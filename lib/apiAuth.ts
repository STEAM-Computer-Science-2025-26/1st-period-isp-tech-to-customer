// lib/apiAuth.ts
// Next.js App Router auth helper — use this in all new app/api/ routes.
// Reads the Authorization: Bearer <token> header and verifies it with JWT_SECRET.
// Mirrors the JWTPayload shape from services/middleware/auth.ts.

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export type UserRole = "dev" | "admin" | "tech";

export interface AuthUser {
	userId: string;
	id?: string;
	email: string;
	role: UserRole;
	companyId?: string;
}

type AuthSuccess = { ok: true; user: AuthUser };
type AuthFailure = { ok: false; response: NextResponse };
type AuthResult = AuthSuccess | AuthFailure;

export async function requireAuth(request: NextRequest): Promise<AuthResult> {
	const authHeader = request.headers.get("authorization");

	if (!authHeader?.startsWith("Bearer ")) {
		return {
			ok: false,
			response: NextResponse.json(
				{ error: "Unauthorized - Missing token" },
				{ status: 401 }
			)
		};
	}

	const token = authHeader.slice(7);
	const secret = process.env.JWT_SECRET;

	if (!secret) {
		console.error("[auth] JWT_SECRET is not configured");
		return {
			ok: false,
			response: NextResponse.json(
				{ error: "Server configuration error" },
				{ status: 500 }
			)
		};
	}

	try {
		const payload = jwt.verify(token, secret) as any;

		const user: AuthUser = {
			// Token may use either 'id' or 'userId' depending on when it was signed
			userId: payload.userId ?? payload.id,
			id: payload.id,
			email: payload.email ?? "",
			role: payload.role as UserRole,
			companyId: payload.companyId
		};

		return { ok: true, user };
	} catch {
		return {
			ok: false,
			response: NextResponse.json(
				{ error: "Unauthorized - Invalid or expired token" },
				{ status: 401 }
			)
		};
	}
}