import { NextRequest, NextResponse } from 'next/server';
import { getSql, queryAll, toCamelCase } from '@/server/db/connection';
import { CreateJobInput, CreateJobSuccess, GetJobsSuccess, JobDTO, JobStatus } from '@/lib/types/jobTypes';
import { getPublicError } from '@/lib/publicErrors';

// List jobs (optionally filtered)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status');
    const assignedTechId = searchParams.get('assignedTechId');

    const parsedStatus = status as JobStatus | null;

    let jobs: JobDTO[];

    if (companyId && parsedStatus && assignedTechId) {
		/* Code Review said this:
			The GET handler contains significant code duplication with the same SELECT statement 
			repeated across 8 different conditional branches. Consider extracting the base query 
			and building WHERE conditions dynamically to reduce duplication and improve maintainability.
		*/
		// TODO: Refactor to reduce duplication
      jobs = await queryAll<JobDTO>`
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
        WHERE company_id = ${companyId}
          AND status = ${parsedStatus}
          AND assigned_tech_id = ${assignedTechId}
        ORDER BY created_at DESC
      `;
    } else if (companyId && parsedStatus) {
      jobs = await queryAll<JobDTO>`
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
        WHERE company_id = ${companyId}
          AND status = ${parsedStatus}
        ORDER BY created_at DESC
      `;
    } else if (companyId && assignedTechId) {
      jobs = await queryAll<JobDTO>`
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
        WHERE company_id = ${companyId}
          AND assigned_tech_id = ${assignedTechId}
        ORDER BY created_at DESC
      `;
    } else if (companyId) {
      jobs = await queryAll<JobDTO>`
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
        WHERE company_id = ${companyId}
        ORDER BY created_at DESC
      `;
    } else if (parsedStatus && assignedTechId) {
      jobs = await queryAll<JobDTO>`
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
        WHERE status = ${parsedStatus}
          AND assigned_tech_id = ${assignedTechId}
        ORDER BY created_at DESC
      `;
    } else if (parsedStatus) {
      jobs = await queryAll<JobDTO>`
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
        WHERE status = ${parsedStatus}
        ORDER BY created_at DESC
      `;
    } else if (assignedTechId) {
      jobs = await queryAll<JobDTO>`
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
        WHERE assigned_tech_id = ${assignedTechId}
        ORDER BY created_at DESC
      `;
    } else {
      jobs = await queryAll<JobDTO>`
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
        ORDER BY created_at DESC
      `;
    }
    const response: GetJobsSuccess = { jobs };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Get jobs error:', error);
    return NextResponse.json(
      getPublicError('SERVER_ERROR'),
      { status: 500 }
    );
  }
}

// Create new job
export async function POST(request: NextRequest) {
  try {
    const sql = getSql();
    const body: CreateJobInput = await request.json();

    // Validate required fields
    if (!body.companyId || !body.customerName || !body.address || !body.phone || !body.jobType || !body.priority) {
      return NextResponse.json(
        getPublicError('MISSING_REQUIRED_FIELD'),
        { status: 400 }
      );
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

    const createdJob = toCamelCase<JobDTO>(insertedRows[0] as Record<string, unknown>);

    const response: CreateJobSuccess = {
      jobId: createdJob.id,
      job: createdJob,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Create job error:', error);
    return NextResponse.json(
      getPublicError('SERVER_ERROR'),
      { status: 500 }
    );
  }
}
