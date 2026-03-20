import type { NextConfig } from "next";

const FASTIFY_URL =
	process.env.NEXT_PUBLIC_FASTIFY_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
	async rewrites() {
		return [
			{
				// Proxy all /api/* requests to Fastify (strips the /api prefix).
				// This keeps frontend fetch calls relative ("/api/verify/send")
				// while all logic lives in Fastify.
				source: "/api/:path*",
				destination: `${FASTIFY_URL}/:path*`
			}
		];
	}
};

export default nextConfig;
