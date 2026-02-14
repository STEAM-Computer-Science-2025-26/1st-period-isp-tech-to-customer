import { batchDispatch } from '../../services/dispatch/batchDispatch';
import { persistBatchAssignments } from '../../services/dispatch/dispatchPersistence';
import * as db from '../../db';

describe('Batch Dispatch Integration', () => {
  let companyId: string;
  let techIds: string[] = [];
  let jobIds: string[] = [];

  beforeAll(async () => {
    // Create test company
    const companyResult = await db.query(`
      INSERT INTO companies (id, name, created_at)
      VALUES (gen_random_uuid(), 'Test Batch Co', NOW())
      RETURNING id
    `);
    companyId = companyResult[0].id;

    // Create 4 techs with GPS locations
    const techData = [
      { name: 'Tech A', lat: 32.7767, lng: -96.7970 },
      { name: 'Tech B', lat: 32.7555, lng: -96.8000 },
      { name: 'Tech C', lat: 32.8000, lng: -96.8200 },
      { name: 'Tech D', lat: 32.7300, lng: -96.7500 },
    ];

    for (let i = 0; i < techData.length; i++) {
      const tech = techData[i];
      const techResult = await db.query(`
        INSERT INTO employees (
          id, name, email, phone, role, company_id,
          skills, is_available, max_jobs_per_day, current_job_count
        ) VALUES (
          gen_random_uuid(),
          $1, $2, $3,
          'tech', $4,
          ARRAY['hvac_repair', 'hvac_maintenance']::text[],
          true, 10, 0
        ) RETURNING id
      `, [
        tech.name,
        `tech${i}@batchtest.com`,
        `214-555-${1000 + i}`,
        companyId
      ]);

      const techId = techResult[0].id;
      techIds.push(techId);

      await db.query(`
        INSERT INTO tech_locations (tech_id, latitude, longitude, updated_at)
        VALUES ($1, $2, $3, NOW())
      `, [techId, tech.lat, tech.lng]);
    }

    // Create 5 unassigned jobs
    const jobData = [
      { name: 'Customer 1', priority: 'emergency', lat: 32.7850, lng: -96.8000 },
      { name: 'Customer 2', priority: 'high', lat: 32.7700, lng: -96.8100 },
      { name: 'Customer 3', priority: 'medium', lat: 32.7600, lng: -96.7800 },
      { name: 'Customer 4', priority: 'medium', lat: 32.7400, lng: -96.7600 },
      { name: 'Customer 5', priority: 'low', lat: 32.8100, lng: -96.8300 }
    ];

    for (const job of jobData) {
      const jobResult = await db.query(`
        INSERT INTO jobs (
          id, company_id, customer_name, address,
          latitude, longitude, status, priority,
          required_skills, description, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5,
          'unassigned', $6,
          ARRAY['hvac_repair']::text[],
          'AC not working', NOW()
        ) RETURNING id
      `, [
        companyId,
        job.name,
        `${job.name} Address, Dallas, TX`,
        job.lat,
        job.lng,
        job.priority
      ]);

      jobIds.push(jobResult[0].id);
    }
  });

  afterAll(async () => {
    // Cleanup safely in reverse order
    try {
      await db.query('DELETE FROM job_assignments WHERE job_id = ANY($1)', [jobIds]);
      await db.query('DELETE FROM job_completions WHERE job_id = ANY($1)', [jobIds]);
      await db.query('DELETE FROM jobs WHERE id = ANY($1)', [jobIds]);
      await db.query('DELETE FROM tech_locations WHERE tech_id = ANY($1)', [techIds]);
      await db.query('DELETE FROM employees WHERE id = ANY($1)', [techIds]);
      await db.query('DELETE FROM companies WHERE id = $1', [companyId]);
    } catch (err) {
      console.error('Cleanup failed', err);
    }
  });

  describe('Performance', () => {
    test('dispatches 5 jobs under 1 second', async () => {
      const result = await batchDispatch(jobIds, companyId);
      expect(result.assignments.length).toBe(5);
      expect(result.stats.durationMs).toBeLessThan(800);
    });
  });

  describe('Correctness', () => {
    test('all jobs assigned', async () => {
      const result = await batchDispatch(jobIds, companyId);
      expect(result.stats.assigned).toBe(5);
      expect(result.stats.unassigned).toBe(0);
      expect(result.assignments).toHaveLength(5);
    });

    test('emergency job prioritized', async () => {
      const result = await batchDispatch(jobIds, companyId);
      const emergencyAssignment = result.assignments.find(a => a.jobId === jobIds[0]);
      expect(emergencyAssignment).toBeDefined();
      expect(emergencyAssignment!.score).toBeGreaterThan(80);
    });
  });

  describe('Persistence', () => {
    test('assignments persisted to DB', async () => {
      const result = await batchDispatch(jobIds, companyId);
      await persistBatchAssignments(result.assignments, companyId);

      const assignedJobs = await db.query(`
        SELECT status, assigned_tech_id
        FROM jobs
        WHERE id = ANY($1)
      `, [jobIds]);

      const assignedCount = assignedJobs.filter(r => r.status === 'assigned' && r.assigned_tech_id).length;
      expect(assignedCount).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    test('handles empty job list', async () => {
      const result = await batchDispatch([], companyId);
      expect(result.assignments).toHaveLength(0);
      expect(result.stats.totalJobs).toBe(0);
    });
  });
});
