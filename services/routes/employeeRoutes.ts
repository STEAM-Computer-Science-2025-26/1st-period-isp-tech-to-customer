import { FastifyInstance } from "fastify";
import { query } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";

// ============================================================
// Schemas
// ============================================================

const listEmployeesSchema = z.object({
	companyId: z.string().uuid().optional()
});

const createEmployeeSchema = z.object({
	userId: z.string().uuid(),
	companyId: z.string().uuid().optional(), // dev only
	name: z.string().min(1),
	email: z.string().email().optional(),
	role: z.string().optional(),
	skills: z.array(z.string()).min(1),
	skillLevel: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
	homeAddress: z.string().min(1),
	phone: z.string().optional(),
	maxConcurrentJobs: z.number().int().min(1).max(20).optional(),
	internalNotes: z.string().optional(),
	createdByUserId: z.string().uuid().optional()
});

const updateEmployeeSchema = z
	.object({
		name: z.string().min(1).optional(),
		email: z.string().email().optional(),
		role: z.string().optional(),
		skills: z.array(z.string()).min(1).optional(),
		skillLevel: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
		homeAddress: z.string().min(1).optional(),
		phone: z.string().optional(),
		isAvailable: z.boolean().optional(),
		maxConcurrentJobs: z.number().int().min(1).max(20).optional(),
		isActive: z.boolean().optional(),
		internalNotes: z.string().optional(),
		latitude: z.number().min(-90).max(90).optional(),
		longitude: z.number().min(-180).max(180).optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field must be provided"
	});

// ============================================================
// Shared SELECT columns (keeps queries DRY)
// ============================================================

const EMPLOYEE_SELECT = `
	id,
	user_id AS "userId",
	company_id AS "companyId",
	name, email, role, skills,
	skill_level AS "skillLevel",
	home_address AS "homeAddress",
	phone,
	is_available AS "isAvailable",
	availability_updated_at AS "availabilityUpdatedAt",
	current_job_id AS "currentJobId",
	max_concurrent_jobs AS "maxConcurrentJobs",
	is_active AS "isActive",
	rating,
	last_job_completed_at AS "lastJobCompletedAt",
	internal_notes AS "internalNotes",
	created_by_user_id AS "createdByUserId",
	latitude, longitude,
	location_updated_at AS "locationUpdatedAt",
	created_at AS "createdAt",
	updated_at AS "updatedAt"
`;

// ============================================================
// Helpers
// ============================================================

type AuthUser = {
	userId?: string;
	id?: string;
	role?: string;
	companyId?: string;
};

// ============================================================
// Route handlers
// ============================================================

export function listEmployees(fastify: FastifyInstance) {
	fastify.get("/employees", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";

		const parsed = listEmployeesSchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid query parameters",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const effectiveCompanyId = isDev
			? (parsed.data.companyId ?? authUser?.companyId)
			: authUser?.companyId;

		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}

		const result = await query(
			`SELECT ${EMPLOYEE_SELECT} FROM employees
			WHERE company_id = $1
			ORDER BY name ASC`,
			[effectiveCompanyId]
		);
		return { employees: result };
	});
}

export function getEmployee(fastify: FastifyInstance) {
	fastify.get("/employees/:employeeId", async (request, reply) => {
		const { employeeId } = request.params as { employeeId: string };
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";

		if (!authUser?.companyId && !isDev) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Missing company in token" });
		}

		const result = await query(
			`SELECT ${EMPLOYEE_SELECT} FROM employees
			WHERE id = $1${isDev ? "" : " AND company_id = $2"}`,
			isDev ? [employeeId] : [employeeId, authUser.companyId]
		);

		if (result.length === 0) {
			return reply.code(404).send({ error: "Employee not found" });
		}
		return { employee: result[0] };
	});
}

export function createEmployee(fastify: FastifyInstance) {
	fastify.post("/employees", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";

		if (!authUser?.companyId && !isDev) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Missing company in token" });
		}

		const parsed = createEmployeeSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const body = parsed.data;
		const effectiveCompanyId = isDev
			? (body.companyId ?? authUser.companyId)
			: authUser.companyId;

		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}

		const effectiveCreatedByUserId =
			body.createdByUserId ?? authUser.userId ?? authUser.id ?? null;

		const result = await query(
			`INSERT INTO employees (
				user_id, company_id, name, email, role, skills, skill_level,
				home_address, phone, max_concurrent_jobs, internal_notes, created_by_user_id
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			RETURNING ${EMPLOYEE_SELECT}`,
			[
				body.userId,
				effectiveCompanyId,
				body.name,
				body.email ?? null,
				body.role ?? null,
				body.skills,
				JSON.stringify(body.skillLevel ?? {}),
				body.homeAddress,
				body.phone ?? null,
				body.maxConcurrentJobs ?? 1,
				body.internalNotes ?? null,
				effectiveCreatedByUserId
			]
		);
		return { employee: result[0] };
	});
}

