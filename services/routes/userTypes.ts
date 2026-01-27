import { FastifyInstance } from "fastify";
import { query } from "@/db";
import { CreateUserInput, UpdateUserInput } from "@/types/userTypes";
import bcrypt from "bcryptjs";

type ListUsersQuery = {
	companyId: string;
	role?: "admin" | "tech";
	limit?: number;
	offset?: number;
};

/*
Accepts optional filters(role, limit, offset)
fetches users for a specific company from the database
returns the list of users as JSON UserDTO[](without passwords, duh)
*/
export function listUsers(fastify: FastifyInstance) {
	fastify.get("/users", async (request) => {
		const {
			companyId,
			role,
			limit = 50,
			offset = 0
		} = request.query as ListUsersQuery;
		const result = await query(
			`SELECT id, email, role, company_id AS "companyId", created_at AS "createdAt", updated_at AS "updatedAt"
             FROM users
             WHERE company_id = $1
             ${role ? "AND role = $2" : ""}
             ORDER BY created_at
                LIMIT $3 OFFSET $4`,
			role ? [companyId, role, limit, offset] : [companyId, limit, offset]
		);
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
		const { userId } = request.params as { userId: string };
		const result = await query(
			`SELECT id, email, role, company_id AS "companyId", created_at AS "createdAt", updated_at AS "updatedAt"
                FROM users
                WHERE id = $1`,
			[userId]
		);
		if (!result[0]) {
			reply.code(404).send({ error: "User not found" });
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
	fastify.post("/users", async (request) => {
		const body = request.body as CreateUserInput;
		const hashedPassword = await bcrypt.hash(body.password, 10);
		const result = await query<{ id: string }>(
			`INSERT INTO users (email, password, role, company_id)
                VALUES ($1, $2, $3, $4)
                RETURNING id`,
			[body.email, hashedPassword, body.role, body.companyId]
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
	fastify.put("/users/:userId", async (request) => {
		const { userId } = request.params as { userId: string };
		const body = request.body as UpdateUserInput;

		const updates: string[] = [];
		const values: string[] = [];

		if (body.email) {
			values.push(body.email);
			updates.push(`email = $${values.length}`);
		}
		if (body.role) {
			values.push(body.role);
			updates.push(`role = $${values.length}`);
		}
		if (body.password) {
			const hash = await bcrypt.hash(body.password, 10);
			values.push(hash);
			updates.push(`password = $${values.length}`);
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
	fastify.delete("/users/:userId", async (request) => {
		const { userId } = request.params as { userId: string };
		await query(`DELETE FROM users WHERE id = $1`, [userId]);
		return { message: `User ${userId} deleted successfully` };
	});
}

/*
combines everything
*/
export async function userRoutes(fastify: FastifyInstance) {
	listUsers(fastify);
	getUser(fastify);
	createUser(fastify);
	updateUser(fastify);
	deleteUser(fastify);
}
