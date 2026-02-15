-- Migration: 003_email_verifications.sql
-- Description: Add email verification system with magic links and codes
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS email_verifications (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email VARCHAR(255) NOT NULL,
	token VARCHAR(64),
	token_hash TEXT,
	code VARCHAR(6),
	code_encrypted TEXT,
	code_expires_at TIMESTAMPTZ,
	session_hash TEXT,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,
	verified BOOLEAN DEFAULT FALSE,
	verified_at TIMESTAMPTZ,
	used_at TIMESTAMPTZ,
	use_code BOOLEAN DEFAULT FALSE,
	code_attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_token
	ON email_verifications(token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verifications_token_hash
	ON email_verifications(token_hash);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email_expires
	ON email_verifications(email, expires_at);

COMMENT ON TABLE email_verifications IS 
'Stores email verification tokens and codes for passwordless authentication';

COMMENT ON COLUMN email_verifications.token_hash IS 
'SHA-256 hash of the magic link token for secure lookup';

COMMENT ON COLUMN email_verifications.code_encrypted IS 
'AES-256-GCM encrypted verification code for additional security';