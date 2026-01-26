import Fastify from "fastify";
import { jobRoutes } from "./routes/jobRoutes";

const fastify = Fastify({ logger: true });
jobRoutes(fastify);
// Test route
fastify.get("/", async () => {
	return { status: "backend is running" };
});

// Start server
const start = async () => {
	try {
		await fastify.listen({ port: 3001 }); // Use a different port than Next.js frontend
		console.log("Backend running on http://localhost:3001");
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
