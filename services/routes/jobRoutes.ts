import { FastifyInstance } from "fastify";
import { query } from "@/db";

/** Register the GET /jobs endpoint (runs when a client requests GET /jobs). */
export function lisJobs(fastify: FastifyInstance) {
	fastify.get("/jobs", async () => {
		const jobs = await query("SELECT * FROM jobs ORDER by created_at DESC");
		return { jobs };
	});
}

/** Register the POST /jobs endpoint (runs when a client requests POST /jobs). */
export function createJob(fastify: FastifyInstance) {
	fastify.post("/jobs", async (request) => {
		const body = request.body as { customerName: string; address: string };
		const result = await query(
			"INSERT INTO jobs (customer_name, address) VALUES ($1, $2) RETURNING *",
			[body.customerName, body.address]
		);
		return { job: result[0] };
	});
}

/** Register the PUT /jobs/:jobId/status endpoint (runs when a client requests it). */
export function updateJobStatus(fastify: FastifyInstance) {
	fastify.put("/jobs/:jobId/status", async (request) => {
		const { jobId } = request.params as { jobId: string };
		const body = request.body as { status: string };
		const result = await query(
			"UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *",
			[body.status, jobId]
		);
		return { job: result[0] };
	});
}

/** Register the DELETE /jobs/:jobId endpoint (runs when a client requests it). */
export function deleteJob(fastify: FastifyInstance) {
	fastify.delete("/jobs/:jobId", async (request) => {
		const { jobId } = request.params as { jobId: string };
		await query("DELETE FROM jobs WHERE id = $1", [jobId]);
		return { message: `Job ${jobId} deleted` };
	});
}

/**
 * Convenience "bundle" function: call this ONCE during server startup.
 * It registers all job endpoints so they are available.
 *
 * You are NOT calling all four actions for one request — you're just making
 * sure all four endpoints exist. Each one runs only when its matching route
 * is requested.
 */
export async function jobRoutes(fastify: FastifyInstance) {
	lisJobs(fastify);
	createJob(fastify);
	updateJobStatus(fastify);
	deleteJob(fastify);
}
