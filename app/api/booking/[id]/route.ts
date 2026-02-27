// app/api/bookings/[id]/route.ts
// PATCH /api/bookings/:id
// Actions: confirm, decline, convert (creates a job from the booking request)

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import { requireAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
	request: NextRequest,
	{ params: _params }: { params: Promise<{ id: string }> }
) {
	const params = await _params;
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

	const existing = (await sql`
                SELECT b.*, c.address, c.city, c.state, c.zip
                FROM booking_requests b
                JOIN customers c ON c.id = b.customer_id
                WHERE b.id = ${params.id} AND b.company_id = ${companyId}
        `) as any[];

	if (existing.length === 0) {
		return NextResponse.json(
			{ error: "Booking request not found" },
			{ status: 404 }
		);
	}

	const booking = existing[0];
	const { action, staffNotes, scheduledAt, assignedTechId } = body;

	if (action === "confirm") {
		const updated = await sql`
                        UPDATE booking_requests SET
                                status = 'confirmed',
                                staff_notes = ${staffNotes ?? booking.staff_notes},
                                updated_at = NOW()
                        WHERE id = ${params.id}
                        RETURNING *
                `;
		return NextResponse.json({ booking: updated[0] });
	}

	if (action === "decline") {
		const updated = await sql`
                        UPDATE booking_requests SET
                                status = 'declined',
                                staff_notes = ${staffNotes ?? null},
                                updated_at = NOW()
                        WHERE id = ${params.id}
                        RETURNING *
                `;
		return NextResponse.json({ booking: updated[0] });
	}

	if (action === "convert") {
		// Create a real job from this booking request
		const [job] = (await sql`
                        INSERT INTO jobs (
                                company_id, branch_id, customer_id,
                                title, description, job_type,
                                address, city, state, zip,
                                status, priority,
                                assigned_tech_id,
                                scheduled_at,
                                source,
                                notes
                        ) VALUES (
                                ${booking.company_id},
                                ${booking.branch_id ?? null},
                                ${booking.customer_id},
                                ${booking.service_type},
                                ${booking.description ?? null},
                                ${booking.service_type},
                                ${booking.address},
                                ${booking.city ?? null},
                                ${booking.state ?? null},
                                ${booking.zip ?? null},
                                ${assignedTechId ? "assigned" : "unassigned"},
                                'normal',
                                ${assignedTechId ?? null},
                                ${scheduledAt ?? booking.preferred_date_1},
                                'customer_portal',
                                ${booking.customer_notes ?? null}
                        )
                        RETURNING id
                `) as any[];

		// Mark booking as converted
		await sql`
                        UPDATE booking_requests SET
                                status = 'converted',
                                converted_job_id = ${job.id},
                                staff_notes = ${staffNotes ?? null},
                                updated_at = NOW()
                        WHERE id = ${params.id}
                `;

		return NextResponse.json({
			booking: { ...booking, status: "converted", convertedJobId: job.id },
			jobId: job.id
		});
	}

	return NextResponse.json(
		{ error: "Invalid action. Use: confirm, decline, convert" },
		{ status: 400 }
	);
}
