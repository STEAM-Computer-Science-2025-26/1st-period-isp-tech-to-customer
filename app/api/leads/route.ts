// app/api/leads/route.ts
// POST /api/leads — capture lead info from resource hub
// No auth required — public marketing endpoint

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
	let body: {
		email?: string;
		firstName?: string;
		lastName?: string;
		businessName?: string;
		phone?: string;
		techCount?: number | string;
		source?: string;
		toolsUsed?: string[];
	};

	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const email = body.email?.trim().toLowerCase();
	if (!email || !email.includes("@") || email.length > 254) {
		return NextResponse.json(
			{ error: "Valid email required" },
			{ status: 400 }
		);
	}

	const firstName = body.firstName?.trim().slice(0, 80) ?? null;
	const lastName = body.lastName?.trim().slice(0, 80) ?? null;
	const businessName = body.businessName?.trim().slice(0, 120) ?? null;
	const phone = body.phone?.trim().slice(0, 30) ?? null;
	const techCount =
		body.techCount != null ? parseInt(String(body.techCount), 10) : null;
	const source = body.source ?? "resource_hub";
	const toolsUsed = Array.isArray(body.toolsUsed) ? body.toolsUsed : [];

	if (
		techCount !== null &&
		(isNaN(techCount) || techCount < 0 || techCount > 9999)
	) {
		return NextResponse.json({ error: "Invalid tech count" }, { status: 400 });
	}

	const sql = getSql();

	const [lead] = (await sql`
		INSERT INTO resource_leads (
			email, first_name, last_name, business_name, phone, tech_count, source, tools_used
		)
		VALUES (
			${email}, ${firstName}, ${lastName}, ${businessName}, ${phone}, ${techCount}, ${source}, ${toolsUsed}
		)
		ON CONFLICT (email)
		DO UPDATE SET
			first_name    = COALESCE(EXCLUDED.first_name,    resource_leads.first_name),
			last_name     = COALESCE(EXCLUDED.last_name,     resource_leads.last_name),
			business_name = COALESCE(EXCLUDED.business_name, resource_leads.business_name),
			phone         = COALESCE(EXCLUDED.phone,         resource_leads.phone),
			tech_count    = COALESCE(EXCLUDED.tech_count,    resource_leads.tech_count),
			tools_used    = ARRAY(
				SELECT DISTINCT unnest(resource_leads.tools_used || EXCLUDED.tools_used)
			),
			created_at    = NOW()
		RETURNING id, email, first_name, last_name, business_name, phone, tech_count, source, tools_used, created_at
	`) as any[];

	return NextResponse.json({ ok: true, lead }, { status: 200 });
}
