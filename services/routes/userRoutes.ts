import { FastifyInstance } from "fastify";
import { query } from "../../db";
import { CreateUserInput, UpdateUserInput } from "@/services/types/userTypes";
import bcrypt from "bcryptjs";
import { authenticate } from "../middleware/auth";
type ListUsersQuery = {
	companyId: string;
	role?: "dev" | "admin" | "tech";
	limit?: number;
	offset?: number;
};

/*
Accepts optional filters(role, limit, offset)
fetches users for a specific company from the database
returns the list of users as JSON UserDTO[](without passwords, duh)
*/
export function listUsers(fastify: FastifyInstance) {
	fastify.get("/users", async (request, reply) => {
		// TODO: Add zod validation for query (limit/offset bounds, role enum, etc).
		// TODO: Consider whether non-admin users should be allowed to list users.
		const authUser = request.user as unknown as {
			companyId?: string;
			role?: string;
		};
		const isDev = authUser?.role === "dev";

		const {
			companyId,
			role,
			limit = 50,
			offset = 0
		} = request.query as ListUsersQuery;

		const effectiveCompanyId = isDev
			? (companyId ?? authUser?.companyId)
			: authUser?.companyId;
		if (!effectiveCompanyId) {
			return reply.code(400).send({ error: "Missing companyId" });
		}

		let sql = `SELECT id, email, role, company_id AS "companyId", created_at AS "createdAt", updated_at AS "updatedAt"
             FROM users
             WHERE company_id = $1`;

		// Enforce company scoping based on the authenticated user (don't trust client-provided companyId).
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

/*
Accepts userId from request params
Fetches the user from the database
Returns the user as JSON UserDTO, 404 if not found
*/
export function getUser(fastify: FastifyInstance) {
	fastify.get("/users/:userId", async (request, reply) => {
		// TODO: Decide whether this endpoint should be admin-only.
		const { userId } = request.params as { userId: string };
		const authUser = request.user as unknown as {
			companyId?: string;
			role?: string;
		};
		const isDev = authUser?.role === "dev";
		const result = await query(
			`SELECT id, email, role, company_id AS "companyId", created_at AS "createdAt", updated_at AS "updatedAt"
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
/*
Accepts user data from request body
Hashes the pswrd
Inserts a new user into the database
Returns the created user's ID
*/
export function createUser(fastify: FastifyInstance) {
	fastify.post("/users", async (request, reply) => {
		// TODO: Validate body with zod (email format, password length, role enum, etc).
		// TODO: Handle duplicate email errors gracefully.
		const authUser = request.user as unknown as {
			companyId?: string;
			role?: string;
		};
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";
		if (!isDev && !isCompanyAdmin) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Admin access required" });
		}

		const body = request.body as CreateUserInput;

		// Only dev can create dev users.
		if (body.role === "dev" && !isDev) {
			return reply.code(403).send({ error: "Forbidden - Dev access required" });
		}

		// Company admins cannot create users in other companies.
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

/*
Accepts userId and optional fields to update
Hashes password if new password provided
Updates the user in the database
Returns a success message and userId
*/
export function updateUser(fastify: FastifyInstance) {
	fastify.put("/users/:userId", async (request, reply) => {
		// TODO: Validate body with zod (email format, password policy, role enum).
		const authUser = request.user as unknown as {
			companyId?: string;
			role?: string;
		};
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";
		if (!isDev && !isCompanyAdmin) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Admin access required" });
		}

		const { userId } = request.params as { userId: string };
		const body = request.body as UpdateUserInput;

		// Company admin can only update users within their own company.
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
			// TODO: Ensure the users table column name matches this (expected: password_hash).
			updates.push(`password_hash = $${values.length}`);
		}
		if (updates.length === 0) {
			return { message: "No fields to update", userId };
		}

		values.push(userId);
		const result = await query<{ id: string }>(
			`UPDATE users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING id`,
			values
		);
		return { message: "User updated successfully", userId: result[0].id };
	});
}

/*
accepts userID
deletes the user from the database
returns a success message
*/

export function deleteUser(fastify: FastifyInstance) {
	fastify.delete("/users/:userId", async (request, reply) => {
		// TODO: Consider soft-delete / audit logging for user deletions.
		const authUser = request.user as unknown as {
			companyId?: string;
			role?: string;
		};
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";
		if (!isDev && !isCompanyAdmin) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Admin access required" });
		}

		const { userId } = request.params as { userId: string };
		if (!isDev) {
			const result = await query(
				`DELETE FROM users WHERE id = $1 AND company_id = $2 RETURNING id`,
				[userId, authUser.companyId]
			);
			if (!result[0]) {
				return reply.code(404).send({ error: "User not found" });
			}
			return { message: `User ${userId} deleted successfully` };
		}

		await query(`DELETE FROM users WHERE id = $1`, [userId]);
		return { message: `User ${userId} deleted successfully` };
	});
}

/*
accepts email and password
verifies the user credentials against database
returns a JWT token if valid, 401 error if invalid
*/
export function loginUser(fastify: FastifyInstance) {
	fastify.post("/login", async (request, reply) => {
		// TODO: Add rate limiting / brute-force protection for login.
		// TODO: Validate body with zod and avoid leaking which field was wrong.
		const body = request.body as {
			email: string;
			password: string;
		};

		const result = await query<{
			id: string;
			email: string;
			password_hash: string;
			role: string;
			company_id: string;
		}>(
			`SELECT id, email, password_hash, role, company_id
			 FROM users
			 WHERE email = $1`,
			[body.email]
		);

		if (!result[0]) {
			return reply.code(401).send({ error: "Invalid email or password" });
		}

		const user = result[0];
		const isPasswordValid = await bcrypt.compare(
			body.password,
			user.password_hash
		);
		if (!isPasswordValid) {
			return reply.code(401).send({ error: "Invalid email or password" });
		}

		// TODO: Add standard JWT claims (exp/iat/aud/iss) and a rotation/refresh strategy.
		const token = fastify.jwt.sign({
			userId: user.id,
			email: user.email,
			role: user.role,
			companyId: user.company_id
		});
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

/*
combines everything
*/
export async function userRoutes(fastify: FastifyInstance) {
	// Public route - no auth needed
	loginUser(fastify);

	// All routes below require authentication
	fastify.register(async (authenticatedRoutes) => {
		authenticatedRoutes.addHook("onRequest", authenticate);

		// Company scoping is enforced inside each handler (and dev can bypass).
		listUsers(authenticatedRoutes);
		getUser(authenticatedRoutes);

		// Admin-only routes (company-admin or dev, enforced inside handlers)
		createUser(authenticatedRoutes);
		updateUser(authenticatedRoutes);
		deleteUser(authenticatedRoutes);
	});
}
