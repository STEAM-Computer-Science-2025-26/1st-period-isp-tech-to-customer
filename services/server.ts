// services/server.ts
import locationRoutes from "./routes/locationRoutes";
import { getGeocodingWorker } from "./workers/geocodingWorker";

import "dotenv/config";
import Fastify from "fastify";
import { jobRoutes } from "./routes/jobRoutesUpdated";
import { userRoutes } from "./routes/userRoutes";
import { companyRoutes } from "./routes/companyRoutes";
import { registerEmployeeRoutes } from "./routes/employeeRoutes";
import { dispatchRoutes } from "./routes/dispatchRoutes";
import { employeeLocationRoutes } from "./routes/employeeLocationRoutes";
import { healthRoutes } from "./routes/healthRoutes";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

function validateEnvironment() {
	const required = ["DATABASE_URL", "JWT_SECRET", "GEOCODIO_API_KEY"];
	const missing = required.filter((key) => !process.env[key]);
	if (missing.length > 0) {
		console.error("\n❌ CRITICAL: Missing required environment variables:\n");
		missing.forEach((key) => console.error(`   - ${key}`));
		console.error("\nAdd these to your .env file and restart the server.\n");
		console.error("Get GEOCODIO_API_KEY from: https://www.geocod.io\n");
		process.exit(1);
	}
}
const geocodingWorker = getGeocodingWorker();
geocodingWorker.start();
validateEnvironment();

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

await fastify.register(fastifyCors, {
	origin: (origin, cb) => {
		if (!origin) return cb(null, true);
		if (allowedOrigins.includes(origin)) return cb(null, true);
		cb(new Error(`CORS: origin '${origin}' is not allowed`), false);
	},
	credentials: true
});

await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET! });

// ===== Add authenticate decorator here =====
fastify.decorate("authenticate", async (request: any, reply: any) => {
	try {
		await request.jwtVerify();
	} catch (err) {
		reply.send(err);
	}
});

fastify.setErrorHandler(errorHandler);
fastify.setNotFoundHandler(notFoundHandler);

// ===== Register all routes =====
await healthRoutes(fastify);
await jobRoutes(fastify);
await userRoutes(fastify);
await companyRoutes(fastify);
await registerEmployeeRoutes(fastify);
await dispatchRoutes(fastify);
await employeeLocationRoutes(fastify);
await fastify.register(locationRoutes); // Proper registration of FastifyPluginAsync

fastify.get("/", async () => ({
	status: "running",
	version: process.env.npm_package_version || "unknown",
	environment: process.env.NODE_ENV || "development"
}));

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

const start = async () => {
	try {
		await fastify.listen({ port, host });

		console.log("\n✅ Backend server started successfully!\n");
		console.log(`   URL: http://localhost:${port}`);
		console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
		console.log(`   Log level: ${process.env.LOG_LEVEL || "info"}`);
		console.log("\n📍 API Endpoints:");
		console.log(`   Health:     GET  /health`);
		console.log(`   Ready:      GET  /health/ready`);
		console.log(`   Jobs:       GET  /jobs`);
		console.log(`   Create Job: POST /jobs`);
		console.log(`   Dispatch:   POST /jobs/:id/dispatch`);
		console.log(`   Assign:     POST /jobs/:id/assign`);
		console.log(`   Complete:   POST /jobs/:id/complete`);
		console.log(`   Login:      POST /login`);
		console.log("\n");
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
process.on("SIGTERM", () => {
	console.log("SIGTERM received, shutting down gracefully...");
	geocodingWorker.stop();
	fastify.close(() => {
		console.log("Server closed");
		process.exit(0);
	});
});

process.on("SIGINT", () => {
	console.log("SIGINT received, shutting down gracefully...");
	geocodingWorker.stop();
	fastify.close(() => {
		console.log("Server closed");
		process.exit(0);
	});
});
