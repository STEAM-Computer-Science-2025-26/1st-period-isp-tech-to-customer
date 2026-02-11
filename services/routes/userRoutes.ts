import { FastifyInstance } from "fastify";
import { query } from "../../db";
import { z } from "zod";
import { CreateUserInput, UpdateUserInput } from "@/services/types/userTypes";
import bcrypt from "bcryptjs";
import { authenticate } from "../middleware/auth";
import { enforceRateLimit } from "../rateLimit";
import { getSql } from "../../db/connection";

const listUsersSchema = z.object({
	companyId: z.string().uuid().optional(),
	role: z.enum(["dev", "admin", "tech"]).optional(),
	limit: z.coerce.number().int().min(1).max(200).optional().default(50),
	offset: z.coerce.number().int().min(0).optional().default(0)
});

const createUserSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8, "Password must be at least 8 characters"),
	role: z.enum(["dev", "admin", "tech"]),
	companyId: z.string().uuid()
});

const updateUserSchema = z
	.object({
		email: z.string().email().optional(),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.optional(),
		role: z.enum(["dev", "admin", "tech"]).optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field must be provided"
	});

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1)
});

type AuthUser = {
	userId?: string;
	id?: string;
	companyId?: string;
	role?: string;
};

// ============================================================
// Route handlers
// ============================================================

export function listUsers(fastify: FastifyInstance) {
	fastify.get("/users", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";

		const parsed = listUsersSchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid query parameters",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const { role, limit, offset } = parsed.data;
		const effectiveCompanyId = isDev
			? (parsed.data.companyId ?? authUser?.companyId)
			: authUser?.companyId;

		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}

		let sql = `SELECT id, email, role, company_id AS "companyId",
			created_at AS "createdAt", updated_at AS "updatedAt"
			FROM users WHERE company_id = $1`;

		const params: Array<string | number> = [effectiveCompanyId];

		if (role) {
			params.push(role);
			sql += ` AND role = $${params.length}`;
		}

		params.push(limit, offset);
		sql += ` ORDER BY created_at LIMIT $${params.length - 1} OFFSET $${params.length}`;

		const result = await query(sql, params);
		return { users: result };
	});
}

export function getUser(fastify: FastifyInstance) {
	fastify.get("/users/:userId", async (request, reply) => {
		const { userId } = request.params as { userId: string };
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";

		const result = await query(
			`SELECT id, email, role, company_id AS "companyId",
				created_at AS "createdAt", updated_at AS "updatedAt"
			FROM users
			WHERE id = $1${isDev ? "" : " AND company_id = $2"}`,
			isDev ? [userId] : [userId, authUser.companyId]
		);

		if (!result[0]) {
			return reply.code(404).send({ error: "User not found" });
		}
		return { user: result[0] };
	});
}

export function createUser(fastify: FastifyInstance) {
	fastify.post("/users", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";

		if (!isDev && !isCompanyAdmin) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Admin access required" });
		}

		const parsed = createUserSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const body = parsed.data as CreateUserInput;

		if (body.role === "dev" && !isDev) {
			return reply.code(403).send({ error: "Forbidden - Dev access required" });
		}

		const effectiveCompanyId = isDev ? body.companyId : authUser.companyId;
		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}
		if (!isDev && body.companyId !== effectiveCompanyId) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Cannot create users for other companies" });
		}

		const hashedPassword = await bcrypt.hash(body.password, 10);
		const result = await query<{ id: string }>(
			`INSERT INTO users (email, password_hash, role, company_id)
				VALUES ($1, $2, $3, $4)
				RETURNING id`,
			[body.email, hashedPassword, body.role, effectiveCompanyId]
		);
		return { userId: result[0].id };
	});
}

