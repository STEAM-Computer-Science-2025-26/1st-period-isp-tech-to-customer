import { Pool, PoolClient } from 'pg';

const pool = new Pool();

export async function persistBatchAssignments(
  assignments: Array<{ jobId: string; techId: string }>,
  companyId: string
): Promise<void> {
  const client: PoolClient = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const jobIds = assignments.map(a => a.jobId);
    await client.query(
      `SELECT id FROM jobs WHERE id = ANY($1) FOR UPDATE`,
      [jobIds]
    );
    
    const techIds = [...new Set(assignments.map(a => a.techId))];
    await client.query(
      `SELECT id FROM employees WHERE id = ANY($1) FOR UPDATE`,
      [techIds]
    );
    
    // NOTE: Using correct column name from schema: max_concurrent_jobs (not max_jobs_per_day)
    // And computing current_jobs_count from jobs table since it's not a column
    const capacityCheck = await client.query(`
      SELECT 
        e.id, 
        COALESCE(
          (SELECT COUNT(*)::integer
           FROM jobs
           WHERE assigned_tech_id = e.id
             AND status IN ('assigned', 'in_progress')),
          0
        ) AS current_jobs_count,
        e.max_concurrent_jobs
      FROM employees e
      WHERE id = ANY($1)
    `, [techIds]);
    
    const capacityMap = new Map();
    capacityCheck.rows.forEach(row => {
      capacityMap.set(row.id, {
        current: row.current_jobs_count || 0,
        max: row.max_concurrent_jobs || 10
      });
    });
    
    const validAssignments = assignments.filter(a => {
      const cap = capacityMap.get(a.techId);
      return cap && cap.current < cap.max;
    });
    
    for (const assignment of validAssignments) {
      await client.query(`
        UPDATE jobs
        SET assigned_tech_id = $1,
            status = 'assigned',
            updated_at = NOW()
        WHERE id = $2
      `, [assignment.techId, assignment.jobId]);
      
      // Note: No need to update current_job_count since it's computed from jobs table
      
      await client.query(`
        INSERT INTO job_assignments (job_id, tech_id, company_id, assigned_at)
        VALUES ($1, $2, $3, NOW())
      `, [assignment.jobId, assignment.techId, companyId]);
    }
    
    await client.query('COMMIT');
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}