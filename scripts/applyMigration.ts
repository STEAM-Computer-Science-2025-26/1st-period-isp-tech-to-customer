import fs from 'node:fs';
import path from 'node:path';
import { getSql } from '../db/connection';

async function main() {
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('Migrations directory not found:', migrationsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const sql = getSql();

  for (const file of files) {
    const migrationPath = path.join(migrationsDir, file);
    const sqlText = fs.readFileSync(migrationPath, 'utf8');
    console.log('Applying migration:', migrationPath);
    try {
      await (sql as any).unsafe(sqlText);
      console.log('  Applied:', file);
    } catch (err) {
      console.error('Migration failed:', file, err);
      process.exit(2);
    }
  }

  console.log('All migrations applied');
}

main().catch((err) => {
  console.error('Error running migration script', err);
  process.exit(3);
});
