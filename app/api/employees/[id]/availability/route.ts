import { NextRequest, NextResponse } from 'next/server';
import { getSql, toCamelCase } from '@/server/db/connection';
import { EmployeeDataType, UpdateEmployeeAvailabilityInput, UpdateEmployeeAvailabilitySuccess } from '@/lib/types/employeeTypes';
import { getPublicError } from '@/lib/publicErrors';

// Update employee availability
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getSql();
    const { id } = await context.params;
    const body: UpdateEmployeeAvailabilityInput = await request.json();

    if (typeof body.isAvailable !== 'boolean') {
      return NextResponse.json(
        getPublicError('MISSING_REQUIRED_FIELD'),
        { status: 400 }
      );
    }

    const updatedRows = await sql`
      UPDATE employees
      SET 
        is_available = ${body.isAvailable},
        availability_updated_at = NOW()
      WHERE id = ${id}
      RETURNING 
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
    `;

    if (updatedRows.length === 0) {
      return NextResponse.json(
        getPublicError('NOT_FOUND'),
        { status: 404 }
      );
    }

    const employee = toCamelCase<EmployeeDataType>(updatedRows[0] as Record<string, unknown>);
    const response: UpdateEmployeeAvailabilitySuccess = { success: true, profile: employee };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Update availability error:', error);
    return NextResponse.json(
      getPublicError('SERVER_ERROR'),
      { status: 500 }
    );
  }
}
