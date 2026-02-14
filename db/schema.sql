-- db/schema.sql
-- Run this in your Neon SQL Editor to create all tables.
-- For existing databases, the migration sections at the bottom
-- add new columns without recreating tables.

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name TEXT NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	dispatch_settings JSONB DEFAULT '{"emergencyOnlyAfterTime": "16:00"}'::jsonb
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email TEXT UNIQUE NOT NULL,
	password_hash TEXT NOT NULL,
	-- NOTE: 'dev' users bypass company scoping in the backend.
	role TEXT NOT NULL CHECK (role IN ('dev', 'admin', 'tech')),
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- ============================================================
-- EMPLOYEES (tech profiles)
-- ============================================================
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

-- ============================================================
-- JOBS
-- ============================================================
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

	-- Geocoded coordinates for dispatch routing.
	-- Populated after job creation via the geocoding service.
	-- NULL means geocoding has not run yet or failed.
	latitude DOUBLE PRECISION,
	longitude DOUBLE PRECISION,

	-- Tracks geocoding state so the system knows whether to retry.
	-- 'pending'  = not yet attempted
	-- 'complete' = lat/lng are populated and usable
	-- 'failed'   = geocoding was attempted but could not resolve the address
	geocoding_status TEXT NOT NULL DEFAULT 'pending'
		CHECK (geocoding_status IN ('pending', 'complete', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_tech_id ON jobs(assigned_tech_id);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_time ON jobs(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_jobs_geocoding_status ON jobs(geocoding_status);

-- Add FK for current_job_id after jobs table exists
ALTER TABLE employees
	ADD CONSTRAINT fk_employees_current_job
	FOREIGN KEY (current_job_id)
	REFERENCES jobs(id)
	ON DELETE SET NULL;

-- ============================================================
-- EMAIL VERIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS email_verifications (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email VARCHAR(255) NOT NULL,
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

ALTER TABLE email_verifications
	ADD COLUMN IF NOT EXISTS token_hash TEXT;

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

-- ============================================================
-- RATE LIMITING
-- ============================================================
CREATE TABLE IF NOT EXISTS api_rate_limits (
	key TEXT PRIMARY KEY,
	hits INTEGER NOT NULL,
	reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at
	ON api_rate_limits(reset_at);

-- ============================================================
-- MIGRATIONS (run these against existing databases)
-- ============================================================

-- companies: add updated_at if missing
ALTER TABLE companies
	ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- users: add updated_at if missing
ALTER TABLE users
	ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- jobs: add updated_at, coordinates, and geocoding_status if missing
ALTER TABLE jobs
	ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE jobs
	ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE jobs
	ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE jobs
	ADD COLUMN IF NOT EXISTS geocoding_status TEXT NOT NULL DEFAULT 'pending'
		CHECK (geocoding_status IN ('pending', 'complete', 'failed'));

CREATE INDEX IF NOT EXISTS idx_jobs_geocoding_status
	ON jobs(geocoding_status);
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

CREATE INDEX idx_job_completions_tech_id ON job_completions(tech_id);
CREATE INDEX idx_job_completions_completed_at ON job_completions(completed_at);

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

CREATE INDEX idx_job_assignments_job_id ON job_assignments(job_id);
CREATE INDEX idx_job_assignments_tech_id ON job_assignments(tech_id);

-- db/schema-updated.sql
-- ADD THESE TABLES TO YOUR EXISTING SCHEMA

-- ============================================================
-- JOB COMPLETIONS (for metrics tracking)
-- ============================================================
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

-- ============================================================
-- JOB ASSIGNMENTS (for dispatch tracking and analytics)
-- ============================================================
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
CREATE INDEX IF NOT EXISTS idx_job_assignments_assigned_at ON job_assignments(assigned_at);

-- Add these to schema.sql
CREATE INDEX idx_jobs_company_status ON jobs(company_id, status);
CREATE INDEX idx_jobs_company_priority ON jobs(company_id, priority);
CREATE INDEX idx_employees_company_available ON employees(company_id, is_available, is_active);
CREATE INDEX idx_job_completions_tech_completed ON job_completions(tech_id, completed_at DESC);