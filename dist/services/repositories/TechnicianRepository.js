// services/repositories/TechnicianRepository.ts
// UPDATED - Uses Neon instead of pg Pool
import { getSql } from "../../db";
export class TechnicianRepository {
    async findEligibleForDispatch(companyId) {
        const sql = getSql();
        const result = await sql `
			SELECT 
				id, 
				name, 
				company_id AS "companyId",
				is_active AS "isActive",
				is_available AS "isAvailable",
				current_jobs_count AS "currentJobsCount",
				max_concurrent_jobs AS "maxConcurrentJobs",
				latitude, 
				longitude,
				max_travel_distance_miles AS "maxTravelDistanceMiles",
				skills,
				skill_level AS "skillLevel"
			FROM employees
			WHERE company_id = ${companyId}
				AND is_active = true
				AND is_available = true
				AND latitude IS NOT NULL
				AND longitude IS NOT NULL
		`;
        return result;
    }
    async batchQueryMetrics(techIds) {
        if (techIds.length === 0) {
            return new Map();
        }
        const sql = getSql();
        // Query completions
        const completions = await sql `
			SELECT
				tech_id,
				COUNT(*) FILTER (
					WHERE completed_at > NOW() - INTERVAL '30 days'
				) AS count,
				COUNT(*) FILTER (
					WHERE completed_at >= CURRENT_DATE
				) AS daily_job_count
			FROM job_completions
			WHERE tech_id = ANY(${techIds})
			GROUP BY tech_id
		`;
        // Query assignments
        const assignments = await sql `
			SELECT
				assigned_tech_id AS tech_id,
				COUNT(*) AS assigned,
				COUNT(*) FILTER (WHERE status = 'completed') AS completed
			FROM jobs
			WHERE assigned_tech_id = ANY(${techIds})
				AND created_at > NOW() - INTERVAL '30 days'
			GROUP BY assigned_tech_id
		`;
        // Build metrics map
        const metricsMap = new Map();
        for (const techId of techIds) {
            metricsMap.set(techId, {
                dailyJobCount: 0,
                recentJobCount: 0,
                recentCompletionRate: 0
            });
        }
        for (const row of completions) {
            const metrics = metricsMap.get(row.tech_id);
            metrics.recentJobCount = parseInt(row.count);
            metrics.dailyJobCount = parseInt(row.daily_job_count);
        }
        for (const row of assignments) {
            const metrics = metricsMap.get(row.tech_id);
            if (metrics) {
                const assigned = parseInt(row.assigned);
                const completed = parseInt(row.completed);
                metrics.recentCompletionRate = assigned > 0 ? completed / assigned : 0;
            }
        }
        return metricsMap;
    }
    async enrichWithMetrics(techs) {
        const techIds = techs.map((t) => t.id);
        const metricsMap = await this.batchQueryMetrics(techIds);
        return techs.map((tech) => {
            const metrics = metricsMap.get(tech.id) || {
                dailyJobCount: 0,
                recentJobCount: 0,
                recentCompletionRate: 0
            };
            return {
                id: tech.id,
                name: tech.name,
                companyId: tech.companyId,
                isActive: tech.isActive,
                isAvailable: tech.isAvailable,
                currentJobsCount: tech.currentJobsCount,
                maxConcurrentJobs: tech.maxConcurrentJobs,
                dailyJobCount: metrics.dailyJobCount,
                recentJobCount: metrics.recentJobCount,
                recentCompletionRate: metrics.recentCompletionRate,
                latitude: tech.latitude,
                longitude: tech.longitude,
                maxTravelDistanceMiles: tech.maxTravelDistanceMiles,
                skills: tech.skills,
                skillLevel: tech.skillLevel
            };
        });
    }
}
