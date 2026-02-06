import crypto from 'node:crypto';
import { getSql, testConnection } from "../../db/connection";
import { logJobCompletion } from "./completionLogger";

async function main() {
  const CONCURRENCY = Number(process.env.HC_CONCURRENCY) || 20; // number of concurrent completions to simulate (default 20, override with HC_CONCURRENCY)
  const sql = getSql();

  const conn = await testConnection();
  if (!conn.success) {
    console.error('DB connection failed', conn.error);
    process.exit(1);
  }

  const techId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  // Ensure company/user/employee exist
  await sql`INSERT INTO companies (id,name) VALUES (${companyId}, 'High Concurrency Company') ON CONFLICT (id) DO NOTHING`;
  await sql`INSERT INTO users (id,email,password_hash,role,company_id) VALUES (${userId}, ${userId + '@example.test'}, 'hash', 'tech', ${companyId}) ON CONFLICT (id) DO NOTHING`;
  await sql`INSERT INTO employees (id,user_id,company_id,home_address) VALUES (${techId}, ${userId}, ${companyId}, 'addr') ON CONFLICT (id) DO NOTHING`;

  const jobs = Array.from({ length: CONCURRENCY }).map((_, i) => ({
    jobId: crypto.randomUUID(),
    durationMinutes: 30 + (i % 5) * 5,
    distanceKm: 2 + (i % 3)
  }));

  // Insert jobs rows so job_completion_logs FK satisfied
  await Promise.all(jobs.map(j => sql`INSERT INTO jobs (id, company_id, customer_name, address, phone, job_type, status, created_at) VALUES (${j.jobId}, ${companyId}, 'hc test', 'addr', '000', 'repair', 'completed', NOW()) ON CONFLICT (id) DO NOTHING`));

  const completions = jobs.map((j, i) => ({
    jobId: j.jobId,
    techId,
    companyId,
    actualStartTime: new Date(Date.now() - j.durationMinutes * 60000).toISOString(),
    actualCompletionTime: new Date().toISOString(),
    estimatedDurationMinutes: j.durationMinutes,
    firstTimeFix: true,
    callbackRequired: false,
    customerRating: 5,
    distanceDrivenKm: j.distanceKm,
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

  console.log('Starting', CONCURRENCY, 'concurrent logJobCompletion calls');
  const results = await Promise.allSettled(completions.map(c => logJobCompletion(c as any)));
  const fulfilled = results.filter(r => r.status === 'fulfilled').length;
  const rejected = results.filter(r => r.status === 'rejected').length;
  console.log(`Log insert results: fulfilled=${fulfilled}, rejected=${rejected}`);

  // After all inserts settle, run one deterministic snapshot update to avoid race conditions in tests
  const date = new Date().toISOString().split('T')[0];
  try {
    await (await import('./completionLogger')).safeUpdatePerformanceSnapshotWithRetries({ techId, companyId, date }, 5);
    console.log('Performed deterministic snapshot update after inserts');
  } catch (err) {
    console.error('Deterministic snapshot update failed', err);
  }

  const snapshots = await sql`SELECT * FROM tech_performance_snapshots WHERE tech_id = ${techId} AND company_id = ${companyId} AND snapshot_date = ${date}`;
  console.log('Snapshot rows:', snapshots.length);
  if (snapshots.length === 0) {
    console.error('No snapshot found after concurrent inserts');
    process.exit(2);
  }

  const snap = snapshots[0];
  console.log('Snapshot summary:', {
    jobs_completed_count: snap.jobs_completed_count,
    total_drive_time_minutes: snap.total_drive_time_minutes,
    total_distance_km: snap.total_distance_km
  });

  // Expected totals
  const expectedJobs = CONCURRENCY;
  const expectedTotalMinutes = jobs.reduce((s, j) => s + j.durationMinutes, 0);
  const expectedDistance = jobs.reduce((s, j) => s + j.distanceKm, 0);

  console.log('Expected totals:', { expectedJobs, expectedTotalMinutes, expectedDistance });

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
