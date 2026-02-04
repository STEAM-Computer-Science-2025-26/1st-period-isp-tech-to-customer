import { getSql } from '../db/connection';

async function main() {
  const sql = getSql();
  const rows = await sql`SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE 'snapshot_%' OR table_name LIKE 'tech_performance_snapshots' ORDER BY table_schema, table_name`;
  console.log('Found snapshot-related tables:');
  console.table(rows.map((r:any)=>({schema: r.table_schema, name: r.table_name}))); 
}

main().catch(err=>{console.error(err); process.exit(1);});
