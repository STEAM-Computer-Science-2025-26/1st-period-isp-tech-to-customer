import { getSql } from '../db/connection';

async function main() {
  const sql = getSql();
  const rows = await sql`SELECT table_name, table_schema FROM information_schema.tables WHERE table_name = 'snapshot_update_queue'`;
  console.log('snapshot_update_queue presence:', rows.length ? rows : 'not found');
}

main().catch(err => { console.error(err); process.exit(1); });
