-- Migration: 007_performance_indexes.sql
-- Description: Add composite indexes for common query patterns
-- Created: 2026-02-15

-- Composite index for employees lookup by company and availability
CREATE INDEX IF NOT EXISTS idx_employees_company_available 
ON employees(company_id, is_available, is_active)
WHERE is_available = true AND is_active = true;

-- Add max_travel_distance_miles if it doesn't exist (for dispatch algorithm)
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS max_travel_distance_miles INTEGER DEFAULT 50;

-- Add current_jobs_count if it doesn't exist (for workload tracking)
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS current_jobs_count INTEGER DEFAULT 0;

-- Add required_skills to jobs if it doesn't exist (for dispatch matching)
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS required_skills TEXT[] DEFAULT '{}';

COMMENT ON COLUMN employees.max_travel_distance_miles IS 
'Maximum distance technician is willing to travel for a job';

COMMENT ON COLUMN employees.current_jobs_count IS 
'Real-time count of jobs currently assigned to this technician';

COMMENT ON COLUMN jobs.required_skills IS 
'Array of skill tags required for this job (e.g., ["hvac_repair", "electrical"])';