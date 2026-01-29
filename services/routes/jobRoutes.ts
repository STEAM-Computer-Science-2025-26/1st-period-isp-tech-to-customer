import { FastifyInstance } from "fastify";
import { query } from "../../db";

/** Register the GET /jobs endpoint (runs when a client requests GET /jobs). */
export function listJobs(fastify: FastifyInstance) {
	fastify.get("/jobs", async (request) => {
		const { companyId, status, assignedTechId, priority } = request.query as {
			companyId?: string;
			status?: string;
			assignedTechId?: string;
			priority?: string;
		};

		let sql = `SELECT 
			id,
			company_id AS "companyId",
			customer_name AS "customerName",
			address,
			phone,
			job_type AS "jobType",
			status,
			priority,
			assigned_tech_id AS "assignedTechId",
			scheduled_time AS "scheduledTime",
			created_at AS "createdAt",
			completed_at AS "completedAt",
			initial_notes AS "initialNotes",
			completion_notes AS "completionNotes",
			updated_at AS "updatedAt"
		FROM jobs`;

		const conditions: string[] = [];
		const params: string[] = [];

		if (companyId) {
			params.push(companyId);
			conditions.push(`company_id = $${params.length}`);
		}
		if (status) {
			params.push(status);
			conditions.push(`status = $${params.length}`);
		}
		if (assignedTechId) {
			params.push(assignedTechId);
			conditions.push(`assigned_tech_id = $${params.length}`);
		}
		if (priority) {
			params.push(priority);
			conditions.push(`priority = $${params.length}`);
		}

		if (conditions.length > 0) {
			sql += ` WHERE ${conditions.join(" AND ")}`;
		}

		sql += ` ORDER BY created_at DESC`;

		const jobs = await query(sql, params);
		return { jobs };
	});
}

/** Register the POST /jobs endpoint (runs when a client requests POST /jobs). */
export function createJob(fastify: FastifyInstance) {
	fastify.post("/jobs", async (request) => {
		const body = request.body as {
			companyId: string;
			customerName: string;
			address: string;
			phone: string;
			jobType: string;
			priority: string;
			scheduledTime?: string;
			initialNotes?: string;
		};

		const result = await query(
			`INSERT INTO jobs (
				company_id,
				customer_name,
				address,
				phone,
				job_type,
				priority,
				status,
				scheduled_time,
				initial_notes
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING 
				id,
				company_id AS "companyId",
				customer_name AS "customerName",
				address,
				phone,
				job_type AS "jobType",
				status,
				priority,
				assigned_tech_id AS "assignedTechId",
				scheduled_time AS "scheduledTime",
				created_at AS "createdAt",
				completed_at AS "completedAt",
				initial_notes AS "initialNotes",
				completion_notes AS "completionNotes",
				updated_at AS "updatedAt"`,
			[
				body.companyId,
				body.customerName,
				body.address,
				body.phone,
				body.jobType,
				body.priority,
				'unassigned', // default status
				body.scheduledTime || null,
				body.initialNotes || null
			]
		);
		return { job: result[0] };
	});
}

/** Register the PUT /jobs/:jobId/status endpoint (runs when a client requests it). */
export function updateJobStatus(fastify: FastifyInstance) {
	fastify.put("/jobs/:jobId/status", async (request, reply) => {
		const { jobId } = request.params as { jobId: string };
		const body = request.body as { 
			status: string;
			completionNotes?: string;
		};

		// If status is 'completed', set completed_at timestamp
		const setCompletedAt = body.status === 'completed' ? ', completed_at = NOW()' : '';

		const result = await query(
			`UPDATE jobs 
			SET status = $1, 
				completion_notes = $2,
				updated_at = NOW()
				${setCompletedAt}
			WHERE id = $3 
			RETURNING 
				id,
				company_id AS "companyId",
				customer_name AS "customerName",
				address,
				phone,
				job_type AS "jobType",
				status,
				priority,
				assigned_tech_id AS "assignedTechId",
				scheduled_time AS "scheduledTime",
				created_at AS "createdAt",
				completed_at AS "completedAt",
				initial_notes AS "initialNotes",
				completion_notes AS "completionNotes",
				updated_at AS "updatedAt"`,
			[body.status, body.completionNotes || null, jobId]
		);

		if (!result[0]) {
			return reply.code(404).send({ error: "Job not found" });
		}

		return { job: result[0] };
	});
}

/** Register the DELETE /jobs/:jobId endpoint (runs when a client requests it). */
export function deleteJob(fastify: FastifyInstance) {
	fastify.delete("/jobs/:jobId", async (request, reply) => {
		const { jobId } = request.params as { jobId: string };
		const result = await query("DELETE FROM jobs WHERE id = $1 RETURNING id", [jobId]);

		if (!result[0]) {
			return reply.code(404).send({ error: "Job not found" });
		}

		return { message: `Job ${jobId} deleted` };
	});
}


/*
get jobId from params
get fields to update from request body(optional)
customer name, address, phone, job type, status, priority, assigned tech ID, scheduled time, initial notes
updates the job in the database
returns a success message and jobId/404 error if not found
*/

export function updateJob(fastify: FastifyInstance) {
	fastify.put("/jobs/:jobId", async (request, reply) => {
		const { jobId } = request.params as { jobId: string };
		const body = request.body as {
			customerName?: string;
			address?: string;
			phone?: string;
			jobType?: string;
			status?: string;
			priority?: string;
			assignedTechId?: string;
			scheduledTime?: string;
			initialNotes?: string;
		};
		
		const updates: string[] = [];
		const values: (string | null)[] = [];

		if (body.customerName !== undefined) {
			values.push(body.customerName);
			updates.push(`customer_name = $${values.length}`);
		}
		if (body.address !== undefined) {
			values.push(body.address);
			updates.push(`address = $${values.length}`);
		}
		if (body.phone !== undefined) {
			values.push(body.phone);
			updates.push(`phone = $${values.length}`);
		}
		if (body.jobType !== undefined) {
			values.push(body.jobType);
			updates.push(`job_type = $${values.length}`);
		}
		if (body.status !== undefined) {
			values.push(body.status);
			updates.push(`status = $${values.length}`);
		}
		if (body.priority !== undefined) {
			values.push(body.priority);
			updates.push(`priority = $${values.length}`);
		}
		if (body.assignedTechId !== undefined) {
			values.push(body.assignedTechId);
			updates.push(`assigned_tech_id = $${values.length}`);
		}
		if (body.scheduledTime !== undefined) {
			values.push(body.scheduledTime);
			updates.push(`scheduled_time = $${values.length}`);
		}
		if (body.initialNotes !== undefined) {
			values.push(body.initialNotes);
			updates.push(`initial_notes = $${values.length}`);
		}
		if (updates.length === 0) {
			return { message: "No fields to update", jobId };
		}
		
		values.push(jobId);
		const result = await query(
			`UPDATE jobs SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING id`,
			values
		);
		if (!result[0]) {
			return reply.code(404).send({ error: "Job not found" });
		}
		return { message: "Job updated successfully", job: result[0] };
	});
}


/**
 * Convenience "bundle" function: call this ONCE during server startup.
 * It registers all job endpoints so they are available.
 *
 * You are NOT calling all four actions for one request — you're just making
 * sure all four endpoints exist. Each one runs only when its matching route
 * is requested.
 */
export async function jobRoutes(fastify: FastifyInstance) {
	listJobs(fastify);
	createJob(fastify);
	updateJobStatus(fastify);
	updateJob(fastify);
	deleteJob(fastify);
}
