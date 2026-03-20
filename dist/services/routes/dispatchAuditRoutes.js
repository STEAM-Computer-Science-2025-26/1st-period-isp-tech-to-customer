// services/routes/dispatchAuditRoutes.ts
// Phase 4 — Dispatch override logging + job reassignment history.
//
// Endpoints:
//   POST  /jobs/:jobId/dispatch-override   — log a manual override of auto-dispatch
//   GET   /jobs/:jobId/dispatch-override   — get override log for a job
//   GET   /jobs/:jobId/reassignments       — get full reassignment history
//   POST  /jobs/:jobId/reassign            — reassign job + log reason
//   GET   /analytics/dispatch-overrides    — company-level override report
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────
const overrideSchema = z.object({
	// The tech the algorithm chose
	originalTechId: z.string().uuid().optional(),
	// The tech the dispatcher chose instead
	overrideTechId: z.string().uuid(),
	// Why the override happened
	reason: z.string().min(1, "Reason is required"),
	// Optional: dispatcher's assessment of algorithm recommendation quality
	algorithmScore: z.number().optional()
});
const reassignSchema = z.object({
	newTechId: z.string().uuid(),
	reason: z.string().min(1, "Reason is required"),
	// Previous tech — if omitted we look it up from the job
	previousTechId: z.string().uuid().optional()
});
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getUser(request) {
	return request.user;
}
function resolveCompanyId(user) {
	return user.companyId ?? null;
}
function isDev(user) {
	return user.role === "dev";
}
function parseLookback(query) {
	const d = parseInt(query?.days ?? "30", 10);
	if (isNaN(d) || d < 1) return 30;
	return Math.min(d, 365);
}
// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────
export async function dispatchAuditRoutes(fastify) {
	// -------------------------------------------------------------------------
	// POST /jobs/:jobId/dispatch-override
	// Log when a dispatcher manually overrides the algorithm's recommendation.
	// -------------------------------------------------------------------------
	fastify.post(
		"/jobs/:jobId/dispatch-override",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params;
			const companyId = resolveCompanyId(user);
			const parsed = overrideSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const body = parsed.data;
			const sql = getSql();
			// Verify job belongs to company
			const [job] = await sql`
				SELECT id, company_id, assigned_tech_id
				FROM jobs
				WHERE id = ${jobId}
				  AND (${isDev(user)} OR company_id = ${companyId})
			`;
			if (!job) return reply.code(404).send({ error: "Job not found" });
			// Assign the override tech to the job
			await sql`
				UPDATE jobs SET
					assigned_tech_id = ${body.overrideTechId},
					updated_at       = NOW()
				WHERE id = ${jobId}
			`;
			// Release original tech if different
			if (body.originalTechId && body.originalTechId !== body.overrideTechId) {
				await sql`
					UPDATE employees SET
						current_jobs_count = GREATEST(0, current_jobs_count - 1),
						updated_at = NOW()
					WHERE id = ${body.originalTechId}
					  AND (${isDev(user)} OR company_id = ${companyId})
					  AND current_jobs_count > 0
				`;
			}
			// Claim slot for override tech
			await sql`
				UPDATE employees SET
					current_job_id     = ${jobId},
					current_jobs_count = current_jobs_count + 1,
					updated_at         = NOW()
				WHERE id = ${body.overrideTechId}
				  AND (${isDev(user)} OR company_id = ${companyId})
			`;
			// Write override log — action column is NOT NULL, must be provided
			const [log] = await sql`
				INSERT INTO job_assignment_logs (
					job_id, company_id,
					assigned_tech_id, original_tech_id,
					assigned_by_user_id,
					is_manual_override, override_reason,
					algorithm_score,
					action,
					created_at
				) VALUES (
					${jobId},
					${job.company_id},
					${body.overrideTechId},
					${body.originalTechId ?? null},
					${user.userId ?? null},
					TRUE,
					${body.reason},
					${body.algorithmScore ?? null},
					'dispatch_override',
					NOW()
				)
				RETURNING *
			`;
			return reply.code(201).send({ override: log });
		}
	);
	// -------------------------------------------------------------------------
	// GET /jobs/:jobId/dispatch-override
	// Return the override log entry for this job, if one exists.
	// -------------------------------------------------------------------------
	fastify.get(
		"/jobs/:jobId/dispatch-override",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const [log] = await sql`
				SELECT
					jal.*,
					orig.name AS original_tech_name,
					ovrd.name AS override_tech_name
				FROM job_assignment_logs jal
				LEFT JOIN employees orig ON orig.id = jal.original_tech_id
				LEFT JOIN employees ovrd ON ovrd.id = jal.assigned_tech_id
				WHERE jal.job_id = ${jobId}
				  AND jal.is_manual_override = TRUE
				  AND (${isDev(user)} OR jal.company_id = ${companyId})
				ORDER BY jal.created_at DESC
				LIMIT 1
			`;
			if (!log)
				return reply
					.code(404)
					.send({ error: "No override found for this job" });
			return { override: log };
		}
	);
	// -------------------------------------------------------------------------
	// GET /jobs/:jobId/reassignments
	// Full reassignment history for a job.
	// -------------------------------------------------------------------------
	fastify.get(
		"/jobs/:jobId/reassignments",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const rows = await sql`
				SELECT
					jrh.*,
					prev.name AS previous_tech_name,
					newt.name AS new_tech_name,
					reassigned_by.name AS reassigned_by_name
				FROM job_reassignment_history jrh
				LEFT JOIN employees prev         ON prev.id         = jrh.previous_tech_id
				LEFT JOIN employees newt         ON newt.id         = jrh.new_tech_id
				LEFT JOIN employees reassigned_by ON reassigned_by.id = jrh.reassigned_by_id
				WHERE jrh.job_id = ${jobId}
				  AND (${isDev(user)} OR jrh.company_id = ${companyId})
				ORDER BY jrh.reassigned_at ASC
			`;
			return { reassignments: rows };
		}
	);
	// -------------------------------------------------------------------------
	// POST /jobs/:jobId/reassign
	// Reassign a job to a different tech + write to job_reassignment_history.
	// -------------------------------------------------------------------------
	fastify.post(
		"/jobs/:jobId/reassign",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params;
			const companyId = resolveCompanyId(user);
			const parsed = reassignSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const body = parsed.data;
			const sql = getSql();
			// Load job
			const [job] = await sql`
				SELECT id, company_id, assigned_tech_id, status
				FROM jobs
				WHERE id = ${jobId}
				  AND (${isDev(user)} OR company_id = ${companyId})
			`;
			if (!job) return reply.code(404).send({ error: "Job not found" });
			if (job.status === "completed" || job.status === "cancelled") {
				return reply.code(409).send({
					error: `Cannot reassign a ${job.status} job`
				});
			}
			const previousTechId = body.previousTechId ?? job.assigned_tech_id;
			if (previousTechId === body.newTechId) {
				return reply
					.code(400)
					.send({ error: "New tech is the same as current tech" });
			}
			// Release previous tech
			if (previousTechId) {
				await sql`
					UPDATE employees SET
						current_job_id     = NULL,
						current_jobs_count = GREATEST(0, current_jobs_count - 1),
						updated_at         = NOW()
					WHERE id = ${previousTechId}
					  AND (${isDev(user)} OR company_id = ${companyId})
				`;
			}
			// Assign new tech
			await sql`
				UPDATE jobs SET
					assigned_tech_id = ${body.newTechId},
					updated_at       = NOW()
				WHERE id = ${jobId}
			`;
			await sql`
				UPDATE employees SET
					current_job_id     = ${jobId},
					current_jobs_count = current_jobs_count + 1,
					updated_at         = NOW()
				WHERE id = ${body.newTechId}
				  AND (${isDev(user)} OR company_id = ${companyId})
			`;
			// Log the reassignment — reassignment_type is NOT NULL, must be provided
			const [history] = await sql`
				INSERT INTO job_reassignment_history (
					job_id, company_id,
					previous_tech_id, new_tech_id,
					reassigned_by_id, reason,
					reassignment_type,
					reassigned_at
				) VALUES (
					${jobId},
					${job.company_id},
					${previousTechId ?? null},
					${body.newTechId},
					${user.userId ?? null},
					${body.reason},
					'manual_override',
					NOW()
				)
				RETURNING *
			`;
			return reply.code(201).send({
				reassignment: history,
				previousTechId,
				newTechId: body.newTechId
			});
		}
	);
	// -------------------------------------------------------------------------
	// GET /analytics/dispatch-overrides
	// Company-level override report: volume, most-overridden techs, outcomes.
	// Query params: ?days=30
	// -------------------------------------------------------------------------
	fastify.get(
		"/analytics/dispatch-overrides",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });
			const days = parseLookback(request.query);
			const sql = getSql();
			const [summary] = await sql`
				SELECT
					COUNT(*)                                               AS total_assignments,
					COUNT(*) FILTER (WHERE is_manual_override = TRUE)      AS total_overrides,
					ROUND(
						100.0 * COUNT(*) FILTER (WHERE is_manual_override = TRUE)
						/ NULLIF(COUNT(*), 0), 1
					)                                                      AS override_rate_pct
				FROM job_assignment_logs
				WHERE company_id = ${companyId}
				  AND created_at >= NOW() - (${days} || ' days')::interval
			`;
			const reasons = await sql`
				SELECT
					override_reason AS reason,
					COUNT(*)        AS count
				FROM job_assignment_logs
				WHERE company_id         = ${companyId}
				  AND is_manual_override = TRUE
				  AND created_at        >= NOW() - (${days} || ' days')::interval
				  AND override_reason   IS NOT NULL
				GROUP BY override_reason
				ORDER BY count DESC
				LIMIT 10
			`;
			const mostOverridden = await sql`
				SELECT
					e.id     AS tech_id,
					e.name   AS tech_name,
					COUNT(*) AS times_overridden_away
				FROM job_assignment_logs jal
				JOIN employees e ON e.id = jal.original_tech_id
				WHERE jal.company_id        = ${companyId}
				  AND jal.is_manual_override = TRUE
				  AND jal.created_at        >= NOW() - (${days} || ' days')::interval
				  AND jal.original_tech_id  IS NOT NULL
				GROUP BY e.id, e.name
				ORDER BY times_overridden_away DESC
				LIMIT 10
			`;
			const [reassignSummary] = await sql`
				SELECT COUNT(*) AS total_reassignments
				FROM job_reassignment_history
				WHERE company_id    = ${companyId}
				  AND reassigned_at >= NOW() - (${days} || ' days')::interval
			`;
			return {
				days,
				summary,
				topReasons: reasons,
				mostOverriddenTechs: mostOverridden,
				reassignments: reassignSummary
			};
		}
	);
}
