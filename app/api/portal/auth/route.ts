// app/api/portal/auth/route.ts
// POST /api/portal/auth  — request a magic-link token (sends to customer email/phone)
// This is the entry point for the customer self-service portal.

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import { createHash, randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { email, phone, companyId } = body;

	if ((!email && !phone) || !companyId) {
		return NextResponse.json(
			{ error: "email or phone, and companyId are required" },
			{ status: 400 }
		);
	}

	const sql = getSql();

	// Look up customer
	const customers = email
		? await sql`
			SELECT id, first_name, email, phone FROM customers
			WHERE email = ${email} AND company_id = ${companyId} AND is_active = TRUE
			LIMIT 1
		`
		: await sql`
			SELECT id, first_name, email, phone FROM customers
			WHERE phone = ${phone} AND company_id = ${companyId} AND is_active = TRUE
			LIMIT 1
		`;

	// Always return 200 to avoid customer enumeration
	if ((customers as any[]).length === 0) {
		return NextResponse.json({
			ok: true,
			message: "If an account exists, a login link has been sent."
		});
	}

	const customer = (customers as any[])[0];

	// Generate token
	const rawToken = randomBytes(32).toString("hex");
	const tokenHash = createHash("sha256").update(rawToken).digest("hex");
	const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

	await sql`
		INSERT INTO customer_portal_tokens (customer_id, token_hash, expires_at)
		VALUES (${customer.id}, ${tokenHash}, ${expiresAt.toISOString()})
	`;

	// TODO: Send magic link via Twilio/SendGrid
	// Magic link format: https://yourapp.com/portal?token=rawToken
	console.log(`[portal] Magic link token for ${customer.id}: ${rawToken}`);

	return NextResponse.json({
		ok: true,
		message: "If an account exists, a login link has been sent.",
		// In dev mode only — remove before prod
		...(process.env.NODE_ENV === "development" ? { _devToken: rawToken } : {})
	});
}
