// app/api/after-hours/route.ts
// GET  /api/after-hours  — list rules
// POST /api/after-hours  — create rule

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

	const rows = await sql`
		SELECT
			id,
			company_id          AS "companyId",
			branch_id           AS "branchId",
			name,
			is_active           AS "isActive",
			weekday_start       AS "weekdayStart",
			weekday_end         AS "weekdayEnd",
			weekend_all_day     AS "weekendAllDay",
			holiday_all_day     AS "holidayAllDay",
			routing_strategy    AS "routingStrategy",
			on_call_employee_ids AS "onCallEmployeeIds",
			surcharge_flat      AS "surchargeFlatFlat",
			surcharge_percent   AS "surchargePercent",
			auto_accept         AS "autoAccept",
			notify_manager      AS "notifyManager",
			manager_phone       AS "managerPhone",
			created_at          AS "createdAt",
			updated_at          AS "updatedAt"
		FROM after_hours_rules
		WHERE company_id = ${companyId}
		ORDER BY is_active DESC, name ASC
	`;

	return NextResponse.json({ rules: rows });
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

	const {
		name,
		weekdayStart = "17:00",
		weekdayEnd = "08:00",
		weekendAllDay = true,
		holidayAllDay = true,
		routingStrategy = "on_call_pool",
		onCallEmployeeIds = [],
		surchargeFlatFlat = 0,
		surchargePercent = 0,
		autoAccept = false,
		notifyManager = true,
		managerPhone,
		branchId
	} = body;

	if (!name || !routingStrategy) {
		return NextResponse.json(
			{ error: "name and routingStrategy are required" },
			{ status: 400 }
		);
	}

	const sql = getSql();
	const result = await sql`
		INSERT INTO after_hours_rules (
			company_id, branch_id, name,
			weekday_start, weekday_end, weekend_all_day, holiday_all_day,
			routing_strategy, on_call_employee_ids,
			surcharge_flat, surcharge_percent,
			auto_accept, notify_manager, manager_phone
		) VALUES (
			${companyId}, ${branchId ?? null}, ${name},
			${weekdayStart}, ${weekdayEnd}, ${weekendAllDay}, ${holidayAllDay},
			${routingStrategy}, ${onCallEmployeeIds},
			${surchargeFlatFlat}, ${surchargePercent},
			${autoAccept}, ${notifyManager}, ${managerPhone ?? null}
		)
		RETURNING *
	`;

	return NextResponse.json({ rule: result[0] }, { status: 201 });
}
