import "dotenv/config";

import Fastify from "fastify";
// services/server.ts
import { jobRoutes } from "./routes/jobRoutes";
import { userRoutes } from "./routes/userRoutes";
import { companyRoutes } from "./routes/companyRoutes";
import { registerEmployeeRoutes } from "./routes/employeeRoutes";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, { origin: "*" });

await fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || "your-super-secret-key-change-this-in-production"
});

jobRoutes(fastify);
userRoutes(fastify);
companyRoutes(fastify);
registerEmployeeRoutes(fastify);

fastify.get("/", async () => ({ status: "backend is running" }));

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: "0.0.0.0" });
    console.log("Backend running on http://localhost:3001");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
