-- Down migration: 001_initial_schema.down.sql
-- Drops everything created by 001_initial_schema.sql (reverse dependency order).

DROP TABLE IF EXISTS email_verifications;
DROP TABLE IF EXISTS customer_no_shows;
DROP TABLE IF EXISTS customer_communications;
DROP TABLE IF EXISTS job_assignments;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS equipment;
DROP TABLE IF EXISTS customer_locations;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS companies;

DROP TYPE IF EXISTS job_type;
DROP TYPE IF EXISTS job_priority;
DROP TYPE IF EXISTS job_status;
DROP TYPE IF EXISTS customer_type;
DROP TYPE IF EXISTS user_role;
