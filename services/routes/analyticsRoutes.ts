// services/routes/analyticsRoutes.ts
// Week 4 analytics endpoints.
// All queries are read-only aggregations — no writes here.
//
// Endpoints:
//   GET /analytics/revenue
//   GET /analytics/tech-performance
//   GET /analytics/job-kpis
//   GET /analytics/first-time-fix
//   GET /analytics/callback-rate
//   GET /analytics/time-breakdown

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { authenticate, JWTPayload } from "../middleware/auth";

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

// Parse ?days=30 query param, default 30, max 365
function parseLookback(query: any): number {
	const d = parseInt(query?.days ?? "30", 10);
	if (isNaN(d) || d < 1) return 30;
	if (d > 365) return 365;
	return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

export async function analyticsRoutes(fastify: FastifyInstance) {

	// -------------------------------------------------------------------------
	// GET /analytics/revenue
	// Revenue totals and trends. Breaks down by period (day/week/month).
	// Query params: ?days=30&period=day|week|month
	// -------------------------------------------------------------------------
	fastify.get(
		"/analytics/revenue",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const query = request.query as any;
			const days = parseLookback(query);
			const period = ["day", "week", "month"].includes(query.period)
				? query.period
				: "day";

			const sql = getSql();

			const truncFn =
				period === "day"
					? "day"
					: period === "week"
						? "week"
						: "month";

			const rows = (await sql`
				SELECT
					DATE_TRUNC(${truncFn}, i.created_at)   AS period_start,
					COUNT(*)                                AS invoice_count,
					SUM(i.total)                            AS gross_revenue,
					SUM(i.amount_paid)                      AS collected,
					SUM(i.balance_due)                      AS outstanding
				FROM invoices i
				WHERE i.company_id = ${companyId}
				  AND i.created_at >= NOW() - (${days} || ' days')::interval
				  AND i.status != 'void'
				GROUP BY DATE_TRUNC(${truncFn}, i.created_at)
				ORDER BY period_start ASC
			`) as any[];

			const totals = (await sql`
				SELECT
					COUNT(*)           AS invoice_count,
					SUM(i.total)       AS gross_revenue,
					SUM(i.amount_paid) AS collected,
					SUM(i.balance_due) AS outstanding
				FROM invoices i
				WHERE i.company_id = ${companyId}
				  AND i.created_at >= NOW() - (${days} || ' days')::interval
				  AND i.status != 'void'
			`) as any[];

			return {
				period,
				days,
				totals: totals[0],
				breakdown: rows
			};
		}
	);

	// -------------------------------------------------------------------------
	// GET /analytics/tech-performance
	// Per-tech: jobs completed, avg rating, first-time fix %, callback %, avg duration.
	// Query params: ?days=30&techId=uuid (techId optional — returns all if omitted)
	// -------------------------------------------------------------------------
	fastify.get(
		"/analytics/tech-performance",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const query = request.query as any;
			const days = parseLookback(query);
			const techId = query.techId ?? null;

			const sql = getSql();

			const rows = (await sql`
				SELECT
					e.id                                            AS tech_id,
					e.name                                          AS tech_name,
					COUNT(jc.id)                                    AS jobs_completed,
					ROUND(AVG(jc.customer_rating), 2)               AS avg_rating,
					ROUND(
						100.0 * COUNT(*) FILTER (WHERE jc.first_time_fix = TRUE)
						/ NULLIF(COUNT(jc.id), 0), 1
					)                                               AS first_time_fix_pct,
					ROUND(
						100.0 * COUNT(*) FILTER (WHERE jc.callback_required = TRUE)
						/ NULLIF(COUNT(jc.id), 0), 1
					)                                               AS callback_pct,
					ROUND(AVG(jc.duration_minutes), 0)              AS avg_duration_minutes,
					ROUND(AVG(jc.wrench_time_minutes), 0)           AS avg_wrench_minutes,
					ROUND(AVG(jc.drive_time_minutes), 0)            AS avg_drive_minutes
				FROM employees e
				LEFT JOIN job_completions jc
					ON jc.tech_id = e.id
					AND jc.completed_at >= NOW() - (${days} || ' days')::interval
				WHERE e.company_id = ${companyId}
				  AND (${techId}::uuid IS NULL OR e.id = ${techId}::uuid)
				GROUP BY e.id, e.name
				ORDER BY jobs_completed DESC, avg_rating DESC
			`) as any[];

			return { days, techs: rows };
		}
	);

	// -------------------------------------------------------------------------
	// GET /analytics/job-kpis
	// Company-level job KPIs: volume, completion rate, avg duration variance.
	// Query params: ?days=30
	// -------------------------------------------------------------------------
	fastify.get(
		"/analytics/job-kpis",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const days = parseLookback(request.query);
			const sql = getSql();

			const kpis = (await sql`
				SELECT
					COUNT(*)                                                AS total_jobs,
					COUNT(*) FILTER (WHERE status = 'completed')            AS completed,
					COUNT(*) FILTER (WHERE status = 'unassigned')           AS unassigned,
					COUNT(*) FILTER (WHERE status = 'in_progress')          AS in_progress,
					ROUND(
						100.0 * COUNT(*) FILTER (WHERE status = 'completed')
						/ NULLIF(COUNT(*), 0), 1
					)                                                       AS completion_rate_pct,
					ROUND(AVG(actual_duration_minutes), 0)                  AS avg_actual_duration,
					ROUND(AVG(estimated_duration_minutes), 0)               AS avg_estimated_duration,
					ROUND(AVG(
						actual_duration_minutes - estimated_duration_minutes
					), 0)                                                   AS avg_duration_variance_minutes
				FROM jobs
				WHERE company_id = ${companyId}
				  AND created_at >= NOW() - (${days} || ' days')::interval
			`) as any[];

			const byType = (await sql`
				SELECT
					job_type,
					COUNT(*)                                            AS total,
					COUNT(*) FILTER (WHERE status = 'completed')        AS completed,
					ROUND(AVG(actual_duration_minutes), 0)              AS avg_duration
				FROM jobs
				WHERE company_id = ${companyId}
				  AND created_at >= NOW() - (${days} || ' days')::interval
				  AND job_type IS NOT NULL
				GROUP BY job_type
				ORDER BY total DESC
			`) as any[];

			return { days, kpis: kpis[0], byJobType: byType };
		}
	);

	// -------------------------------------------------------------------------
	// GET /analytics/first-time-fix
	// First-time fix rate over time + per tech breakdown.
	// Definition: job completed, no new repair job for same equipment within 30 days.
	// We use the job_completions.first_time_fix boolean as the source of truth
	// (set by the tech on job close).
	// Query params: ?days=30
	// -------------------------------------------------------------------------
	fastify.get(
		"/analytics/first-time-fix",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const days = parseLookback(request.query);
			const sql = getSql();

			const overall = (await sql`
				SELECT
					COUNT(*)                                                        AS total_completions,
					COUNT(*) FILTER (WHERE jc.first_time_fix = TRUE)                AS first_time_fixes,
					ROUND(
						100.0 * COUNT(*) FILTER (WHERE jc.first_time_fix = TRUE)
						/ NULLIF(COUNT(*), 0), 1
					)                                                               AS first_time_fix_pct
				FROM job_completions jc
				JOIN jobs j ON j.id = jc.job_id
				WHERE j.company_id = ${companyId}
				  AND jc.completed_at >= NOW() - (${days} || ' days')::interval
			`) as any[];

			const byTech = (await sql`
				SELECT
					e.id                                                            AS tech_id,
					e.name                                                          AS tech_name,
					COUNT(jc.id)                                                    AS total_completions,
					COUNT(*) FILTER (WHERE jc.first_time_fix = TRUE)                AS first_time_fixes,
					ROUND(
						100.0 * COUNT(*) FILTER (WHERE jc.first_time_fix = TRUE)
						/ NULLIF(COUNT(jc.id), 0), 1
					)                                                               AS first_time_fix_pct
				FROM employees e
				JOIN job_completions jc ON jc.tech_id = e.id
				JOIN jobs j ON j.id = jc.job_id
				WHERE j.company_id = ${companyId}
				  AND jc.completed_at >= NOW() - (${days} || ' days')::interval
				GROUP BY e.id, e.name
				ORDER BY first_time_fix_pct DESC
			`) as any[];

			return {
				days,
				overall: overall[0],
				byTech
			};
		}
	);

	// -------------------------------------------------------------------------
	// GET /analytics/callback-rate
	// Callback rate: return visit for same customer within 30 days of a completed job.
	// Uses job_completions.callback_required boolean.
	// Query params: ?days=30
	// -------------------------------------------------------------------------
	fastify.get(
		"/analytics/callback-rate",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const days = parseLookback(request.query);
			const sql = getSql();

			const overall = (await sql`
				SELECT
					COUNT(*)                                                        AS total_completions,
					COUNT(*) FILTER (WHERE jc.callback_required = TRUE)             AS callbacks,
					ROUND(
						100.0 * COUNT(*) FILTER (WHERE jc.callback_required = TRUE)
						/ NULLIF(COUNT(*), 0), 1
					)                                                               AS callback_rate_pct
				FROM job_completions jc
				JOIN jobs j ON j.id = jc.job_id
				WHERE j.company_id = ${companyId}
				  AND jc.completed_at >= NOW() - (${days} || ' days')::interval
			`) as any[];

			const byTech = (await sql`
				SELECT
					e.id                                                            AS tech_id,
					e.name                                                          AS tech_name,
					COUNT(jc.id)                                                    AS total_completions,
					COUNT(*) FILTER (WHERE jc.callback_required = TRUE)             AS callbacks,
					ROUND(
						100.0 * COUNT(*) FILTER (WHERE jc.callback_required = TRUE)
						/ NULLIF(COUNT(jc.id), 0), 1
					)                                                               AS callback_rate_pct
				FROM employees e
				JOIN job_completions jc ON jc.tech_id = e.id
				JOIN jobs j ON j.id = jc.job_id
				WHERE j.company_id = ${companyId}
				  AND jc.completed_at >= NOW() - (${days} || ' days')::interval
				GROUP BY e.id, e.name
				ORDER BY callback_rate_pct ASC
			`) as any[];

			return { days, overall: overall[0], byTech };
		}
	);

	// -------------------------------------------------------------------------
	// GET /analytics/time-breakdown
	// Drive time vs wrench time per tech, from job_time_tracking.
	// Query params: ?days=30&techId=uuid
	// -------------------------------------------------------------------------
	fastify.get(
		"/analytics/time-breakdown",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const query = request.query as any;
			const days = parseLookback(query);
			const techId = query.techId ?? null;
			const sql = getSql();

			const rows = (await sql`
				SELECT
					e.id                                                AS tech_id,
					e.name                                              AS tech_name,
					COUNT(jtt.id)                                       AS jobs_tracked,

					-- Drive time
					SUM(
						EXTRACT(EPOCH FROM (jtt.arrived_at - jtt.departed_at)) / 60
					)::INTEGER                                          AS total_drive_minutes,
					ROUND(AVG(
						EXTRACT(EPOCH FROM (jtt.arrived_at - jtt.departed_at)) / 60
					), 0)                                               AS avg_drive_minutes,

					-- Wrench time
					SUM(
						EXTRACT(EPOCH FROM (jtt.work_ended_at - jtt.work_started_at)) / 60
					)::INTEGER                                          AS total_wrench_minutes,
					ROUND(AVG(
						EXTRACT(EPOCH FROM (jtt.work_ended_at - jtt.work_started_at)) / 60
					), 0)                                               AS avg_wrench_minutes,

					-- Ratio: wrench / (drive + wrench)
					ROUND(
						SUM(EXTRACT(EPOCH FROM (jtt.work_ended_at - jtt.work_started_at)))
						/ NULLIF(
							SUM(EXTRACT(EPOCH FROM (jtt.arrived_at - jtt.departed_at)))
							+ SUM(EXTRACT(EPOCH FROM (jtt.work_ended_at - jtt.work_started_at))),
						0) * 100, 1
					)                                                   AS wrench_time_pct

				FROM employees e
				JOIN job_time_tracking jtt ON jtt.tech_id = e.id
				WHERE e.company_id = ${companyId}
				  AND jtt.departed_at IS NOT NULL
				  AND jtt.arrived_at IS NOT NULL
				  AND jtt.work_started_at IS NOT NULL
				  AND jtt.work_ended_at IS NOT NULL
				  AND jtt.created_at >= NOW() - (${days} || ' days')::interval
				  AND (${techId}::uuid IS NULL OR e.id = ${techId}::uuid)
				GROUP BY e.id, e.name
				ORDER BY wrench_time_pct DESC
			`) as any[];

			return { days, techs: rows };
		}
	);
}