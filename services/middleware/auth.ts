import { FastifyRequest, FastifyReply } from "fastify";

// Define our JWT payload structure
export interface JWTPayload {
	// TODO: Standardize the JWT payload shape across the codebase.
	// Current code has used both `id` and `userId` in different places.
	userId?: string;
	id?: string;
	email: string;
	role: "dev" | "admin" | "tech" | string;
	// TODO: Ensure companyId is always present in tokens for company scoping.
	companyId?: string;
}

// Middleware to verify JWT token
<<<<<<< HEAD
export async function authenticate(
	request: FastifyRequest,
	reply: FastifyReply
) {
	try {
		// Verify the JWT token from the Authorization header
		await request.jwtVerify();

		// Token is valid, user info is now in request.user
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

	// Company-admin (not a global admin).
	// Dev users should not be forced through admin-only gates; they bypass via requireDev.

	if (user?.role !== "admin") {
		return reply.code(403).send({ error: "Forbidden - Admin access required" });
	}
}

// Middleware to check if user is a dev user (bypasses company scoping)
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

	// Dev users can bypass company scoping checks.
	if (user?.role === "dev") return;

	// TODO: Company scoping should not rely only on `request.query.companyId`.
	// Many routes use path params (/company/:companyId) or body fields (companyId).
	// Consider enforcing scoping at the SQL level (WHERE company_id = request.user.companyId).
	if (!user?.companyId) {
		return reply
			.code(403)
			.send({ error: "Forbidden - Missing company in token" });
	}

	if (companyId && companyId !== user?.companyId) {
		return reply
			.code(403)
			.send({ error: "Forbidden - Cannot access other company's data" });
	}
}
=======
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    // Token is valid - continue to next handler
  } catch (err) {
    return reply.code(401).send({ error: "Unauthorized - Invalid or missing token" });
  }
}

// Middleware to check if user is admin
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as JWTPayload;
  
  if (user?.role !== 'admin') {
    return reply.code(403).send({ error: "Forbidden - Admin access required" });
  }
  // User is admin - continue to next handler
}

// Middleware to ensure user can only access their company's data
export function requireCompanyAccess(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as JWTPayload;
  const { companyId } = request.query as { companyId?: string };
  
  if (companyId && companyId !== user?.companyId) {
    return reply.code(403).send({ error: "Forbidden - Cannot access other company's data" });
  }
  // Company access OK - continue to next handler
}
>>>>>>> b49ede1 (feat: implement user management routes with CRUD operations)
