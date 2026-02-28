// services/server.ts
import fastifyRawBody from "fastify-raw-body";
import "dotenv/config";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";

// Existing routes
import { paymentCollectionRoutes } from "../services/dispatch/paymentCollectionRoutes";
import locationRoutes from "./routes/locationRoutes";
import { jobRoutes } from "./routes/jobRoutes";
import { userRoutes } from "./routes/userRoutes";
import { companyRoutes } from "./routes/companyRoutes";
import { registerEmployeeRoutes } from "./routes/employeeRoutes";
import { dispatchRoutes } from "./routes/dispatchRoutes";
import { employeeLocationRoutes } from "./routes/employeeLocationRoutes";
import { healthRoutes } from "./routes/healthRoutes";
import { stripeRoutes } from "./routes/stripeRoutes";
import { qbRoutes } from "./routes/qbRoutes";
import { partsRoutes } from "./routes/partsRoutes";
import { customerRoutes } from "./routes/customerRoutes";
import { branchRoutes } from "./routes/branchRoutes";
import { onboardingRoutes } from "./routes/onboardingRoutes";
import { certificationRoutes } from "./routes/certificationRoutes";
import { durationRoutes } from "./routes/durationRoutes";
import { pricebookRoutes } from "./routes/pricebookRoutes";
import { estimateRoutes } from "./routes/estimateRoutes";
import { invoiceRoutes } from "./routes/invoiceRoutes";
import { analyticsRoutes } from "./routes/analyticsRoutes";
import { jobTimeTrackingRoutes } from "./routes/jobTimeTrackingRoutes";
import { kpiRoutes } from "./routes/kpiRoutes";
import { dispatchAuditRoutes } from "./routes/dispatchAuditRoutes";
import { refrigerantLogRoutes } from "./routes/refrigerantLogRoutes";
import { getGeocodingWorker } from "./workers/geocodingWorker";
import {
	runCustomerGeocodingWorker,
	retryFailedGeocoding
} from "./workers/customerGeocodingWorker";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

// ============================================================
// Environment validation
// ============================================================

function validateEnvironment() {
	const required = ["DATABASE_URL", "JWT_SECRET", "GEOCODIO_API_KEY"];
	const missing = required.filter((key) => !process.env[key]);

	if (missing.length > 0) {
		console.error("\n❌ CRITICAL: Missing required environment variables:\n");
		missing.forEach((key) => console.error(`   - ${key}`));
		console.error("\nAdd these to your .env file and restart the server.\n");
		process.exit(1);
	}
}

validateEnvironment();

// ============================================================
// Workers
// ============================================================

const geocodingWorker = getGeocodingWorker();
try {
	await geocodingWorker.start();
} catch (err) {
	console.error(
		"⚠️ Geocoding worker failed to start — server continuing:",
		err
	);
}

const customerGeocodingInterval = setInterval(async () => {
	await runCustomerGeocodingWorker();
}, 30_000);

const retryGeocodingInterval = setInterval(async () => {
	await retryFailedGeocoding();
}, 60 * 60_000);

// ============================================================
// Server setup
// ============================================================

const allowedOrigins: string[] = (
	process.env.ALLOWED_ORIGINS ?? "http://localhost:3000"
)
	.split(",")
	.map((o) => o.trim())
	.filter(Boolean);

const fastify = Fastify({
	logger: {
		level: process.env.LOG_LEVEL || "info",
		...(process.env.NODE_ENV !== "production" && {
			transport: {
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "HH:MM:ss",
					ignore: "pid,hostname"
				}
			}
		})
	}
});

// ============================================================
// Plugins
// ============================================================

await fastify.register(fastifyRawBody, {
	field: "rawBody",
	global: false,
	encoding: false,
	runFirst: true
});

await fastify.register(fastifyCors, {
	origin: (origin, cb) => {
		if (!origin) return cb(null, true);
		if (allowedOrigins.includes(origin)) return cb(null, true);
		cb(new Error(`CORS: origin '${origin}' is not allowed`), false);
	},
	credentials: true
});

await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET! });

fastify.decorate(
	"authenticate",
	async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			await request.jwtVerify();
		} catch {
			return reply
				.code(401)
				.send({ error: "Unauthorized - Invalid or missing token" });
		}
	}
);

fastify.setErrorHandler(errorHandler);
fastify.setNotFoundHandler(notFoundHandler);

// ============================================================
// Routes — existing
// ============================================================

