import { FastifyInstance } from "fastify";
import { query } from "../../db";

/*
reads companyId from query parameters
queries the DB
returns company data/404 error
*/
export function getCompany(fastify: FastifyInstance) {
    fastify.get("/company/:companyId", async (request, reply) => {
        const { companyId } = request.params as { companyId: string };
        type CompanyRow = {
            id: string;
            name: string;
            dispatchSettings: string; 
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
    fastify.post("/company", async (request) => {
        const body = request.body as { name: string };
        const result = await query<{id: string}>(
            `INSERT INTO companies (name)
                VALUES ($1)
                RETURNING id`,
            [body.name]
        );
        return { companyId: result[0].id };
    }
    );
}

/*
updates given fields from a company
*/

export function updateCompany(fastify: FastifyInstance) {
    fastify.put("/company/:companyId", async (request) => {
        const { companyId } = request.params as { companyId: string };
        const body = request.body as {
            name?: string;
            dispatchSettings?: string;
        };
        
        const updates: string[] = [];
        const values: string[] = [];
        if (body.name) {
            values.push(body.name);
            updates.push(`name = $${values.length}`);

        }
        if (body.dispatchSettings) {
            values.push(body.dispatchSettings);
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
	fastify.delete("/company/:companyId", async (request) => {
		const { companyId } = request.params as { companyId: string };

		await query(
			`DELETE FROM companies WHERE id = $1`,
			[companyId]
		);

		return { message: `Company ${companyId} deleted` };
	});
}

export async function companyRoutes(fastify: FastifyInstance) {
	getCompany(fastify);
	createCompany(fastify);
	updateCompany(fastify);
	deleteCompany(fastify);
}

