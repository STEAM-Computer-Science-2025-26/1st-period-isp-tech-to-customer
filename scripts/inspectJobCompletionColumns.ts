import { getSql } from '../db/connection';

async function main() {
  const sql = getSql();
  const rows = await sql`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'job_completion_logs'
    ORDER BY ordinal_position
  `;
  console.log('Columns for job_completion_logs:');
  console.table(rows);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
