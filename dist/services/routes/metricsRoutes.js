import * as register from "../dispatch/metrics";
export function metricsEndpoint(fastify) {
    fastify.get("/metrics", async (_request, reply) => {
        reply.header("Content-Type", register.contentType);
        return register.metrics();
    });
}
