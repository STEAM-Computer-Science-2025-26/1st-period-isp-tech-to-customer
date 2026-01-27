import { FastifyInstance } from "fastify";
import { query } from "@/db";

/*
    waits for GET request at /employees
    reads companyId from query parameters to filter employees by company
    queries the db for employees(all or filtered by company)
    returns the list of employees as JSON EmployeeDataType[]
*/

export function listEmployees(fastify: FastifyInstance) {
	fastify.get("/employees", async (request) => {
		const companyId = (request.query as { companyId?: string }).companyId;
		let sql = "SELECT * FROM employees";
		const params: string[] = [];
		if (companyId) {
			sql += " WHERE company_id = $1";
			params.push(companyId);
		}
		sql += " ORDER BY id ASC";
		const employees = await query(sql, params);
		return { employees };
	});
}

/*
waits for a get request at /employees/:employeeId
extracts employeeId from URL
Queries the DB
returns the employee record/returns a 404 error if not found
*/
export function getEmployee(fastify: FastifyInstance) {
	fastify.get("/employees/:employeeId", async (request, reply) => {
		const { employeeId } = request.params as { employeeId: string };
		const result = await query("SELECT * FROM employees WHERE id = $1", [
			employeeId
		]);
		if (result.length === 0) {
			reply.status(404);
			return { error: "Employee not found" };
		}
		return { employee: result[0] };
	});
}

/*
Waits for a POST request at /employees.
takes out employee data from the request body.
Inserts a new employee into the database.
Returns the created employee record.
*/
export function createEmployee(fastify: FastifyInstance) {
	fastify.post("/employees", async (request) => {
		const body = request.body as {
			name: string;
			role: string;
			company_id: string;
		};
		const result = await query(
			"INSERT INTO employees (name, role, company_id) VALUES ($1, $2, $3) RETURNING *",
			[body.name, body.role, body.company_id]
		);
		return { employee: result[0] };
	});
}

/*
Waits for a PUT request at /employees/:employeeId.
Extracts employeeId from the URL.
Takes updated employee data from the request body.
Updates the employee record in the database.
Returns the updated employee record.
*/
export function updateEmployee(fastify: FastifyInstance) {
	fastify.put("/employees/:employeeId", async (request) => {
		const { employeeId } = request.params as { employeeId: string };
		const body = request.body as {
			name?: string;
			role?: string;
			company_id?: string;
		};
		const result = await query(
			"UPDATE employees SET name = $1, role = $2, company_id = $3 WHERE id = $4 RETURNING *",
			[body.name, body.role, body.company_id, employeeId]
		);
		return { employee: result[0] };
	});
}

/*
Waits for a DELETE request at /employees/:employeeId.
Extracts employeeId from the URL.
Deletes the employee record from the database.
Returns a success message.
*/
export function deleteEmployee(fastify: FastifyInstance) {
	fastify.delete("/employees/:employeeId", async (request) => {
		const { employeeId } = request.params as { employeeId: string };
		await query("DELETE FROM employees WHERE id = $1", [employeeId]);
		return { message: `Employee ${employeeId} deleted` };
	});
}
/*
registers all employee endpoints during server startup
*/
export function registerEmployeeRoutes(fastify: FastifyInstance) {
	listEmployees(fastify);
	getEmployee(fastify);
	createEmployee(fastify);
	updateEmployee(fastify);
	deleteEmployee(fastify);
}
