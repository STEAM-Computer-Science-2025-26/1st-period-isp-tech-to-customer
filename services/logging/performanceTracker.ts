import { getSql } from "../../db/connection";
import { UpdatePerformanceSnapshotInput, TechPerformanceSnapshot } from "../types/loggingTypes";
import { computePerformanceScore } from './performanceUtils';

export async function updatePerformanceSnapshot(
    input: UpdatePerformanceSnapshotInput
): Promise<TechPerformanceSnapshot> {
    const sql = getSql();
    
    // Get all completed jobs for this date
    const completedJobs = await sql`
        SELECT 
            job_id,
            actual_start_time,
            actual_completion_time,
            actual_duration_minutes,
            estimated_duration_minutes,
            first_time_fix,
            customer_rating,
            distance_driven_km,
            travel_time_minutes
        FROM job_completion_logs
        WHERE tech_id = ${input.techId}
        AND DATE(completed_at) = ${input.date}
        ORDER BY completed_at ASC
    `;
    
    // Calculate daily metrics
    const jobsCount = completedJobs.length;
    const totalDriveTime = completedJobs.reduce((sum, j) => sum + (j.travel_time_minutes || 0), 0);
    const totalDistance = completedJobs.reduce((sum, j) => sum + (j.distance_driven_km || 0), 0);
    const avgDuration = jobsCount > 0
        ? Math.round(completedJobs.reduce((sum, j) => sum + j.actual_duration_minutes, 0) / jobsCount)
        : null;
    
    const fixedJobs = completedJobs.filter(j => j.first_time_fix).length;
    const firstTimeFixRate = jobsCount > 0
        ? Number((fixedJobs / jobsCount * 100).toFixed(2))
        : null;
    
    const ratedJobs = completedJobs.filter(j => j.customer_rating);
    const avgRating = ratedJobs.length > 0
        ? Number((ratedJobs.reduce((sum, j) => sum + j.customer_rating, 0) / ratedJobs.length).toFixed(2))
        : null;
    
    // Get last 10 jobs for performance score
    const recentJobs = await sql`
        SELECT 
            job_id,
            completed_at,
            actual_duration_minutes,
            estimated_duration_minutes,
            first_time_fix,
            customer_rating
        FROM job_completion_logs
        WHERE tech_id = ${input.techId}
        AND company_id = ${input.companyId}
        ORDER BY completed_at DESC
        LIMIT 10
    `;
    
    const performanceScore = computePerformanceScore({ recentJobs: recentJobs as any[] });
    
    // Upsert snapshot
    const result = await sql`
        INSERT INTO tech_performance_snapshots (
            tech_id,
            company_id,
            snapshot_date,
            jobs_completed_count,
            total_drive_time_minutes,
            total_distance_km,
            average_job_duration_minutes,
            first_time_fix_rate,
            average_customer_rating,
            recent_performance_score,
            recent_jobs_data
        ) VALUES (
            ${input.techId},
            ${input.companyId},
            ${input.date},
            ${jobsCount},
            ${totalDriveTime},
            ${totalDistance},
            ${avgDuration},
            ${firstTimeFixRate},
            ${avgRating},
            ${performanceScore},
            ${JSON.stringify(recentJobs.map(j => ({
                jobId: j.job_id,
                completedAt: j.completed_at,
                duration: j.actual_duration_minutes,
                firstTimeFix: j.first_time_fix,
                customerRating: j.customer_rating
            })))}
        )
        ON CONFLICT (tech_id, snapshot_date)
        DO UPDATE SET
            jobs_completed_count = EXCLUDED.jobs_completed_count,
            total_drive_time_minutes = EXCLUDED.total_drive_time_minutes,
            total_distance_km = EXCLUDED.total_distance_km,
            average_job_duration_minutes = EXCLUDED.average_job_duration_minutes,
            first_time_fix_rate = EXCLUDED.first_time_fix_rate,
            average_customer_rating = EXCLUDED.average_customer_rating,
            recent_performance_score = EXCLUDED.recent_performance_score,
            recent_jobs_data = EXCLUDED.recent_jobs_data
        RETURNING *
    `;
    
    return toCamelCase(result[0]) as TechPerformanceSnapshot;
}
export async function getPerformanceSnapshots(params: {
    companyId: string;
    techId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}): Promise<TechPerformanceSnapshot[]> {
    const sql = getSql();
    const conditions: string[] = [];
    const values: any[] = [];

    conditions.push(`company_id = $${values.length + 1}`);
    values.push(params.companyId);

    if (params.techId) {
        conditions.push(`tech_id = $${values.length + 1}`);
        values.push(params.techId);
    }
    if (params.startDate) {
        conditions.push(`snapshot_date >= $${values.length + 1}`);
        values.push(params.startDate);
    }
    if (params.endDate) {
        conditions.push(`snapshot_date <= $${values.length + 1}`);
        values.push(params.endDate);
    }

    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const query = `
        SELECT *
        FROM tech_performance_snapshots
        WHERE ${conditions.join(' AND ')}
        ORDER BY snapshot_date DESC, tech_id ASC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
    `;

    values.push(limit, offset);

    const rows = await sql`${query}`;
    
    return rows.map(row => ({
        ...toCamelCase(row),
        recentJobsData: JSON.parse(row.recent_jobs_data || '[]')
    })) as TechPerformanceSnapshot[];
}
function toCamelCase(row: Record<string, any>): TechPerformanceSnapshot {
    const camelCaseRow: Record<string, any> = {};
    for (const key in row) {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        camelCaseRow[camelKey] = row[key];
    }
    return camelCaseRow as TechPerformanceSnapshot;
}
export async function getTechPerformanceTrend(
    techId: string,
    companyId: string,
    days: number = 30
): Promise<any> {
    const sql = getSql();
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const snapshots = await getPerformanceSnapshots({
        companyId,
        techId,
        startDate,
        endDate
    });
    
    if (snapshots.length === 0) {
        return { error: 'No performance data available' };
    }
    
    // Calculate trends
    const first = snapshots[snapshots.length - 1];
    const last = snapshots[0];
    
    const performanceTrend = last.recentPerformanceScore - first.recentPerformanceScore;
    const ratingTrend = (last.averageCustomerRating || 0) - (first.averageCustomerRating || 0);
    const fixRateTrend = (last.firstTimeFixRate || 0) - (first.firstTimeFixRate || 0);
    
    return {
        techId,
        periodDays: days,
        totalSnapshots: snapshots.length,
        currentPerformanceScore: last.recentPerformanceScore,
        trends: {
            performance: {
                change: Number(performanceTrend.toFixed(2)),
                direction: performanceTrend > 0 ? 'improving' : performanceTrend < 0 ? 'declining' : 'stable'
            },
            customerRating: {
                change: Number(ratingTrend.toFixed(2)),
                direction: ratingTrend > 0 ? 'improving' : ratingTrend < 0 ? 'declining' : 'stable'
            },
            firstTimeFixRate: {
                change: Number(fixRateTrend.toFixed(2)),
                direction: fixRateTrend > 0 ? 'improving' : fixRateTrend < 0 ? 'declining' : 'stable'
            }
        },
        averages: {
            jobsPerDay: Number((snapshots.reduce((sum, s) => sum + s.jobsCompletedCount, 0) / snapshots.length).toFixed(2)),
            driveTimePerDay: Math.round(snapshots.reduce((sum, s) => sum + s.totalDriveTimeMinutes, 0) / snapshots.length),
            distancePerDay: Number((snapshots.reduce((sum, s) => sum + s.totalDistanceKm, 0) / snapshots.length).toFixed(2))
        },
        snapshots
    };
}