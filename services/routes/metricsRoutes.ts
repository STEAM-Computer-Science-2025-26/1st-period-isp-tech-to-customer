import { FastifyInstance } from "fastify";
import * as register from "../dispatch/metrics";

export function metricsEndpoint(fastify: FastifyInstance) {
	fastify.get("/metrics", async (_request, reply) => {
		reply.header("Content-Type", register.contentType);
		return register.metrics();
	});
}
