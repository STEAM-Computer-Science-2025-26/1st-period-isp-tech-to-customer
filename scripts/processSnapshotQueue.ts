import { getSql } from '../db/connection';

(async () => {
  const sql = getSql();

  // snapshot_update_queue
  await sql`
    CREATE TABLE IF NOT EXISTS snapshot_update_queue (
      id BIGSERIAL PRIMARY KEY,
      tech_id BIGINT NOT NULL,
      company_id BIGINT NOT NULL,
      snapshot_date DATE NOT NULL,
      events JSONB NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      failed_at TIMESTAMPTZ DEFAULT now(),
      locked_at TIMESTAMPTZ,
      processed_at TIMESTAMPTZ
    );
  `;

  // snapshot_update_events
  await sql`
    CREATE TABLE IF NOT EXISTS snapshot_update_events (
      id BIGSERIAL PRIMARY KEY,
      tech_id BIGINT NOT NULL,
      company_id BIGINT NOT NULL,
      snapshot_date DATE NOT NULL,
      event JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `;

  // snapshot_update_deadletter
  await sql`
    CREATE TABLE IF NOT EXISTS snapshot_update_deadletter (
      id BIGSERIAL PRIMARY KEY,
      tech_id BIGINT NOT NULL,
      company_id BIGINT NOT NULL,
      snapshot_date DATE NOT NULL,
      events JSONB NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      failed_at TIMESTAMPTZ DEFAULT now()
    );
  `;

  console.log('All snapshot queue tables ensured with required columns.');
})();