await fastify.register(paymentCollectionRoutes);
await healthRoutes(fastify);
await jobRoutes(fastify);
await userRoutes(fastify);
await companyRoutes(fastify);
await registerEmployeeRoutes(fastify);
await dispatchRoutes(fastify);
await employeeLocationRoutes(fastify);
await fastify.register(locationRoutes);
await fastify.register(pricebookRoutes);
await fastify.register(estimateRoutes);
await fastify.register(invoiceRoutes);
await fastify.register(customerRoutes);
await fastify.register(branchRoutes);
await fastify.register(onboardingRoutes);
await fastify.register(certificationRoutes);
await fastify.register(durationRoutes);
await fastify.register(stripeRoutes);
await fastify.register(qbRoutes);
await fastify.register(partsRoutes);
await fastify.register(analyticsRoutes);
await fastify.register(jobTimeTrackingRoutes);
await fastify.register(kpiRoutes);
await fastify.register(dispatchAuditRoutes);
await fastify.register(refrigerantLogRoutes);


// ============================================================
// Root
// ============================================================

fastify.get("/", async () => ({
	status: "running",
	version: process.env.npm_package_version || "unknown",
	environment: process.env.NODE_ENV || "development"
}));

// ============================================================
// Start
// ============================================================

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

const start = async () => {
	try {
		await fastify.listen({ port, host });

		console.log("\n✅ Backend server started successfully!\n");
		console.log(`   URL:         http://localhost:${port}`);
		console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
		console.log(`   Log level:   ${process.env.LOG_LEVEL || "info"}`);

		console.log("\n📍 Existing Endpoints:");
		console.log("   GET  /health");
		console.log("   POST /login");
		console.log("   GET  /jobs");
		console.log("   POST /jobs");
		console.log("   POST /jobs/:id/dispatch");
		console.log("   POST /jobs/:id/assign");
		console.log("   POST /jobs/:id/complete");

		console.log("\n Analytics:");
		console.log("   GET  /analytics/revenue");
		console.log("   GET  /analytics/tech-performance");
		console.log("   GET  /analytics/job-kpis");
		console.log("   GET  /analytics/first-time-fix");
		console.log("   GET  /analytics/callback-rate");
		console.log("   GET  /analytics/time-breakdown");

		console.log("\n Time Tracking:");
		console.log("   POST   /jobs/:jobId/time-tracking");
		console.log("   PATCH  /jobs/:jobId/time-tracking/departed");
		console.log("   PATCH  /jobs/:jobId/time-tracking/arrived");
		console.log("   PATCH  /jobs/:jobId/time-tracking/work-started");
		console.log("   PATCH  /jobs/:jobId/time-tracking/work-ended");
		console.log("   PATCH  /jobs/:jobId/time-tracking/departed-job");
		console.log("   GET    /jobs/:jobId/time-tracking");

		console.log("\n KPI Thresholds & Alerts:");
		console.log("   GET    /kpi/thresholds");
		console.log("   POST   /kpi/thresholds");
		console.log("   PATCH  /kpi/thresholds/:id");
		console.log("   DELETE /kpi/thresholds/:id");
		console.log("   GET    /kpi/alerts");
		console.log("   PATCH  /kpi/alerts/:id/read");
		console.log("   PATCH  /kpi/alerts/:id/resolve");
		console.log("   POST   /kpi/check");

		console.log("\n Dispatch Audit:");
		console.log("   POST   /jobs/:jobId/dispatch-override");
		console.log("   GET    /jobs/:jobId/dispatch-override");
		console.log("   POST   /jobs/:jobId/reassign");
		console.log("   GET    /jobs/:jobId/reassignments");
		console.log("   GET    /analytics/dispatch-overrides");

		console.log("\n Refrigerant Logs (EPA 608):");
		console.log("   POST   /refrigerant-logs");
		console.log("   GET    /refrigerant-logs");
		console.log("   GET    /refrigerant-logs/summary");
		console.log("   GET    /refrigerant-logs/:logId");
		console.log("   POST   /refrigerant-logs/:logId/amend");

		console.log("\n📍 Workers running:");
		console.log("   Job geocoding        — existing");
		console.log("   Customer geocoding   — every 30s");
		console.log("   Geocoding retry      — every 1h");
		console.log("   Cert expiration      — via cron endpoint");
		console.log("\n");
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();

// ============================================================
// Graceful shutdown
// ============================================================

function shutdown(signal: string) {
	console.log(`\n${signal} received, shutting down gracefully...`);
	geocodingWorker.stop();
	clearInterval(customerGeocodingInterval);
	clearInterval(retryGeocodingInterval);
	fastify.close(() => {
		console.log("Server closed");
		process.exit(0);
	});
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));