import { FastifyInstance } from "fastify";
import { query } from "../../db";
import { z } from "zod";
import { areValidCoordinates } from "../../algo/distance";

const updateLocationSchema = z.object({
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180)
});

type AuthUser = {
	userId?: string;
	id?: string;
	role?: string;
	companyId?: string;
};

export function updateEmployeeLocation(fastify: FastifyInstance) {
	fastify.put("/employees/:employeeId/location", async (request, reply) => {
		const { employeeId } = request.params as { employeeId: string };
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";
		const isAdmin = authUser?.role === "admin";

		const parsed = updateLocationSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const { latitude, longitude } = parsed.data;

		if (!areValidCoordinates({ latitude, longitude })) {
			return reply.code(400).send({
				error: "Invalid coordinates",
				details: { latitude: ["Invalid"], longitude: ["Invalid"] }
			});
		}

		if (!isDev) {
			const employeeCheck = (await query(
				`SELECT id, user_id, company_id FROM employees WHERE id = $1`,
				[employeeId]
			)) as unknown as { id: string; user_id: string; company_id: string }[];

			if (employeeCheck.length === 0) {
				return reply.code(404).send({ error: "Employee not found" });
			}

			const employee = employeeCheck[0];

			if (isAdmin) {
				if (employee.company_id !== authUser.companyId) {
					return reply.code(403).send({
						error: "Forbidden - Cannot update employee from other company"
					});
				}
			} else {
				const userId = authUser.userId ?? authUser.id;
				if (employee.user_id !== userId) {
					return reply
						.code(403)
						.send({ error: "Forbidden - Can only update your own location" });
				}
			}
		}

		const result = (await query(
			`UPDATE employees 
		SET latitude = $1, longitude = $2, location_updated_at = NOW(), updated_at = NOW()
		WHERE id = $3
		RETURNING id, latitude, longitude, location_updated_at AS "locationUpdatedAt"`,
			[latitude, longitude, employeeId]
		)) as unknown as {
			id: string;
			latitude: number | null;
			longitude: number | null;
			locationUpdatedAt: string | null;
		}[];

		if (result.length === 0) {
			return reply.code(404).send({ error: "Employee not found" });
		}

		return {
			success: true,
			location: result[0]
		};
	});
}

export function getEmployeeLocation(fastify: FastifyInstance) {
	fastify.get("/employees/:employeeId/location", async (request, reply) => {
		const { employeeId } = request.params as { employeeId: string };
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";

		const sql = `SELECT 
	  id, latitude, longitude, 
	  location_updated_at AS "locationUpdatedAt"
	  FROM employees 
	  WHERE id = $1`;

		const params = [employeeId];

		const result = (await query(sql, params)) as unknown as {
			id: string;
			latitude: number | null;
			longitude: number | null;
			locationUpdatedAt: string | null;
		}[];
		if (result.length === 0) {
			return reply.code(404).send({ error: "Employee not found" });
		}

		return result[0];
	});
}

export function getAllTechs(fastify: FastifyInstance) {
	fastify.get("/techs", async (request, _reply) => {
		const authUser = request.user as AuthUser;
		const isDev = authUser?.role === "dev";

		let sql = `
	  SELECT 
		id AS tech_id,
		name AS tech_name,
		latitude,
		longitude,
		location_updated_at AS last_update
	  FROM employees
	  WHERE role = 'tech'
	`;

		const params: any[] = [];

		if (!isDev) {
			sql += ` AND company_id = $1`;
			params.push(authUser.companyId ?? "");
		}

		const result = (await query(sql, params)) as unknown as {
			tech_id: string;
			tech_name: string;
			latitude: number | null;
			longitude: number | null;
			last_update: string | null;
		}[];

		const techs = result.map((t) => ({
			tech_id: t.tech_id,
			tech_name: t.tech_name,
			latitude: t.latitude,
			longitude: t.longitude,
			last_update: t.last_update,
			seconds_since_update: t.last_update
				? Math.floor((Date.now() - new Date(t.last_update).getTime()) / 1000)
				: null
		}));

		return {
			techs,
			timestamp: new Date().toISOString()
		};
	});
}
export function employeeLocationRoutes(fastify: FastifyInstance) {
	updateEmployeeLocation(fastify);
	getEmployeeLocation(fastify);
	getAllTechs(fastify);
}
