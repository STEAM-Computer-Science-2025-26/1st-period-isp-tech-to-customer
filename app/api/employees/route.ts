import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/server/db/connection';
import { EmployeeDataType } from '@/lib/types/employeeTypes';
import { getPublicError } from '@/lib/publicErrors';

// List all employees
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    const employees = companyId
	/* 
  	Code Review said this:
    	The type assertion as never[] bypasses TypeScript's type checking in an unsafe way. Consider
    	using a more specific type or restructuring the function signature to properly handle
    	the parameter spread.
  	*/
 // TODO: Refactor to avoid unsafe type assertion
      ? await queryAll<EmployeeDataType>`
          SELECT
            id,
            user_id,
            company_id,
            skills,
            skill_level,
            home_address,
            NULL::text as current_location,
            phone,
            email,
            is_available,
            availability_updated_at,
            current_job_id,
            max_concurrent_jobs,
            is_active,
            rating,
            last_job_completed_at,
            internal_notes,
            created_by_user_id,
            created_at
          FROM employees
          WHERE company_id = ${companyId}
          ORDER BY created_at DESC
        `
      : await queryAll<EmployeeDataType>`
          SELECT
            id,
            user_id,
            company_id,
            skills,
            skill_level,
            home_address,
            NULL::text as current_location,
            phone,
            email,
            is_available,
            availability_updated_at,
            current_job_id,
            max_concurrent_jobs,
            is_active,
            rating,
            last_job_completed_at,
            internal_notes,
            created_by_user_id,
            created_at
          FROM employees
          ORDER BY created_at DESC
        `;

    return NextResponse.json(employees);
  } catch (error) {
    console.error('Get employees error:', error);
    return NextResponse.json(
      getPublicError('SERVER_ERROR'),
      { status: 500 }
    );
  }
}
