-- Migration: 002_add_geocoding_retries.sql
-- Description: Add geocoding retry tracking to jobs table
-- Created: 2026-02-15

ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS geocoding_retries INTEGER DEFAULT 0;

-- Add index for worker query performance
CREATE INDEX IF NOT EXISTS idx_jobs_geocoding_pending 
ON jobs(geocoding_status, created_at) 
WHERE geocoding_status IN ('pending', 'failed');

-- Add comment for documentation
COMMENT ON COLUMN jobs.geocoding_retries IS 
'Number of times geocoding has been attempted for this job. Max retries: 3';