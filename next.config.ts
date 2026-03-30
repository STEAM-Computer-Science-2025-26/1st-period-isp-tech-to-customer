import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Keep Fastify and its ecosystem out of webpack bundling.
	// They rely on dynamic requires that webpack can't handle correctly,
	// so we let Next.js load them natively as Node.js modules at runtime.
	serverExternalPackages: [
		"fastify",
		"@fastify/jwt",
		"@fastify/cors",
		"fastify-raw-body",
		"@fastify/formbody",
		"fastify-plugin",
		"pg",
		"pg-pool",
		"@neondatabase/serverless",
		"undici",
		"pino",
		"pino-pretty",
		"bcryptjs",
		"jsonwebtoken",
		"node-quickbooks",
		"stripe",
		"twilio",
		"nodemailer"
	]
};

export default nextConfig;
