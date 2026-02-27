// services/dispatch/persistence.ts
import { getSql } from "../../db";
import { Pool } from "pg";
const pool = new Pool(); // reads DATABASE_URL from env
async function transaction(fn) {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await fn(client);
		await client.query("COMMIT");
		return result;
	} catch (err) {
		await client.query("ROLLBACK");
		throw err;
	} finally {
		client.release();
	}
}
export async function assignJobToTech(
	jobId,
	techId,
	assignedByUserId,
	isManualOverride,
	overrideReason,
	scoringDetails
) {
	await transaction(async (client) => {
		// Lock the job FIRST before reading
		await client.query(`SELECT id FROM jobs WHERE id = $1 FOR UPDATE`, [jobId]);
		// Now safely read the job
		const jobResult = await client.query(
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
		await client.query(`SELECT id FROM employees WHERE id = $1 FOR UPDATE`, [
			techId
		]);
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
	jobId,
	completionNotes,
	durationMinutes,
	firstTimeFix,
	customerRating
) {
	await transaction(async (client) => {
		const jobResult = await client.query(
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
		const completionParams = {
			job_id: jobId,
			tech_id: job.assigned_tech_id,
			company_id: job.company_id,
			completion_notes: completionNotes || null,
			duration_minutes: durationMinutes || null,
			first_time_fix: firstTimeFix ?? true,
			customer_rating: customerRating || null
		};
	});
}
/**
 * Unassign a job from a technician
 * @param jobId
 */
export async function unassignJob(jobId) {
	await transaction(async (client) => {
		const jobResult = await client.query(
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
	});
}
/**
 * Start a job (move from assigned to in_progress)
 * @param jobId
 */
export async function startJob(jobId) {
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
