// services/routes/durationRoutes.ts
// Estimated vs actual duration tracking on jobs.
// This is how you measure tech efficiency and improve scheduling.
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const setEstimatedDurationSchema = z.object({
	estimatedMinutes: z.number().int().min(15).max(480)
});
const recordActualDurationSchema = z.object({
	actualMinutes: z.number().int().min(1).max(1440)
});
// ============================================================
// Helpers
// ============================================================
function getUser(request) {
	return request.user;
}
function isDev(user) {
	return user.role === "dev";
}
function resolveCompanyId(user) {
	return user.companyId ?? null;
}
// ============================================================
// Routes
// ============================================================
export async function durationRoutes(fastify) {
	// ----------------------------------------------------------
	// PATCH /jobs/:jobId/estimated-duration
	// Dispatcher sets how long they think a job will take.
	// Used for scheduling windows and route planning.
	// ----------------------------------------------------------
	fastify.patch(
		"/jobs/:jobId/estimated-duration",
		{
			preHandler: [authenticate]
		},
		async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params;
			const parsed = setEstimatedDurationSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const { estimatedMinutes } = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const result = isDev(user)
				? await sql`
				UPDATE jobs
				SET estimated_duration_minutes = ${estimatedMinutes},
				    updated_at = NOW()
				WHERE id = ${jobId}
				RETURNING id, estimated_duration_minutes AS "estimatedMinutes"
			`
				: await sql`
				UPDATE jobs
				SET estimated_duration_minutes = ${estimatedMinutes},
				    updated_at = NOW()
				WHERE id = ${jobId} AND company_id = ${companyId}
				RETURNING id, estimated_duration_minutes AS "estimatedMinutes"
			`;
			if (!result[0]) return reply.code(404).send({ error: "Job not found" });
			return reply.send({ message: "Estimated duration set", job: result[0] });
		}
	);
	// ----------------------------------------------------------
	// PATCH /jobs/:jobId/actual-duration
	// Tech records how long the job actually took on completion.
	// Also computes variance so we can improve future estimates.
	// Variance = actual - estimated. Positive = ran over.
	// ----------------------------------------------------------
	fastify.patch(
		"/jobs/:jobId/actual-duration",
		{
			preHandler: [authenticate]
		},
		async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params;
			const parsed = recordActualDurationSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const { actualMinutes } = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const result = isDev(user)
				? await sql`
				UPDATE jobs
				SET actual_duration_minutes = ${actualMinutes},
				    duration_variance_minutes = ${actualMinutes} - COALESCE(estimated_duration_minutes, ${actualMinutes}),
				    updated_at = NOW()
				WHERE id = ${jobId}
				RETURNING
					id,
					estimated_duration_minutes AS "estimatedMinutes",
					actual_duration_minutes    AS "actualMinutes",
					duration_variance_minutes  AS "varianceMinutes"
			`
				: await sql`
				UPDATE jobs
				SET actual_duration_minutes = ${actualMinutes},
				    duration_variance_minutes = ${actualMinutes} - COALESCE(estimated_duration_minutes, ${actualMinutes}),
				    updated_at = NOW()
				WHERE id = ${jobId} AND company_id = ${companyId}
				RETURNING
					id,
					estimated_duration_minutes AS "estimatedMinutes",
					actual_duration_minutes    AS "actualMinutes",
					duration_variance_minutes  AS "varianceMinutes"
			`;
			if (!result[0]) return reply.code(404).send({ error: "Job not found" });
			return reply.send({
				message: "Actual duration recorded",
				job: result[0]
			});
		}
	);
	// ----------------------------------------------------------
	// GET /analytics/duration
	// Per-tech duration accuracy over the last N days.
	// Shows avg estimated, avg actual, avg variance.
	// Dispatcher uses this to calibrate future estimates.
	// ----------------------------------------------------------
	fastify.get(
		"/analytics/duration",
		{
			preHandler: [authenticate]
		},
		async (request, reply) => {
			const user = getUser(request);
			const { days = "30" } = request.query;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}
			const daysN = Math.min(parseInt(days, 10) || 30, 365);
			const stats =
				isDev(user) && !companyId
					? await sql`
				SELECT
					e.id                                        AS "techId",
					e.name                                      AS "techName",
					COUNT(j.id)::int                            AS "jobCount",
					ROUND(AVG(j.estimated_duration_minutes))::int AS "avgEstimatedMinutes",
					ROUND(AVG(j.actual_duration_minutes))::int    AS "avgActualMinutes",
					ROUND(AVG(j.duration_variance_minutes))::int  AS "avgVarianceMinutes",
					-- Positive variance = consistently runs over (underestimated)
					-- Negative variance = consistently finishes early (overestimated)
					SUM(CASE WHEN j.duration_variance_minutes > 15 THEN 1 ELSE 0 END)::int AS "overRuns",
					SUM(CASE WHEN j.duration_variance_minutes < -15 THEN 1 ELSE 0 END)::int AS "underRuns"
				FROM employees e
				JOIN jobs j ON j.assigned_tech_id = e.id
				WHERE j.actual_duration_minutes IS NOT NULL
				  AND j.created_at >= NOW() - ${daysN}::int * INTERVAL '1 day'
				GROUP BY e.id, e.name
				ORDER BY "avgVarianceMinutes" DESC
			`
					: await sql`
				SELECT
					e.id                                        AS "techId",
					e.name                                      AS "techName",
					COUNT(j.id)::int                            AS "jobCount",
					ROUND(AVG(j.estimated_duration_minutes))::int AS "avgEstimatedMinutes",
					ROUND(AVG(j.actual_duration_minutes))::int    AS "avgActualMinutes",
					ROUND(AVG(j.duration_variance_minutes))::int  AS "avgVarianceMinutes",
					SUM(CASE WHEN j.duration_variance_minutes > 15 THEN 1 ELSE 0 END)::int AS "overRuns",
					SUM(CASE WHEN j.duration_variance_minutes < -15 THEN 1 ELSE 0 END)::int AS "underRuns"
				FROM employees e
				JOIN jobs j ON j.assigned_tech_id = e.id
				WHERE j.company_id = ${companyId}
				  AND j.actual_duration_minutes IS NOT NULL
				  AND j.created_at >= NOW() - ${daysN}::int * INTERVAL '1 day'
				GROUP BY e.id, e.name
				ORDER BY "avgVarianceMinutes" DESC
			`;
			return reply.send({ stats, windowDays: daysN });
		}
	);
}
