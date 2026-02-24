import { FastifyInstance } from "fastify";
import { z } from "zod";
import { CreateUserInput, UpdateUserInput } from "@/services/types/userTypes";
import bcrypt from "bcryptjs";
import { authenticate } from "../middleware/auth";
import { enforceRateLimit } from "../rateLimit";
import { getSql } from "../../db";

const listUsersSchema = z.object({
	companyId: z.string().check(z.uuid()).optional(),
	role: z.enum(["dev", "admin", "tech"]).optional(),
	limit: z.coerce.number().int().min(1).max(200).optional().default(50),
	offset: z.coerce.number().int().min(0).optional().default(0)
});

const createUserSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8, "Password must be at least 8 characters"),
	role: z.enum(["dev", "admin", "tech"]),
	companyId: z.string().check(z.uuid())
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
				details: z.treeifyError(parsed.error)
			});
		}

		const { role, limit, offset } = parsed.data;
		const effectiveCompanyId = isDev
			? (parsed.data.companyId ?? authUser?.companyId)
			: authUser?.companyId;

		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}

		const sql = getSql();

		const users = await sql`
			SELECT id, email, role,
				company_id AS "companyId",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM users
			WHERE company_id = ${effectiveCompanyId}
				AND (${role == null} OR role = ${role})
			ORDER BY created_at
			LIMIT ${limit} OFFSET ${offset}
		`;

		return { users };
	});
}

export function getUser(fastify: FastifyInstance) {
	fastify.get("/users/:userId", async (request, reply) => {
		const { userId } = request.params as { userId: string };
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const sql = getSql();

		const [user] = await sql`
			SELECT id, email, role,
				company_id AS "companyId",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM users
			WHERE id = ${userId}
				AND (${isDev} OR company_id = ${authUser.companyId ?? null})
		` as any[];

		if (!user) return reply.code(404).send({ error: "User not found" });
		return { user };
	});
}

export function createUser(fastify: FastifyInstance) {
	fastify.post("/users", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";

		if (!isDev && !isCompanyAdmin) {
			return reply.code(403).send({ error: "Forbidden - Admin access required" });
		}

		const parsed = createUserSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: z.treeifyError(parsed.error)
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
			return reply.code(403).send({ error: "Forbidden - Cannot create users for other companies" });
		}

		const sql = getSql();
		const hashedPassword = await bcrypt.hash(body.password, 10);

		const [result] = await sql`
			INSERT INTO users (email, password_hash, role, company_id)
			VALUES (${body.email}, ${hashedPassword}, ${body.role}, ${effectiveCompanyId})
			RETURNING id
		` as any[];

		return { userId: result.id };
	});
}

export function updateUser(fastify: FastifyInstance) {
	fastify.put("/users/:userId", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";

		if (!isDev && !isCompanyAdmin) {
			return reply.code(403).send({ error: "Forbidden - Admin access required" });
		}

		const parsed = updateUserSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: z.treeifyError(parsed.error)
			});
		}

		const body = parsed.data as UpdateUserInput;
		const { userId } = request.params as { userId: string };
		const sql = getSql();

		if (!isDev) {
			const [existing] = await sql`
				SELECT id FROM users WHERE id = ${userId} AND company_id = ${authUser.companyId ?? null}
			` as any[];
			if (!existing) return reply.code(404).send({ error: "User not found" });
		}

		if (body.role === "dev" && !isDev) {
			return reply.code(403).send({ error: "Forbidden - Dev access required" });
		}

		const hashedPassword = body.password
			? await bcrypt.hash(body.password, 10)
			: null;

		const [result] = await sql`
			UPDATE users SET
				email         = COALESCE(${body.email ?? null}, email),
				role          = COALESCE(${body.role ?? null}, role),
				password_hash = COALESCE(${hashedPassword}, password_hash),
				updated_at    = NOW()
			WHERE id = ${userId}
				AND (${isDev} OR company_id = ${authUser.companyId ?? null})
			RETURNING id
		` as any[];

		if (!result) return reply.code(404).send({ error: "User not found" });
		return { message: "User updated successfully", userId: result.id };
	});
}

export function deleteUser(fastify: FastifyInstance) {
	fastify.delete("/users/:userId", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";

		if (!isDev && !isCompanyAdmin) {
			return reply.code(403).send({ error: "Forbidden - Admin access required" });
		}

		const { userId } = request.params as { userId: string };
		const sql = getSql();

		const [result] = await sql`
			DELETE FROM users
			WHERE id = ${userId}
				AND (${isDev} OR company_id = ${authUser.companyId ?? null})
			RETURNING id
		` as any[];

		if (!result) return reply.code(404).send({ error: "User not found" });
		return { message: `User ${userId} deleted successfully` };
	});
}

export function loginUser(fastify: FastifyInstance) {
	fastify.post("/login", async (request, reply) => {
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
				details: z.treeifyError(parsed.error)
			});
		}

		const { email, password } = parsed.data;

		const [user] = await sql`
			SELECT id, email, password_hash, role, company_id
			FROM users WHERE email = ${email}
		` as any[];

		if (!user) {
			return reply.code(401).send({ error: "Invalid email or password" });
		}

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

		const rateLimitResult = await enforceRateLimit(sql, `register:${ip}`, 5, 900);
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
				details: z.treeifyError(parsed.error)
			});
		}

		const { email, password, companyName } = parsed.data;

		const [existing] = await sql`
			SELECT id FROM users WHERE email = ${email}
		` as any[];
		if (existing) {
			return reply.code(409).send({ error: "Email is already registered" });
		}

		const [verified] = await sql`
			SELECT id FROM email_verifications
			WHERE email = ${email} AND verified = TRUE
			ORDER BY used_at DESC NULLS LAST, verified_at DESC NULLS LAST
			LIMIT 1
		` as any[];
		if (!verified) {
			return reply.code(403).send({
				error: "Email verification required before registration"
			});
		}

		const finalCompanyName = buildCompanyName(email, companyName);
		const hashedPassword = await bcrypt.hash(password, 10);

		const [createdCompany] = await sql`
			INSERT INTO companies (name) VALUES (${finalCompanyName}) RETURNING id
		` as any[];

		const [createdUser] = await sql`
			INSERT INTO users (email, password_hash, role, company_id)
			VALUES (${email}, ${hashedPassword}, 'admin', ${createdCompany.id})
			RETURNING id
		` as any[];

		const token = fastify.jwt.sign(
			{ userId: createdUser.id, email, role: "admin", companyId: createdCompany.id },
			{ expiresIn: "8h" }
		);

		return {
			token,
			user: {
				userId: createdUser.id,
				email,
				role: "admin",
				companyId: createdCompany.id
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