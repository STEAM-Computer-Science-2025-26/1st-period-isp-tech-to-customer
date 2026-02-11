import { NextRequest, NextResponse } from "next/server";
import { getSql, queryOne, toCamelCase } from "@/db/connection";
import {
	AssignTechInput,
	AssignTechSuccess,
	JobDTO
} from "@/services/types/jobTypes";
import { getPublicError } from "@/services/publicErrors";

// Assign tech to job
export async function PATCH(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const sql = getSql();
		const { id } = await context.params;
		const body = (await request.json()) as AssignTechInput;

		const assignedTechId = body.assignedTechId;
		if (!assignedTechId) {
			return NextResponse.json(getPublicError("MISSING_REQUIRED_FIELD"), {
				status: 400
			});
		}

		// Check if employee exists and is available
		const employeeRow = await queryOne(
			(s) => s`
        SELECT id, is_available
        FROM employees
        WHERE id = ${assignedTechId}
      `
		);

		// Cast to expected type
		const employee = employeeRow
			? toCamelCase<{ id: string; isAvailable: boolean }>(employeeRow)
			: null;

		if (!employee) {
			return NextResponse.json(
				{ message: "Employee not found", code: "NOT_FOUND" },
				{ status: 404 }
			);
		}

		if (!employee.isAvailable) {
			return NextResponse.json(getPublicError("TECH_NOT_AVAILABLE"), {
				status: 400
			});
		}

		// Check if job exists
		const jobRow = await queryOne(
			(s) => s`
        SELECT id, assigned_tech_id
        FROM jobs
        WHERE id = ${id}
      `
		);

		const existingJob = jobRow
			? toCamelCase<{ id: string; assignedTechId: string | null }>(jobRow)
			: null;

		if (!existingJob) {
			return NextResponse.json(getPublicError("NOT_FOUND"), { status: 404 });
		}

		if (existingJob.assignedTechId) {
			return NextResponse.json(getPublicError("JOB_ALREADY_ASSIGNED"), {
				status: 400
			});
		}

		// Assign the tech
		const updatedRows = await sql`
      UPDATE jobs
      SET assigned_tech_id = ${assignedTechId},
          status = 'assigned'
      WHERE id = ${id}
      RETURNING *
    `;

		const updatedJob = toCamelCase<JobDTO>(
			updatedRows[0] as Record<string, unknown>
		);

		const response: AssignTechSuccess = {
			success: true,
			updatedJob
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error("Assign tech error:", error);
		return NextResponse.json(getPublicError("SERVER_ERROR"), { status: 500 });
	}
}
