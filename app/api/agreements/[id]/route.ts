import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import { requireAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	const { id } = await context.params;

	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;

	const { companyId } = auth.user;
	const sql = getSql();

	const rows = await sql`
    SELECT
      a.*,
      t.name               AS "tierName",
      t.included_services  AS "includedServices",
      t.discount_percent   AS "discountPercent",
      t.priority_dispatch  AS "priorityDispatch",
      c.first_name || ' ' || c.last_name AS "customerName",
      c.email              AS "customerEmail",
      c.phone              AS "customerPhone"
    FROM maintenance_agreements a
    JOIN maintenance_agreement_tiers t ON t.id = a.tier_id
    JOIN customers c ON c.id = a.customer_id
    WHERE a.id = ${id} AND a.company_id = ${companyId}
  `;

	if (rows.length === 0) {
		return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
	}

	return NextResponse.json({ agreement: rows[0] });
}

export async function PATCH(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	const { id } = await context.params;

	const auth = await requireAuth(request);
	if (!auth.ok) return auth.response;

	const { companyId } = auth.user;

	let body: any;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const sql = getSql();

	const existing = await sql`
    SELECT id, status FROM maintenance_agreements
    WHERE id = ${id} AND company_id = ${companyId}
  `;
	if (existing.length === 0) {
		return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
	}

	const { action, reason, autoRenew, notes } = body;

	if (action === "cancel") {
		const updated = await sql`
      UPDATE maintenance_agreements SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = ${reason ?? null},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
		return NextResponse.json({ agreement: updated[0] });
	}

	if (action === "suspend") {
		const updated = await sql`
      UPDATE maintenance_agreements SET
        status = 'suspended',
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
		return NextResponse.json({ agreement: updated[0] });
	}

	if (action === "reactivate") {
		const updated = await sql`
      UPDATE maintenance_agreements SET
        status = 'active',
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
		return NextResponse.json({ agreement: updated[0] });
	}

	if (autoRenew === undefined && notes === undefined) {
		return NextResponse.json(
			{ error: "No valid fields to update" },
			{ status: 400 }
		);
	}

	const updated = await sql`
    UPDATE maintenance_agreements SET
      auto_renew = COALESCE(${autoRenew ?? null}, auto_renew),
      notes = COALESCE(${notes ?? null}, notes),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

	return NextResponse.json({ agreement: updated[0] });
}
