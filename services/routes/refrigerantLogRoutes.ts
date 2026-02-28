// services/routes/refrigerantLogRoutes.ts
// EPA Section 608 refrigerant compliance log.
//
// Rules:
//   - NO DELETE endpoint. Ever. EPA requires an audit trail.
//   - Errors are corrected via amendments: POST a new log with corrects_log_id
//     pointing to the original. The original stays untouched.
//   - All amounts in pounds (lbs).
//
// Endpoints:
//   POST  /refrigerant-logs              — create new log entry
//   GET   /refrigerant-logs              — list logs (filter by job, equipment, tech, date range)
//   GET   /refrigerant-logs/:logId       — get single log with amendment chain
//   POST  /refrigerant-logs/:logId/amend — create an amendment to an existing log
//   GET   /refrigerant-logs/summary      — company totals by refrigerant type (EPA reporting)

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const createLogSchema = z.object({
	jobId: z.string().uuid().optional(),
	equipmentId: z.string().uuid().optional(),
	techId: z.string().uuid(),
	refrigerantType: z.string().min(1),         // R-22, R-410A, R-32, etc.
	actionType: z.enum([
		"recovery",
		"recharge",
		"top_off",
		"leak_check",
		"reclaim",
		"disposal"
	]),
	quantityLbs: z.number().min(0),             // lbs recovered/charged
	cylinderTag: z.string().optional(),          // recovery cylinder ID
	leakDetected: z.boolean().default(false),
	leakRepaired: z.boolean().default(false),
	epaSection608Cert: z.string().optional(),    // tech's EPA cert number
	notes: z.string().optional(),
	loggedAt: z.string().optional()              // override timestamp, defaults to NOW()
});

