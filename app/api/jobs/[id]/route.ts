import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/db/connection";
import { JobDTO } from "@/services/types/jobTypes";
import { getPublicError } from "@/services/publicErrors";

// Get single job
export async function GET(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await context.params;

		// Use function style instead of tagged literal to satisfy TS
		const row = await queryOne(
			(sql) =>
				sql`
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
        WHERE id = ${id}
      `
		);

		if (!row) {
			return NextResponse.json(getPublicError("NOT_FOUND"), { status: 404 });
		}

		// Cast manually to JobDTO
		const job: JobDTO = row as JobDTO;

		return NextResponse.json(job);
	} catch (error) {
		console.error("Get job error:", error);
		return NextResponse.json(getPublicError("SERVER_ERROR"), { status: 500 });
	}
}
