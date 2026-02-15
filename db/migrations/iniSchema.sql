-- Migration: 001_initial_schema.sql
-- Description: Create core tables (companies, users, employees, jobs)
-- Created: 2026-02-15

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

-- Add FK for current_job_id after jobs table exists
ALTER TABLE employees
	ADD CONSTRAINT fk_employees_current_job
	FOREIGN KEY (current_job_id)
	REFERENCES jobs(id)
	ON DELETE SET NULL;