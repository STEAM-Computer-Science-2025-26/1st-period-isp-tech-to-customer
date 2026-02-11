// WHAT THIS DOES:
// Calculates real performance metrics for technicians by querying job history
// Replaces the fake/hardcoded values in your current system
//
// METRICS CALCULATED:
// - recentJobCount: How many jobs completed in last 30 days
// - recentCompletionRate: % of assigned jobs that were completed (0.0 - 1.0)
// - dailyJobCount: Jobs completed today
// - averageRating: Customer satisfaction score

import { count } from "console";
import { query } from "../../db";

export type techMetrics = {
	recentJobCount: number;
	recentCompletionRate: number;
	dailyJobCount: number;
	averageRating: number;
};
/**
 * @param techId
 * @param lookbackDays
 * @returns
 */

export async function calculateTechMetrics(
	techId: string,
	lookbackDays: number = 30
): Promise<techMetrics> {
	const [completionData, assignmentData, ratingData] = await Promise.all([
		query<{ count: string; daily_job_count: string }>(
			`SELECT
                COUNT(*) FILTER (WHERE completed_at > NOW() - INTERVAL '${lookbackDays} days') as count,
                COUNT(*) FILTER (WHERE completed_at >= CURRENT_DATE) AS daily_job_count
            FROM jobs_completions
            WHERE assigned_tech_id = $1`,
			[techId]
		),
		query<{ assigned: string; completed: string }>(
			`SELECT
                COUNT(*) as assigned,
                COUNT(*) FILTER (WHERE j.status = 'completed') as completed
            FROM job_assignments ja
            LEFT JOIN jobs j ON ja.job_id = j.id
            WHERE ja.tech_id = $1
                AND ja.assigned_at > NOW() - INTERVAL '${lookbackDays} days'`,
			[techId]
		),

		query<{ avg_rating: string }>(
			`SELECT
                COALESCE(AVG(customer_rating), 3.0) as avg_rating
            FROM jobs_completions
            WHERE assigned_tech_id = $1
                AND customer_rating IS NOT NULL
                AND completed_at > NOW() - INTERVAL '${lookbackDays} days'`,
			[techId]
		)
	]);

	const recentJobCount = parseInt(completionData[0]?.count || "0");
	const dailyJobCount = parseInt(completionData[0]?.daily_job_count || "0");
	const assigned = parseInt(assignmentData[0]?.assigned || "0");
	const completed = parseInt(assignmentData[0]?.completed || "0");
	const averageRating = parseFloat(ratingData[0]?.avg_rating || "3.0");

	const recentCompletionRate = assigned > 0 ? completed / assigned : 0;

	return {
		recentJobCount,
		recentCompletionRate,
		dailyJobCount,
		averageRating
	};
}
/**
 * @params tech
 * @returns
 */

export async function enrichTechWithMetrics(
	tech: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const metrics = await calculateTechMetrics(tech.id as string);
	return {
		...tech,
		...metrics
	};
}

/**
 * @param techs = await query(`SELECT * FROM employees WHERE company_id = $1 AND is_available = true`, [companyId])
 * @returns
 */

export async function enrichMultipleTechnicians(
	technicians: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
	return await Promise.all(
		technicians.map((tech) => enrichTechWithMetrics(tech))
	);
}
