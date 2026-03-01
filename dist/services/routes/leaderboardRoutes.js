// services/routes/leaderboardRoutes.ts
// Tech performance leaderboard — aggregated from job completions, ratings, KPIs
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
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
function periodToInterval(period) {
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
export function getTechLeaderboard(fastify) {
    fastify.get("/leaderboard/techs", async (request, reply) => {
        const user = request.user;
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
        const leaderboard = await sql `
            SELECT
                e.id                                                        AS "employeeId",
                e.name                                                      AS "techName",
                e.role,
                COUNT(jc.id)::int                                           AS "jobsCompleted",
                COALESCE(SUM(inv.total), 0)::numeric                        AS "revenueGenerated",
                ROUND(AVG(jc.customer_rating)::numeric, 2)                  AS "avgRating",
                COUNT(jc.id) FILTER (WHERE jc.first_time_fix = TRUE)::int   AS "firstTimeFixes",
                COUNT(jc.id) FILTER (WHERE jc.callback_required = TRUE)::int AS "callbacks",
                CASE
                    WHEN COUNT(jc.id) > 0
                    THEN ROUND(
                        (COUNT(jc.id) FILTER (WHERE jc.first_time_fix = TRUE)::numeric / COUNT(jc.id)) * 100, 1
                    )
                    ELSE 0
                END                                                         AS "firstTimeFixRate",
                CASE
                    WHEN COUNT(jc.id) > 0
                    THEN ROUND(
                        (COUNT(jc.id) FILTER (WHERE jc.callback_required = TRUE)::numeric / COUNT(jc.id)) * 100, 1
                    )
                    ELSE 0
                END                                                         AS "callbackRate",
                AVG(jc.duration_minutes)::int                               AS "avgJobDurationMinutes"
            FROM employees e
            LEFT JOIN job_completions jc ON jc.tech_id = e.id
                AND jc.completed_at >= NOW() - ${interval}::interval
            LEFT JOIN invoices inv ON inv.job_id = jc.job_id AND inv.status != 'void'
            WHERE e.is_active = TRUE
            AND (${effectiveCompanyId}::uuid IS NULL OR e.company_id = ${effectiveCompanyId})
            AND (${branchId ?? null}::uuid IS NULL OR e.branch_id = ${branchId ?? null})
            GROUP BY e.id, e.name, e.role
            ORDER BY
                CASE ${metric}
                    WHEN 'revenue'        THEN COALESCE(SUM(inv.total), 0)
                    WHEN 'jobs_completed' THEN COUNT(jc.id)
                    WHEN 'rating'         THEN COALESCE(AVG(jc.customer_rating), 0) * 100
                    WHEN 'first_time_fix' THEN
                        CASE WHEN COUNT(jc.id) > 0
                        THEN (COUNT(jc.id) FILTER (WHERE jc.first_time_fix = TRUE)::numeric / COUNT(jc.id)) * 100
                        ELSE 0 END
                    WHEN 'callback_rate'  THEN
                        CASE WHEN COUNT(jc.id) > 0
                        THEN 100 - (COUNT(jc.id) FILTER (WHERE jc.callback_required = TRUE)::numeric / COUNT(jc.id)) * 100
                        ELSE 100 END
                    ELSE COALESCE(SUM(inv.total), 0)
                END DESC
            LIMIT ${limit}
        `;
        return {
            period,
            metric,
            leaderboard: leaderboard.map((row, i) => ({
                rank: i + 1,
                ...row
            }))
        };
    });
}
export async function leaderboardRoutes(fastify) {
    fastify.register(async (authed) => {
        authed.addHook("onRequest", authenticate);
        getTechLeaderboard(authed);
    });
}
