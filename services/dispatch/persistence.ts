import { pool } from "../../db";
import { PoolClient } from "pg";

/**
 * @param jobId
 * @param techId
 * @param assignedByUserId
 * @param isManualOverride
 * @param overrideReason
 * @param scoringDetails
 * @returns
 *
 */
export async function assignJobToTech(
	jobId: string,
	techId: string,
	assignedByUserId: string,
	isManualOverride: boolean,
	overrideReason?: string,
	scoringDetails?: Record<string, unknown>
): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		const jobResult = await client.query(
			`SELECT id, company_id, status, assigned_tech_id, priority, job_type,
            FROM jobs WHERE id = $1`,
			[jobId]
		);

		if (jobResult.rowCount === 0) {
			throw new Error("Job not found");
		}

		const job = jobResult.rows[0];

		if (job.assigned_tech_id) {
			throw new Error(
				`Job ${jobId} is already assigned to tech ${job.assigned_tech_id}`
			);
		}

		const techResult = await client.query(
			`SELECT id, current_jobs_count, max_concurrent_jobs
            FROM employees WHERE id = $1`,
			[techId]
		);

		if (techResult.rowCount === 0) {
			throw new Error("Tech not found");
		}

		const tech = techResult.rows[0];

		if (tech.current_jobs_count >= tech.max_concurrent_jobs) {
			throw new Error(`Tech ${techId} has reached max concurrent jobs limit`);
		}

		await client.query(
			`UPDATE jobs SET assigned_tech_id = $1, status = 'assigned', updated_at = NOW()
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

		await client.query(
			`INSERT INTO job_assignments 
            (job_id, tech_id, assigned_by_user_id, assigned_at, is_manual_override, 
              override_reason, scoring_details, job_priority, job_type, is_emergency)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			[
				jobId,
				techId,
				job.company_id,
				assignedByUserId,
				isManualOverride,
				overrideReason || null,
				scoringDetails ? JSON.stringify(scoringDetails) : null,
				job.priority,
				job.job_type,
				job.priority === "emergency"
			]
		);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}
/**
 * @param jobId
 * @param completionNotes
 * @param customerRating
 * @param durationMinutes
 * @param firstTimeFix
 */

export async function completeJob(
	jobId: string,
	completionNotes?: string,
	durationMinutes?: number,
	firstTimeFix?: boolean,
	customerRating?: number
): Promise<void> {
	const client = await pool.connect();

	try {
		await client.query("BEGIN");
		const jobResult = await client.query(
			`SELECT id, company_id, assigned_tech_id, status
			FROM jobs WHERE id = $1`,
			[jobId]
		);
		if (jobResult.rows.length === 0) {
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
		await client.query(
			`INSERT INTO job_completions 
			(job_id, tech_id, company_id, completion_notes, duration_minutes, 
			 first_time_fix, customer_rating)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[
				jobId,
				job.assigned_tech_id,
				job.company_id,
				completionNotes || null,
				durationMinutes || null,
				firstTimeFix ?? true,
				customerRating || null
			]
		);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

/**
 * @param jobId
 */
export async function unassignJob(jobId: string): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		const jobResult = await client.query(
			`SELECT id, assigned_tech_id, status
            FROM jobs WHERE id = $1`,
			[jobId]
		);

		if (jobResult.rows.length === 0) {
			throw new Error("Job not found");
		}
		const job = jobResult.rows[0];

		if (!job.assigned_tech_id) {
			throw new Error(
				`Job ${jobId} is not currently assigned to any technician`
			);
		}

		await client.query(
			`UPDATE jobs 
            SET assigned_tech_id = NULL, status = 'unassigned', updated_at = NOW()
            WHERE id = $1`,
			[jobId]
		);

		await client.query(
			`UPDATE employees 
            SET current_job_id = NULL,
                current_jobs_count = GREATEST(0, current_jobs_count - 1),
                updated_at = NOW()
            WHERE id = $1`,
			[job.assigned_tech_id]
		);

		await client.query(
			`UPDATE emplyees
            SET current_job_id = NULL,
                current_jobs_count = GREATEST(0, current_jobs_count - 1),
                updated_at = NOW()
            WHERE id = $1`,
			[job.assigned_tech_id]
		);

		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

/**
 * @param jobId
 */

export async function startJob(jobId: string): Promise<void> {
	const result = await pool.query(
		`UPDATE jobs 
		SET status = 'in_progress', updated_at = NOW()
		WHERE id = $1 AND status = 'assigned'
		RETURNING id`,
		[jobId]
	);

	if (result.rows.length === 0) {
		throw new Error(`Job ${jobId} not found or not in 'assigned' status`);
	}
}
