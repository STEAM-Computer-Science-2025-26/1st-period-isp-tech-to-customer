import { FastifyInstance } from "fastify";
import { pool } from "../../db";

export function healthCheck(fastify: FastifyInstance) {
	fastify.get("/health", async () => {
		return {
			status: "ok",
			timestamp: new Date().toISOString(),
			uptime: process.uptime()
		};
	});
}

export function readinessCheck(fastify: FastifyInstance) {
	fastify.get("/health/ready", async (request, reply) => {
		const checks: Record<string, string> = {};

		// Check 1: Database connection
		try {
			const client = await pool.connect();
			await client.query("SELECT 1");
			client.release();
			checks.database = "ok";
		} catch (error) {
			checks.database = `failed - ${error instanceof Error ? error.message : "unknown error"}`;
		}

		// Check 2: Required environment variables
		const requiredEnvVars = [
			"DATABASE_URL",
			"JWT_SECRET",
			"GOOGLE_MAPS_API_KEY"
		];

		const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
		if (missingVars.length > 0) {
			checks.environment = `missing: ${missingVars.join(", ")}`;
		} else {
			checks.environment = "ok";
		}

		// Determine overall status
		const allHealthy = Object.values(checks).every((status) => status === "ok");

		const response = {
			status: allHealthy ? "ready" : "not ready",
			checks,
			timestamp: new Date().toISOString(),
			version: process.env.npm_package_version || "unknown"
		};

		return reply.code(allHealthy ? 200 : 503).send(response);
	});
}

export function livenessCheck(fastify: FastifyInstance) {
	fastify.get("/health/live", async () => {
		return { status: "alive" };
	});
}

export async function healthRoutes(fastify: FastifyInstance) {
	// No authentication required for health checks
	healthCheck(fastify);
	readinessCheck(fastify);
	livenessCheck(fastify);
}
