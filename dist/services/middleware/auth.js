// services/middleware/auth.ts
/*
convenience helper — resolves the user ID regardless of which field
was used when the token was signed.
*/
export function resolveUserId(payload) {
	return payload.userId ?? payload.id;
}
// Verify JWT token — rejects with 401 if missing or invalid
export async function authenticate(request, reply) {
	try {
		await request.jwtVerify();
	} catch {
		return reply
			.code(401)
			.send({ error: "Unauthorized - Invalid or missing token" });
	}
}
// Require admin role — call after authenticate
export async function requireAdmin(request, reply) {
	const user = request.user;
	if (user?.role !== "admin") {
		return reply.code(403).send({ error: "Forbidden - Admin access required" });
	}
}
// Require dev role — call after authenticate
export async function requireDev(request, reply) {
	const user = request.user;
	if (user?.role !== "dev") {
		return reply.code(403).send({ error: "Forbidden - Dev access required" });
	}
}
// Ensure the requesting user can only access their own company's data.
// Dev users bypass this check entirely.
export function requireCompanyAccess(request, reply) {
	const user = request.user;
	const { companyId } = request.query;
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
