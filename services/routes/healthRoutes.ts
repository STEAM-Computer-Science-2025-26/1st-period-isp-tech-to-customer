// services/routes/healthRoutes.ts

import { FastifyInstance } from "fastify";
import { Pool } from "pg";
import * as db from "../../db";

const pool: Pool =
	(db as any).pool ??
	new Pool({
		connectionString: process.env.DATABASE_URL
	});

import { geocodeAddress } from "./geocoding";

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
		const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET", "GEOCODIO_API_KEY"];

		const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
		if (missingVars.length > 0) {
			checks.environment = `missing: ${missingVars.join(", ")}`;
		} else {
			checks.environment = "ok";
		}

		// Check 3: Geocoding API
		try {
			const testResult = await geocodeAddress(
				"1600 Amphitheatre Parkway, Mountain View, CA"
			);
			if (testResult.success) {
				checks.geocoding = "ok";
			} else {
				checks.geocoding = `failed - ${testResult.error}`;
			}
		} catch (error) {
			checks.geocoding = `failed - ${error instanceof Error ? error.message : "unknown error"}`;
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
