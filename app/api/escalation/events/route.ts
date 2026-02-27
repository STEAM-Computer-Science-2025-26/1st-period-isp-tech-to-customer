// app/api/escalation/events/route.ts
// GET  /api/escalation/events         — list active escalation events
// POST /api/escalation/events         — manually trigger escalation for a job

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import { requireAuth } from "@/lib/apiAuth";
import { triggerEscalation, resolveEscalation } from "../../../../services/escalation/escalationEngine"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;
	const { companyId } = auth.user;
	const { searchParams } = new URL(request.url);
	const status = searchParams.get("status") ?? "active";

	const sql = getSql();
	const events = await sql`
		SELECT
			e.id,
			e.job_id        AS "jobId",
			e.policy_id     AS "policyId",
			e.current_step  AS "currentStep",
			e.status,
			e.triggered_at  AS "triggeredAt",
			e.resolved_at   AS "resolvedAt",
			e.resolution_notes AS "resolutionNotes",
			e.notification_log AS "notificationLog",
			p.name          AS "policyName",
			p.steps,
			j.title         AS "jobTitle",
			j.priority      AS "jobPriority",
			c.first_name || ' ' || c.last_name AS "customerName"
		FROM escalation_events e
		JOIN escalation_policies p ON p.id = e.policy_id
		JOIN jobs j ON j.id = e.job_id
		JOIN customers c ON c.id = j.customer_id
		WHERE e.company_id = ${companyId}
		  AND e.status = ${status}
		ORDER BY e.triggered_at DESC
	`;

	return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;

	let body: any;
	try { body = await request.json(); } catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { jobId } = body;
	if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

	const result = await triggerEscalation(jobId);
	return NextResponse.json(result, { status: result.triggered ? 201 : 200 });
}