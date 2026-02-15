-- Migration: 006_job_assignments.sql
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
CREATE INDEX IF NOT EXISTS idx_job_assignments_assigned_at ON job_assignments(assigned_at);

COMMENT ON TABLE job_assignments IS 
'Audit trail of job assignments with dispatch algorithm scoring details';

COMMENT ON COLUMN job_assignments.is_manual_override IS 
'True if dispatcher manually assigned instead of accepting algorithm recommendation';

COMMENT ON COLUMN job_assignments.scoring_details IS 
'JSON object containing the dispatch algorithm scores that led to this assignment';

COMMENT ON COLUMN job_assignments.override_reason IS 
'Human-readable reason for manual override, e.g., "Customer requested specific tech"';