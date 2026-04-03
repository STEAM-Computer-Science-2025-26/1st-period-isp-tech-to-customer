// services/routes/platform/cronRoutes.ts
// Cron endpoint — triggers scheduled maintenance tasks.

import { FastifyInstance } from "fastify";
import { runAllCronJobs } from "../../cron/cronRunner";

function getBearerToken(authorization?: string | string[]): string {
	if (!authorization) return "";
	const value = Array.isArray(authorization)
		? authorization[0]
		: authorization;
	if (!value) return "";
	return value.startsWith("Bearer ") ? value.slice("Bearer ".length) : value;
}

export async function cronRoutes(fastify: FastifyInstance) {
	fastify.post("/cron/run", async (request, reply) => {
		const secret = process.env.CRON_SECRET ?? "";
		const token = getBearerToken(request.headers.authorization);

		if (!secret || token !== secret) {
			return reply.code(401).send({ error: "Unauthorized" });
		}

		const result = await runAllCronJobs();
		return reply.send({ ok: true, result });
	});
}
