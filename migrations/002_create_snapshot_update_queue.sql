-- Migration: create snapshot_update_queue table for DB-backed snapshot scheduling

-- Queue table that schedules snapshot updates per (tech, company, date).
-- This migration is the only place the schema is created/changed — do NOT create this table at runtime.
CREATE TABLE IF NOT EXISTS snapshot_update_queue (
  id BIGSERIAL PRIMARY KEY,
  tech_id UUID NOT NULL,
  company_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  first_enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ NULL,
  locked_until TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  job_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint to dedupe scheduling per tech/company/date. We still record causal events separately.
CREATE UNIQUE INDEX IF NOT EXISTS ux_snapshot_queue_tech_company_date ON snapshot_update_queue (tech_id, company_id, snapshot_date);

-- Index for picking due rows
CREATE INDEX IF NOT EXISTS idx_snapshot_queue_scheduled_at ON snapshot_update_queue (scheduled_at);

-- Events table: records individual job causation so we retain provenance even when we dedupe queue rows.
CREATE TABLE IF NOT EXISTS snapshot_update_events (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT NOT NULL REFERENCES snapshot_update_queue(id) ON DELETE CASCADE,
  job_id UUID NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_update_events_queue_id ON snapshot_update_events (queue_id);

-- Dead-letter table to keep failed payloads for replay/analysis
CREATE TABLE IF NOT EXISTS snapshot_update_deadletter (
  id BIGSERIAL PRIMARY KEY,
  tech_id UUID NOT NULL,
  company_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  payload JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  failed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_deadletter_date ON snapshot_update_deadletter (snapshot_date);
