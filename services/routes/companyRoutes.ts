import { FastifyInstance } from "fastify";
import { query } from "../../db";
import { authenticate } from "../middleware/auth";

type AuthUser = {
	role?: string;
	companyId?: string;
};
// import functions to check auth and roles

/*
reads companyId from query parameters
queries the DB
returns company data/404 error
*/
export function getCompany(fastify: FastifyInstance) {
	fastify.get("/company/:companyId", async (request, reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const { companyId } = request.params as { companyId: string };
		if (!isDev && authUser?.companyId !== companyId) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Cannot access other company's data" });
		} // non-admins can only access their own company
		type CompanyRow = {
			id: string;
			name: string;
			dispatchSettings: object;
			createdAt: string;
			updatedAt: string;
		};
		const result = await query<CompanyRow>(
			`SELECT
                id,
                name,
                dispatch_settings AS "dispatchSettings",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM companies
            WHERE id = $1`,
			[companyId]
		);

		if (!result[0]) {
			return reply.code(404).send({ error: "Company not found" });
		}

		return { company: result[0] };
	});
}

/*
accepts name
creates new row
returns new id
*/
export function createCompany(fastify: FastifyInstance) {
	fastify.post("/company", async (request, reply) => {
		// TODO: Protect this route (likely admin-only).
		// TODO: Validate request body with zod.
		const authUser = request.user as AuthUser;
		if (authUser?.role !== "dev") {
			return reply.code(403).send({ error: "Forbidden - Dev access required" });
		}
		const body = request.body as { name: string };
		const result = await query<{ id: string }>(
			`INSERT INTO companies (name)
                VALUES ($1)
                RETURNING id`,
			[body.name]
		);
		return { companyId: result[0].id };
	});
}

/*
updates given fields from a company
*/

export function updateCompany(fastify: FastifyInstance) {
	fastify.put("/company/:companyId", async (request, reply) => {
		// TODO: Protect this route with JWT auth + company/admin scoping.
		// TODO: Validate request body with zod.
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const isCompanyAdmin = authUser?.role === "admin";
		const { companyId } = request.params as { companyId: string };
		if (!isDev && (!isCompanyAdmin || authUser?.companyId !== companyId)) {
			return reply
				.code(403)
				.send({ error: "Forbidden - Company admin access required" });
		}
		const body = request.body as {
			name?: string;
			dispatchSettings?: string;
		};

		// TODO: `dispatchSettings` is typed as string but later JSON.stringify() is used.
		// Make this consistently an object and store as JSON in the DB.

		const updates: string[] = [];
		const values: string[] = [];
		if (body.name) {
			values.push(body.name);
			updates.push(`name = $${values.length}`);
		}
		if (body.dispatchSettings) {
			values.push(JSON.stringify(body.dispatchSettings));
			updates.push(`dispatch_settings = $${values.length}`);
		}
		if (updates.length === 0) {
			return { message: "No fields to update", companyId };
		}
		values.push(companyId);
		await query(
			`UPDATE companies
                SET ${updates.join(", ")}, updated_at = NOW()
                WHERE id = $${values.length}`,
			values
		);
		return { message: "Company updated successfully", companyId };
	});
}

/*
deletes a company given its ID
*/
export function deleteCompany(fastify: FastifyInstance) {
	fastify.delete("/company/:companyId", async (request, reply) => {
		// TODO: Protect this route (admin-only) and consider soft-delete.
		const authUser = request.user as AuthUser;
		if (authUser?.role !== "dev") {
			return reply.code(403).send({ error: "Forbidden - Dev access required" });
		}
		const { companyId } = request.params as { companyId: string };

		await query(`DELETE FROM companies WHERE id = $1`, [companyId]);

		return { message: `Company ${companyId} deleted` };
	});
}

export async function companyRoutes(fastify: FastifyInstance) {
	fastify.register(async (authenticatedRoutes) => {
		authenticatedRoutes.addHook("onRequest", authenticate);

		getCompany(authenticatedRoutes);

		// Authorization is enforced inside handlers:
		// - dev: can create/delete any company
		// - admin: can update only their own company
		createCompany(authenticatedRoutes);
		updateCompany(authenticatedRoutes);
		deleteCompany(authenticatedRoutes);
	});
}
