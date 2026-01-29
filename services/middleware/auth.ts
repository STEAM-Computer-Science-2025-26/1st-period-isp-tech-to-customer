import { FastifyRequest, FastifyReply } from "fastify";

// Define our JWT payload structure
export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  companyId: string;
}

// Middleware to verify JWT token
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Verify the JWT token from the Authorization header
    await request.jwtVerify();
    
    // Token is valid, user info is now in request.user
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized - Invalid or missing token" });
  }
}

// Middleware to check if user is admin
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as JWTPayload;
  
  if (user?.role !== 'admin') {
    reply.code(403).send({ error: "Forbidden - Admin access required" });
  }
}

// Middleware to ensure user can only access their company's data
export function requireCompanyAccess(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as JWTPayload;
  const { companyId } = request.query as { companyId?: string };
  
  if (companyId && companyId !== user?.companyId) {
    reply.code(403).send({ error: "Forbidden - Cannot access other company's data" });
  }
}