// services/routes/jobRoutes.ts

import { FastifyInstance } from "fastify";
import { getSql, query as runQuery } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { tryGeocodeJob } from "./geocoding";

// ============================================================
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
	companyId: z.string().uuid().optional(),
	customerName: z.string().min(1),
	address: z.string().min(5, "Address must be at least 5 characters"),
	phone: z.string().min(1),
	jobType: z.enum(["installation", "repair", "maintenance", "inspection"]),
	priority: z.enum(["low", "medium", "high", "emergency"]),
	scheduledTime: z.string().datetime().optional(),
	initialNotes: z.string().optional(),
	requiredSkills: z.array(z.string()).optional()
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
		address: z.string().min(5).optional(),
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
		initialNotes: z.string().optional(),
		requiredSkills: z.array(z.string()).optional()
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

const query = getSql();

/**
 * Background geocoding — doesn't block the HTTP response.
 * Failures are logged and marked in the DB for retry.
 */
async function geocodeJobAsync(jobId: string, address: string): Promise<void> {
	try {
		const geo = await tryGeocodeJob(address);
		await query(
			`UPDATE jobs
			 SET latitude = $1, longitude = $2, geocoding_status = $3, updated_at = NOW()
			 WHERE id = $4` as unknown as TemplateStringsArray,
			[geo.latitude, geo.longitude, geo.geocodingStatus, jobId]
		);
		console.log(`✅ Geocoded job ${jobId}: ${geo.geocodingStatus}`);
	} catch (error) {
		console.error(`❌ Geocoding failed for job ${jobId}:`, error);
		await query(
			`UPDATE jobs SET geocoding_status = 'failed', updated_at = NOW() WHERE id = $1` as unknown as TemplateStringsArray,
			[jobId]
		).catch((err) => console.error("Failed to update geocoding status:", err));
	}
}

// Shared SELECT columns — keep queries DRY
const JOB_SELECT = `
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
	required_skills AS "requiredSkills"
`;

// ============================================================
// Route Handlers
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

		const sql = `SELECT ${JOB_SELECT} FROM jobs WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`;
		const jobs = await runQuery(sql, params);
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

		const result = await query(
			`INSERT INTO jobs (
				company_id, customer_name, address, phone,
				job_type, priority, status, scheduled_time,
				initial_notes, geocoding_status, required_skills
			) VALUES ($1, $2, $3, $4, $5, $6, 'unassigned', $7, $8, 'pending', $9)
			RETURNING ${JOB_SELECT}` as unknown as TemplateStringsArray,
			[
				effectiveCompanyId,
				body.customerName,
				body.address,
				body.phone,
				body.jobType,
				body.priority,
				body.scheduledTime ?? null,
				body.initialNotes ?? null,
				body.requiredSkills ?? []
			]
		);

		const job = result[0];

		// Fire and forget — background worker handles geocoding
		console.log(`📍 Job ${job.id} queued for geocoding`);

		return reply.code(201).send({ job });
	});
}
export function getJob(fastify: FastifyInstance) {
	fastify.get(
		"/jobs/:jobId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getAuthUser(request);
			const dev = isDev(user);
			const companyId = requireCompanyId(user);
			const { jobId } = request.params as { jobId: string };

			const result = await query(
				`SELECT ${JOB_SELECT} FROM jobs
			 WHERE id = $1
			   AND ($2::boolean OR company_id = $3)` as unknown as TemplateStringsArray,
				[jobId, dev && !companyId, companyId]
			);

			if (!result[0]) return reply.code(404).send({ error: "Job not found" });
			return reply.send({ job: result[0] });
		}
	);
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
		const values: (string | null)[] = [status, completionNotes ?? null];

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
			`UPDATE jobs
			 SET status = $1, completion_notes = $2${setCompletedAt}, updated_at = NOW()
			 ${where}
			 RETURNING id` as unknown as TemplateStringsArray,
			values
		);

		if (!result[0]) {
			return reply.code(404).send({ error: "Job not found" });
		}
		return { message: "Job status updated", jobId: result[0].id };
	});
}

