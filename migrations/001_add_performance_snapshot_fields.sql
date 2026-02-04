-- Migration: add new tables/columns for performance snapshots and failure log
-- Run this in your DB migration tool or psql connected to the project's DB.

-- Create tech_performance_snapshots table (used by application code)
CREATE TABLE IF NOT EXISTS tech_performance_snapshots (
  id BIGSERIAL PRIMARY KEY,
  tech_id UUID NOT NULL,
  company_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  jobs_completed_count INTEGER DEFAULT 0,
  total_drive_time_minutes NUMERIC DEFAULT 0,
  total_distance_km NUMERIC DEFAULT 0,
  average_customer_rating NUMERIC,
  average_job_duration_minutes NUMERIC,
  first_time_fix_rate NUMERIC,
  recent_performance_score NUMERIC,
  recent_jobs_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure a uniqueness constraint so ON CONFLICT (tech_id, snapshot_date) works
CREATE UNIQUE INDEX IF NOT EXISTS ux_tech_snapshot_date ON tech_performance_snapshots (tech_id, snapshot_date);

-- Table to record persistent failures when snapshot updates cannot be performed.
CREATE TABLE IF NOT EXISTS performance_snapshot_update_failures (
  id BIGSERIAL PRIMARY KEY,
  tech_id UUID NOT NULL,
  company_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  job_id UUID NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index to quickly find recent failures
CREATE INDEX IF NOT EXISTS idx_perf_snapshot_failures_date ON performance_snapshot_update_failures (snapshot_date);

-- Backwards-compatible view for legacy references to 'performance_snapshots'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_name = 'performance_snapshots'
  ) THEN
    EXECUTE $$
      CREATE VIEW performance_snapshots AS
      SELECT
        id::text AS id,
        tech_id,
        company_id,
        snapshot_date AS date,
        jobs_completed_count AS jobs_completed,
        total_drive_time_minutes AS total_minutes_worked,
        total_distance_km AS total_distance_driven,
        average_customer_rating AS avg_customer_rating,
        average_job_duration_minutes,
        first_time_fix_rate,
        recent_performance_score,
        recent_jobs_data,
        created_at
      FROM tech_performance_snapshots;
    $$;
  END IF;
END$$;
