// app/api/bookings/route.ts
// Staff-facing booking request management
// GET  /api/bookings          — list all pending booking requests (staff)
// PATCH /api/bookings/:id     — confirm, decline, or convert to job

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
	const status = searchParams.get("status") ?? "pending";

	const sql = getSql();
	const rows = await sql`
		SELECT
			b.*,
			c.first_name || ' ' || c.last_name AS "customerName",
			c.phone AS "customerPhone",
			c.email AS "customerEmail",
			c.address AS "customerAddress"
		FROM booking_requests b
		JOIN customers c ON c.id = b.customer_id
		WHERE b.company_id = ${companyId}
		  AND b.status = ${status}
		ORDER BY b.preferred_date_1 ASC
	`;

	return NextResponse.json({ bookings: rows });
}
