// services/routes/automationRoutes.ts
// Two automation engines:
//
// 1. ESTIMATE FOLLOW-UPS
//    Rule-based: N days after estimate sent with no response → queue a follow-up.
//    Companies configure their own follow-up sequences (day 3, day 7, day 14).
//    Cron picks up queued follow-ups and marks them sent (Twilio/SendGrid hook in later).
//
//    Endpoints:
//      POST   /automation/estimate-followup-rules         — create rule
//      GET    /automation/estimate-followup-rules         — list rules
//      PUT    /automation/estimate-followup-rules/:id     — update rule
//      DELETE /automation/estimate-followup-rules/:id     — delete rule
//      GET    /automation/estimate-followups/queue        — pending follow-ups (for cron/debug)
//      POST   /automation/estimate-followups/run          — manually trigger follow-up generation (cron calls this)
//
// 2. SCHEDULE AUTO-ADJUST
//    Rule-based: when certain conditions are met, automatically reschedule jobs.
//    Conditions: tech called out, job ran long (spillover), weather hold, customer reschedule.
//    Rules define: trigger condition → action (bump N hours/days, assign backup tech, escalate priority).
//
//    Endpoints:
//      POST   /automation/schedule-rules                  — create rule
//      GET    /automation/schedule-rules                  — list rules
//      PUT    /automation/schedule-rules/:id              — update rule
//      DELETE /automation/schedule-rules/:id              — delete rule
//      POST   /automation/schedule-rules/evaluate         — evaluate all rules against current jobs (cron)
//      GET    /automation/schedule-adjustments            — log of auto-adjustments made

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─── Schemas ─────────────────────────────────────────────── ──────────────────

// Estimate follow-up rules
const followUpRuleSchema = z.object({
	name: z.string().min(1).max(120),
	daysAfterSent: z.number().int().min(1).max(90), // trigger N days after sent_at
	channel: z.enum(["email", "sms", "both"]).default("email"),
	messageTemplate: z.string().max(2000).optional(), // {{customerName}}, {{estimateTotal}}, {{estimateUrl}}
	isActive: z.boolean().default(true),
	companyId: z.string().uuid().optional()
});

const updateFollowUpRuleSchema = z
	.object({
		name: z.string().min(1).max(120).optional(),
		daysAfterSent: z.number().int().min(1).max(90).optional(),
		channel: z.enum(["email", "sms", "both"]).optional(),
		messageTemplate: z.string().max(2000).optional().nullable(),
		isActive: z.boolean().optional()
	})
	.refine((d) => Object.keys(d).length > 0, {
		message: "At least one field required"
	});

// Schedule auto-adjust rules
const TRIGGER_CONDITIONS = [
	"tech_unavailable", // tech marked unavailable/sick
	"job_running_long", // job exceeds estimated duration by threshold %
	"customer_no_show", // tech arrived, no customer
	"customer_reschedule", // customer requested reschedule via portal
	"weather_hold", // manual weather hold flagged on job
	"emergency_inserted" // high-priority job inserted, causing conflict
] as const;

const ACTIONS = [
	"bump_next_available_slot", // push to next open slot for same tech
	"reassign_backup_tech", // find available tech and reassign
	"escalate_priority", // raise job priority
	"notify_dispatcher", // flag for dispatcher attention (no auto-move)
	"bump_hours", // push scheduled_time by N hours
	"bump_days" // push scheduled_time by N days
] as const;

const scheduleRuleSchema = z.object({
	name: z.string().min(1).max(120),
	triggerCondition: z.enum(TRIGGER_CONDITIONS),
	// Condition parameters (depends on trigger type)
	thresholdPct: z.number().min(0).max(500).optional(), // for job_running_long: how much over (e.g. 150 = 50% over)
	action: z.enum(ACTIONS),
	// Action parameters
	bumpHours: z.number().min(0).max(72).optional(), // for bump_hours
	bumpDays: z.number().int().min(0).max(30).optional(), // for bump_days
	newPriority: z.enum(["low", "normal", "high", "urgent"]).optional(), // for escalate_priority
	notifyMessage: z.string().max(500).optional(),
	isActive: z.boolean().default(true),
	companyId: z.string().uuid().optional()
});

