// services/routes/preStaffingAlertRoutes.ts
// Seasonal pre-staffing alerts.
//
// Endpoints:
//   POST  /staffing-alerts/rules          — create an alert rule
//   GET   /staffing-alerts/rules          — list rules
//   PUT   /staffing-alerts/rules/:id      — update a rule
//   DELETE /staffing-alerts/rules/:id     — delete a rule
//   GET   /staffing-alerts/evaluate       — run rules against forecast NOW, return active alerts
//   GET   /staffing-alerts/history        — past fired alerts
//
// How it works:
//   A rule says: "if forecast predicts > X jobs in month M, fire an alert Y days
//   in advance." The /evaluate endpoint runs all active rules for the company
//   against the same forecast logic used in forecastRoutes, and returns which
//   rules are currently firing. The cron job can call /evaluate on a schedule
//   and persist results to staffing_alert_history.
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ─── Schemas ──────────────────────────────────────────────────────────────────
const createRuleSchema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    branchId: z.string().uuid().optional().nullable(),
    // Trigger: when forecasted job count for a period exceeds threshold
    triggerThreshold: z.number().int().positive(),
    // How many days before the period start to fire the alert
    leadDays: z.number().int().min(1).max(180).default(30),
    // Which months this rule applies to (1-12). Empty = all months.
    targetMonths: z.array(z.number().int().min(1).max(12)).default([]),
    jobType: z.string().optional().nullable(),
    // Recommended action text
    recommendedAction: z.string().max(500).optional(),
    isActive: z.boolean().default(true),
    companyId: z.string().uuid().optional() // dev only
});
const updateRuleSchema = z
    .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional().nullable(),
    branchId: z.string().uuid().optional().nullable(),
    triggerThreshold: z.number().int().positive().optional(),
    leadDays: z.number().int().min(1).max(180).optional(),
    targetMonths: z.array(z.number().int().min(1).max(12)).optional(),
    jobType: z.string().optional().nullable(),
    recommendedAction: z.string().max(500).optional().nullable(),
    isActive: z.boolean().optional()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field required"
});
const listRulesSchema = z.object({
    companyId: z.string().uuid().optional(),
    isActive: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
const evaluateSchema = z.object({
    companyId: z.string().uuid().optional(),
    // How far ahead to look when evaluating rules (months)
    horizon: z.coerce.number().int().min(1).max(12).default(3)
});
const historySchema = z.object({
    companyId: z.string().uuid().optional(),
    ruleId: z.string().uuid().optional(),
    since: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
// ─── Seasonal multipliers (same as forecastRoutes) ───────────────────────────
const SEASONAL_MULTIPLIERS = [
    0.85, 0.8, 0.9, 1.05, 1.2, 1.4, 1.5, 1.45, 1.15, 0.95, 1.1, 1.0
];
const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
];
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getUser(req) {
    return req.user;
}
function resolveCompanyId(user, bodyId) {
    if (user.role === "dev")
        return bodyId ?? user.companyId ?? null;
    return user.companyId ?? null;
}
async function getForecastedJobCount(sql, companyId, targetMonth, targetYear, jobType) {
    // Historical monthly average for this specific month
    const historical = (await sql `
		SELECT COUNT(*)::int AS job_count
		FROM jobs
		WHERE company_id = ${companyId}
		  AND EXTRACT(MONTH FROM scheduled_time) = ${targetMonth}
		  AND scheduled_time >= NOW() - INTERVAL '2 years'
		  AND status NOT IN ('cancelled')
		  AND (${jobType}::text IS NULL OR job_type = ${jobType})
	`);
    // Overall monthly average as fallback
    const overall = (await sql `
		SELECT COALESCE(COUNT(*) / NULLIF(
			COUNT(DISTINCT DATE_TRUNC('month', scheduled_time)), 0
		), 10)::float AS monthly_avg
		FROM jobs
		WHERE company_id = ${companyId}
		  AND scheduled_time >= NOW() - INTERVAL '2 years'
		  AND status NOT IN ('cancelled')
		  AND (${jobType}::text IS NULL OR job_type = ${jobType})
	`);
    const historicalCount = Number(historical[0]?.job_count ?? 0);
    const overallAvg = Number(overall[0]?.monthly_avg ?? 10);
    const base = historicalCount > 0 ? historicalCount : overallAvg;
    const multiplier = SEASONAL_MULTIPLIERS[targetMonth - 1] ?? 1;
    return Math.round(base * multiplier);
}
// ─── Routes ──────────────────────────────────────────────────────────────────
export async function preStaffingAlertRoutes(fastify) {
    fastify.register(async (r) => {
        r.addHook("onRequest", authenticate);
        // ── POST /staffing-alerts/rules ───────────────────────────────────────
        r.post("/staffing-alerts/rules", async (request, reply) => {
            const user = getUser(request);
            const parsed = createRuleSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const body = parsed.data;
            const companyId = resolveCompanyId(user, body.companyId);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const [rule] = (await sql `
				INSERT INTO staffing_alert_rules (
					company_id,
					branch_id,
					name,
					description,
					trigger_threshold,
					lead_days,
					target_months,
					job_type,
					recommended_action,
					is_active,
					created_by_user_id
				) VALUES (
					${companyId},
					${body.branchId ?? null},
					${body.name},
					${body.description ?? null},
					${body.triggerThreshold},
					${body.leadDays},
					${body.targetMonths},
					${body.jobType ?? null},
					${body.recommendedAction ?? null},
					${body.isActive},
					${user.userId ?? user.id ?? null}
				)
				RETURNING
					id,
					company_id          AS "companyId",
					branch_id           AS "branchId",
					name,
					description,
					trigger_threshold   AS "triggerThreshold",
					lead_days           AS "leadDays",
					target_months       AS "targetMonths",
					job_type            AS "jobType",
					recommended_action  AS "recommendedAction",
					is_active           AS "isActive",
					created_at          AS "createdAt"
			`);
            return reply.code(201).send({ rule });
        });
        // ── GET /staffing-alerts/rules ────────────────────────────────────────
        r.get("/staffing-alerts/rules", async (request, reply) => {
            const user = getUser(request);
            const parsed = listRulesSchema.safeParse(request.query);
            if (!parsed.success) {
                return reply.code(400).send({ error: "Invalid query" });
            }
            const { isActive, limit, offset } = parsed.data;
            const companyId = resolveCompanyId(user, parsed.data.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const rules = (await sql `
				SELECT
					id,
					company_id          AS "companyId",
					branch_id           AS "branchId",
					name,
					description,
					trigger_threshold   AS "triggerThreshold",
					lead_days           AS "leadDays",
					target_months       AS "targetMonths",
					job_type            AS "jobType",
					recommended_action  AS "recommendedAction",
					is_active           AS "isActive",
					last_fired_at       AS "lastFiredAt",
					created_at          AS "createdAt",
					updated_at          AS "updatedAt"
				FROM staffing_alert_rules
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				  AND (${isActive ?? null}::boolean IS NULL OR is_active = ${isActive ?? null})
				ORDER BY created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`);
            return { rules };
        });
        // ── PUT /staffing-alerts/rules/:id ────────────────────────────────────
        r.put("/staffing-alerts/rules/:id", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = updateRuleSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const sql = getSql();
            const [existing] = (await sql `
				SELECT id FROM staffing_alert_rules WHERE id = ${id} AND company_id = ${companyId}
			`);
            if (!existing)
                return reply.code(404).send({ error: "Rule not found" });
            const b = parsed.data;
            const [updated] = (await sql `
				UPDATE staffing_alert_rules SET
					name               = COALESCE(${b.name ?? null}, name),
					description        = CASE WHEN ${b.description !== undefined ? "true" : "false"} = 'true' THEN ${b.description ?? null} ELSE description END,
					branch_id          = CASE WHEN ${b.branchId !== undefined ? "true" : "false"} = 'true' THEN ${b.branchId ?? null} ELSE branch_id END,
					trigger_threshold  = COALESCE(${b.triggerThreshold ?? null}, trigger_threshold),
					lead_days          = COALESCE(${b.leadDays ?? null}, lead_days),
					target_months      = COALESCE(${b.targetMonths ?? null}, target_months),
					job_type           = CASE WHEN ${b.jobType !== undefined ? "true" : "false"} = 'true' THEN ${b.jobType ?? null} ELSE job_type END,
					recommended_action = CASE WHEN ${b.recommendedAction !== undefined ? "true" : "false"} = 'true' THEN ${b.recommendedAction ?? null} ELSE recommended_action END,
					is_active          = COALESCE(${b.isActive ?? null}, is_active),
					updated_at         = NOW()
				WHERE id = ${id}
				RETURNING
					id, name, description,
					trigger_threshold  AS "triggerThreshold",
					lead_days          AS "leadDays",
					target_months      AS "targetMonths",
					job_type           AS "jobType",
					recommended_action AS "recommendedAction",
					is_active          AS "isActive",
					updated_at         AS "updatedAt"
			`);
            return { rule: updated };
        });
        // ── DELETE /staffing-alerts/rules/:id ─────────────────────────────────
        r.delete("/staffing-alerts/rules/:id", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const [deleted] = (await sql `
				DELETE FROM staffing_alert_rules
				WHERE id = ${id} AND company_id = ${companyId}
				RETURNING id
			`);
            if (!deleted)
                return reply.code(404).send({ error: "Rule not found" });
            return { deleted: true };
        });
        // ── GET /staffing-alerts/evaluate ─────────────────────────────────────
        // Evaluates all active rules against the forecast and returns which are firing.
        // Call this from cron to persist results, or on-demand for dashboard use.
        r.get("/staffing-alerts/evaluate", async (request, reply) => {
            const user = getUser(request);
            const parsed = evaluateSchema.safeParse(request.query);
            if (!parsed.success)
                return reply.code(400).send({ error: "Invalid query" });
            const { horizon } = parsed.data;
            const companyId = resolveCompanyId(user, parsed.data.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const rules = (await sql `
				SELECT * FROM staffing_alert_rules
				WHERE company_id = ${companyId} AND is_active = true
			`);
            const now = new Date();
            const firing = [];
            const passing = [];
            for (let i = 1; i <= horizon; i++) {
                const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
                const targetMonth = targetDate.getMonth() + 1;
                const targetYear = targetDate.getFullYear();
                // Days until that month starts
                const msUntil = targetDate.getTime() - now.getTime();
                const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24));
                for (const rule of rules) {
                    // Check if this month is targeted (empty = all months)
                    const months = rule.target_months ?? [];
                    if (months.length > 0 && !months.includes(targetMonth))
                        continue;
                    // Only fire if we're within the lead window
                    if (daysUntil > rule.lead_days)
                        continue;
                    const forecastedJobs = await getForecastedJobCount(sql, companyId, targetMonth, targetYear, rule.job_type ?? null);
                    const isTriggered = forecastedJobs >= rule.trigger_threshold;
                    const result = {
                        ruleId: rule.id,
                        ruleName: rule.name,
                        period: `${MONTH_NAMES[targetMonth - 1]} ${targetYear}`,
                        targetMonth,
                        targetYear,
                        daysUntil,
                        forecastedJobs,
                        threshold: rule.trigger_threshold,
                        recommendedAction: rule.recommended_action,
                        isTriggered
                    };
                    if (isTriggered) {
                        firing.push(result);
                        // Persist to history (upsert by rule+period to avoid spam)
                        await sql `
							INSERT INTO staffing_alert_history (
								company_id, rule_id, period_month, period_year,
								forecasted_jobs, threshold, days_until_period
							) VALUES (
								${companyId}, ${rule.id}, ${targetMonth}, ${targetYear},
								${forecastedJobs}, ${rule.trigger_threshold}, ${daysUntil}
							)
							ON CONFLICT (rule_id, period_month, period_year)
							DO UPDATE SET
								forecasted_jobs   = EXCLUDED.forecasted_jobs,
								days_until_period = EXCLUDED.days_until_period,
								evaluated_at      = NOW()
						`;
                        // Update last_fired_at on the rule
                        await sql `
							UPDATE staffing_alert_rules SET last_fired_at = NOW() WHERE id = ${rule.id}
						`;
                    }
                    else {
                        passing.push(result);
                    }
                }
            }
            return {
                evaluatedAt: now.toISOString(),
                horizon,
                firingCount: firing.length,
                passingCount: passing.length,
                firing,
                passing
            };
        });
        // ── GET /staffing-alerts/history ──────────────────────────────────────
        r.get("/staffing-alerts/history", async (request, reply) => {
            const user = getUser(request);
            const parsed = historySchema.safeParse(request.query);
            if (!parsed.success)
                return reply.code(400).send({ error: "Invalid query" });
            const { ruleId, since, limit, offset } = parsed.data;
            const companyId = resolveCompanyId(user, parsed.data.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const history = (await sql `
				SELECT
					h.id,
					h.rule_id           AS "ruleId",
					r.name              AS "ruleName",
					h.period_month      AS "periodMonth",
					h.period_year       AS "periodYear",
					h.forecasted_jobs   AS "forecastedJobs",
					h.threshold,
					h.days_until_period AS "daysUntilPeriod",
					h.evaluated_at      AS "evaluatedAt"
				FROM staffing_alert_history h
				JOIN staffing_alert_rules r ON r.id = h.rule_id
				WHERE h.company_id = ${companyId}
				  AND (${ruleId ?? null}::uuid IS NULL OR h.rule_id = ${ruleId ?? null})
				  AND (${since ?? null}::text IS NULL OR h.evaluated_at >= ${since ?? null}::date)
				ORDER BY h.evaluated_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`);
            return { history };
        });
    });
}
