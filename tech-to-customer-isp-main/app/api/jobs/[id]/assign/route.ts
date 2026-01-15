import { NextRequest, NextResponse } from 'next/server';
import { getSql, queryOne, toCamelCase } from '@/server/db/connection';
import { AssignTechInput, AssignTechSuccess, JobDTO } from '@/lib/types/jobTypes';
import { getPublicError } from '@/lib/publicErrors';

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
      return NextResponse.json(
        getPublicError('MISSING_REQUIRED_FIELD'),
        { status: 400 }
      );
    }

    // Check if employee exists and is available
    const employee = await queryOne<{ id: string; isAvailable: boolean }>`
      SELECT id, is_available
      FROM employees
      WHERE id = ${assignedTechId}
    `;

    if (!employee) {
      return NextResponse.json(
        { message: 'Employee not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!employee.isAvailable) {
      return NextResponse.json(
        getPublicError('TECH_NOT_AVAILABLE'),
        { status: 400 }
      );
    }
 
    // Check if job exists
	/* Code review said this:
		The query selects 'assigned_employee_id' but the database column is 'assigned_tech_id'
		(as seen in other queries). This inconsistency will cause the query to fail or return null values.
	*/
	// TODO: Fix column name inconsistency
    const existingJob = await queryOne<{ id: string; assignedEmployeeId: string | null }>`
      SELECT id, assigned_employee_id as "assignedEmployeeId"
      FROM jobs
      WHERE id = ${id}
    `;

    if (!existingJob) {
      return NextResponse.json(
        getPublicError('NOT_FOUND'),
        { status: 404 }
      );
    }

    if (existingJob.assignedEmployeeId) {
      return NextResponse.json(
        getPublicError('JOB_ALREADY_ASSIGNED'),
        { status: 400 }
      );
    }

    // Assign the tech
    const updatedRows = await sql`
      UPDATE jobs
      SET 
        assigned_tech_id = ${assignedTechId},
        status = 'assigned'
      WHERE id = ${id}
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

    const job = toCamelCase<JobDTO>(updatedRows[0] as Record<string, unknown>);

    const response: AssignTechSuccess = {
      success: true,
      updatedJob: job,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Assign tech error:', error);
    return NextResponse.json(
      getPublicError('SERVER_ERROR'),
      { status: 500 }
    );
  }
}
