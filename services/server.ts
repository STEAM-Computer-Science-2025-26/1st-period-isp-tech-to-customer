import "dotenv/config";

import Fastify from "fastify";
import { jobRoutes } from "./routes/jobRoutes";
import { userRoutes } from "./routes/userRoutes";
import { companyRoutes } from "./routes/companyRoutes";
import { registerEmployeeRoutes } from "./routes/employeeRoutes";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";

// Fail fast on missing secrets — never let the server start in a broken state.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
	console.error(
		"❌ JWT_SECRET environment variable is not set. Server cannot start."
	);
	process.exit(1);
}

const allowedOrigins: string[] = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
	.split(",")
	.map((o) => o.trim())
	.filter(Boolean);

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, {
	origin: (origin, cb) => {
		// allow requests with no origin (server-to-server, curl, Postman)
		if (!origin) return cb(null, true);
		if (allowedOrigins.includes(origin)) return cb(null, true);
		cb(new Error(`CORS: origin '${origin}' is not allowed`), false);
	},
	credentials: true
});

await fastify.register(fastifyJwt, { secret: jwtSecret });

jobRoutes(fastify);
userRoutes(fastify);
companyRoutes(fastify);
registerEmployeeRoutes(fastify);

fastify.get("/", async () => ({ status: "backend is running" }));

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

const start = async () => {
	try {
		await fastify.listen({ port, host });
		console.log(`Backend running on http://localhost:3001`);
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();