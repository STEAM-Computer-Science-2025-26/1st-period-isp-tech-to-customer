import { getSql } from '../db/connection';

async function main() {
  const sql = getSql();
  const rows = await sql`SELECT schemaname, tablename FROM pg_tables WHERE tablename ILIKE '%performance%';`;
  console.log('performance-related tables:');
  console.table(rows);
}

main().catch(err => { console.error(err); process.exit(1); });
