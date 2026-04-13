-- Migration: 004_rate_limits.sql
-- Stores per-key rate limit buckets used by enforceRateLimit().
-- Each row tracks hit count and expiry for a given key (e.g. "login:<ip>").
-- The INSERT ... ON CONFLICT pattern atomically increments or resets the counter.

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key       TEXT        PRIMARY KEY,
  hits      INTEGER     NOT NULL DEFAULT 1,
  reset_at  TIMESTAMPTZ NOT NULL
);

-- Index for fast cleanup of expired buckets
CREATE INDEX IF NOT EXISTS api_rate_limits_reset_at_idx
  ON api_rate_limits(reset_at);
