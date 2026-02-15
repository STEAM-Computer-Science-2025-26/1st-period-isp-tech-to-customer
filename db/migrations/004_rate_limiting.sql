-- Migration: 004_rate_limiting.sql
-- Description: Add rate limiting table for API throttling
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS api_rate_limits (
	key TEXT PRIMARY KEY,
	hits INTEGER NOT NULL,
	reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at
	ON api_rate_limits(reset_at);

COMMENT ON TABLE api_rate_limits IS 
'Tracks API request counts per key (IP, user, etc.) for rate limiting';

COMMENT ON COLUMN api_rate_limits.key IS 
'Rate limit key, typically: "login:{ip}" or "api:{user_id}"';

COMMENT ON COLUMN api_rate_limits.hits IS 
'Number of requests made within the current window';

COMMENT ON COLUMN api_rate_limits.reset_at IS 
'Timestamp when the rate limit window resets';