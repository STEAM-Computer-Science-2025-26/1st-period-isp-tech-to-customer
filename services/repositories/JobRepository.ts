
import { query, pool } from "../../db";

export type JobRecord = {
	id: string;
	companyId: string;
	jobType: string;
	priority: string;
	address: string;
	latitude: number | null;
	longitude: number | null;
	status: string;
	geocodingStatus: string;
	requiredSkills: string[];
};

export class JobRepository {
	async findById(jobId: string): Promise<JobRecord | null> {
		const result = await query<any>(
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
				required_skills AS "requiredSkills"
			FROM jobs
			WHERE id = $1`,
			[jobId]
		);

		return result[0] || null;
	}

	async findByIdWithLock(jobId: string, client: any): Promise<JobRecord | null> {
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
			requiredSkills: row.requiredSkills || []
		};
	}

	async updateGeocoding(
		jobId: string,
		latitude: number | null,
		longitude: number | null,
		status: "complete" | "failed"
	): Promise<void> {
		await query(
			`UPDATE jobs 
			SET latitude = $1, longitude = $2, geocoding_status = $3, updated_at = NOW()
			WHERE id = $4`,
			[latitude, longitude, status, jobId]
		);
	}

	async assignToTech(jobId: string, techId: string, client: any): Promise<void> {
		await client.query(
			`UPDATE jobs 
			SET assigned_tech_id = $1, status = 'assigned', updated_at = NOW()
			WHERE id = $2`,
			[techId, jobId]
		);
	}

	async logAssignment(
		jobId: string,
		techId: string,
		companyId: string,
		assignedByUserId: string,
		isManualOverride: boolean,
		overrideReason: string | null,
		scoringDetails: any,
		jobPriority: string,
		jobType: string,
		client: any
	): Promise<void> {
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

	async updateEmployeeWorkload(
		techId: string,
		jobId: string,
		client: any
	): Promise<void> {
		await client.query(
			`UPDATE employees
			SET current_job_id = $1,
				current_jobs_count = current_jobs_count + 1,
				updated_at = NOW()
			WHERE id = $2`,
			[jobId, techId]
		);
	}

	async getClient() {
		return pool.connect();
	}
}