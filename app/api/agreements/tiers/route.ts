// app/api/agreements/tiers/route.ts
// GET  /api/agreements/tiers   — list tiers for company
// POST /api/agreements/tiers   — create tier

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
			name,
			description,
			price_monthly       AS "priceMonthly",
			price_annual        AS "priceAnnual",
			billing_cycle       AS "billingCycle",
			included_visits     AS "includedVisits",
			discount_percent    AS "discountPercent",
			priority_dispatch   AS "priorityDispatch",
			included_services   AS "includedServices",
			is_active           AS "isActive",
			created_at          AS "createdAt",
			updated_at          AS "updatedAt"
		FROM maintenance_agreement_tiers
		WHERE company_id = ${companyId}
		ORDER BY price_annual ASC
	`;

	return NextResponse.json({ tiers: rows });
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
		name, description, priceMonthly, priceAnnual,
		billingCycle = "annual", includedVisits = 1,
		discountPercent = 0, priorityDispatch = false,
		includedServices = []
	} = body;

	if (!name || !priceAnnual) {
		return NextResponse.json(
			{ error: "name and priceAnnual are required" },
			{ status: 400 }
		);
	}

	const sql = getSql();
	const result = await sql`
		INSERT INTO maintenance_agreement_tiers (
			company_id, name, description, price_monthly, price_annual,
			billing_cycle, included_visits, discount_percent,
			priority_dispatch, included_services
		) VALUES (
			${companyId}, ${name}, ${description ?? null},
			${priceMonthly ?? null}, ${priceAnnual},
			${billingCycle}, ${includedVisits}, ${discountPercent},
			${priorityDispatch}, ${includedServices}
		)
		RETURNING *
	`;

	return NextResponse.json({ tier: result[0] }, { status: 201 });
}