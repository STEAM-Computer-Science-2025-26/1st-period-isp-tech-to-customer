-- Migration: 000_migration_tracker.sql
-- Description: Create migration tracking table (run this first)

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
'Tracks which database migrations have been applied and when';

COMMENT ON COLUMN schema_migrations.version IS 
'Migration version number (e.g., "001", "002", "003")';

COMMENT ON COLUMN schema_migrations.checksum IS 
'SHA-256 checksum of migration file to detect tampering';

COMMENT ON COLUMN schema_migrations.execution_time_ms IS 
'Time taken to execute the migration in milliseconds';