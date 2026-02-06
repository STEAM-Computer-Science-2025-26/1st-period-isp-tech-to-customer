import { getSql } from '../db/connection';

const createSql = `
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id UUID NOT NULL,
  company_id UUID NOT NULL,
  date DATE NOT NULL,
  jobs_completed INTEGER DEFAULT 0,
  total_minutes_worked NUMERIC DEFAULT 0,
  total_distance_driven NUMERIC DEFAULT 0,
  avg_customer_rating NUMERIC,
  average_job_duration_minutes NUMERIC,
  first_time_fix_rate NUMERIC,
  recent_performance_score NUMERIC,
  recent_jobs_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tech_id, company_id, date)
);
`;

async function main() {
  const sql = getSql();
  try {
    await (sql as any).unsafe(createSql);
    console.log('performance_snapshots table ensured');
  } catch (err) {
    console.error('Failed to create performance_snapshots:', err);
    process.exit(2);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
