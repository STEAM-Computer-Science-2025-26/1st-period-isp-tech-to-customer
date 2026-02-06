import crypto from 'node:crypto';
import { getSql, testConnection } from "../../db/connection";
import { logJobCompletion } from "./completionLogger";

async function main() {
  // sanity check DB
  const conn = await testConnection();
  if (!conn.success) {
    console.error("DB connection failed, aborting integration test", conn.error);
    process.exit(1);
  }

  const sql = getSql();
  const techId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const todayIso = new Date().toISOString();

  // Create a few concurrent job completions for the same tech/company
  const jobs = Array.from({ length: 5 }).map((_, i) => ({
    jobId: crypto.randomUUID(),
    techId,
    companyId,
    actualStartTime: new Date(Date.now() - (i + 1) * 30 * 60000).toISOString(),
    actualCompletionTime: new Date(Date.now() - i * 20 * 60000).toISOString(),
    estimatedDurationMinutes: 30,
    firstTimeFix: i % 2 === 0,
    callbackRequired: false,
    customerRating: 4,
    distanceDrivenKm: 5 + i,
    travelTimeMinutes: 10,
    partsUsed: [],
    stockAvailabilityNotes: null,
    reordersRequired: false,
    techStressLevel: null,
    dispatcherNotes: null,
    bottlenecksObserved: null,
    complications: null,
    softwareUsed: [],
    systemFailures: null,
    improvementSuggestions: null,
    repeatCustomer: false,
    postJobTrainingNotes: null
  }));

  // Ensure company exists
  await sql`
    INSERT INTO companies (id, name)
    VALUES (${companyId}, 'Integration Test Company')
    ON CONFLICT (id) DO NOTHING
  `;

  // Ensure a user and an employee (tech) exist
  const userId = crypto.randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, role, company_id)
    VALUES (${userId}, ${userId + '@example.test'}, 'testhash', 'tech', ${companyId})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO employees (id, user_id, company_id, home_address)
    VALUES (${techId}, ${userId}, ${companyId}, 'Integration Test Address')
    ON CONFLICT (id) DO NOTHING
  `;

  // Insert jobs records so the FK constraint for job_id is satisfied
  await Promise.all(
    jobs.map((j) =>
      sql`
        INSERT INTO jobs (id, company_id, customer_name, address, phone, job_type, status, created_at)
        VALUES (${j.jobId}, ${j.companyId}, 'Integration test', '123 Test St', '0000000000', 'repair', 'completed', ${j.actualCompletionTime})
        ON CONFLICT (id) DO NOTHING
      `
    )
  );

  console.log('Inserting', jobs.length, 'concurrent completions...');
  await Promise.all(jobs.map((j) => logJobCompletion(j as any)));

  // Wait a short while for background snapshot updates to finish
  await new Promise((r) => setTimeout(r, 2000));

  const date = new Date().toISOString().split('T')[0];

  const snapshots = await sql`
    SELECT * FROM tech_performance_snapshots
    WHERE tech_id = ${techId} AND company_id = ${companyId} AND snapshot_date = ${date}
  `;

  console.log('Snapshots rows:', snapshots.length);
  if (snapshots.length > 0) {
    console.log('Snapshot:', snapshots[0]);
  } else {
    console.warn('No snapshot row found for the test tech/company/date');
  }

  try {
    const failures = await sql`
      SELECT * FROM performance_snapshot_update_failures
      WHERE tech_id = ${techId} AND company_id = ${companyId} AND date = ${date}
    `;
    console.log('Snapshot update failures rows:', failures.length);
    if (failures.length > 0) console.log('Failures:', failures);
  } catch (err) {
    console.warn('performance_snapshot_update_failures table not present or query failed:', String(err));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Integration test failed', err);
  process.exit(2);
});
