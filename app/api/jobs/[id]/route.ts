import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/server/db/connection';
import { JobDTO } from '@/lib/types/jobTypes';
import { getPublicError } from '@/lib/publicErrors';

// Get single job
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const job = await queryOne<JobDTO>`
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
    `;

    if (!job) {
      return NextResponse.json(
        getPublicError('NOT_FOUND'),
        { status: 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error('Get job error:', error);
    return NextResponse.json(
      getPublicError('SERVER_ERROR'),
      { status: 500 }
    );
  }
}