export function updateEmployee(fastify: FastifyInstance) {
	fastify.put("/employees/:employeeId", async (request, reply) => {
		const { employeeId } = request.params as { employeeId: string };
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";

		if (!authUser?.companyId && !isDev) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Missing company in token" });
		}

		const parsed = updateEmployeeSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const body = parsed.data;
		const updates: string[] = [];
		const values: Array<string | number | boolean | string[] | null> = [];

		if (body.name !== undefined) {
			values.push(body.name);
			updates.push(`name = $${values.length}`);
		}
		if (body.email !== undefined) {
			values.push(body.email);
			updates.push(`email = $${values.length}`);
		}
		if (body.role !== undefined) {
			values.push(body.role);
			updates.push(`role = $${values.length}`);
		}
		if (body.skills !== undefined) {
			values.push(body.skills);
			updates.push(`skills = $${values.length}`);
		}
		if (body.skillLevel !== undefined) {
			values.push(JSON.stringify(body.skillLevel));
			updates.push(`skill_level = $${values.length}`);
		}
		if (body.homeAddress !== undefined) {
			values.push(body.homeAddress);
			updates.push(`home_address = $${values.length}`);
		}
		if (body.phone !== undefined) {
			values.push(body.phone);
			updates.push(`phone = $${values.length}`);
		}
		if (body.isAvailable !== undefined) {
			values.push(body.isAvailable);
			updates.push(`is_available = $${values.length}`);
			updates.push(`availability_updated_at = NOW()`);
		}
		if (body.maxConcurrentJobs !== undefined) {
			values.push(body.maxConcurrentJobs);
			updates.push(`max_concurrent_jobs = $${values.length}`);
		}
		if (body.isActive !== undefined) {
			values.push(body.isActive);
			updates.push(`is_active = $${values.length}`);
		}
		if (body.internalNotes !== undefined) {
			values.push(body.internalNotes);
			updates.push(`internal_notes = $${values.length}`);
		}
		if (body.latitude !== undefined) {
			values.push(body.latitude);
			updates.push(`latitude = $${values.length}`);
			updates.push(`location_updated_at = NOW()`);
		}
		if (body.longitude !== undefined) {
			values.push(body.longitude);
			updates.push(`longitude = $${values.length}`);
		}

		values.push(employeeId);
		if (!isDev) {
			values.push(authUser.companyId ?? null);
		}

		const result = await query(
			`UPDATE employees
			SET ${updates.join(", ")}, updated_at = NOW()
			WHERE id = $${values.length}${isDev ? "" : ` AND company_id = $${values.length + 1}`}
			RETURNING ${EMPLOYEE_SELECT}`,
			values
		);

		if (!result[0]) {
			return reply.code(404).send({ error: "Employee not found" });
		}
		return { employee: result[0] };
	});
}

export function deleteEmployee(fastify: FastifyInstance) {
	fastify.delete("/employees/:employeeId", async (request, reply) => {
		const { employeeId } = request.params as { employeeId: string };
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";

		if (!authUser?.companyId && !isDev) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Missing company in token" });
		}

		const result = isDev
			? await query("DELETE FROM employees WHERE id = $1 RETURNING id", [
					employeeId
				])
			: await query(
					"DELETE FROM employees WHERE id = $1 AND company_id = $2 RETURNING id",
					[employeeId, authUser.companyId]
				);

		if (!result[0]) {
			return reply.code(404).send({ error: "Employee not found" });
		}
		return { message: `Employee ${employeeId} deleted` };
	});
}

export function registerEmployeeRoutes(fastify: FastifyInstance) {
	fastify.register(async (authenticatedRoutes) => {
		authenticatedRoutes.addHook("onRequest", authenticate);
		listEmployees(authenticatedRoutes);
		getEmployee(authenticatedRoutes);
		createEmployee(authenticatedRoutes);
		updateEmployee(authenticatedRoutes);
		deleteEmployee(authenticatedRoutes);
	});
}
