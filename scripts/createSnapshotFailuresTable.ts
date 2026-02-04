import { getSql } from '../db/connection';

const sqlText = `
CREATE TABLE IF NOT EXISTS performance_snapshot_update_failures (
  id BIGSERIAL PRIMARY KEY,
  tech_id UUID NOT NULL,
  company_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  job_id UUID NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function main() {
  const sql = getSql();
  try {
    await (sql as any).unsafe(sqlText);
    console.log('performance_snapshot_update_failures table ensured');
  } catch (err) {
    console.error('failed to create performance_snapshot_update_failures', err);
    process.exit(2);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
