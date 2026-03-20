-- Migration: 001_initial_schema.sql
-- Initial database schema for Tech to Customer HVAC management platform.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- companies
CREATE TABLE IF NOT EXISTS companies (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT        NOT NULL,
  dispatch_settings   JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- users
CREATE TYPE user_role AS ENUM ('dev', 'admin', 'employee');

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'employee',
  company_id    UUID        REFERENCES companies(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx      ON users(email);
CREATE INDEX IF NOT EXISTS users_company_id_idx ON users(company_id);

-- customers
CREATE TYPE customer_type AS ENUM ('residential', 'commercial');

CREATE TABLE IF NOT EXISTS customers (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name          TEXT          NOT NULL,
  last_name           TEXT          NOT NULL,
  company_name        TEXT,
  customer_type       customer_type NOT NULL DEFAULT 'residential',
  email               TEXT,
  phone               TEXT,
  alt_phone           TEXT,
  address             TEXT,
  city                TEXT,
  state               TEXT,
  zip                 TEXT,
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  geocoding_status    TEXT          NOT NULL DEFAULT 'pending',
  notes               TEXT,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  no_show_count       INTEGER       NOT NULL DEFAULT 0,
  created_by_user_id  UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_company_id_idx ON customers(company_id);
CREATE INDEX IF NOT EXISTS customers_email_idx      ON customers(email);

--employees
CREATE TABLE IF NOT EXISTS employees (
  id                       UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID              REFERENCES users(id) ON DELETE SET NULL,
  company_id               UUID              NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                     TEXT              NOT NULL,
  email                    TEXT,
  role                     TEXT,
  phone                    TEXT,
  skills                   JSONB             NOT NULL DEFAULT '[]',
  skill_level              JSONB             NOT NULL DEFAULT '{}',
  home_address             TEXT,
  latitude                 DOUBLE PRECISION,
  longitude                DOUBLE PRECISION,
  location_updated_at      TIMESTAMPTZ,
  is_available             BOOLEAN           NOT NULL DEFAULT TRUE,
  availability_updated_at  TIMESTAMPTZ,
  current_job_id           UUID,
  current_jobs_count       INTEGER           NOT NULL DEFAULT 0,
  max_concurrent_jobs      INTEGER           NOT NULL DEFAULT 1,
  max_travel_distance_miles INTEGER          NOT NULL DEFAULT 50,
  is_active                BOOLEAN           NOT NULL DEFAULT TRUE,
  rating                   NUMERIC(3, 2)     NOT NULL DEFAULT 0,
  last_job_completed_at    TIMESTAMPTZ,
  internal_notes           TEXT,
  created_by_user_id       UUID              REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employees_company_id_idx   ON employees(company_id);
CREATE INDEX IF NOT EXISTS employees_is_available_idx ON employees(is_available);

-- customer_locations
CREATE TABLE IF NOT EXISTS customer_locations (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id      UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  company_id       UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label            TEXT,
  address          TEXT        NOT NULL,
  city             TEXT,
  state            TEXT,
  zip              TEXT,
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  geocoding_status TEXT        NOT NULL DEFAULT 'pending',
  access_notes     TEXT,
  gate_code        TEXT,
  has_pets         BOOLEAN     NOT NULL DEFAULT FALSE,
  is_primary       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_locations_customer_id_idx ON customer_locations(customer_id);
CREATE INDEX IF NOT EXISTS customer_locations_company_id_idx  ON customer_locations(company_id);

-- equipment
CREATE TABLE IF NOT EXISTS equipment (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id       UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  location_id       UUID        REFERENCES customer_locations(id) ON DELETE SET NULL,
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_type    TEXT        NOT NULL,
  manufacturer      TEXT,
  model_number      TEXT,
  serial_number     TEXT,
  install_date      DATE,
  warranty_expiry   DATE,
  last_service_date DATE,
  condition         TEXT,
  refrigerant_type  TEXT,
  notes             TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS equipment_customer_id_idx ON equipment(customer_id);
CREATE INDEX IF NOT EXISTS equipment_company_id_idx  ON equipment(company_id);

-- jobs
CREATE TYPE job_status   AS ENUM ('unassigned', 'assigned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE job_priority AS ENUM ('low', 'medium', 'high', 'emergency');
CREATE TYPE job_type     AS ENUM ('installation', 'repair', 'maintenance', 'inspection');

CREATE TABLE IF NOT EXISTS jobs (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id      UUID         REFERENCES customers(id) ON DELETE SET NULL,
  customer_name    TEXT         NOT NULL,
  address          TEXT,
  phone            TEXT,
  job_type         job_type     NOT NULL,
  status           job_status   NOT NULL DEFAULT 'unassigned',
  priority         job_priority NOT NULL DEFAULT 'medium',
  assigned_tech_id UUID         REFERENCES employees(id) ON DELETE SET NULL,
  scheduled_time   TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  initial_notes    TEXT,
  completion_notes TEXT,
  required_skills  JSONB        NOT NULL DEFAULT '[]',
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  geocoding_status TEXT         NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_company_id_idx       ON jobs(company_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx           ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_assigned_tech_id_idx ON jobs(assigned_tech_id);
CREATE INDEX IF NOT EXISTS jobs_scheduled_time_idx   ON jobs(scheduled_time);

-- job_assignments
-- Audit log of every assignment/reassignment decision.

CREATE TABLE IF NOT EXISTS job_assignments (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id              UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tech_id             UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assigned_by_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  is_manual_override  BOOLEAN     NOT NULL DEFAULT FALSE,
  override_reason     TEXT,
  scoring_details     JSONB       NOT NULL DEFAULT '{}',
  job_priority        job_priority,
  job_type            job_type,
  is_emergency        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_assignments_job_id_idx  ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS job_assignments_tech_id_idx ON job_assignments(tech_id);

-- customer_communications
CREATE TABLE IF NOT EXISTS customer_communications (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id       UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  direction    TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel      TEXT        NOT NULL CHECK (channel IN ('phone', 'email', 'sms', 'in_person')),
  summary      TEXT        NOT NULL,
  notes        TEXT,
  performed_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comms_customer_id_idx ON customer_communications(customer_id);
CREATE INDEX IF NOT EXISTS comms_company_id_idx  ON customer_communications(company_id);

-- customer_no_shows
CREATE TABLE IF NOT EXISTS customer_no_shows (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id      UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- email_verifications
CREATE TABLE IF NOT EXISTS email_verifications (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT        NOT NULL,
  token_hash  TEXT        NOT NULL,
  verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verifications_email_idx ON email_verifications(email);
