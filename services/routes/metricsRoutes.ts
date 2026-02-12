import { FastifyInstance } from "fastify";
import * as register from "../dispatch/metrics";

export function metricsEndpoint(fastify: FastifyInstance) {
	fastify.get("/metrics", async (request, reply) => {
		reply.header("Content-Type", register.contentType);
		return register.metrics();
	});
}

// /Users/tanayshah/airleous/1st-period-isp-tech-to-customer/services/dispatch/metrics.ts
export const contentType = "text/plain; version=0.0.4; charset=utf-8";

/**
 * Return a small set of Prometheus-style metrics about the Node process.
 * The function is async to match the usage site, but it generates metrics synchronously.
 */
export async function metrics(): Promise<string> {
	const m = process.memoryUsage();
	const uptime = process.uptime();

	// best-effort active handles count (non-standard API may not exist in some runtimes)
	const activeHandlesCount =
		typeof (process as any)._getActiveHandles === "function"
			? (process as any)._getActiveHandles().length
			: 0;

	const lines: string[] = [
		"# HELP node_process_uptime_seconds Process uptime in seconds.",
		"# TYPE node_process_uptime_seconds gauge",
		`node_process_uptime_seconds ${uptime}`,
		"# HELP node_process_memory_rss_bytes Resident set size in bytes.",
		"# TYPE node_process_memory_rss_bytes gauge",
		`node_process_memory_rss_bytes ${m.rss}`,
		"# HELP node_process_heap_total_bytes V8 heap total in bytes.",
		"# TYPE node_process_heap_total_bytes gauge",
		`node_process_heap_total_bytes ${m.heapTotal}`,
		"# HELP node_process_heap_used_bytes V8 heap used in bytes.",
		"# TYPE node_process_heap_used_bytes gauge",
		`node_process_heap_used_bytes ${m.heapUsed}`,
		"# HELP node_process_external_memory_bytes V8 external memory in bytes.",
		"# TYPE node_process_external_memory_bytes gauge",
		`node_process_external_memory_bytes ${m.external ?? 0}`,
		"# HELP node_process_active_handles Number of active libuv handles.",
		"# TYPE node_process_active_handles gauge",
		`node_process_active_handles ${activeHandlesCount}`
	];

	return lines.join("\n") + "\n";
}
