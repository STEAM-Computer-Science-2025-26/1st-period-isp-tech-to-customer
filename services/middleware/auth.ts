import { FastifyRequest, FastifyReply } from "fastify";

// Define our JWT payload structure
export interface JWTPayload {
	userId?: string;
	id?: string;
	email: string;
	role: "dev" | "admin" | "tech" | string;
	companyId?: string;
}

// Middleware to verify JWT token
export async function authenticate(
	request: FastifyRequest,
	reply: FastifyReply
) {
	try {
		await request.jwtVerify();
	} catch {
		return reply
			.code(401)
			.send({ error: "Unauthorized - Invalid or missing token" });
	}
}

// Middleware to check if user is admin
export async function requireAdmin(
	request: FastifyRequest,
	reply: FastifyReply
) {
	const user = request.user as JWTPayload;

	if (user?.role !== "admin") {
		return reply.code(403).send({ error: "Forbidden - Admin access required" });
	}
}

// Middleware to check if user is a dev (bypasses company scoping)
export async function requireDev(request: FastifyRequest, reply: FastifyReply) {
	const user = request.user as JWTPayload;

	if (user?.role !== "dev") {
		return reply.code(403).send({ error: "Forbidden - Dev access required" });
	}
}

// Middleware to ensure user can only access their company's data
export function requireCompanyAccess(
	request: FastifyRequest,
	reply: FastifyReply
) {
	const user = request.user as JWTPayload;
	const { companyId } = request.query as { companyId?: string };

	// Dev users bypass company scoping
	if (user?.role === "dev") return;

	if (!user?.companyId) {
		return reply
			.code(403)
			.send({ error: "Forbidden - Missing company in token" });
	}

	if (companyId && companyId !== user.companyId) {
		return reply
			.code(403)
			.send({ error: "Forbidden - Cannot access other company's data" });
	}
}
