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

const registerSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8, "Password must be at least 8 characters"),
	companyName: z.string().min(1).max(120).optional()
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

		const result = (await query(
			`SELECT id, email, role, company_id AS "companyId",
				created_at AS "createdAt", updated_at AS "updatedAt"
			FROM users
			WHERE id = $1${isDev ? "" : " AND company_id = $2"}`,
			isDev ? [userId] : [userId, authUser.companyId]
		)) as unknown as Array<{
			id: string;
			email: string;
			role: string;
			companyId: string;
			createdAt: string;
			updatedAt: string;
		}>;

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
		const result = (await query(
			`INSERT INTO users (email, password_hash, role, company_id)
				VALUES ($1, $2, $3, $4)
				RETURNING id`,
			[body.email, hashedPassword, body.role, effectiveCompanyId]
		)) as unknown as Array<{ id: string }>;
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
			const rows = (await query(
				"SELECT id FROM users WHERE id = $1 AND company_id = $2",
				[userId, authUser.companyId]
			)) as unknown as Array<{ id: string }>;
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
		const result = (await query(
			`UPDATE users SET ${updates.join(", ")}, updated_at = NOW()
			WHERE id = $${values.length} RETURNING id`,
			values
		)) as unknown as Array<{ id: string }>;
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

		const result = (isDev
			? await query("DELETE FROM users WHERE id = $1 RETURNING id", [userId])
			: await query(
					"DELETE FROM users WHERE id = $1 AND company_id = $2 RETURNING id",
					[userId, authUser.companyId]
				)) as unknown as Array<{ id: string }>;

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

		const rows: Array<{
			id: string;
			email: string;
			password_hash: string;
			role: string;
			company_id: string;
		}> = (await query(
			`SELECT id, email, password_hash, role, company_id
			FROM users WHERE email = $1`,
			[email]
		)) as unknown as Array<{
			id: string;
			email: string;
			password_hash: string;
			role: string;
			company_id: string;
		}>;

		if (!rows[0]) {
			return reply.code(401).send({ error: "Invalid email or password" });
		}

		const user = rows[0];
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

function buildCompanyName(email: string, provided?: string): string {
	if (provided) return provided;
	const domain = email.split("@")[1] ?? "";
	const root = domain.split(".")[0];
	return root ? `${root} Company` : "New Company";
}

export function registerUser(fastify: FastifyInstance) {
	fastify.post("/register", async (request, reply) => {
		const ip = request.ip ?? "unknown";
		const sql = getSql();
		const rateLimitResult = await enforceRateLimit(
			sql,
			`register:${ip}`,
			5,
			900
		);
		if (!rateLimitResult.allowed) {
			return reply.code(429).send({
				error: "Too many registration attempts. Please try again later.",
				retryAfterSeconds: rateLimitResult.retryAfterSeconds
			});
		}

		const parsed = registerSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const { email, password, companyName } = parsed.data;

		const existing = (await query("SELECT id FROM users WHERE email = $1", [
			email
		])) as unknown as Array<{ id: string }>;
		if (existing[0]) {
			return reply.code(409).send({ error: "Email is already registered" });
		}

		const verified = (await query(
			`SELECT id
			FROM email_verifications
			WHERE email = $1 AND verified = TRUE
			ORDER BY used_at DESC NULLS LAST, verified_at DESC NULLS LAST
			LIMIT 1`,
			[email]
		)) as unknown as Array<{ id: string }>;
		if (!verified[0]) {
			return reply.code(403).send({
				error: "Email verification required before registration"
			});
		}

		const finalCompanyName = buildCompanyName(email, companyName);
		const hashedPassword = await bcrypt.hash(password, 10);

		const createdCompany = (await query(
			"INSERT INTO companies (name) VALUES ($1) RETURNING id",
			[finalCompanyName]
		)) as unknown as Array<{ id: string }>;
		const companyId = createdCompany[0].id;

		const createdUser = (await query(
			`INSERT INTO users (email, password_hash, role, company_id)
			VALUES ($1, $2, $3, $4)
			RETURNING id`,
			[email, hashedPassword, "admin", companyId]
		)) as unknown as Array<{ id: string }>;

		const token = fastify.jwt.sign(
			{
				userId: createdUser[0].id,
				email,
				role: "admin",
				companyId
			},
			{ expiresIn: "8h" }
		);

		return {
			token,
			user: {
				userId: createdUser[0].id,
				email,
				role: "admin",
				companyId
			}
		};
	});
}

export async function userRoutes(fastify: FastifyInstance) {
	registerUser(fastify);
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
