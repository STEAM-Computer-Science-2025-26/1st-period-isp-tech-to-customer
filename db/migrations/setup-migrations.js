#!/usr/bin/env node
/**
 * setup-migrations.js - One-file migration system setup
 *
 * This script will:
 * 1. Create migrations/ directory
 * 2. Create scripts/ directory
 * 3. Generate all migration SQL files
 * 4. Generate migration runner scripts
 * 5. Update package.json
 *
 * Usage: node setup-migrations.js
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const migrations = {
	"000_migration_tracker.sql": `-- Migration: 000_migration_tracker.sql
-- Description: Create migration tracking table (run this first)
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS schema_migrations (
	id SERIAL PRIMARY KEY,
	version VARCHAR(255) NOT NULL UNIQUE,
	name VARCHAR(255) NOT NULL,
	applied_at TIMESTAMPTZ DEFAULT NOW(),
	checksum VARCHAR(64),
	execution_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);

COMMENT ON TABLE schema_migrations IS 
'Tracks which database migrations have been applied and when';`,

	"001_initial_schema.sql": `-- Migration: 001_initial_schema.sql
-- Description: Create core tables (companies, users, employees, jobs)
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS companies (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name TEXT NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	dispatch_settings JSONB DEFAULT '{"emergencyOnlyAfterTime": "16:00"}'::jsonb
);

CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email TEXT UNIQUE NOT NULL,
	password_hash TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('dev', 'admin', 'tech')),
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

CREATE TABLE IF NOT EXISTS employees (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	email TEXT,
	role TEXT,
	skills TEXT[] NOT NULL DEFAULT '{}',
	skill_level JSONB DEFAULT '{}'::jsonb,
	home_address TEXT NOT NULL,
	phone TEXT,
	is_available BOOLEAN DEFAULT TRUE,
	availability_updated_at TIMESTAMPTZ DEFAULT NOW(),
	current_job_id UUID,
	max_concurrent_jobs INTEGER DEFAULT 1,
	is_active BOOLEAN DEFAULT TRUE,
	rating DECIMAL(3,2) DEFAULT 3.00 CHECK (rating >= 1.00 AND rating <= 5.00),
	last_job_completed_at TIMESTAMPTZ,
	internal_notes TEXT,
	created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
	latitude DOUBLE PRECISION,
	longitude DOUBLE PRECISION,
	location_updated_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_available ON employees(is_available);
CREATE INDEX IF NOT EXISTS idx_employees_skills_gin ON employees USING GIN (skills);

CREATE TABLE IF NOT EXISTS jobs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	customer_name TEXT NOT NULL,
	address TEXT NOT NULL,
	phone TEXT NOT NULL,
	job_type TEXT NOT NULL CHECK (job_type IN ('installation', 'repair', 'maintenance', 'inspection')),
	status TEXT NOT NULL DEFAULT 'unassigned' CHECK (status IN (
		'unassigned', 'assigned', 'in_progress', 'completed', 'cancelled'
	)),
	priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'emergency')),
	assigned_tech_id UUID REFERENCES employees(id) ON DELETE SET NULL,
	scheduled_time TIMESTAMPTZ,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	completed_at TIMESTAMPTZ,
	initial_notes TEXT,
	completion_notes TEXT,
	latitude DOUBLE PRECISION,
	longitude DOUBLE PRECISION,
	geocoding_status TEXT NOT NULL DEFAULT 'pending'
		CHECK (geocoding_status IN ('pending', 'complete', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_tech_id ON jobs(assigned_tech_id);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_time ON jobs(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_jobs_geocoding_status ON jobs(geocoding_status);
CREATE INDEX IF NOT EXISTS idx_jobs_company_status ON jobs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_company_priority ON jobs(company_id, priority);

ALTER TABLE employees
	ADD CONSTRAINT fk_employees_current_job
	FOREIGN KEY (current_job_id)
	REFERENCES jobs(id)
	ON DELETE SET NULL;`,

	"002_add_geocoding_retries.sql": `-- Migration: 002_add_geocoding_retries.sql
-- Description: Add geocoding retry tracking to jobs table
-- Created: 2026-02-15

ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS geocoding_retries INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_jobs_geocoding_pending 
ON jobs(geocoding_status, created_at) 
WHERE geocoding_status IN ('pending', 'failed');

COMMENT ON COLUMN jobs.geocoding_retries IS 
'Number of times geocoding has been attempted for this job. Max retries: 3';`,

	"003_email_verifications.sql": `-- Migration: 003_email_verifications.sql
-- Description: Add email verification system with magic links and codes
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS email_verifications (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email VARCHAR(255) NOT NULL,
	token VARCHAR(64),
	token_hash TEXT,
	code VARCHAR(6),
	code_encrypted TEXT,
	code_expires_at TIMESTAMPTZ,
	session_hash TEXT,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,
	verified BOOLEAN DEFAULT FALSE,
	verified_at TIMESTAMPTZ,
	used_at TIMESTAMPTZ,
	use_code BOOLEAN DEFAULT FALSE,
	code_attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_token
	ON email_verifications(token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verifications_token_hash
	ON email_verifications(token_hash);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email_expires
	ON email_verifications(email, expires_at);`,

	"004_rate_limiting.sql": `-- Migration: 004_rate_limiting.sql
-- Description: Add rate limiting table for API throttling
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS api_rate_limits (
	key TEXT PRIMARY KEY,
	hits INTEGER NOT NULL,
	reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at
	ON api_rate_limits(reset_at);`,

	"005_job_completions.sql": `-- Migration: 005_job_completions.sql
-- Description: Add job completions table for metrics and performance tracking
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS job_completions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
	tech_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	completed_at TIMESTAMPTZ DEFAULT NOW(),
	duration_minutes INTEGER,
	first_time_fix BOOLEAN DEFAULT TRUE,
	customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
	completion_notes TEXT,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_completions_tech_id ON job_completions(tech_id);
CREATE INDEX IF NOT EXISTS idx_job_completions_completed_at ON job_completions(completed_at);
CREATE INDEX IF NOT EXISTS idx_job_completions_company_id ON job_completions(company_id);
CREATE INDEX IF NOT EXISTS idx_job_completions_tech_completed ON job_completions(tech_id, completed_at DESC);`,

	"006_job_assignments.sql": `-- Migration: 006_job_assignments.sql
-- Description: Add job assignments table for dispatch analytics and audit trail
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS job_assignments (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
	tech_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
	assigned_at TIMESTAMPTZ DEFAULT NOW(),
	is_manual_override BOOLEAN DEFAULT FALSE,
	override_reason TEXT,
	scoring_details JSONB,
	job_priority TEXT,
	job_type TEXT,
	is_emergency BOOLEAN DEFAULT FALSE,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_tech_id ON job_assignments(tech_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_company_id ON job_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_assigned_at ON job_assignments(assigned_at);`,

	"007_performance_indexes.sql": `-- Migration: 007_performance_indexes.sql
-- Description: Add composite indexes for common query patterns
-- Created: 2026-02-15

CREATE INDEX IF NOT EXISTS idx_employees_company_available 
ON employees(company_id, is_available, is_active)
WHERE is_available = true AND is_active = true;

ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS max_travel_distance_miles INTEGER DEFAULT 50;

ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS current_jobs_count INTEGER DEFAULT 0;

ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS required_skills TEXT[] DEFAULT '{}';`
};

const migrateScript = `#!/usr/bin/env node
// scripts/migrate.js
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function calculateChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureMigrationTable() {
  const client = await pool.connect();
  try {
    await client.query(\`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        checksum VARCHAR(64),
        execution_time_ms INTEGER
      )
    \`);
    console.log('✅ Migration tracking table ready');
  } finally {
    client.release();
  }
}

async function getAppliedMigrations() {
  const result = await pool.query(
    'SELECT version, checksum FROM schema_migrations ORDER BY version'
  );
  return new Map(result.rows.map(row => [row.version, row.checksum]));
}

async function getMigrationFiles() {
  const migrationsDir = join(__dirname, '..', 'migrations');
  const files = await readdir(migrationsDir);
  
  return files
    .filter(f => f.endsWith('.sql') && f !== '000_migration_tracker.sql')
    .sort()
    .map(f => {
      const match = f.match(/^(\\d+)_(.+)\\.sql$/);
      if (!match) throw new Error(\`Invalid migration filename: \${f}\`);
      return {
        version: match[1],
        name: match[2],
        filename: f,
        path: join(migrationsDir, f)
      };
    });
}

async function runMigration(migration) {
  const client = await pool.connect();
  const startTime = Date.now();
  
  try {
    console.log(\`\\n📦 Running migration \${migration.version}: \${migration.name}\`);
    
    const sql = await readFile(migration.path, 'utf8');
    const checksum = calculateChecksum(sql);
    
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      \`INSERT INTO schema_migrations (version, name, checksum, execution_time_ms)
       VALUES ($1, $2, $3, $4)\`,
      [migration.version, migration.name, checksum, Date.now() - startTime]
    );
    await client.query('COMMIT');
    
    console.log(\`✅ Migration \${migration.version} applied successfully (\${Date.now() - startTime}ms)\`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(\`❌ Migration \${migration.version} failed:\`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function migrateUp() {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  const migrations = await getMigrationFiles();
  const pending = migrations.filter(m => !applied.has(m.version));
  
  if (pending.length === 0) {
    console.log('\\n✅ No pending migrations. Database is up to date.');
    return;
  }
  
  console.log(\`\\n📋 Found \${pending.length} pending migration(s)\`);
  
  for (const migration of pending) {
    await runMigration(migration);
  }
  
  console.log('\\n✅ All migrations applied successfully!');
}

async function migrateDown() {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  
  if (applied.size === 0) {
    console.log('\\n⚠️  No migrations to rollback.');
    return;
  }
  
  const versions = Array.from(applied.keys()).sort().reverse();
  const lastVersion = versions[0];
  
  console.log(\`\\n⚠️  Rolling back migration \${lastVersion}\`);
  await pool.query('DELETE FROM schema_migrations WHERE version = $1', [lastVersion]);
  console.log(\`✅ Migration \${lastVersion} removed from tracking\`);
  console.log('⚠️  Note: You must manually revert database changes');
}

async function showStatus() {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  const migrations = await getMigrationFiles();
  
  console.log('\\n📊 Migration Status:\\n');
  console.log('Version | Name                          | Status   | Checksum');
  console.log('--------|-------------------------------|----------|------------------');
  
  for (const migration of migrations) {
    const isApplied = applied.has(migration.version);
    const status = isApplied ? '✅ Applied' : '⏳ Pending';
    const checksum = isApplied ? applied.get(migration.version).slice(0, 8) : '—';
    console.log(\`\${migration.version.padEnd(7)} | \${migration.name.padEnd(29)} | \${status.padEnd(8)} | \${checksum}\`);
  }
  
  console.log(\`\\nTotal: \${migrations.length} migrations (\${applied.size} applied, \${migrations.length - applied.size} pending)\`);
}

async function main() {
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'up': await migrateUp(); break;
      case 'down': await migrateDown(); break;
      case 'status': await showStatus(); break;
      default:
        console.log('Usage: node scripts/migrate.js <up|down|status>');
        process.exit(1);
    }
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\\n❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
`;

async function setup() {
	console.log("🚀 Setting up migration system...\n");

	// Create directories
	if (!existsSync("migrations")) {
		await mkdir("migrations", { recursive: true });
		console.log("✅ Created migrations/ directory");
	}

	if (!existsSync("scripts")) {
		await mkdir("scripts", { recursive: true });
		console.log("✅ Created scripts/ directory");
	}

	// Write migration files
	for (const [filename, content] of Object.entries(migrations)) {
		await writeFile(join("migrations", filename), content);
		console.log(`✅ Created migrations/${filename}`);
	}

	// Write migrate script
	await writeFile(join("scripts", "migrate.js"), migrateScript);
	console.log("✅ Created scripts/migrate.js");

	console.log("\n📝 Next steps:");
	console.log("1. Add to package.json scripts:");
	console.log('   "migrate:up": "node scripts/migrate.js up"');
	console.log('   "migrate:down": "node scripts/migrate.js down"');
	console.log('   "migrate:status": "node scripts/migrate.js status"');
	console.log("\n2. Install dependencies: npm install pg dotenv");
	console.log("\n3. Set DATABASE_URL in .env");
	console.log("\n4. Run: npm run migrate:status\n");
}

setup().catch(console.error);
