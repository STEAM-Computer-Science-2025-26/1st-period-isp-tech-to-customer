// app/api/portal/bookings/route.ts
// GET  /api/portal/bookings  — list customer's booking requests
// POST /api/portal/bookings  — submit a new booking request
// Auth: portal token in Authorization header as "Bearer <token>"

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolvePortalCustomer(request: NextRequest) {
	const auth = request.headers.get("authorization");
	if (!auth?.startsWith("Bearer ")) return null;
	const rawToken = auth.slice(7);
	const tokenHash = createHash("sha256").update(rawToken).digest("hex");

	const sql = getSql();
	const rows = (await sql`
		SELECT t.customer_id, t.expires_at, t.used_at,
		       c.company_id
		FROM customer_portal_tokens t
		JOIN customers c ON c.id = t.customer_id
		WHERE t.token_hash = ${tokenHash}
		  AND t.expires_at > NOW()
		LIMIT 1
	`) as any[];

	if (rows.length === 0) return null;
	return rows[0] as { customer_id: string; company_id: string };
}

export async function GET(request: NextRequest) {
	const customer = await resolvePortalCustomer(request);
	if (!customer) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const sql = getSql();
	const bookings = await sql`
		SELECT
			id,
			service_type   AS "serviceType",
			description,
			preferred_date_1 AS "preferredDate1",
			preferred_time_1 AS "preferredTime1",
			preferred_date_2 AS "preferredDate2",
			preferred_time_2 AS "preferredTime2",
			status,
			converted_job_id AS "convertedJobId",
			staff_notes    AS "staffNotes",
			customer_notes AS "customerNotes",
			created_at     AS "createdAt",
			updated_at     AS "updatedAt"
		FROM booking_requests
		WHERE customer_id = ${customer.customer_id}
		ORDER BY created_at DESC
	`;

	// Also return agreements + invoices for the portal dashboard
	const agreements = await sql`
		SELECT
			a.id,
			a.status,
			a.expires_at AS "expiresAt",
			a.visits_used AS "visitsUsed",
			a.visits_allowed AS "visitsAllowed",
			a.auto_renew AS "autoRenew",
			t.name AS "tierName",
			t.included_services AS "includedServices",
			t.discount_percent AS "discountPercent"
		FROM maintenance_agreements a
		JOIN maintenance_agreement_tiers t ON t.id = a.tier_id
		WHERE a.customer_id = ${customer.customer_id}
		  AND a.status = 'active'
	`;

	const invoices = await sql`
		SELECT
			id,
			invoice_number AS "invoiceNumber",
			status,
			total,
			due_date AS "dueDate",
			paid_at AS "paidAt",
			created_at AS "createdAt"
		FROM invoices
		WHERE customer_id = ${customer.customer_id}
		ORDER BY created_at DESC
		LIMIT 10
	`;

	return NextResponse.json({ bookings, agreements, invoices });
}

export async function POST(request: NextRequest) {
	const customer = await resolvePortalCustomer(request);
	if (!customer) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: any;
	try { body = await request.json(); } catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const {
		serviceType, description,
		preferredDate1, preferredTime1,
		preferredDate2, preferredTime2,
		preferredDate3, preferredTime3,
		customerNotes, agreementId
	} = body;

	if (!serviceType || !preferredDate1) {
		return NextResponse.json(
			{ error: "serviceType and preferredDate1 are required" },
			{ status: 400 }
		);
	}

	const sql = getSql();

	const result = await sql`
		INSERT INTO booking_requests (
			company_id, customer_id, agreement_id,
			service_type, description,
			preferred_date_1, preferred_time_1,
			preferred_date_2, preferred_time_2,
			preferred_date_3, preferred_time_3,
			customer_notes
		) VALUES (
			${customer.company_id},
			${customer.customer_id},
			${agreementId ?? null},
			${serviceType},
			${description ?? null},
			${preferredDate1},
			${preferredTime1 ?? null},
			${preferredDate2 ?? null},
			${preferredTime2 ?? null},
			${preferredDate3 ?? null},
			${preferredTime3 ?? null},
			${customerNotes ?? null}
		)
		RETURNING *
	`;

	return NextResponse.json({ booking: result[0] }, { status: 201 });
}