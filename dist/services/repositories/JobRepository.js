// services/repositories/JobRepository.ts
// UPDATED - Uses Neon instead of pg Pool
import { getSql } from "../../db";
export class JobRepository {
	async findById(jobId) {
		const sql = getSql();
		const result = await sql`
			SELECT 
				id, 
				company_id AS "companyId",
				job_type AS "jobType",
				priority, 
				address, 
				latitude, 
				longitude, 
				status, 
				geocoding_status AS "geocodingStatus",
				required_skills AS "requiredSkills"
			FROM jobs
			WHERE id = ${jobId}
		`;
		const row = result[0];
		if (!row) return null;
		return {
			id: row.id,
			companyId: row.companyId,
			jobType: row.jobType,
			priority: row.priority,
			address: row.address,
			latitude: row.latitude,
			longitude: row.longitude,
			status: row.status,
			geocodingStatus: row.geocodingStatus,
			requiredSkills: row.requiredSkills || []
		};
	}
	async findByIdWithLock(jobId, client) {
		const result = await client.query(
			`SELECT 
				id, 
				company_id AS "companyId",
				job_type AS "jobType",
				priority, 
				address, 
				latitude, 
				longitude, 
				status, 
				geocoding_status AS "geocodingStatus",
				required_skills AS "requiredSkills",
				assigned_tech_id AS "assignedTechId"
			FROM jobs
			WHERE id = $1
			FOR UPDATE`,
			[jobId]
		);
		if (result.rows.length === 0) return null;
		const row = result.rows[0];
		return {
			id: row.id,
			companyId: row.companyId,
			jobType: row.jobType,
			priority: row.priority,
			address: row.address,
			latitude: row.latitude,
			longitude: row.longitude,
			status: row.status,
			geocodingStatus: row.geocodingStatus,
			requiredSkills: row.requiredSkills || [],
			assignedTechId: row.assignedTechId ?? null
		};
	}
	async updateGeocoding(jobId, latitude, longitude, status) {
		const sql = getSql();
		await sql`
			UPDATE jobs 
			SET latitude = ${latitude}, 
			    longitude = ${longitude}, 
			    geocoding_status = ${status}, 
			    updated_at = NOW()
			WHERE id = ${jobId}
		`;
	}
	async assignToTech(jobId, techId, client) {
		await client.query(
			`UPDATE jobs 
			 SET assigned_tech_id = $1, status = 'assigned', updated_at = NOW()
			 WHERE id = $2`,
			[techId, jobId]
		);
	}
	async logAssignment(
		jobId,
		techId,
		companyId,
		assignedByUserId,
		isManualOverride,
		overrideReason,
		scoringDetails,
		jobPriority,
		jobType,
		client
	) {
		await client.query(
			`INSERT INTO job_assignments 
			(job_id, tech_id, company_id, assigned_by_user_id, is_manual_override, 
			 override_reason, scoring_details, job_priority, job_type, is_emergency)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			[
				jobId,
				techId,
				companyId,
				assignedByUserId,
				isManualOverride,
				overrideReason,
				scoringDetails ? JSON.stringify(scoringDetails) : null,
				jobPriority,
				jobType,
				jobPriority === "emergency"
			]
		);
	}
	async updateEmployeeWorkload(techId, jobId, client) {
		await client.query(
			`UPDATE employees
			 SET current_job_id = $1,
			     current_jobs_count = current_jobs_count + 1,
			     updated_at = NOW()
			 WHERE id = $2`,
			[jobId, techId]
		);
	}
}
