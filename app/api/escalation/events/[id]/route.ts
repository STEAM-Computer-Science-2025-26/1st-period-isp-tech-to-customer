// app/api/escalation/events/[id]/route.ts
// PATCH /api/escalation/events/:id  — resolve or cancel escalation

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { resolveEscalation } from "@/services/escalation/escalationEngine";
import { getSql } from "@/db/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
	request: NextRequest,
	{ params: _params }: { params: Promise<{ id: string }> }
) {
	const params = await _params;
	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;
	const { userId } = auth.user;

	let body: any;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { action, notes } = body;

	if (action === "resolve") {
		await resolveEscalation(params.id, userId, notes);
		return NextResponse.json({ ok: true, status: "resolved" });
	}

	if (action === "cancel") {
		const sql = getSql();
		await sql`
                        UPDATE escalation_events SET
                                status = 'cancelled', updated_at = NOW()
                        WHERE id = ${params.id}
                `;
		return NextResponse.json({ ok: true, status: "cancelled" });
	}

	return NextResponse.json(
		{ error: "Invalid action. Use: resolve, cancel" },
		{ status: 400 }
	);
}
