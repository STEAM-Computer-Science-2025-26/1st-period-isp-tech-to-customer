// app/api/recurring/route.ts
// GET  /api/recurring  — list schedules
// POST /api/recurring  — create schedule

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import { requireAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;
	const { companyId } = auth.user;
	const { searchParams } = new URL(request.url);
	const customerId = searchParams.get("customerId");

	const sql = getSql();
	const rows = await sql`
		SELECT
			r.id,
			r.company_id        AS "companyId",
			r.branch_id         AS "branchId",
			r.customer_id       AS "customerId",
			r.agreement_id      AS "agreementId",
			r.title,
			r.description,
			r.job_type          AS "jobType",
			r.skills_required   AS "skillsRequired",
			r.preferred_tech_id AS "preferredTechId",
			r.frequency,
			r.preferred_time_start AS "preferredTimeStart",
			r.preferred_time_end   AS "preferredTimeEnd",
			r.preferred_days    AS "preferredDays",
			r.duration_minutes  AS "durationMinutes",
			r.next_run_at       AS "nextRunAt",
			r.last_run_at       AS "lastRunAt",
			r.last_job_id       AS "lastJobId",
			r.advance_days      AS "advanceDays",
			r.is_active         AS "isActive",
			r.created_at        AS "createdAt",
			r.updated_at        AS "updatedAt",
			c.first_name || ' ' || c.last_name AS "customerName"
		FROM recurring_job_schedules r
		JOIN customers c ON c.id = r.customer_id
		WHERE r.company_id = ${companyId}
			${customerId ? sql`AND r.customer_id = ${customerId}` : sql``}
		ORDER BY r.next_run_at ASC
	`;

	return NextResponse.json({ schedules: rows });
}

export async function POST(request: NextRequest) {
	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;
	const { companyId } = auth.user;

	let body: any;
	try { body = await request.json(); } catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const {
		customerId, agreementId, title, description, jobType,
		skillsRequired = [], preferredTechId, frequency,
		preferredTimeStart, preferredTimeEnd, preferredDays = [],
		durationMinutes = 60, nextRunAt, advanceDays = 3, branchId
	} = body;

	if (!customerId || !title || !jobType || !frequency || !nextRunAt) {
		return NextResponse.json(
			{ error: "customerId, title, jobType, frequency, nextRunAt required" },
			{ status: 400 }
		);
	}

	const sql = getSql();
	const result = await sql`
		INSERT INTO recurring_job_schedules (
			company_id, branch_id, customer_id, agreement_id,
			title, description, job_type, skills_required,
			preferred_tech_id, frequency, preferred_time_start,
			preferred_time_end, preferred_days, duration_minutes,
			next_run_at, advance_days
		) VALUES (
			${companyId}, ${branchId ?? null}, ${customerId}, ${agreementId ?? null},
			${title}, ${description ?? null}, ${jobType}, ${skillsRequired},
			${preferredTechId ?? null}, ${frequency}, ${preferredTimeStart ?? null},
			${preferredTimeEnd ?? null}, ${preferredDays}, ${durationMinutes},
			${nextRunAt}, ${advanceDays}
		)
		RETURNING *
	`;

	return NextResponse.json({ schedule: result[0] }, { status: 201 });
}