import { getSql, toCamelCase } from "../../db/connection";
import { LogAssignmentInput, JobAssignmentLogEntry } from "../types/loggingTypes";



/*
    Validates input data
    Determine time of day category (based on scheduledTime)
    Inserts a new job assignment log entry into the database
    Returns the ID of the newly created log entry
    Handles any database errors.
*/
export async function logJobAssignment(
    input: LogAssignmentInput
): Promise<string> {
    const sql = getSql();
    
    // Extract technician snapshot fields
    const tech = input.technicianSnapshot;
    const scoring = input.scoringDetails;
    
    const result = await sql`
        INSERT INTO job_assignment_logs (
            job_id,
            assigned_tech_id,
            company_id,
            assigned_by_user_id,
            is_manual_override,
            override_reason,
            is_emergency,
            requires_manual_dispatch,
            tech_active_status,
            tech_availability_status,
            tech_current_workload,
            tech_distance_to_job_km,
            tech_shift_start,
            tech_shift_end,
            tech_emergency_capable,
            tech_skill_level,
            skill_match_score,
            distance_score,
            availability_score,
            recent_performance_score,
            workload_balance_score,
            total_score,
            rank_among_eligible,
            total_eligible_techs,
            job_type,
            job_complexity,
            job_priority,
            scheduled_time
        ) VALUES (
            ${input.jobId},
            ${input.assignedTechId},
            ${input.companyId},
            ${input.assignedByUserId},
            ${input.isManualOverride},
            ${input.overrideReason},
            ${input.isEmergency},
            ${input.requiresManualDispatch},
            ${tech.activeStatus},
            ${tech.availabilityStatus},
            ${tech.currentWorkload},
            ${tech.distanceToJobKm},
            ${tech.shiftStart},
            ${tech.shiftEnd},
            ${tech.emergencyCapable},
            ${JSON.stringify(tech.skillLevel)},
            ${scoring.skillMatchScore},
            ${scoring.distanceScore},
            ${scoring.availabilityScore},
            ${scoring.recentPerformanceScore},
            ${scoring.workloadBalanceScore},
            ${scoring.totalScore},
            ${scoring.rankAmongEligible},
            ${scoring.totalEligibleTechs},
            ${input.jobType},
            ${input.jobComplexity},
            ${input.jobPriority},
            ${input.scheduledTime}
        )
        RETURNING id
    `;
    
    return result[0].id as string;
}

/*
    Parts invalidate query parameters.
    Build dynamic sql query with where conditions.
    Apply pagnation(limit/offset).
    Execute query and fetch results.
    Map database rows to JobAssignmentLogEntry objects.
    Return the list of log entries.
*/
export async function getAssignmentLogs(params: {
    companyId: string;
    jobId?: string;
    techId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}): Promise<JobAssignmentLogEntry[]> {
    const sql = getSql();
    const conditions: string[] = [];
    const values: any[] = [];

    conditions.push(`company_id = $${values.length + 1}`);
    values.push(params.companyId);

    if (params.jobId) {
        conditions.push(`job_id = $${values.length + 1}`);
        values.push(params.jobId);
    }
    if (params.techId) {
        conditions.push(`assigned_tech_id = $${values.length + 1}`);
        values.push(params.techId);
    }
    if (params.startDate) {
        conditions.push(`assigned_at >= $${values.length + 1}`);
        values.push(params.startDate);
    }
    if (params.endDate) {
        conditions.push(`assigned_at <= $${values.length + 1}`);
        values.push(params.endDate);
    }

    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
        SELECT 
            id,
            job_id,
            assigned_tech_id,
            company_id,
            assigned_at,
            assigned_by_user_id,
            is_manual_override,
            override_reason,
            is_emergency,
            requires_manual_dispatch,
            tech_active_status,
            tech_availability_status,
            tech_current_workload,
            tech_distance_to_job_km,
            tech_shift_start,
            tech_shift_end,
            tech_emergency_capable,
            tech_skill_level,
            skill_match_score,
            distance_score,
            availability_score,
            recent_performance_score,
            workload_balance_score,
            total_score,
            rank_among_eligible,
            total_eligible_techs,
            job_type,
            job_complexity,
            job_priority,
            scheduled_time,
            created_at
        FROM job_assignment_logs
        ${whereClause}
        ORDER BY assigned_at DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
    `;

    values.push(limit, offset);

    // Execute parametrized query safely
    // The neon query function accepts a TemplateStringsArray or a raw query text + params.
    // To call it with raw SQL text and parameters we use the function form: sql(queryText, ...params)
    const rows = await (sql as any)(query, ...values) as unknown as any[];

    // Transform to proper structure
    return rows.map(row => ({
        ...toCamelCase(row),
        technicianSnapshot: {
            techId: row.assigned_tech_id,
            techName: '', // Would need join to get name
            activeStatus: row.tech_active_status,
            availabilityStatus: row.tech_availability_status,
            skillLevel: row.tech_skill_level,
            distanceToJobKm: row.tech_distance_to_job_km,
            currentWorkload: row.tech_current_workload,
            shiftStart: row.tech_shift_start,
            shiftEnd: row.tech_shift_end,
            emergencyCapable: row.tech_emergency_capable
        },
        scoringDetails: {
            distanceScore: row.distance_score,
            availabilityScore: row.availability_score,
            skillMatchScore: row.skill_match_score,
            recentPerformanceScore: row.recent_performance_score,
            workloadBalanceScore: row.workload_balance_score,
            totalScore: row.total_score,
            rankAmongEligible: row.rank_among_eligible,
            totalEligibleTechs: row.total_eligible_techs
        }
    })) as JobAssignmentLogEntry[];
}