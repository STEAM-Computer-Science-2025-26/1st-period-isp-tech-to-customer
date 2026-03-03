// app/api/leads/route.ts
// POST /api/leads — capture email from resource hub
// No auth required — this is a public marketing endpoint

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
	let body: { email?: string; source?: string; toolsUsed?: string[] };

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

	const source = body.source ?? "resource_hub";
	const toolsUsed = Array.isArray(body.toolsUsed) ? body.toolsUsed : [];

	const sql = getSql();

	// Upsert — if they submit again, update timestamp and tools used
	const [lead] = (await sql`
		INSERT INTO resource_leads (email, source, tools_used)
		VALUES (${email}, ${source}, ${toolsUsed})
		ON CONFLICT (email)
		DO UPDATE SET
			tools_used   = ARRAY(
				SELECT DISTINCT unnest(resource_leads.tools_used || EXCLUDED.tools_used)
			),
			created_at   = NOW()
		RETURNING id, email, source, tools_used, created_at
	`) as any[];

	return NextResponse.json({ ok: true, lead }, { status: 200 });
}
