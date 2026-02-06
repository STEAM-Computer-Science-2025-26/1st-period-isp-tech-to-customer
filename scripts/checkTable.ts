import { getSql } from '../db/connection';

async function main() {
  const sql = getSql();
  const r = await sql`SELECT to_regclass('public.performance_snapshots') as t`;
  console.log(r);
}

main().catch(err => { console.error(err); process.exit(1); });