export function updateJob(fastify: FastifyInstance) {
	fastify.patch("/jobs/:jobId", async (request, reply) => {
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
		const values: (string | string[] | null)[] = [];

		const addField = (
			col: string,
			val: string | string[] | null | undefined
		) => {
			if (val !== undefined) {
				values.push(val ?? null);
				updates.push(`${col} = $${values.length}`);
			}
		};

		let addressChanged = false;
		let newAddress: string | undefined;

		if (body.address !== undefined) {
			addressChanged = true;
			newAddress = body.address;
			// Reset geocoding state inline so dispatch doesn't use stale coords
			values.push(body.address);
			updates.push(`address = $${values.length}`);
			updates.push(`geocoding_status = 'pending'`);
			updates.push(`latitude = NULL`);
			updates.push(`longitude = NULL`);
		}

		addField("customer_name", body.customerName);
		addField("phone", body.phone);
		addField("job_type", body.jobType);
		addField("status", body.status);
		addField("priority", body.priority);
		addField("assigned_tech_id", body.assignedTechId);
		addField("scheduled_time", body.scheduledTime);
		addField("initial_notes", body.initialNotes);
		addField("required_skills", body.requiredSkills);

		if (updates.length === 0) {
			return reply.code(400).send({ error: "No fields to update" });
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
			`UPDATE jobs SET ${updates.join(", ")}, updated_at = NOW() ${where} RETURNING id` as unknown as TemplateStringsArray,
			values
		);

		if (!result[0]) {
			return reply.code(404).send({ error: "Job not found" });
		}

		// Re-geocode in background if address changed
		if (addressChanged && newAddress) {
			geocodeJobAsync(jobId, newAddress).catch(() => {});
		}

		return { message: "Job updated successfully", jobId: result[0].id };
	});
}

export function deleteJob(fastify: FastifyInstance) {
	fastify.delete("/jobs/:jobId", async (request, reply) => {
		const user = getAuthUser(request);
		const dev = isDev(user);
		const companyId = requireCompanyId(user);

		const { jobId } = request.params as { jobId: string };

		const result = dev
			? await query(
					"DELETE FROM jobs WHERE id = $1 RETURNING id" as unknown as TemplateStringsArray,
					[jobId]
				)
			: await query(
					"DELETE FROM jobs WHERE id = $1 AND company_id = $2 RETURNING id" as unknown as TemplateStringsArray,
					[jobId, companyId]
				);

		if (!result[0]) {
			return reply.code(404).send({ error: "Job not found" });
		}
		return { message: `Job ${jobId} deleted` };
	});
}

export function retryGeocoding(fastify: FastifyInstance) {
	fastify.post("/jobs/:jobId/retry-geocoding", async (request, reply) => {
		const user = getAuthUser(request);
		const dev = isDev(user);
		const companyId = requireCompanyId(user);

		const { jobId } = request.params as { jobId: string };

		let whereClause = "WHERE id = $1";
		const params: string[] = [jobId];

		if (!dev) {
			if (!companyId) {
				return reply
					.code(403)
					.send({ error: "Forbidden - Missing company in token" });
			}
			params.push(companyId);
			whereClause += " AND company_id = $2";
		}

		const result = await query(
			`SELECT id, address, geocoding_status AS "geocodingStatus" FROM jobs ${whereClause}` as unknown as TemplateStringsArray,
			params
		);

		if (!result[0]) {
			return reply.code(404).send({ error: "Job not found" });
		}

		const job = result[0] as {
			id: string;
			address: string;
			geocodingStatus: string;
		};

		if (job.geocodingStatus === "complete") {
			return reply
				.code(400)
				.send({ error: "Job already geocoded successfully" });
		}

		geocodeJobAsync(job.id, job.address).catch(() => {});

		return {
			message: "Geocoding retry initiated",
			jobId: job.id,
			status: "pending"
		};
	});
}

// ============================================================
// Registration
// ============================================================

export async function jobRoutes(fastify: FastifyInstance) {
	fastify.register(async (authenticatedRoutes) => {
		authenticatedRoutes.addHook("onRequest", authenticate);
		listJobs(authenticatedRoutes);
		createJob(authenticatedRoutes);
		updateJobStatus(authenticatedRoutes);
		updateJob(authenticatedRoutes);
		deleteJob(authenticatedRoutes);
		retryGeocoding(authenticatedRoutes);
	});
}
