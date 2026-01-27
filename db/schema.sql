-- /server/db/schema.sql
-- Run this in your Neon SQL Editor to create all tables

-- Companies table (must be created first due to foreign key dependencies)
CREATE TABLE IF NOT EXISTS companies (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name TEXT NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	dispatch_settings JSONB DEFAULT '{"emergencyOnlyAfterTime": "16:00"}'::jsonb
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email TEXT UNIQUE NOT NULL,
	password_hash TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('admin', 'tech')),
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- Employees table (tech profiles)
CREATE TABLE IF NOT EXISTS employees (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	skills TEXT[] NOT NULL DEFAULT '{}',
	skill_level JSONB DEFAULT '{}'::jsonb,
	home_address TEXT NOT NULL,
	phone TEXT,
	email TEXT,
	is_available BOOLEAN DEFAULT TRUE,
	availability_updated_at TIMESTAMPTZ DEFAULT NOW(),
	current_job_id UUID,
	max_concurrent_jobs INTEGER DEFAULT 1,
	is_active BOOLEAN DEFAULT TRUE,
	rating DECIMAL(3,2) DEFAULT 3.00 CHECK (rating >= 1.00 AND rating <= 5.00),
	last_job_completed_at TIMESTAMPTZ,
	internal_notes TEXT,
	created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for employees
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_available ON employees(is_available);
CREATE INDEX IF NOT EXISTS idx_employees_skills_gin ON employees USING GIN (skills);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	customer_name TEXT NOT NULL,
	address TEXT NOT NULL,
	phone TEXT NOT NULL,
	job_type TEXT NOT NULL CHECK (job_type IN ('installation', 'repair', 'maintenance', 'inspection')),
	status TEXT NOT NULL DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned', 'in_progress', 'completed'
, 'cancelled')),                                                                                                    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'emergency')),
	assigned_tech_id UUID REFERENCES employees(id) ON DELETE SET NULL,
	scheduled_time TIMESTAMPTZ,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	completed_at TIMESTAMPTZ,
	initial_notes TEXT,
	completion_notes TEXT
);

-- Indexes for jobs
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_tech_id ON jobs(assigned_tech_id);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_time ON jobs(scheduled_time);

-- Add foreign key constraint for current_job_id (after jobs table exists)
ALTER TABLE employees
	ADD CONSTRAINT fk_employees_current_job
	FOREIGN KEY (current_job_id)
	REFERENCES jobs(id)
	ON DELETE SET NULL;

-- Email verification tokens/codes (registration)
--
-- Security notes:
-- - `token` is a secret (magic link) and should ONLY be delivered via email.
-- - The browser should use `id` (verificationId) for polling + code submission.
-- - In production, prefer storing a token hash instead of plaintext.
CREATE TABLE IF NOT EXISTS email_verifications (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email VARCHAR(255) NOT NULL,
	-- Legacy columns (kept for existing DBs; new code uses token_hash/code_encrypted).
	token VARCHAR(64),
	code VARCHAR(6),
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,
	verified BOOLEAN DEFAULT FALSE,
	verified_at TIMESTAMPTZ,
	used_at TIMESTAMPTZ,
	use_code BOOLEAN DEFAULT FALSE,
	code_attempts INTEGER NOT NULL DEFAULT 0
);

-- Migrations for hardened verification flow
ALTER TABLE email_verifications
	ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- If your table was created with `token UNIQUE NOT NULL`, relax that so the
-- hardened flow can avoid storing plaintext tokens.
ALTER TABLE email_verifications
	ALTER COLUMN token DROP NOT NULL;

ALTER TABLE email_verifications
	DROP CONSTRAINT IF EXISTS email_verifications_token_key;

ALTER TABLE email_verifications
	ADD COLUMN IF NOT EXISTS session_hash TEXT;

ALTER TABLE email_verifications
	ADD COLUMN IF NOT EXISTS code_encrypted TEXT;

ALTER TABLE email_verifications
	ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_verifications_token
	ON email_verifications(token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verifications_token_hash
	ON email_verifications(token_hash);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email_expires
	ON email_verifications(email, expires_at);

-- DB-backed rate limiting
CREATE TABLE IF NOT EXISTS api_rate_limits (
	key TEXT PRIMARY KEY,
	hits INTEGER NOT NULL,
	reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at
	ON api_rate_limits(reset_at);
