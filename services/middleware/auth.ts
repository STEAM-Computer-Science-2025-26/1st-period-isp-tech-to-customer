// services/middleware/auth.ts

import { FastifyRequest, FastifyReply } from "fastify";

export type UserRole = "dev" | "admin" | "tech";

export interface JWTPayload {
	// userId and id both exist in the wild depending on how the token was signed.
	// Prefer userId; fall back to id.
	userId?: string;
	id?: string;
	email: string;
	role: UserRole;
	companyId?: string;
}

/*
convenience helper — resolves the user ID regardless of which field
was used when the token was signed.
*/
export function resolveUserId(payload: JWTPayload): string | undefined {
	return payload.userId ?? payload.id;
}

// Verify JWT token — rejects with 401 if missing or invalid
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

// Require admin role — call after authenticate
export async function requireAdmin(
	request: FastifyRequest,
	reply: FastifyReply
) {
	const user = request.user as JWTPayload;
	if (user?.role !== "admin") {
		return reply.code(403).send({ error: "Forbidden - Admin access required" });
	}
}

// Require dev role — call after authenticate
export async function requireDev(request: FastifyRequest, reply: FastifyReply) {
	const user = request.user as JWTPayload;
	if (user?.role !== "dev") {
		return reply.code(403).send({ error: "Forbidden - Dev access required" });
	}
}

// Ensure the requesting user can only access their own company's data.
// Dev users bypass this check entirely.
export function requireCompanyAccess(
	request: FastifyRequest,
	reply: FastifyReply
) {
	const user = request.user as JWTPayload;
	const { companyId } = request.query as { companyId?: string };

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
