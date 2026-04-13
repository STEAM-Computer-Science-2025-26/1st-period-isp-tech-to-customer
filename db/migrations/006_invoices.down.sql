-- Rollback: 006_invoices.sql

DROP TABLE IF EXISTS invoice_line_items;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS invoice_counters;
DROP FUNCTION IF EXISTS next_invoice_number(UUID);
DROP TYPE IF EXISTS invoice_status;
