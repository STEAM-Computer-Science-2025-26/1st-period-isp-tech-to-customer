import { FastifyInstance } from "fastify";
import { query } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";

// Schemas
// ============================================================

const listJobsSchema = z.object({
	companyId: z.string().uuid().optional(),
	status: z
		.enum(["unassigned", "assigned", "in_progress", "completed", "cancelled"])
		.optional(),
	assignedTechId: z.string().uuid().optional(),
	priority: z.enum(["low", "medium", "high", "emergency"]).optional()
});

const createJobSchema = z.object({
	companyId: z.string().uuid().optional(), // dev only — ignored for non-dev
	customerName: z.string().min(1),
	address: z.string().min(1),
	phone: z.string().min(1),
	jobType: z.enum(["installation", "repair", "maintenance", "inspection"]),
	priority: z.enum(["low", "medium", "high", "emergency"]),
	requiredSkills: z.array(z.string()).optional(),
	scheduledTime: z.string().datetime().optional(),
	initialNotes: z.string().optional()
});

const updateJobStatusSchema = z.object({
	status: z.enum([
		"unassigned",
		"assigned",
		"in_progress",
		"completed",
		"cancelled"
	]),
	completionNotes: z.string().optional()
});

const updateJobSchema = z
	.object({
		customerName: z.string().min(1).optional(),
		address: z.string().min(1).optional(),
		phone: z.string().min(1).optional(),
		jobType: z
			.enum(["installation", "repair", "maintenance", "inspection"])
			.optional(),
		status: z
			.enum(["unassigned", "assigned", "in_progress", "completed", "cancelled"])
			.optional(),
		priority: z.enum(["low", "medium", "high", "emergency"]).optional(),
		assignedTechId: z.string().uuid().optional(),
		scheduledTime: z.string().datetime().optional(),
		initialNotes: z.string().optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field must be provided"
	});

// ============================================================
// Helpers
// ============================================================

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

// ============================================================
// Route handlers
// ============================================================

export function listJobs(fastify: FastifyInstance) {
	fastify.get("/jobs", async (request, reply) => {
		const user = getAuthUser(request);
		const dev = isDev(user);

		const parsed = listJobsSchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid query parameters",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const { status, assignedTechId, priority } = parsed.data;
		const effectiveCompanyId = dev
			? (parsed.data.companyId ?? requireCompanyId(user))
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
			updated_at AS "updatedAt",
			latitude,
			longitude,
			geocoding_status AS "geocodingStatus"
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

export function createJob(fastify: FastifyInstance) {
	fastify.post("/jobs", async (request, reply) => {
		const user = getAuthUser(request);
		const dev = isDev(user);

		const parsed = createJobSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const body = parsed.data;

		const effectiveCompanyId = dev
			? (body.companyId ?? requireCompanyId(user))
			: requireCompanyId(user);

		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}

		// Create job with geocoding_status = 'pending'
		// The worker will pick it up automatically
		const result = await query(
			`INSERT INTO jobs (
				company_id, customer_name, address, phone,
				job_type, priority, status, scheduled_time, initial_notes,
				geocoding_status, required_skills
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
			RETURNING
				id,
				company_id AS "companyId",
				customer_name AS "customerName",
				address, phone,
				job_type AS "jobType",
				status, priority,
				assigned_tech_id AS "assignedTechId",
				scheduled_time AS "scheduledTime",
				created_at AS "createdAt",
				completed_at AS "completedAt",
				initial_notes AS "initialNotes",
				completion_notes AS "completionNotes",
				updated_at AS "updatedAt",
				latitude, longitude,
				geocoding_status AS "geocodingStatus",
				required_skills AS "requiredSkills"`,
			[
				effectiveCompanyId,
				body.customerName,
				body.address,
				body.phone,
				body.jobType,
				body.priority,
				"unassigned",
				body.scheduledTime ?? null,
				body.initialNotes ?? null,
				body.requiredSkills ?? []
			]
		);

		const job = result[0];

		// Fire and forget - don't wait for geocoding
		// The background worker will handle it
		console.log(`📍 Job ${job.id} queued for geocoding`);

		return { job };
	});
}

export function updateJobStatus(fastify: FastifyInstance) {
	fastify.put("/jobs/:jobId/status", async (request, reply) => {
		const user = getAuthUser(request);
		const dev = isDev(user);
		const companyId = requireCompanyId(user);

		const parsed = updateJobStatusSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const { jobId } = request.params as { jobId: string };
		const { status, completionNotes } = parsed.data;

		const setCompletedAt =
			status === "completed" ? ", completed_at = NOW()" : "";

		const values: Array<string | null> = [
			status,
			completionNotes ?? null,
			jobId
		];
		let where = `WHERE id = $3`;

		if (!dev) {
			if (!companyId) {
				return reply
					.code(403)
					.send({ error: "Forbidden - Missing company in token" });
			}
			values.push(companyId);
			where += ` AND company_id = $4`;
		}

		const result = await query(
			`UPDATE jobs
			SET status = $1, completion_notes = $2, updated_at = NOW()${setCompletedAt}
			${where}
			RETURNING
				id, company_id AS "companyId",
				customer_name AS "customerName",
				address, phone,
				job_type AS "jobType",
				status, priority,
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

export function updateJob(fastify: FastifyInstance) {
	fastify.put("/jobs/:jobId", async (request, reply) => {
		const user = getAuthUser(request);
		const dev = isDev(user);
		const companyId = requireCompanyId(user);

		const parsed = updateJobSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const { jobId } = request.params as { jobId: string };
		const body = parsed.data;

		const updates: string[] = [];
		const values: Array<string | null> = [];

		if (body.customerName !== undefined) {
			values.push(body.customerName);
			updates.push(`customer_name = $${values.length}`);
		}
		if (body.address !== undefined) {
			values.push(body.address);
			updates.push(`address = $${values.length}`);
			// If address changes, geocoding needs to re-run
			updates.push(`geocoding_status = 'pending'`);
			updates.push(`latitude = NULL`);
			updates.push(`longitude = NULL`);
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

		values.push(jobId);
		let where = `WHERE id = $${values.length}`;

		if (!dev) {
			if (!companyId) {
				return reply
					.code(403)
					.send({ error: "Forbidden - Missing company in token" });
			}
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