const updateScheduleRuleSchema = z
	.object({
		name: z.string().min(1).max(120).optional(),
		triggerCondition: z.enum(TRIGGER_CONDITIONS).optional(),
		thresholdPct: z.number().min(0).max(500).optional().nullable(),
		action: z.enum(ACTIONS).optional(),
		bumpHours: z.number().min(0).max(72).optional().nullable(),
		bumpDays: z.number().int().min(0).max(30).optional().nullable(),
		newPriority: z
			.enum(["low", "normal", "high", "urgent"])
			.optional()
			.nullable(),
		notifyMessage: z.string().max(500).optional().nullable(),
		isActive: z.boolean().optional()
	})
	.refine((d) => Object.keys(d).length > 0, {
		message: "At least one field required"
	});

const adjustmentLogSchema = z.object({
	companyId: z.string().uuid().optional(),
	jobId: z.string().uuid().optional(),
	ruleId: z.string().uuid().optional(),
	since: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUser(req: any): JWTPayload {
	return req.user as JWTPayload;
}

function resolveCompanyId(user: JWTPayload, bodyId?: string): string | null {
	if (user.role === "dev") return bodyId ?? user.companyId ?? null;
	return user.companyId ?? null;
}

function isAdmin(user: JWTPayload): boolean {
	return user.role === "admin" || user.role === "dev";
}

// ─── Cron-callable functions (also exported for cronRunner) ───────────────────

// Called by cron daily. Scans sent estimates, generates follow-up queue entries.
export async function generateEstimateFollowUps(): Promise<{ queued: number }> {
	const sql = getSql();
	let queued = 0;

	// Get all active rules
	const rules = (await sql`
		SELECT id, company_id, days_after_sent, channel, message_template
		FROM estimate_followup_rules
		WHERE is_active = true
	`) as any[];

	for (const rule of rules) {
		// Find estimates that are 'sent', not yet responded to, and haven't
		// already had a follow-up queued for this rule
		const estimates = (await sql`
			SELECT
				e.id, e.company_id, e.customer_id, e.total,
				e.sent_at, e.estimate_number AS "estimateNumber",
				c.first_name AS "customerFirstName",
				c.last_name  AS "customerLastName",
				c.email, c.phone
			FROM estimates e
			JOIN customers c ON c.id = e.customer_id
			WHERE e.company_id = ${rule.company_id}
			  AND e.status = 'sent'
			  AND e.sent_at IS NOT NULL
			  AND e.sent_at <= NOW() - (${rule.days_after_sent} || ' days')::interval
			  AND NOT EXISTS (
			      SELECT 1 FROM estimate_followup_queue q
			      WHERE q.estimate_id = e.id AND q.rule_id = ${rule.id}
			  )
		`) as any[];

		for (const est of estimates) {
			// Render message template
			const template =
				rule.message_template ??
				`Hi {{customerFirstName}}, just following up on estimate {{estimateNumber}} for {{estimateTotal}}. Let us know if you have any questions!`;

			const message = template
				.replace("{{customerFirstName}}", est.customerFirstName ?? "there")
				.replace("{{estimateNumber}}", est.estimateNumber ?? "")
				.replace("{{estimateTotal}}", Number(est.total ?? 0).toFixed(2));

			await sql`
				INSERT INTO estimate_followup_queue (
					company_id, estimate_id, rule_id, customer_id,
					channel, message, scheduled_for, status
				) VALUES (
					${est.company_id}, ${est.id}, ${rule.id}, ${est.customer_id},
					${rule.channel}, ${message}, NOW(), 'pending'
				)
			`;
			queued++;
		}
	}

	return { queued };
}

// Called by cron hourly. Dispatches pending follow-ups.
export async function dispatchEstimateFollowUps(): Promise<{
	sent: number;
	failed: number;
}> {
	const sql = getSql();
	let sent = 0;
	let failed = 0;

	const pending = (await sql`
		SELECT q.*, c.email, c.phone, c.first_name
		FROM estimate_followup_queue q
		JOIN customers c ON c.id = q.customer_id
		WHERE q.status = 'pending'
		  AND q.scheduled_for <= NOW()
		ORDER BY q.scheduled_for ASC
		LIMIT 100
	`) as any[];

	for (const item of pending) {
		try {
			// TODO: plug in Twilio (SMS) / SendGrid (email) here
			console.log(
				`[estimate-followup] Sending ${item.channel} to customer ${item.customer_id} for estimate ${item.estimate_id}`
			);

			await sql`
				UPDATE estimate_followup_queue
				SET status = 'sent', sent_at = NOW(), updated_at = NOW()
				WHERE id = ${item.id}
			`;
			sent++;
		} catch (err) {
			console.error(`[estimate-followup] Failed ${item.id}:`, err);
			await sql`
				UPDATE estimate_followup_queue
				SET status = 'failed', updated_at = NOW()
				WHERE id = ${item.id}
			`;
			failed++;
		}
	}

	return { sent, failed };
}

// Called by cron every 15 min. Evaluates schedule rules against current jobs.
export async function evaluateScheduleRules(): Promise<{
	evaluated: number;
	adjusted: number;
}> {
	const sql = getSql();
	let evaluated = 0;
	let adjusted = 0;

	const rules = (await sql`
		SELECT * FROM schedule_auto_adjust_rules WHERE is_active = true
	`) as any[];

	for (const rule of rules) {
		if (rule.trigger_condition === "job_running_long") {
			// Jobs that started but haven't been marked complete, and are over threshold
			const threshold = rule.threshold_pct ?? 150; // default 50% over
			const overrunJobs = (await sql`
				SELECT j.id, j.company_id, j.assigned_tech_id, j.scheduled_time,
				       j.estimated_duration_minutes, j.priority,
				       j.started_at
				FROM jobs j
				WHERE j.status IN ('assigned', 'in_progress')
				  AND j.company_id = ${rule.company_id}
				  AND j.started_at IS NOT NULL
				  AND j.estimated_duration_minutes IS NOT NULL
				  AND EXTRACT(EPOCH FROM (NOW() - j.started_at)) / 60
				      > (j.estimated_duration_minutes * ${threshold / 100})
				  AND NOT EXISTS (
				      SELECT 1 FROM schedule_adjustment_log sal
				      WHERE sal.job_id = j.id AND sal.rule_id = ${rule.id}
				        AND sal.created_at > NOW() - INTERVAL '4 hours'
				  )
			`) as any[];

			for (const job of overrunJobs) {
				await applyScheduleAction(sql, rule, job);
				adjusted++;
			}
			evaluated += overrunJobs.length;
		}

		if (rule.trigger_condition === "tech_unavailable") {
			// Jobs assigned to techs who are currently marked unavailable
			const affectedJobs = (await sql`
				SELECT j.id, j.company_id, j.assigned_tech_id, j.scheduled_time,
				       j.estimated_duration_minutes, j.priority
				FROM jobs j
				JOIN employees e ON e.id = j.assigned_tech_id
				WHERE j.status IN ('assigned', 'unassigned')
				  AND j.company_id = ${rule.company_id}
				  AND j.scheduled_time >= NOW()
				  AND e.is_available = false
				  AND NOT EXISTS (
				      SELECT 1 FROM schedule_adjustment_log sal
				      WHERE sal.job_id = j.id AND sal.rule_id = ${rule.id}
				        AND sal.created_at > NOW() - INTERVAL '1 hour'
				  )
			`) as any[];

			for (const job of affectedJobs) {
				await applyScheduleAction(sql, rule, job);
				adjusted++;
			}
			evaluated += affectedJobs.length;
		}

		if (rule.trigger_condition === "customer_no_show") {
			// Jobs where tech arrived (arrived_at set) but no work started after 30 min
			const noShows = (await sql`
				SELECT j.id, j.company_id, j.assigned_tech_id, j.scheduled_time,
				       j.estimated_duration_minutes, j.priority
				FROM jobs j
				JOIN job_time_tracking jtt ON jtt.job_id = j.id
				WHERE j.status IN ('assigned', 'in_progress')
				  AND j.company_id = ${rule.company_id}
				  AND jtt.arrived_at IS NOT NULL
				  AND jtt.work_started_at IS NULL
				  AND jtt.arrived_at < NOW() - INTERVAL '30 minutes'
				  AND NOT EXISTS (
				      SELECT 1 FROM schedule_adjustment_log sal
				      WHERE sal.job_id = j.id AND sal.rule_id = ${rule.id}
				        AND sal.created_at > NOW() - INTERVAL '2 hours'
				  )
			`) as any[];

			for (const job of noShows) {
				await applyScheduleAction(sql, rule, job);
				adjusted++;
			}
			evaluated += noShows.length;
		}

		if (rule.trigger_condition === "weather_hold") {
			// Jobs manually flagged with weather_hold = true
			const heldJobs = (await sql`
				SELECT j.id, j.company_id, j.assigned_tech_id, j.scheduled_time,
				       j.estimated_duration_minutes, j.priority
				FROM jobs j
				WHERE j.status IN ('assigned', 'unassigned')
				  AND j.company_id = ${rule.company_id}
				  AND j.weather_hold = true
				  AND NOT EXISTS (
				      SELECT 1 FROM schedule_adjustment_log sal
				      WHERE sal.job_id = j.id AND sal.rule_id = ${rule.id}
				        AND sal.created_at > NOW() - INTERVAL '6 hours'
				  )
			`) as any[];

			for (const job of heldJobs) {
				await applyScheduleAction(sql, rule, job);
				adjusted++;
			}
			evaluated += heldJobs.length;
		}
	}

	return { evaluated, adjusted };
}

async function applyScheduleAction(
	sql: any,
	rule: any,
	job: any
): Promise<void> {
	const action = rule.action;
	let description = "";
	let newScheduledTime: string | null = null;
	let newTechId: string | null = null;
	let newPriority: string | null = null;

	try {
		if (action === "bump_hours" && rule.bump_hours) {
			const current = new Date(job.scheduled_time ?? new Date());
			current.setHours(current.getHours() + rule.bump_hours);
			newScheduledTime = current.toISOString();
			description = `Auto-bumped ${rule.bump_hours}h due to: ${rule.trigger_condition}`;

			await sql`
				UPDATE jobs SET scheduled_time = ${newScheduledTime}, updated_at = NOW()
				WHERE id = ${job.id}
			`;
		}

		if (action === "bump_days" && rule.bump_days) {
			const current = new Date(job.scheduled_time ?? new Date());
			current.setDate(current.getDate() + rule.bump_days);
			newScheduledTime = current.toISOString();
			description = `Auto-bumped ${rule.bump_days} day(s) due to: ${rule.trigger_condition}`;

			await sql`
				UPDATE jobs SET scheduled_time = ${newScheduledTime}, updated_at = NOW()
				WHERE id = ${job.id}
			`;
		}

		if (action === "bump_next_available_slot") {
			// Push to next available slot: find next open 2-hour window for same tech
			// Simplified: bump 4 hours from now
			const nextSlot = new Date();
			nextSlot.setHours(nextSlot.getHours() + 4);
			// Round to next half-hour
			nextSlot.setMinutes(nextSlot.getMinutes() < 30 ? 30 : 0);
			if (nextSlot.getMinutes() === 0)
				nextSlot.setHours(nextSlot.getHours() + 1);
			newScheduledTime = nextSlot.toISOString();
			description = `Auto-scheduled to next available slot due to: ${rule.trigger_condition}`;

			await sql`
				UPDATE jobs SET scheduled_time = ${newScheduledTime}, updated_at = NOW()
				WHERE id = ${job.id}
			`;
		}

		if (action === "reassign_backup_tech") {
			// Find available tech not already assigned to a job at this time
			const [backupTech] = (await sql`
				SELECT e.id FROM employees e
				WHERE e.company_id = ${job.company_id}
				  AND e.is_active = true
				  AND e.is_available = true
				  AND e.id != ${job.assigned_tech_id ?? null}
				  AND e.current_jobs_count < e.max_concurrent_jobs
				  AND NOT EXISTS (
				      SELECT 1 FROM jobs j2
				      WHERE j2.assigned_tech_id = e.id
				        AND j2.status NOT IN ('completed','cancelled')
				        AND j2.scheduled_time BETWEEN
				            (${job.scheduled_time ?? new Date().toISOString()}::timestamptz - INTERVAL '2 hours')
				            AND (${job.scheduled_time ?? new Date().toISOString()}::timestamptz + INTERVAL '2 hours')
				  )
				ORDER BY e.current_jobs_count ASC
				LIMIT 1
			`) as any[];

			if (backupTech) {
				newTechId = backupTech.id;
				description = `Auto-reassigned to backup tech due to: ${rule.trigger_condition}`;
				await sql`
					UPDATE jobs SET
						assigned_tech_id = ${backupTech.id},
						status = 'assigned',
						updated_at = NOW()
					WHERE id = ${job.id}
				`;
			} else {
				description = `No backup tech available — flagged for dispatcher. Trigger: ${rule.trigger_condition}`;
			}
		}

		if (action === "escalate_priority" && rule.new_priority) {
			newPriority = rule.new_priority;
			description = `Auto-escalated to '${rule.new_priority}' due to: ${rule.trigger_condition}`;
			await sql`
				UPDATE jobs SET priority = ${rule.new_priority}, updated_at = NOW()
				WHERE id = ${job.id}
			`;
		}

		if (action === "notify_dispatcher") {
			description =
				rule.notify_message ??
				`Dispatcher attention needed. Trigger: ${rule.trigger_condition}`;
			// No job mutation — just logs the adjustment for dispatcher review
		}

		// Log the adjustment
		await sql`
			INSERT INTO schedule_adjustment_log (
				company_id, job_id, rule_id, trigger_condition, action_taken,
				description, new_scheduled_time, new_assigned_tech_id, new_priority
			) VALUES (
				${job.company_id}, ${job.id}, ${rule.id},
				${rule.trigger_condition}, ${action},
				${description},
				${newScheduledTime}, ${newTechId}, ${newPriority}
			)
		`;
	} catch (err) {
		console.error(
			`[schedule-adjust] Failed to apply rule ${rule.id} to job ${job.id}:`,
			err
		);
	}
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function automationRoutes(fastify: FastifyInstance) {
	fastify.register(async (r) => {
		r.addHook("onRequest", authenticate);

		// ════════════════════════════════════════════════════════════════════
		// ESTIMATE FOLLOW-UP RULES
		// ════════════════════════════════════════════════════════════════════

		r.post("/automation/estimate-followup-rules", async (request, reply) => {
			const user = getUser(request);
			if (!isAdmin(user))
				return reply.code(403).send({ error: "Admin required" });

			const parsed = followUpRuleSchema.safeParse(request.body);
			if (!parsed.success)
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});

			const body = parsed.data;
			const companyId = resolveCompanyId(user, body.companyId);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [rule] = (await sql`
				INSERT INTO estimate_followup_rules (
					company_id, name, days_after_sent, channel, message_template, is_active
				) VALUES (
					${companyId}, ${body.name}, ${body.daysAfterSent},
					${body.channel}, ${body.messageTemplate ?? null}, ${body.isActive}
				)
				RETURNING
					id, name, days_after_sent AS "daysAfterSent",
					channel, message_template AS "messageTemplate",
					is_active AS "isActive", created_at AS "createdAt"
			`) as any[];

			return reply.code(201).send({ rule });
		});

		r.get("/automation/estimate-followup-rules", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(
				user,
				(request.query as any).companyId
			);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const rules = (await sql`
				SELECT id, name, days_after_sent AS "daysAfterSent",
				       channel, message_template AS "messageTemplate",
				       is_active AS "isActive", created_at AS "createdAt"
				FROM estimate_followup_rules
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				ORDER BY days_after_sent
			`) as any[];

			return { rules };
		});

		r.put("/automation/estimate-followup-rules/:id", async (request, reply) => {
			const user = getUser(request);
			if (!isAdmin(user))
				return reply.code(403).send({ error: "Admin required" });

			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = updateFollowUpRuleSchema.safeParse(request.body);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });

			const sql = getSql();
			const b = parsed.data;

			const [updated] = (await sql`
				UPDATE estimate_followup_rules SET
					name             = COALESCE(${b.name ?? null}, name),
					days_after_sent  = COALESCE(${b.daysAfterSent ?? null}, days_after_sent),
					channel          = COALESCE(${b.channel ?? null}, channel),
					message_template = CASE WHEN ${b.messageTemplate !== undefined ? "true" : "false"} = 'true' THEN ${b.messageTemplate ?? null} ELSE message_template END,
					is_active        = COALESCE(${b.isActive ?? null}, is_active),
					updated_at       = NOW()
				WHERE id = ${id} AND company_id = ${companyId}
				RETURNING id, name, days_after_sent AS "daysAfterSent", channel, is_active AS "isActive"
			`) as any[];

			if (!updated) return reply.code(404).send({ error: "Rule not found" });
			return { rule: updated };
		});

		r.delete(
			"/automation/estimate-followup-rules/:id",
			async (request, reply) => {
				const user = getUser(request);
				if (!isAdmin(user))
					return reply.code(403).send({ error: "Admin required" });

				const { id } = request.params as { id: string };
				const companyId = resolveCompanyId(user);
				if (!companyId) return reply.code(403).send({ error: "Forbidden" });

				const sql = getSql();
				const [deleted] = (await sql`
				DELETE FROM estimate_followup_rules WHERE id = ${id} AND company_id = ${companyId} RETURNING id
			`) as any[];

				if (!deleted) return reply.code(404).send({ error: "Rule not found" });
				return { deleted: true };
			}
		);

		r.get("/automation/estimate-followups/queue", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(
				user,
				(request.query as any).companyId
			);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const queue = (await sql`
				SELECT
					q.id, q.estimate_id AS "estimateId", q.rule_id AS "ruleId",
					q.channel, q.message, q.status,
					q.scheduled_for AS "scheduledFor", q.sent_at AS "sentAt",
					c.first_name || ' ' || c.last_name AS "customerName",
					e.estimate_number AS "estimateNumber"
				FROM estimate_followup_queue q
				JOIN customers c ON c.id = q.customer_id
				JOIN estimates e ON e.id = q.estimate_id
				WHERE (${companyId}::uuid IS NULL OR q.company_id = ${companyId})
				ORDER BY q.scheduled_for DESC
				LIMIT 100
			`) as any[];

			return { queue };
		});

		r.post("/automation/estimate-followups/run", async (request, reply) => {
			const user = getUser(request);
			if (!isAdmin(user))
				return reply.code(403).send({ error: "Admin required" });

			const [queued, dispatched] = await Promise.all([
				generateEstimateFollowUps(),
				dispatchEstimateFollowUps()
			]);

			return {
				queued: queued.queued,
				sent: dispatched.sent,
				failed: dispatched.failed
			};
		});

		// ════════════════════════════════════════════════════════════════════
		// SCHEDULE AUTO-ADJUST RULES
		// ════════════════════════════════════════════════════════════════════

		r.post("/automation/schedule-rules", async (request, reply) => {
			const user = getUser(request);
			if (!isAdmin(user))
				return reply.code(403).send({ error: "Admin required" });

			const parsed = scheduleRuleSchema.safeParse(request.body);
			if (!parsed.success)
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});

			const body = parsed.data;
			const companyId = resolveCompanyId(user, body.companyId);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const [rule] = (await sql`
				INSERT INTO schedule_auto_adjust_rules (
					company_id, name, trigger_condition, threshold_pct,
					action, bump_hours, bump_days, new_priority, notify_message, is_active
				) VALUES (
					${companyId}, ${body.name}, ${body.triggerCondition},
					${body.thresholdPct ?? null}, ${body.action},
					${body.bumpHours ?? null}, ${body.bumpDays ?? null},
					${body.newPriority ?? null}, ${body.notifyMessage ?? null}, ${body.isActive}
				)
				RETURNING
					id, name,
					trigger_condition AS "triggerCondition",
					threshold_pct     AS "thresholdPct",
					action,
					bump_hours        AS "bumpHours",
					bump_days         AS "bumpDays",
					new_priority      AS "newPriority",
					notify_message    AS "notifyMessage",
					is_active         AS "isActive",
					created_at        AS "createdAt"
			`) as any[];

			return reply.code(201).send({ rule });
		});

		r.get("/automation/schedule-rules", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(
				user,
				(request.query as any).companyId
			);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const rules = (await sql`
				SELECT
					id, name,
					trigger_condition AS "triggerCondition",
					threshold_pct     AS "thresholdPct",
					action, bump_hours AS "bumpHours", bump_days AS "bumpDays",
					new_priority      AS "newPriority",
					notify_message    AS "notifyMessage",
					is_active         AS "isActive",
					created_at        AS "createdAt"
				FROM schedule_auto_adjust_rules
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				ORDER BY trigger_condition, name
			`) as any[];

			return { rules };
		});

		r.put("/automation/schedule-rules/:id", async (request, reply) => {
			const user = getUser(request);
			if (!isAdmin(user))
				return reply.code(403).send({ error: "Admin required" });

			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = updateScheduleRuleSchema.safeParse(request.body);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });

			const sql = getSql();
			const b = parsed.data;

			const [updated] = (await sql`
				UPDATE schedule_auto_adjust_rules SET
					name              = COALESCE(${b.name ?? null}, name),
					trigger_condition = COALESCE(${b.triggerCondition ?? null}, trigger_condition),
					threshold_pct     = CASE WHEN ${b.thresholdPct !== undefined ? "true" : "false"} = 'true' THEN ${b.thresholdPct ?? null} ELSE threshold_pct END,
					action            = COALESCE(${b.action ?? null}, action),
					bump_hours        = CASE WHEN ${b.bumpHours !== undefined ? "true" : "false"} = 'true' THEN ${b.bumpHours ?? null} ELSE bump_hours END,
					bump_days         = CASE WHEN ${b.bumpDays !== undefined ? "true" : "false"} = 'true' THEN ${b.bumpDays ?? null} ELSE bump_days END,
					new_priority      = CASE WHEN ${b.newPriority !== undefined ? "true" : "false"} = 'true' THEN ${b.newPriority ?? null} ELSE new_priority END,
					notify_message    = CASE WHEN ${b.notifyMessage !== undefined ? "true" : "false"} = 'true' THEN ${b.notifyMessage ?? null} ELSE notify_message END,
					is_active         = COALESCE(${b.isActive ?? null}, is_active),
					updated_at        = NOW()
				WHERE id = ${id} AND company_id = ${companyId}
				RETURNING id, name, trigger_condition AS "triggerCondition", action, is_active AS "isActive"
			`) as any[];

			if (!updated) return reply.code(404).send({ error: "Rule not found" });
			return { rule: updated };
		});

		r.delete("/automation/schedule-rules/:id", async (request, reply) => {
			const user = getUser(request);
			if (!isAdmin(user))
				return reply.code(403).send({ error: "Admin required" });

			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const [deleted] = (await sql`
				DELETE FROM schedule_auto_adjust_rules WHERE id = ${id} AND company_id = ${companyId} RETURNING id
			`) as any[];

			if (!deleted) return reply.code(404).send({ error: "Rule not found" });
			return { deleted: true };
		});

		r.post("/automation/schedule-rules/evaluate", async (request, reply) => {
			const user = getUser(request);
			if (!isAdmin(user))
				return reply.code(403).send({ error: "Admin required" });

			const result = await evaluateScheduleRules();
			return result;
		});

		r.get("/automation/schedule-adjustments", async (request, reply) => {
			const user = getUser(request);
			const parsed = adjustmentLogSchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });

			const { jobId, ruleId, since, limit, offset } = parsed.data;
			const companyId = resolveCompanyId(user, parsed.data.companyId);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const adjustments = (await sql`
				SELECT
					sal.id,
					sal.job_id              AS "jobId",
					sal.rule_id             AS "ruleId",
					r.name                  AS "ruleName",
					sal.trigger_condition   AS "triggerCondition",
					sal.action_taken        AS "actionTaken",
					sal.description,
					sal.new_scheduled_time  AS "newScheduledTime",
					sal.new_assigned_tech_id AS "newAssignedTechId",
					e.name                  AS "newTechName",
					sal.new_priority        AS "newPriority",
					sal.created_at          AS "createdAt"
				FROM schedule_adjustment_log sal
				LEFT JOIN schedule_auto_adjust_rules r ON r.id = sal.rule_id
				LEFT JOIN employees e ON e.id = sal.new_assigned_tech_id
				WHERE (${companyId}::uuid IS NULL OR sal.company_id = ${companyId})
				  AND (${jobId ?? null}::uuid IS NULL OR sal.job_id = ${jobId ?? null})
				  AND (${ruleId ?? null}::uuid IS NULL OR sal.rule_id = ${ruleId ?? null})
				  AND (${since ?? null}::text IS NULL OR sal.created_at >= ${since ?? null}::date)
				ORDER BY sal.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`) as any[];

			return { adjustments, limit, offset };
		});
	});
}
