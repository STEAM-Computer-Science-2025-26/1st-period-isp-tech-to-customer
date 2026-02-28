// services/routes/leaderboardRoutes.ts
// Tech performance leaderboard — aggregated from job completions, ratings, KPIs

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ============================================================
// Schemas
// ============================================================

const leaderboardSchema = z.object({
	companyId: z.string().uuid().optional(),
	branchId: z.string().uuid().optional(),
	period: z
		.enum(["today", "week", "month", "quarter", "year", "all"])
		.default("month"),
	limit: z.coerce.number().int().min(1).max(50).default(20),
	metric: z
		.enum([
			"revenue",
			"jobs_completed",
			"rating",
			"first_time_fix",
			"callback_rate"
		])
		.default("revenue")
});

// ============================================================
// Helpers
// ============================================================

function periodToInterval(period: string): string {
	switch (period) {
		case "today":
			return "1 day";
		case "week":
			return "7 days";
		case "month":
			return "30 days";
		case "quarter":
			return "90 days";
		case "year":
			return "365 days";
		default:
			return "3650 days"; // "all" ~10 years
	}
}

// ============================================================
// Route handlers
// ============================================================

export function getTechLeaderboard(fastify: FastifyInstance) {
	fastify.get("/leaderboard/techs", async (request, reply) => {
		const user = request.user as JWTPayload;
		const isDev = user.role === "dev";

		const parsed = leaderboardSchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid query",
				details: z.treeifyError(parsed.error)
			});
		}

		const { branchId, period, limit, metric } = parsed.data;
		const effectiveCompanyId = isDev
			? (parsed.data.companyId ?? null)
			: (user.companyId ?? null);
		const interval = periodToInterval(period);
		const sql = getSql();

		const leaderboard = await sql`
			SELECT
				e.id                                    AS "employeeId",
				e.name                                  AS "techName",
				e.role,
				COUNT(j.id)::int                        AS "jobsCompleted",
				COALESCE(SUM(j.invoice_total), 0)::numeric AS "revenueGenerated",
				ROUND(AVG(j.tech_rating)::numeric, 2)  AS "avgRating",
				COUNT(j.id) FILTER (
					WHERE j.first_time_fix = TRUE
				)::int                                  AS "firstTimeFixes",
				COUNT(j.id) FILTER (
					WHERE j.is_callback = TRUE
				)::int                                  AS "callbacks",
				CASE
					WHEN COUNT(j.id) > 0
					THEN ROUND(
						(COUNT(j.id) FILTER (WHERE j.first_time_fix = TRUE)::numeric / COUNT(j.id)) * 100,
						1
					)
					ELSE 0
				END                                     AS "firstTimeFixRate",
				CASE
					WHEN COUNT(j.id) > 0
					THEN ROUND(
						(COUNT(j.id) FILTER (WHERE j.is_callback = TRUE)::numeric / COUNT(j.id)) * 100,
						1
					)
					ELSE 0
				END                                     AS "callbackRate",
				AVG(j.actual_duration_minutes)::int     AS "avgJobDurationMinutes"
			FROM employees e
			LEFT JOIN jobs j ON j.assigned_employee_id = e.id
				AND j.status = 'completed'
				AND j.completed_at >= NOW() - ${interval}::interval
			WHERE e.is_active = TRUE
			  AND (${effectiveCompanyId}::uuid IS NULL OR e.company_id = ${effectiveCompanyId})
			  AND (${branchId ?? null}::uuid IS NULL OR e.branch_id = ${branchId ?? null})
			GROUP BY e.id, e.name, e.role
			ORDER BY
				CASE ${metric}
					WHEN 'revenue'         THEN COALESCE(SUM(j.invoice_total), 0)
					WHEN 'jobs_completed'  THEN COUNT(j.id)
					WHEN 'rating'          THEN COALESCE(AVG(j.tech_rating), 0) * 100
					WHEN 'first_time_fix'  THEN
						CASE WHEN COUNT(j.id) > 0
						THEN (COUNT(j.id) FILTER (WHERE j.first_time_fix = TRUE)::numeric / COUNT(j.id)) * 100
						ELSE 0 END
					WHEN 'callback_rate'   THEN
						-- lower is better — invert for ordering
						CASE WHEN COUNT(j.id) > 0
						THEN 100 - (COUNT(j.id) FILTER (WHERE j.is_callback = TRUE)::numeric / COUNT(j.id)) * 100
						ELSE 100 END
					ELSE COALESCE(SUM(j.invoice_total), 0)
				END DESC
			LIMIT ${limit}
		`;

		return {
			period,
			metric,
			leaderboard: leaderboard.map((row: any, i: number) => ({
				rank: i + 1,
				...row
			}))
		};
	});
}

export async function leaderboardRoutes(fastify: FastifyInstance) {
	fastify.register(async (authed) => {
		authed.addHook("onRequest", authenticate);
		getTechLeaderboard(authed);
	});
}
