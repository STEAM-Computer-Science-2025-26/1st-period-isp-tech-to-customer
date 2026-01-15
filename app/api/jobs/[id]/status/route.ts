import { NextRequest, NextResponse } from 'next/server';
import { getSql, toCamelCase } from '@/server/db/connection';
import { JobDTO, JobStatus, UpdateJobStatusInput, UpdateJobStatusSuccess } from '@/lib/types/jobTypes';
import { getPublicError } from '@/lib/publicErrors';

// Update job status
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getSql();
    const { id } = await context.params;
    const body = (await request.json()) as Partial<UpdateJobStatusInput>;

    const status = body.status;
    const completionNotes = body.completionNotes;

    if (!status) {
      return NextResponse.json(
        getPublicError('MISSING_REQUIRED_FIELD'),
        { status: 400 }
      );
    }

    const validStatuses: JobStatus[] = ['unassigned', 'assigned', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { message: 'Invalid status', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const updatedRows = await sql`
      UPDATE jobs
      SET
        status = ${status},
        completion_notes = COALESCE(${completionNotes ?? null}, completion_notes),
        completed_at = CASE WHEN ${status} = 'completed' THEN NOW() ELSE completed_at END
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

    if (updatedRows.length === 0) {
      return NextResponse.json(
        getPublicError('NOT_FOUND'),
        { status: 404 }
      );
    }

    const job = toCamelCase<JobDTO>(updatedRows[0] as Record<string, unknown>);
    const response: UpdateJobStatusSuccess = { success: true, updatedJob: job };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Update status error:', error);
    return NextResponse.json(
      getPublicError('SERVER_ERROR'),
      { status: 500 }
    );
  }
}
