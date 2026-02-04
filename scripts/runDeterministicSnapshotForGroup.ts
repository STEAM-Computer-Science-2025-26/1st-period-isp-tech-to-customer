import { getSql } from '../db/connection';

async function main() {
  const { safeUpdatePerformanceSnapshotWithRetries } = await import('../services/logging/completionLogger');
  const sql = getSql();

  // Group from previous inspection
  const techId = 'c7f29444-be25-4f6f-9155-f55c4f29a951';
  const companyId = 'e8b8dece-7792-4210-834b-161f2411fcf4';
  const date = '2026-02-04';

  console.log('Running deterministic snapshot update for', { techId, companyId, date });
  try {
    await safeUpdatePerformanceSnapshotWithRetries({ techId, companyId, date }, 5);
    console.log('Snapshot update completed');
  } catch (err) {
    console.error('Snapshot update failed', err);
    process.exit(2);
  }

  const rows = await sql`SELECT * FROM tech_performance_snapshots WHERE tech_id = ${techId} AND company_id = ${companyId} AND snapshot_date = ${date}`;
  console.log('Snapshot rows returned:', rows.length);
  if (rows.length > 0) {
    console.log(JSON.stringify(rows[0], null, 2));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
