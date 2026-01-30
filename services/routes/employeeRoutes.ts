import { FastifyInstance } from "fastify";
import { query } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";

type AuthUser = {
	userId?: string;
	id?: string;
	role?: string;
	companyId?: string;
};

export function listEmployees(fastify: FastifyInstance) {
	const querySchema = z.object({
		companyId: z.string().optional()
	});

	fastify.get("/employees", async (request, reply) => {
		// TODO: Protect with JWT auth.
		// TODO: Enforce company scoping based on request.user.companyId (don't trust query companyId).
		// TODO: Consider pagination (limit/offset) to avoid returning huge datasets.
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const parsed = querySchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({ error: "Invalid query parameters" });
		}

		const requestedCompanyId = parsed.data.companyId;
		const effectiveCompanyId = isDev
			? (requestedCompanyId ?? authUser?.companyId)
			: authUser?.companyId;
		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}
		let sql = `SELECT 
                        id, 
                        user_id AS "userId",
                        company_id AS "companyId",
                        name,
                        email,
                        role,
                        skills,
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
                        latitude,
                        longitude,
                        location_updated_at AS "locationUpdatedAt",
                        created_at AS "createdAt",
                        updated_at AS "updatedAt"
                    FROM employees`;
		const params: string[] = [effectiveCompanyId];
		sql += ` WHERE company_id = $1`;

		sql += ` ORDER BY name ASC`;

		const result = await query(sql, params);
		return { employees: result };
	});
}

export function getEmployee(fastify: FastifyInstance) {
	fastify.get("/employees/:employeeId", async (request, reply) => {
		// TODO: Protect with JWT auth and verify the employee belongs to request.user.companyId.
		const { employeeId } = request.params as { employeeId: string };
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		if (!authUser?.companyId && !isDev) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Missing company in token" });
		}

		const result = await query(
			`SELECT 
                id, 
                user_id AS "userId",
                company_id AS "companyId",
                name,
                email,
                role,
                skills,
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
                latitude,
                longitude,
                location_updated_at AS "locationUpdatedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM employees 
			WHERE id = $1${isDev ? "" : " AND company_id = $2"}`,
			isDev ? [employeeId] : [employeeId, authUser.companyId]
		);
		if (result.length === 0) {
			reply.status(404);
			return { error: "Employee not found" };
		}
		return { employee: result[0] };
	});
}

export function createEmployee(fastify: FastifyInstance) {
	fastify.post("/employees", async (request, reply) => {
		// TODO: Protect with JWT auth.
		// TODO: Validate body with zod (required fields, email format, skills array, etc).
		// TODO: Avoid trusting body.companyId; derive from request.user.companyId.
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		if (!authUser?.companyId && !isDev) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Missing company in token" });
		}

		const body = request.body as {
			userId: string;
			companyId: string;
			name: string;
			email: string;
			role?: string;
			skills: string[];
			skillLevel?: Record<string, number>;
			homeAddress: string;
			phone?: string;
			maxConcurrentJobs?: number;
			internalNotes?: string;
			createdByUserId?: string;
		};

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
                user_id, 
                company_id, 
                name,
                email,
                role,
                skills, 
                skill_level,
                home_address, 
                phone,
                max_concurrent_jobs,
                internal_notes,
                created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
            RETURNING 
                id, 
                user_id AS "userId",
                company_id AS "companyId",
                name,
                email,
                role,
                skills,
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
                latitude,
                longitude,
                location_updated_at AS "locationUpdatedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt"`,
			[
				body.userId,
				effectiveCompanyId,
				body.name,
				body.email,
				body.role || null,
				body.skills,
				JSON.stringify(body.skillLevel || {}),
				body.homeAddress,
				body.phone || null,
				body.maxConcurrentJobs || 1,
				body.internalNotes || null,
				effectiveCreatedByUserId
			]
		);
		return { employee: result[0] };
	});
}

export function updateEmployee(fastify: FastifyInstance) {
	fastify.put("/employees/:employeeId", async (request, reply) => {
		// TODO: Protect with JWT auth and enforce company scoping.
		// TODO: Validate body with zod (types, ranges for lat/long, etc).
		const { employeeId } = request.params as { employeeId: string };
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		if (!authUser?.companyId && !isDev) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Missing company in token" });
		}
		const body = request.body as {
			name?: string;
			email?: string;
			role?: string;
			skills?: string[];
			skillLevel?: Record<string, number>;
			homeAddress?: string;
			phone?: string;
			isAvailable?: boolean;
			maxConcurrentJobs?: number;
			isActive?: boolean;
			internalNotes?: string;
			latitude?: number;
			longitude?: number;
		};

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

		if (updates.length === 0) {
			return { message: "No fields to update", employeeId };
		}

		values.push(employeeId);
		if (!isDev) {
			values.push(authUser.companyId ?? null);
		}

		const result = await query(
			`UPDATE employees 
            SET ${updates.join(", ")}, updated_at = NOW() 
        WHERE id = $${values.length}${isDev ? "" : ` AND company_id = $${values.length + 1}`} 
            RETURNING 
                id, 
                user_id AS "userId",
                company_id AS "companyId",
                name,
                email,
                role,
                skills,
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
                latitude,
                longitude,
                location_updated_at AS "locationUpdatedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt"`,
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
		// TODO: Protect with JWT auth and enforce company scoping.
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