// Amendment reuses create schema but adds corrects_log_id
const amendLogSchema = createLogSchema.extend({
	amendmentReason: z.string().min(1, "Amendment reason is required")
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getUser(request: any): JWTPayload {
	return request.user as JWTPayload;
}

function resolveCompanyId(user: JWTPayload): string | null {
	return user.companyId ?? null;
}

function isDev(user: JWTPayload): boolean {
	return user.role === "dev";
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

export async function refrigerantLogRoutes(fastify: FastifyInstance) {

	// -------------------------------------------------------------------------
	// POST /refrigerant-logs
	// Create a new refrigerant log entry.
	// -------------------------------------------------------------------------
	fastify.post(
		"/refrigerant-logs",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) return reply.code(403).send({ error: "Forbidden" });

			const parsed = createLogSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const body = parsed.data;
			const sql = getSql();

			// Verify tech belongs to company
			const [tech] = (await sql`
				SELECT id FROM employees
				WHERE id = ${body.techId}
				  AND (${isDev(user)} OR company_id = ${companyId})
			`) as any[];

			if (!tech && !isDev(user)) {
				return reply.code(404).send({ error: "Technician not found" });
			}

			const [log] = (await sql`
				INSERT INTO refrigerant_logs (
					company_id, job_id, equipment_id, tech_id,
					refrigerant_type, action_type, quantity_lbs,
					cylinder_tag, leak_detected, leak_repaired,
					epa_section608_cert, notes,
					corrects_log_id,
					logged_at, created_at
				) VALUES (
					${companyId},
					${body.jobId ?? null},
					${body.equipmentId ?? null},
					${body.techId},
					${body.refrigerantType},
					${body.actionType},
					${body.quantityLbs},
					${body.cylinderTag ?? null},
					${body.leakDetected},
					${body.leakRepaired},
					${body.epaSection608Cert ?? null},
					${body.notes ?? null},
					NULL,
					${body.loggedAt ?? null},
					NOW()
				)
				RETURNING *
			`) as any[];

			return reply.code(201).send({ log });
		}
	);

	// -------------------------------------------------------------------------
	// GET /refrigerant-logs
	// List logs. Filter by jobId, equipmentId, techId, refrigerantType, date range.
	// Query params: ?jobId=&equipmentId=&techId=&type=&from=&to=&limit=50&offset=0
	// -------------------------------------------------------------------------
	fastify.get(
		"/refrigerant-logs",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) return reply.code(403).send({ error: "Forbidden" });

			const q = request.query as any;
			const limit = Math.min(parseInt(q.limit ?? "50", 10), 200);
			const offset = parseInt(q.offset ?? "0", 10);
			const sql = getSql();

			// Build dynamic filter conditions using parameterized approach
			const rows = (await sql`
				SELECT
					rl.*,
					e.name AS tech_name,
					j.id   AS job_ref,
					eq.model_number AS equipment_model
				FROM refrigerant_logs rl
				LEFT JOIN employees e  ON e.id  = rl.tech_id
				LEFT JOIN jobs j       ON j.id  = rl.job_id
				LEFT JOIN equipment eq ON eq.id = rl.equipment_id
				WHERE rl.company_id = ${companyId}
				  AND (${q.jobId       ?? null}::uuid IS NULL OR rl.job_id         = ${q.jobId ?? null}::uuid)
				  AND (${q.equipmentId ?? null}::uuid IS NULL OR rl.equipment_id   = ${q.equipmentId ?? null}::uuid)
				  AND (${q.techId      ?? null}::uuid IS NULL OR rl.tech_id        = ${q.techId ?? null}::uuid)
				  AND (${q.type        ?? null}        IS NULL OR rl.refrigerant_type = ${q.type ?? null})
				  AND (${q.from        ?? null}        IS NULL OR rl.logged_at     >= ${q.from ?? null}::timestamptz)
				  AND (${q.to          ?? null}        IS NULL OR rl.logged_at     <= ${q.to ?? null}::timestamptz)
				ORDER BY rl.logged_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`) as any[];

			const [countRow] = (await sql`
				SELECT COUNT(*) AS total
				FROM refrigerant_logs rl
				WHERE rl.company_id = ${companyId}
				  AND (${q.jobId       ?? null}::uuid IS NULL OR rl.job_id         = ${q.jobId ?? null}::uuid)
				  AND (${q.equipmentId ?? null}::uuid IS NULL OR rl.equipment_id   = ${q.equipmentId ?? null}::uuid)
				  AND (${q.techId      ?? null}::uuid IS NULL OR rl.tech_id        = ${q.techId ?? null}::uuid)
				  AND (${q.type        ?? null}        IS NULL OR rl.refrigerant_type = ${q.type ?? null})
				  AND (${q.from        ?? null}        IS NULL OR rl.logged_at     >= ${q.from ?? null}::timestamptz)
				  AND (${q.to          ?? null}        IS NULL OR rl.logged_at     <= ${q.to ?? null}::timestamptz)
			`) as any[];

			return {
				logs: rows,
				total: parseInt(countRow?.total ?? "0"),
				limit,
				offset
			};
		}
	);

	// -------------------------------------------------------------------------
	// GET /refrigerant-logs/summary
	// EPA reporting summary: totals by refrigerant type.
	// IMPORTANT: must be registered BEFORE /:logId to avoid route conflict.
	// Query params: ?from=&to= (date range, defaults to current year)
	// -------------------------------------------------------------------------
	fastify.get(
		"/refrigerant-logs/summary",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) return reply.code(403).send({ error: "Forbidden" });

			const q = request.query as any;
			const fromDate = q.from ?? `${new Date().getFullYear()}-01-01`;
			const toDate   = q.to   ?? `${new Date().getFullYear()}-12-31`;
			const sql = getSql();

			const byType = (await sql`
				SELECT
					refrigerant_type,
					action_type,
					COUNT(*)              AS entry_count,
					SUM(quantity_lbs)     AS total_lbs,
					COUNT(*) FILTER (WHERE leak_detected = TRUE)  AS leaks_detected,
					COUNT(*) FILTER (WHERE leak_repaired = TRUE)  AS leaks_repaired
				FROM refrigerant_logs
				WHERE company_id = ${companyId}
				  AND corrects_log_id IS NULL        -- exclude amendments (already counted in original)
				  AND logged_at >= ${fromDate}::date
				  AND logged_at <  ${toDate}::date + INTERVAL '1 day'
				GROUP BY refrigerant_type, action_type
				ORDER BY refrigerant_type, action_type
			`) as any[];

			const [totals] = (await sql`
				SELECT
					COUNT(*)          AS total_entries,
					SUM(quantity_lbs) AS total_lbs_all_types,
					COUNT(*) FILTER (WHERE leak_detected = TRUE) AS total_leaks
				FROM refrigerant_logs
				WHERE company_id = ${companyId}
				  AND corrects_log_id IS NULL
				  AND logged_at >= ${fromDate}::date
				  AND logged_at <  ${toDate}::date + INTERVAL '1 day'
			`) as any[];

			return {
				dateRange: { from: fromDate, to: toDate },
				totals,
				byTypeAndAction: byType
			};
		}
	);

	// -------------------------------------------------------------------------
	// GET /refrigerant-logs/:logId
	// Get a single log entry + its full amendment chain.
	// -------------------------------------------------------------------------
	fastify.get(
		"/refrigerant-logs/:logId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { logId } = request.params as { logId: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [log] = (await sql`
				SELECT rl.*, e.name AS tech_name
				FROM refrigerant_logs rl
				LEFT JOIN employees e ON e.id = rl.tech_id
				WHERE rl.id = ${logId}
				  AND (${isDev(user)} OR rl.company_id = ${companyId})
			`) as any[];

			if (!log) return reply.code(404).send({ error: "Log not found" });

			// Fetch all amendments to this log (entries that correct it)
			const amendments = (await sql`
				SELECT rl.*, e.name AS tech_name
				FROM refrigerant_logs rl
				LEFT JOIN employees e ON e.id = rl.tech_id
				WHERE rl.corrects_log_id = ${logId}
				  AND (${isDev(user)} OR rl.company_id = ${companyId})
				ORDER BY rl.created_at ASC
			`) as any[];

			// If this log is itself an amendment, fetch what it corrects
			let corrects = null;
			if (log.corrects_log_id) {
				const [orig] = (await sql`
					SELECT rl.*, e.name AS tech_name
					FROM refrigerant_logs rl
					LEFT JOIN employees e ON e.id = rl.tech_id
					WHERE rl.id = ${log.corrects_log_id}
				`) as any[];
				corrects = orig ?? null;
			}

			return { log, amendments, corrects };
		}
	);

	// -------------------------------------------------------------------------
	// POST /refrigerant-logs/:logId/amend
	// Create an amendment to correct an existing log.
	// The original log is NEVER modified. This inserts a new row with
	// corrects_log_id pointing to the original.
	// -------------------------------------------------------------------------
	fastify.post(
		"/refrigerant-logs/:logId/amend",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { logId } = request.params as { logId: string };
			const companyId = resolveCompanyId(user);

			const parsed = amendLogSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const body = parsed.data;
			const sql = getSql();

			// Verify the original log exists and belongs to this company
			const [original] = (await sql`
				SELECT id, company_id FROM refrigerant_logs
				WHERE id = ${logId}
				  AND (${isDev(user)} OR company_id = ${companyId})
			`) as any[];

			if (!original) return reply.code(404).send({ error: "Original log not found" });

			// Insert the amendment — never touch the original
			const [amendment] = (await sql`
				INSERT INTO refrigerant_logs (
					company_id, job_id, equipment_id, tech_id,
					refrigerant_type, action_type, quantity_lbs,
					cylinder_tag, leak_detected, leak_repaired,
					epa_section608_cert, notes,
					corrects_log_id, amendment_reason,
					logged_at, created_at
				) VALUES (
					${original.company_id},
					${body.jobId        ?? null},
					${body.equipmentId  ?? null},
					${body.techId},
					${body.refrigerantType},
					${body.actionType},
					${body.quantityLbs},
					${body.cylinderTag     ?? null},
					${body.leakDetected},
					${body.leakRepaired},
					${body.epaSection608Cert ?? null},
					${body.notes           ?? null},
					${logId},
					${body.amendmentReason},
					${body.loggedAt ?? null},
					NOW()
				)
				RETURNING *
			`) as any[];

			return reply.code(201).send({
				amendment,
				message: "Amendment created. Original log preserved."
			});
		}
	);
}