import { getSql } from '../db/connection';

async function main() {
  const sql = getSql();
  // Aggregate counts per tech/company/date for recent entries
  const summary = await sql`SELECT tech_id, company_id, DATE(actual_completion_time) AS date, COUNT(*) AS cnt,
    MIN(actual_completion_time) AS first_at, MAX(actual_completion_time) AS last_at
    FROM job_completion_logs
    WHERE actual_completion_time >= NOW() - INTERVAL '1 hour'
    GROUP BY tech_id, company_id, DATE(actual_completion_time)
    ORDER BY cnt DESC
    LIMIT 50`;

  console.log('Recent job_completion_logs summary (last 1 hour):');
  console.table(summary.map(r => ({ tech_id: r.tech_id, company_id: r.company_id, date: r.date, count: Number(r.cnt), first_at: r.first_at, last_at: r.last_at })));

  if (summary.length === 0) {
    console.log('No recent completions found in the last hour.');
    return;
  }

  // For the top row, show individual rows
  const top = summary[0];
  console.log('\nShowing individual rows for top group:\n', { tech_id: top.tech_id, company_id: top.company_id, date: top.date });
  const rows = await sql`
    SELECT id, job_id, tech_id, company_id, actual_completion_time, actual_duration_minutes, distance_driven_km, first_time_fix, customer_rating
    FROM job_completion_logs
    WHERE tech_id = ${top.tech_id} AND company_id = ${top.company_id} AND DATE(actual_completion_time) = ${top.date}
    ORDER BY actual_completion_time DESC
    LIMIT 200
  `;

  console.log('Rows count:', rows.length);
  rows.forEach((r: any, i: number) => {
    console.log(i + 1, { id: r.id, job_id: r.job_id, actual_completion_time: r.actual_completion_time, duration: r.actual_duration_minutes, distance: r.distance_driven_km, first_time_fix: r.first_time_fix, rating: r.customer_rating });
  });
}

main().catch(err => { console.error(err); process.exit(1); });
