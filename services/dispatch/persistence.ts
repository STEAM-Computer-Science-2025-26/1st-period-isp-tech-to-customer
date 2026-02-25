// services/dispatch/persistence.ts
// FIXED VERSION - Uses Neon, proper transaction handling

import { getSql } from "../../db";

declare function transaction<T>(
	fn: (client: DBClient) => Promise<T>
): Promise<T>;

interface QueryResult<T> {
	rowCount: number;
	rows: T[];
}

interface DBClient {
	query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
}

export async function assignJobToTech(
	jobId: string,
	techId: string,
	assignedByUserId: string,
	isManualOverride: boolean,
	overrideReason?: string,
	scoringDetails?: Record<string, unknown>
): Promise<void> {
	await transaction(async (client: DBClient) => {
		interface JobRow {
			id: string;
			company_id: string;
			status: string;
			assigned_tech_id?: string | null;
			priority: string;
			job_type: string;
		}

		interface TechRow {
			id: string;
			current_jobs_count: number;
			max_concurrent_jobs: number;
		}

		// Lock the job FIRST before reading
		await client.query<{ id: string }>(
			`SELECT id FROM jobs WHERE id = $1 FOR UPDATE`,
			[jobId]
		);

		// Now safely read the job
		const jobResult = await client.query<JobRow>(
			`SELECT id, company_id, status, assigned_tech_id, priority, job_type
			 FROM jobs WHERE id = $1`,
			[jobId]
		);

		if (jobResult.rowCount === 0) {
			throw new Error("Job not found");
		}

		const job = jobResult.rows[0];

		// Check if already assigned AFTER locking
		if (job.assigned_tech_id) {
			throw new Error(
				`Job ${jobId} is already assigned to tech ${job.assigned_tech_id}`
			);
		}

		// Lock the technician row
		await client.query<{ id: string }>(
			`SELECT id FROM employees WHERE id = $1 FOR UPDATE`,
			[techId]
		);

		const techResult = await client.query<TechRow>(
			`SELECT id, current_jobs_count, max_concurrent_jobs
			 FROM employees WHERE id = $1`,
			[techId]
		);

		if (techResult.rowCount === 0) {
			throw new Error("Tech not found");
		}

		const tech = techResult.rows[0] as TechRow;

		if (tech.current_jobs_count >= tech.max_concurrent_jobs) {
			throw new Error(`Tech ${techId} has reached max concurrent jobs limit`);
		}

		// Perform the assignment
		await client.query(
			`UPDATE jobs 
			 SET assigned_tech_id = $1, status = 'assigned', updated_at = NOW()
			 WHERE id = $2`,
			[techId, jobId]
		);

		await client.query(
			`UPDATE employees
			 SET current_job_id = $1,
				 current_jobs_count = current_jobs_count + 1,
				 updated_at = NOW()
			 WHERE id = $2`,
			[jobId, techId]
		);

	});
}

/**
 * Complete a job
 * @param jobId
 * @param completionNotes
 * @param durationMinutes
 * @param firstTimeFix
 * @param customerRating
 */
export async function completeJob(
	jobId: string,
	completionNotes?: string,
	durationMinutes?: number,
	firstTimeFix?: boolean,
	customerRating?: number
): Promise<void> {
	await transaction(async (client: DBClient) => {
		interface JobRow {
			id: string;
			company_id: string;
			assigned_tech_id?: string | null;
			status: string;
		}

		interface EmployeeRow {
			id: string;
			current_job_id?: string | null;
			current_jobs_count: number;
		}

		interface JobCompletionInsert {
			job_id: string;
			tech_id?: string | null;
			company_id: string;
			completion_notes?: string | null;
			duration_minutes?: number | null;
			first_time_fix: boolean;
			customer_rating?: number | null;
		}

		const jobResult = await client.query<JobRow>(
			`SELECT id, company_id, assigned_tech_id, status
			 FROM jobs WHERE id = $1`,
			[jobId]
		);

		if (jobResult.rowCount === 0) {
			throw new Error(`Job ${jobId} not found`);
		}

		const job = jobResult.rows[0];

		if (!job.assigned_tech_id) {
			throw new Error(`Job ${jobId} has no assigned technician`);
		}

		if (job.status === "completed") {
			throw new Error(`Job ${jobId} is already marked as completed`);
		}

		await client.query(
			`UPDATE jobs 
			 SET status = 'completed', 
				 completed_at = NOW(), 
				 completion_notes = $1,
				 updated_at = NOW()
			 WHERE id = $2`,
			[completionNotes || null, jobId]
		);

		await client.query(
			`UPDATE employees 
			 SET current_job_id = NULL,
				 current_jobs_count = GREATEST(0, current_jobs_count - 1),
				 last_job_completed_at = NOW(),
				 updated_at = NOW()
			 WHERE id = $1`,
			[job.assigned_tech_id]
		);

		const completionParams: JobCompletionInsert = {
			job_id: jobId,
			tech_id: job.assigned_tech_id,
			company_id: job.company_id,
			completion_notes: completionNotes || null,
			duration_minutes: durationMinutes || null,
			first_time_fix: firstTimeFix ?? true,
			customer_rating: customerRating || null
		};

		await client.query(
			`INSERT INTO job_completions 
			(job_id, tech_id, company_id, completion_notes, duration_minutes, 
			 first_time_fix, customer_rating)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[
				completionParams.job_id,
				completionParams.tech_id,
				completionParams.company_id,
				completionParams.completion_notes,
				completionParams.duration_minutes,
				completionParams.first_time_fix,
				completionParams.customer_rating
			]
		);
	});
}

/**
 * Unassign a job from a technician
 * @param jobId
 */
export async function unassignJob(jobId: string): Promise<void> {
	await transaction(async (client: DBClient) => {
		interface JobRow {
			id: string;
			assigned_tech_id?: string | null;
			status: string;
		}

		interface IdRow {
			id: string;
		}

		const jobResult = await client.query<JobRow>(
			`SELECT id, assigned_tech_id, status
			 FROM jobs WHERE id = $1`,
			[jobId]
		);

		if (jobResult.rowCount === 0) {
			throw new Error("Job not found");
		}

		const job = jobResult.rows[0];

		if (!job.assigned_tech_id) {
			throw new Error(
				`Job ${jobId} is not currently assigned to any technician`
			);
		}

		await client.query<IdRow>(
			`UPDATE jobs 
			 SET assigned_tech_id = NULL, status = 'unassigned', updated_at = NOW()
			 WHERE id = $1`,
			[jobId]
		);

		await client.query<IdRow>(
			`UPDATE employees 
			 SET current_job_id = NULL,
				 current_jobs_count = GREATEST(0, current_jobs_count - 1),
				 updated_at = NOW()
			 WHERE id = $1`,
			[job.assigned_tech_id]
		);
	});
}

/**
 * Start a job (move from assigned to in_progress)
 * @param jobId
 */
export async function startJob(jobId: string): Promise<void> {
	const sql = getSql();

	const result = await sql`
		UPDATE jobs 
		SET status = 'in_progress', updated_at = NOW()
		WHERE id = ${jobId} AND status = 'assigned'
		RETURNING id
	`;

	if (result.length === 0) {
		throw new Error(`Job ${jobId} not found or not in 'assigned' status`);
	}
}
