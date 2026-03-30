-- Migration: 003_tech_location_history.sql
-- Creates a running log of technician GPS positions so the map page
-- can draw a "trail" of where each tech has been in the past hour.
-- The existing tech_locations table only keeps the CURRENT position
-- (upserted on conflict), so we need a separate append-only table.

CREATE TABLE IF NOT EXISTS tech_location_history (
  id              BIGSERIAL        PRIMARY KEY,
  tech_id         UUID             NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  accuracy_meters DOUBLE PRECISION,
  recorded_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Index for fast per-tech lookups ordered newest-first (trail queries filter by time)
CREATE INDEX IF NOT EXISTS tech_location_history_tech_time_idx
  ON tech_location_history(tech_id, recorded_at DESC);
