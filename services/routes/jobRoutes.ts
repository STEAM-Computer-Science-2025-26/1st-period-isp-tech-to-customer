import { FastifyInstance } from "fastify";
import { query } from "../../db";
import { authenticate } from "../middleware/auth";

type AuthUser = {
	userId?: string;
	id?: string;
	email?: string;
	role?: string;
	companyId?: string;
};

function getAuthUser(request: { user?: unknown }): AuthUser {
	return (request.user ?? {}) as AuthUser;
}

function isDev(user: AuthUser): boolean {
	return user.role === "dev";
}

function requireCompanyId(user: AuthUser): string | null {
	return user.companyId ?? null;
}

/** Register the GET /jobs endpoint (runs when a client requests GET /jobs). */
export function listJobs(fastify: FastifyInstance) {
	fastify.get("/jobs", async (request, reply) => {
		// TODO: Add pagination (limit/offset) and validate filters.
		const user = getAuthUser(request);
		const dev = isDev(user);

		const { companyId, status, assignedTechId, priority } = request.query as {
			companyId?: string;
			status?: string;
			assignedTechId?: string;
			priority?: string;
		};

		const effectiveCompanyId = dev
			? (companyId ?? requireCompanyId(user))
			: requireCompanyId(user);
		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}

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

		params.push(effectiveCompanyId);
		conditions.push(`company_id = $${params.length}`);

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

		sql += ` WHERE ${conditions.join(" AND ")}`;
		sql += ` ORDER BY created_at DESC`;

		const jobs = await query(sql, params);
		return { jobs };
	});
}

/** Register the POST /jobs endpoint (runs when a client requests POST /jobs). */
export function createJob(fastify: FastifyInstance) {
	fastify.post("/jobs", async (request, reply) => {
		// TODO: Validate body with zod.
		// TODO: Derive companyId from request.user.companyId (don't trust body.companyId).
		const user = getAuthUser(request);
		const dev = isDev(user);

		const body = request.body as {
			companyId?: string;
			customerName: string;
			address: string;
			phone: string;
			jobType: string;
			priority: string;
			scheduledTime?: string;
			initialNotes?: string;
		};

		const effectiveCompanyId = dev
			? (body.companyId ?? requireCompanyId(user))
			: requireCompanyId(user);
		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}

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
				effectiveCompanyId,
				body.customerName,
				body.address,
				body.phone,
				body.jobType,
				body.priority,
				"unassigned",
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
		// TODO: Validate status values and allowed transitions.
		const user = getAuthUser(request);
		const dev = isDev(user);
		const companyId = requireCompanyId(user);

		const { jobId } = request.params as { jobId: string };
		const body = request.body as {
			status: string;
			completionNotes?: string;
		};

		const setCompletedAt =
			body.status === "completed" ? ", completed_at = NOW()" : "";

		const values: Array<string | null> = [
			body.status,
			body.completionNotes || null,
			jobId
		];
		let where = `WHERE id = $3`;
		if (!dev) {
			if (!companyId)
				return reply
					.code(403)
					.send({ error: "Forbidden - Missing company in token" });
			values.push(companyId);
			where += ` AND company_id = $4`;
		}

		const result = await query(
			`UPDATE jobs 
			SET status = $1,
				completion_notes = $2,
				updated_at = NOW()
				${setCompletedAt}
			${where}
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
			values
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
		const user = getAuthUser(request);
		const dev = isDev(user);
		const companyId = requireCompanyId(user);

		const { jobId } = request.params as { jobId: string };
		const result = dev
			? await query("DELETE FROM jobs WHERE id = $1 RETURNING id", [jobId])
			: await query(
					"DELETE FROM jobs WHERE id = $1 AND company_id = $2 RETURNING id",
					[jobId, companyId]
				);

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
		// TODO: Validate body with zod.
		const user = getAuthUser(request);
		const dev = isDev(user);
		const companyId = requireCompanyId(user);

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
		const values: Array<string | null> = [];

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
		let where = `WHERE id = $${values.length}`;
		if (!dev) {
			if (!companyId)
				return reply
					.code(403)
					.send({ error: "Forbidden - Missing company in token" });
			values.push(companyId);
			where += ` AND company_id = $${values.length}`;
		}

		const result = await query(
			`UPDATE jobs SET ${updates.join(", ")}, updated_at = NOW() ${where} RETURNING id`,
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
 */
export async function jobRoutes(fastify: FastifyInstance) {
	fastify.register(async (authenticatedRoutes) => {
		authenticatedRoutes.addHook("onRequest", authenticate);
		listJobs(authenticatedRoutes);
		createJob(authenticatedRoutes);
		updateJobStatus(authenticatedRoutes);
		updateJob(authenticatedRoutes);
		deleteJob(authenticatedRoutes);
	});
}
