
import { Pool, PoolClient, QueryConfig, QueryResult } from 'pg';

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
    
    const capacityCheck = await client.query(`
      SELECT id, current_job_count, max_jobs_per_day
      FROM employees
      WHERE id = ANY($1)
    `, [techIds]);
    
    const capacityMap = new Map();
    capacityCheck.rows.forEach(row => {
      capacityMap.set(row.id, {
        current: row.current_job_count || 0,
        max: row.max_jobs_per_day || 10
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
            assigned_at = NOW()
        WHERE id = $2
      `, [assignment.techId, assignment.jobId]);
      
      await client.query(`
        UPDATE employees
        SET current_job_count = COALESCE(current_job_count, 0) + 1
        WHERE id = $1
      `, [assignment.techId]);
      
      await client.query(`
        INSERT INTO job_assignments (job_id, tech_id, assigned_at, assignment_method)
        VALUES ($1, $2, NOW(), 'auto')
      `, [assignment.jobId, assignment.techId]);
    }
    
    await client.query('COMMIT');
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}