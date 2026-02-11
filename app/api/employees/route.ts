import { NextRequest, NextResponse } from "next/server";
import { queryAll } from "@/db/connection";
import { EmployeeDataType } from "@/services/types/employeeTypes";
import { getPublicError } from "@/services/publicErrors";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const companyIdParam = searchParams.get("companyId");
		const companyId = companyIdParam ? Number(companyIdParam) : null;

		// Fetch employees
		const rows = companyId
			? await queryAll(
					(sql) => sql`
          SELECT
            id,
            user_id AS "userId",
            company_id AS "companyId",
            skills,
            skill_level AS "skillLevel",
            home_address AS "homeAddress",
            NULL::text AS "currentLocation",
            phone,
            email,
            is_available AS "isAvailable",
            availability_updated_at AS "availabilityUpdatedAt",
            current_job_id AS "currentJobId",
            max_concurrent_jobs AS "maxConcurrentJobs",
            is_active AS "isActive",
            rating,
            last_job_completed_at AS "lastJobCompletedAt",
            internal_notes AS "internalNotes",
            created_by_user_id AS "createdByUserId",
            created_at AS "createdAt"
          FROM employees
          WHERE company_id = ${companyId}
          ORDER BY created_at DESC
        `
				)
			: await queryAll(
					(sql) => sql`
          SELECT
            id,
            user_id AS "userId",
            company_id AS "companyId",
            skills,
            skill_level AS "skillLevel",
            home_address AS "homeAddress",
            NULL::text AS "currentLocation",
            phone,
            email,
            is_available AS "isAvailable",
            availability_updated_at AS "availabilityUpdatedAt",
            current_job_id AS "currentJobId",
            max_concurrent_jobs AS "maxConcurrentJobs",
            is_active AS "isActive",
            rating,
            last_job_completed_at AS "lastJobCompletedAt",
            internal_notes AS "internalNotes",
            created_by_user_id AS "createdByUserId",
            created_at AS "createdAt"
          FROM employees
          ORDER BY created_at DESC
        `
				);

		// Map raw database rows to EmployeeDataType to satisfy TypeScript
		const employees: EmployeeDataType[] = rows.map((row) => ({
			id: row.id,
			userId: row.userId,
			companyId: row.companyId,
			skills: row.skills,
			skillLevel: row.skillLevel,
			homeAddress: row.homeAddress,
			currentLocation: row.currentLocation ?? null,
			phone: row.phone,
			email: row.email,
			isAvailable: row.isAvailable,
			availabilityUpdatedAt: row.availabilityUpdatedAt,
			currentJobId: row.currentJobId,
			maxConcurrentJobs: row.maxConcurrentJobs,
			isActive: row.isActive,
			rating: row.rating,
			lastJobCompletedAt: row.lastJobCompletedAt,
			internalNotes: row.internalNotes,
			createdByUserId: row.createdByUserId,
			createdAt: row.createdAt
		}));

		return NextResponse.json(employees);
	} catch (error) {
		console.error("Get employees error:", error);
		return NextResponse.json(getPublicError("SERVER_ERROR"), { status: 500 });
	}
}
