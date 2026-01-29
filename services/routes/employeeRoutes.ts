import { FastifyInstance } from "fastify";
import { query } from "../../db";
import { z } from "zod";

export function listEmployees(fastify: FastifyInstance) {
	const querySchema = z.object({
		companyId: z.string().optional()
	});

	fastify.get("/employees", async (request, reply) => {
		const parsed = querySchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({ error: "Invalid query parameters" });
		}

		const { companyId } = parsed.data;
		let sql = `SELECT id, name, role, company_id AS "companyId" FROM employees`;
		const params: string[] = [];

		if (companyId) {
			sql += ` WHERE company_id = $1`;
			params.push(companyId);
		}

		sql += ` ORDER BY name ASC`;

		const result = await query(sql, params);
		return { employees: result };
	});


}

export function getEmployee(fastify: FastifyInstance) {
    fastify.get("/employees/:employeeId", async (request, reply) => {
        const { employeeId } = request.params as { employeeId: string };
        const result = await query(
            `SELECT id, name, role, company_id AS "companyId" FROM employees WHERE id = $1`,
            [employeeId]
        );
        if (result.length === 0) {
            reply.status(404);
            return { error: "Employee not found" };
        }
        return { employee: result[0] };
    });
}

export function createEmployee(fastify: FastifyInstance) {
    fastify.post("/employees", async (request) => {
        const body = request.body as {
            name: string;
            role: string;
            companyId: string;
        };
        const result = await query(
            `INSERT INTO employees (name, role, company_id) VALUES ($1, $2, $3) RETURNING id, name, role, company_id AS "companyId"`,
            [body.name, body.role, body.companyId]
        );
        return { employee: result[0] };
    });
}

export function updateEmployee(fastify: FastifyInstance) {
    fastify.put("/employees/:employeeId", async (request) => {
        const { employeeId } = request.params as { employeeId: string };
        const body = request.body as {
            name?: string;
            role?: string;
            companyId?: string;
        };

        const updates: string[] = [];
        const values: any[] = [];

        if (body.name) {
            values.push(body.name);
            updates.push(`name = $${values.length}`);
        }
        if (body.role) {
            values.push(body.role);
            updates.push(`role = $${values.length}`);
        }
        if (body.companyId) {
            values.push(body.companyId);
            updates.push(`company_id = $${values.length}`);
        }

        if (updates.length === 0) {
            return { message: "No fields to update", employeeId };
        }

        values.push(employeeId);
        const result = await query(
            `UPDATE employees SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, name, role, company_id AS "companyId"`,
            values
        );

        return { employee: result[0] };
    });
}

export function deleteEmployee(fastify: FastifyInstance) {
    fastify.delete("/employees/:employeeId", async (request) => {
        const { employeeId } = request.params as { employeeId: string };
        await query("DELETE FROM employees WHERE id = $1", [employeeId]);
        return { message: `Employee ${employeeId} deleted` };
    });
}

export function registerEmployeeRoutes(fastify: FastifyInstance) {
    listEmployees(fastify);
    getEmployee(fastify);
    createEmployee(fastify);
    updateEmployee(fastify);
    deleteEmployee(fastify);
}
