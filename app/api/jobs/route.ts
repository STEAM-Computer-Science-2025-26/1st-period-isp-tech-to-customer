import { NextRequest, NextResponse } from "next/server";
import { getSql, toCamelCase } from "@/db/connection";
import {
	CreateJobInput,
	CreateJobSuccess,
	GetJobsSuccess,
	JobDTO,
	JobStatus
} from "@/services/types/jobTypes";
import { getPublicError } from "@/services/publicErrors";

// List jobs (optionally filtered)
export async function GET(request: NextRequest) {
	try {
		const sql = getSql();
		const { searchParams } = new URL(request.url);
		const companyId = searchParams.get("companyId");
		const status = searchParams.get("status") as JobStatus | null;
		const assignedTechId = searchParams.get("assignedTechId");

		// Build dynamic WHERE conditions using parameterized fragments
		const conditions: any[] = [];
		if (companyId) conditions.push(sql`company_id = ${Number(companyId)}`);
		if (status) conditions.push(sql`status = ${status}`);
		if (assignedTechId)
			conditions.push(sql`assigned_tech_id = ${Number(assignedTechId)}`);

		// Combine the parameterized fragments into a single fragment without using sql.join
		let whereFragment: any = sql``;
		if (conditions.length) {
			const combined = conditions.reduce(
				(acc, cur) => (acc ? sql`${acc} AND ${cur}` : cur),
				null
			);
			whereFragment = sql`WHERE ${combined}`;
		}

		const rows = await sql`
      SELECT
        id,
        company_id,
        customer_name,
        address,
        phone,
        job_type,
        status,
        priority,
        assigned_tech_id,
        scheduled_time,
        created_at,
        completed_at,
        initial_notes,
        completion_notes
      FROM jobs
      ${whereFragment}
      ORDER BY created_at DESC
    `;

		const jobs: JobDTO[] = (rows as Array<Record<string, unknown>>).map((row) =>
			toCamelCase<JobDTO>(row)
		);

		const response: GetJobsSuccess = { jobs };
		return NextResponse.json(response);
	} catch (error) {
		console.error("Get jobs error:", error);
		return NextResponse.json(getPublicError("SERVER_ERROR"), { status: 500 });
	}
}

// Create new job
export async function POST(request: NextRequest) {
	try {
		const sql = getSql();
		const body: CreateJobInput = await request.json();

		// Validate required fields
		if (
			!body.companyId ||
			!body.customerName ||
			!body.address ||
			!body.phone ||
			!body.jobType ||
			!body.priority
		) {
			return NextResponse.json(getPublicError("MISSING_REQUIRED_FIELD"), {
				status: 400
			});
		}

		const insertedRows = await sql`
      INSERT INTO jobs (
        company_id,
        customer_name,
        address,
        phone,
        job_type,
        status,
        priority,
        assigned_tech_id,
        scheduled_time,
        initial_notes
      ) VALUES (
        ${body.companyId},
        ${body.customerName},
        ${body.address},
        ${body.phone},
        ${body.jobType},
        'unassigned',
        ${body.priority},
        NULL,
        ${body.scheduledTime ?? null},
        ${body.initialNotes ?? null}
      )
      RETURNING
        id,
        company_id,
        customer_name,
        address,
        phone,
        job_type,
        status,
        priority,
        assigned_tech_id,
        scheduled_time,
        created_at,
        completed_at,
        initial_notes,
        completion_notes
    `;

		const createdJob = toCamelCase<JobDTO>(
			insertedRows[0] as Record<string, unknown>
		);

		const response: CreateJobSuccess = {
			jobId: createdJob.id,
			job: createdJob
		};

		return NextResponse.json(response, { status: 201 });
	} catch (error) {
		console.error("Create job error:", error);
		return NextResponse.json(getPublicError("SERVER_ERROR"), { status: 500 });
	}
}
