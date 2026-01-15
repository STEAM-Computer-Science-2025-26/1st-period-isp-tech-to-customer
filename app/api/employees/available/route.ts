import { NextRequest, NextResponse } from 'next/server';
import { getSql, toCamelCase, queryOne } from '@/server/db/connection';
import { AvailableTechDataType, GetAvailableTechsSuccess } from '@/lib/types/employeeTypes';
import { getPublicError } from '@/lib/publicErrors';

// Get available techs for a job
export async function GET(request: NextRequest) {
  try {
    const sql = getSql();
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const companyId = searchParams.get('companyId');

    if (!jobId && !companyId) {
      return NextResponse.json(
        { message: 'Either jobId or companyId is required', code: 'MISSING_REQUIRED_FIELD' },
        { status: 400 }
      );
    }

    let job: { companyId: string } | null = null;
    if (jobId) {
      job = await queryOne<{ companyId: string }>`
        SELECT
          company_id
        FROM jobs
        WHERE id = ${jobId}
      `;

      if (!job) {
        return NextResponse.json(
          getPublicError('NOT_FOUND'),
          { status: 404 }
        );
      }
    }

    const targetCompanyId = job?.companyId || companyId;

    if (!targetCompanyId) {
      return NextResponse.json(
        { message: 'companyId could not be determined', code: 'MISSING_REQUIRED_FIELD' },
        { status: 400 }
      );
    }

    const rows = await sql`
      SELECT
        e.id,
        e.user_id,
        e.company_id,
        e.skills,
        e.skill_level,
        e.home_address,
        NULL::text as current_location,
        e.phone,
        e.email,
        e.is_available,
        e.availability_updated_at,
        e.current_job_id,
        e.max_concurrent_jobs,
        e.is_active,
        e.rating,
        e.last_job_completed_at,
        e.internal_notes,
        e.created_by_user_id,
        e.created_at,
        NULL::double precision as distance_km,
        (
          SELECT COUNT(*)::int
          FROM jobs j
          WHERE j.assigned_tech_id = e.id
            AND j.status IN ('assigned', 'in_progress')
        ) as current_jobs_count
      FROM employees e
      WHERE e.company_id = ${targetCompanyId}
        AND e.is_available = true
      ORDER BY e.rating DESC
    `;

    const techs: AvailableTechDataType[] = (rows as Array<Record<string, unknown>>).map((row) =>
      toCamelCase<AvailableTechDataType>(row)
    );

    const response: GetAvailableTechsSuccess = { techs };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Get available employees error:', error);
    return NextResponse.json(
      getPublicError('SERVER_ERROR'),
      { status: 500 }
    );
  }
}