export function updateUser(fastify: FastifyInstance) {
	fastify.put("/users/:userId", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";

		if (!isDev && !isCompanyAdmin) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Admin access required" });
		}

		const parsed = updateUserSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const body = parsed.data as UpdateUserInput;
		const { userId } = request.params as { userId: string };

		if (!isDev) {
			const rows = await query<{ id: string }>(
				"SELECT id FROM users WHERE id = $1 AND company_id = $2",
				[userId, authUser.companyId]
			);
			if (!rows[0]) {
				return reply.code(404).send({ error: "User not found" });
			}
		}

		const updates: string[] = [];
		const values: string[] = [];

		if (body.email) {
			values.push(body.email);
			updates.push(`email = $${values.length}`);
		}
		if (body.role) {
			if (body.role === "dev" && !isDev) {
				return reply
					.code(403)
					.send({ error: "Forbidden - Dev access required" });
			}
			values.push(body.role);
			updates.push(`role = $${values.length}`);
		}
		if (body.password) {
			const hash = await bcrypt.hash(body.password, 10);
			values.push(hash);
			updates.push(`password_hash = $${values.length}`);
		}

		// refine() above guarantees at least one field, but guard anyway
		if (updates.length === 0) {
			return reply.code(400).send({ error: "No fields to update" });
		}

		values.push(userId);
		const result = await query<{ id: string }>(
			`UPDATE users SET ${updates.join(", ")}, updated_at = NOW()
			WHERE id = $${values.length} RETURNING id`,
			values
		);
		return { message: "User updated successfully", userId: result[0].id };
	});
}

export function deleteUser(fastify: FastifyInstance) {
	fastify.delete("/users/:userId", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";

		if (!isDev && !isCompanyAdmin) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Admin access required" });
		}

		const { userId } = request.params as { userId: string };

		const result = isDev
			? await query("DELETE FROM users WHERE id = $1 RETURNING id", [userId])
			: await query(
					"DELETE FROM users WHERE id = $1 AND company_id = $2 RETURNING id",
					[userId, authUser.companyId]
				);

		if (!result[0]) {
			return reply.code(404).send({ error: "User not found" });
		}
		return { message: `User ${userId} deleted successfully` };
	});
}

export function loginUser(fastify: FastifyInstance) {
	fastify.post("/login", async (request, reply) => {
		// Rate limit: 10 attempts per 15 minutes per IP
		const ip = request.ip ?? "unknown";
		const sql = getSql();
		const rateLimitResult = await enforceRateLimit(sql, `login:${ip}`, 10, 900);
		if (!rateLimitResult.allowed) {
			return reply.code(429).send({
				error: "Too many login attempts. Please try again later.",
				retryAfterSeconds: rateLimitResult.retryAfterSeconds
			});
		}

		const parsed = loginSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const { email, password } = parsed.data;

		const result = await query<{
			id: string;
			email: string;
			password_hash: string;
			role: string;
			company_id: string;
		}>(
			`SELECT id, email, password_hash, role, company_id
			FROM users WHERE email = $1`,
			[email]
		);

		if (!result[0]) {
			return reply.code(401).send({ error: "Invalid email or password" });
		}

		const user = result[0];
		const isPasswordValid = await bcrypt.compare(password, user.password_hash);
		if (!isPasswordValid) {
			return reply.code(401).send({ error: "Invalid email or password" });
		}

		const token = fastify.jwt.sign(
			{
				userId: user.id,
				email: user.email,
				role: user.role,
				companyId: user.company_id
			},
			{ expiresIn: "8h" }
		);

		return {
			token,
			user: {
				userId: user.id,
				email: user.email,
				role: user.role,
				companyId: user.company_id
			}
		};
	});
}

export async function userRoutes(fastify: FastifyInstance) {
	loginUser(fastify);

	fastify.register(async (authenticatedRoutes) => {
		authenticatedRoutes.addHook("onRequest", authenticate);
		listUsers(authenticatedRoutes);
		getUser(authenticatedRoutes);
		createUser(authenticatedRoutes);
		updateUser(authenticatedRoutes);
		deleteUser(authenticatedRoutes);
	});
}
