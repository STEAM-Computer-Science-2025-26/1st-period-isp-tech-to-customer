import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../db/index";

export async function POST(request: NextRequest) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid request body" },
			{ status: 400 }
		);
	}

	const { email, password } = (body ?? {}) as Record<string, unknown>;

	if (
		typeof email !== "string" ||
		!email ||
		typeof password !== "string" ||
		!password
	) {
		return NextResponse.json(
			{ error: "Invalid request body" },
			{ status: 400 }
		);
	}

	const jwtSecret = process.env.JWT_SECRET;
	if (!jwtSecret) {
		return NextResponse.json(
			{ error: "Server misconfiguration" },
			{ status: 500 }
		);
	}

	const sql = getSql();
	const [user] = (await sql`
		SELECT id, email, password_hash, role, company_id
		FROM users WHERE email = ${email}
	`) as any[];

	if (!user) {
		return NextResponse.json(
			{ error: "Invalid email or password" },
			{ status: 401 }
		);
	}

	const isPasswordValid = await bcrypt.compare(password, user.password_hash);
	if (!isPasswordValid) {
		return NextResponse.json(
			{ error: "Invalid email or password" },
			{ status: 401 }
		);
	}

	const token = jwt.sign(
		{
			userId: user.id,
			email: user.email,
			role: user.role,
			companyId: user.company_id
		},
		jwtSecret,
		{ expiresIn: "8h" }
	);

	return NextResponse.json({
		token,
		user: {
			userId: user.id,
			email: user.email,
			role: user.role,
			companyId: user.company_id
		}
	});
}
