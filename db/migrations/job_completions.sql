-- Migration: 005_job_completions.sql
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
CREATE INDEX IF NOT EXISTS idx_job_completions_tech_completed ON job_completions(tech_id, completed_at DESC);

COMMENT ON TABLE job_completions IS 
'Records job completion metrics for technician performance analytics';

COMMENT ON COLUMN job_completions.duration_minutes IS 
'Actual time taken to complete the job in minutes';

COMMENT ON COLUMN job_completions.first_time_fix IS 
'Whether the job was completed on the first visit (no callback needed)';

COMMENT ON COLUMN job_completions.customer_rating IS 
'Customer satisfaction rating from 1 (poor) to 5 (excellent)';