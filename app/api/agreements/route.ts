// app/api/agreements/route.ts
// GET  /api/agreements       — list all tiers or agreements
// POST /api/agreements        — create a new agreement

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import { requireAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;

	const { companyId, role } = auth.user;
	const { searchParams } = new URL(request.url);
	const customerId = searchParams.get("customerId");
	const status = searchParams.get("status");

	const sql = getSql();

	const rows = await sql`
		SELECT
			a.id,
			a.company_id          AS "companyId",
			a.branch_id           AS "branchId",
			a.customer_id         AS "customerId",
			a.tier_id             AS "tierId",
			a.status,
			a.billing_cycle       AS "billingCycle",
			a.price_locked        AS "priceLocked",
			a.starts_at           AS "startsAt",
			a.expires_at          AS "expiresAt",
			a.auto_renew          AS "autoRenew",
			a.renewal_notified_at AS "renewalNotifiedAt",
			a.visits_used         AS "visitsUsed",
			a.visits_allowed      AS "visitsAllowed",
			a.notes,
			a.cancelled_at        AS "cancelledAt",
			a.cancellation_reason AS "cancellationReason",
			a.created_at          AS "createdAt",
			a.updated_at          AS "updatedAt",
			t.name                AS "tierName",
			c.first_name || ' ' || c.last_name AS "customerName"
		FROM maintenance_agreements a
		JOIN maintenance_agreement_tiers t ON t.id = a.tier_id
		JOIN customers c ON c.id = a.customer_id
		WHERE a.company_id = ${companyId}
			${customerId ? sql`AND a.customer_id = ${customerId}` : sql``}
			${status ? sql`AND a.status = ${status}` : sql``}
		ORDER BY a.expires_at ASC
	`;

	return NextResponse.json({ agreements: rows });
}

export async function POST(request: NextRequest) {
	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;

	const { companyId, userId } = auth.user;

	let body: any;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { customerId, tierId, billingCycle = "annual", startsAt, autoRenew = true, notes, branchId } = body;

	if (!customerId || !tierId || !startsAt) {
		return NextResponse.json(
			{ error: "customerId, tierId, and startsAt are required" },
			{ status: 400 }
		);
	}

	const sql = getSql();

	// Fetch tier to get pricing + visit info
	const tiers = await sql`
		SELECT * FROM maintenance_agreement_tiers
		WHERE id = ${tierId} AND company_id = ${companyId} AND is_active = TRUE
	`;

	if (tiers.length === 0) {
		return NextResponse.json({ error: "Tier not found" }, { status: 404 });
	}

	const tier = tiers[0] as any;
	const priceLocked = billingCycle === "monthly" ? tier.price_monthly : tier.price_annual;

	if (!priceLocked) {
		return NextResponse.json(
			{ error: `This tier does not support ${billingCycle} billing` },
			{ status: 400 }
		);
	}

	// Calculate expiry (1 year from start)
	const expiresAt = new Date(startsAt);
	expiresAt.setFullYear(expiresAt.getFullYear() + 1);

	const result = await sql`
		INSERT INTO maintenance_agreements (
			company_id, branch_id, customer_id, tier_id,
			billing_cycle, price_locked, starts_at, expires_at,
			auto_renew, visits_allowed, notes, created_by
		) VALUES (
			${companyId}, ${branchId ?? null}, ${customerId}, ${tierId},
			${billingCycle}, ${priceLocked}, ${startsAt}, ${expiresAt.toISOString().split("T")[0]},
			${autoRenew}, ${tier.included_visits}, ${notes ?? null}, ${userId}
		)
		RETURNING *
	`;

	return NextResponse.json({ agreement: result[0] }, { status: 201 });
}