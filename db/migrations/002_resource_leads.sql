-- Migration: 002_resource_leads.sql
-- Creates the resource_leads table used by the public /leads endpoint.

CREATE TABLE IF NOT EXISTS resource_leads (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT        NOT NULL UNIQUE,
  first_name    TEXT,
  last_name     TEXT,
  business_name TEXT,
  phone         TEXT,
  tech_count    INTEGER,
  source        TEXT        NOT NULL DEFAULT 'resource_hub',
  tools_used    TEXT[]      NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resource_leads_email_idx ON resource_leads(email);
