// app/api/escalation/route.ts
// GET  /api/escalation         — list escalation policies
// POST /api/escalation         — create policy

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import { requireAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;
	const { companyId } = auth.user;
	const sql = getSql();

	const policies = await sql`
		SELECT
			id, company_id AS "companyId", branch_id AS "branchId",
			name, trigger_conditions AS "triggerConditions",
			is_active AS "isActive", steps,
			created_at AS "createdAt", updated_at AS "updatedAt"
		FROM escalation_policies
		WHERE company_id = ${companyId}
		ORDER BY name ASC
	`;

	return NextResponse.json({ policies });
}

export async function POST(request: NextRequest) {
	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;
	const { companyId } = auth.user;

	let body: any;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { name, triggerConditions = {}, steps = [], branchId } = body;

	if (!name) {
		return NextResponse.json({ error: "name is required" }, { status: 400 });
	}

	const sql = getSql();
	const result = await sql`
		INSERT INTO escalation_policies (
			company_id, branch_id, name, trigger_conditions, steps
		) VALUES (
			${companyId}, ${branchId ?? null}, ${name},
			${JSON.stringify(triggerConditions)}, ${JSON.stringify(steps)}
		)
		RETURNING *
	`;

	return NextResponse.json({ policy: result[0] }, { status: 201 });
}
