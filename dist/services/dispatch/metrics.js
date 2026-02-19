// services/dispatch/metrics.ts
//
// Calculates real performance metrics for technicians from job history.
//
// BUG 3 FIXES:
//   - 'jobs_completions' → 'job_completions'  (matches schema.sql + persistence.ts)
//   - 'job_assignments' table doesn't exist in schema — replaced with a query
//     against the 'jobs' table filtered by assigned_tech_id, which is what the
//     schema actually has.
import { query } from "../../db";
export const contentType = "text/plain; version=0.0.4; charset=utf-8";
/**
 * Return a small set of Prometheus-style metrics about the Node process.
 * The function is async to match the usage site, but it generates metrics synchronously.
 */
export async function metrics() {
    const m = process.memoryUsage();
    const uptime = process.uptime();
    const processWithHandles = process;
    // best-effort active handles count (non-standard API may not exist in some runtimes)
    const activeHandlesCount = typeof processWithHandles._getActiveHandles === "function"
        ? processWithHandles._getActiveHandles().length
        : 0;
    const lines = [
        "# HELP node_process_uptime_seconds Process uptime in seconds.",
        "# TYPE node_process_uptime_seconds gauge",
        `node_process_uptime_seconds ${uptime}`,
        "# HELP node_process_memory_rss_bytes Resident set size in bytes.",
        "# TYPE node_process_memory_rss_bytes gauge",
        `node_process_memory_rss_bytes ${m.rss}`,
        "# HELP node_process_heap_total_bytes V8 heap total in bytes.",
        "# TYPE node_process_heap_total_bytes gauge",
        `node_process_heap_total_bytes ${m.heapTotal}`,
        "# HELP node_process_heap_used_bytes V8 heap used in bytes.",
        "# TYPE node_process_heap_used_bytes gauge",
        `node_process_heap_used_bytes ${m.heapUsed}`,
        "# HELP node_process_external_memory_bytes V8 external memory in bytes.",
        "# TYPE node_process_external_memory_bytes gauge",
        `node_process_external_memory_bytes ${m.external ?? 0}`,
        "# HELP node_process_active_handles Number of active libuv handles.",
        "# TYPE node_process_active_handles gauge",
        `node_process_active_handles ${activeHandlesCount}`
    ];
    return lines.join("\n") + "\n";
}
export function recordDispatchResult(_totalEligibleTechs, _requiresManualDispatch, _manualDispatchReason) {
    // Placeholder hook for future metrics collection.
}
/**
 * Calculates performance metrics for a single technician.
 * @param techId
 * @param lookbackDays  defaults to 30
 */
export async function calculateTechMetrics(techId, lookbackDays = 30) {
    // Validate lookbackDays is a safe positive integer before interpolating
    // into the query string (avoids SQL injection if the caller passes user input).
    const safeLookback = Math.max(1, Math.floor(Math.abs(lookbackDays)));
    const [completionData, assignmentData, ratingData] = await Promise.all([
        // BUG 3 FIX: was 'jobs_completions' — correct table is 'job_completions'
        query(`SELECT
                COUNT(*) FILTER (
                    WHERE completed_at > NOW() - INTERVAL '${safeLookback} days'
                ) AS count,
                COUNT(*) FILTER (
                    WHERE completed_at >= CURRENT_DATE
                ) AS daily_job_count
            FROM job_completions
            WHERE tech_id = $1`, [techId]),
        // BUG 3 FIX: 'job_assignments' table doesn't exist in the schema.
        // The schema tracks assignments via jobs.assigned_tech_id.
        // We count total assigned jobs vs completed jobs from the jobs table directly.
        query(`SELECT
                COUNT(*) AS assigned,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed
            FROM jobs
            WHERE assigned_tech_id = $1
                AND created_at > NOW() - INTERVAL '${safeLookback} days'`, [techId]),
        // BUG 3 FIX: was 'jobs_completions' — correct table is 'job_completions'
        query(`SELECT
                COALESCE(AVG(customer_rating), 3.0) AS avg_rating
            FROM job_completions
            WHERE tech_id = $1
                AND customer_rating IS NOT NULL
                AND completed_at > NOW() - INTERVAL '${safeLookback} days'`, [techId])
    ]);
    const recentJobCount = parseInt(completionData[0]?.count ?? "0");
    const dailyJobCount = parseInt(completionData[0]?.daily_job_count ?? "0");
    const assigned = parseInt(assignmentData[0]?.assigned ?? "0");
    const completed = parseInt(assignmentData[0]?.completed ?? "0");
    const averageRating = parseFloat(ratingData[0]?.avg_rating ?? "3.0");
    const recentCompletionRate = assigned > 0 ? completed / assigned : 0;
    return {
        recentJobCount,
        recentCompletionRate,
        dailyJobCount,
        averageRating
    };
}
/**
 * Enriches a single raw DB tech row with computed metrics.
 */
export async function enrichTechWithMetrics(tech) {
    const metrics = await calculateTechMetrics(tech.id);
    return { ...tech, ...metrics };
}
/**
 * Enriches an array of raw DB tech rows with computed metrics.
 * All metrics queries run in parallel per technician.
 *
 * NOTE: This runs 3 queries per technician in parallel — fine for MVP,
 * but replace with a single batched query when tech pool grows large.
 */
export async function enrichMultipleTechnicians(technicians) {
    return Promise.all(technicians.map((tech) => enrichTechWithMetrics(tech)));
}
