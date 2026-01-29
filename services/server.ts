import Fastify from "fastify";
// services/server.ts
import { jobRoutes } from "./routes/jobRoutes";      // ← relative path from services/server.ts
import { userRoutes } from "./routes/userRoutes";
import { companyRoutes } from "./routes/companyRoutes";
import { registerEmployeeRoutes } from "./routes/employeeRoutes";
import fastifyCors from "@fastify/cors";

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, { origin: "*" });

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
