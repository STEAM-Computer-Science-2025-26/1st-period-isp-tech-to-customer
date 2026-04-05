-- Migration: 006_invoices.sql
-- Invoice lifecycle tables: invoices, invoice_line_items.
-- Sequential per-company invoice numbering via invoice_counters + next_invoice_number().

-- ============================================================
-- Status enum
-- ============================================================

CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'partial', 'paid', 'overdue', 'void');

-- ============================================================
-- Sequential invoice number counter per company
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_counters (
  company_id   UUID    PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  last_number  INTEGER NOT NULL DEFAULT 0
);

-- Atomically increments the counter and returns the formatted invoice number.
-- Example: INV-0001, INV-0047, INV-1000
CREATE OR REPLACE FUNCTION next_invoice_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO invoice_counters (company_id, last_number)
  VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO UPDATE
    SET last_number = invoice_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'INV-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- ============================================================
-- invoices
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id                       UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id               UUID           NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id              UUID           NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  job_id                   UUID           REFERENCES jobs(id) ON DELETE SET NULL,
  estimate_id              UUID,          -- soft ref; estimates table may not always exist
  invoice_number           TEXT           NOT NULL,
  status                   invoice_status NOT NULL DEFAULT 'draft',
  subtotal                 NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate                 NUMERIC(6, 4)  NOT NULL DEFAULT 0,
  tax_amount               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total                    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance_due              NUMERIC(12, 2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  issue_date               DATE           NOT NULL DEFAULT CURRENT_DATE,
  due_date                 DATE,
  notes                    TEXT,
  sent_at                  TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  stripe_payment_intent_id TEXT,
  created_by               UUID           REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS invoices_company_id_idx  ON invoices(company_id);
CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS invoices_job_id_idx      ON invoices(job_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx      ON invoices(status);
CREATE INDEX IF NOT EXISTS invoices_due_date_idx    ON invoices(due_date);

-- ============================================================
-- invoice_line_items
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id                UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id        UUID           NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  pricebook_item_id UUID,          -- soft ref; pricebook row may be deleted
  item_type         TEXT           NOT NULL CHECK (item_type IN ('labor', 'part', 'bundle', 'custom')),
  name              TEXT           NOT NULL,
  description       TEXT,
  quantity          NUMERIC(10, 3) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(12, 2) NOT NULL,
  unit_cost         NUMERIC(12, 2),
  taxable           BOOLEAN        NOT NULL DEFAULT TRUE,
  sort_order        INTEGER        NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_id_idx ON invoice_line_items(invoice_id);
