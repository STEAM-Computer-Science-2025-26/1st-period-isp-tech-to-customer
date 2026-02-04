// Update the import path if necessary, or create the module if missing
import { getSql } from '../db/connection';
// If '../db/connection' is not correct, adjust the path to where your connection file is located.

(async () => {
  const sql = getSql();

  // snapshot_update_queue
  await sql`
    CREATE TABLE IF NOT EXISTS snapshot_update_queue (
      tech_id bigint NOT NULL,
      company_id bigint NOT NULL,
      snapshot_date date NOT NULL,
      first_enqueued_at timestamptz NOT NULL DEFAULT now(),
      scheduled_at timestamptz NOT NULL,
      locked_until timestamptz,
      attempts int NOT NULL DEFAULT 0,
      PRIMARY KEY (tech_id, company_id, snapshot_date)
    );
  `;

  // snapshot_update_events
  await sql`
    CREATE TABLE IF NOT EXISTS snapshot_update_events (
      id bigserial PRIMARY KEY,
      job_id bigint NOT NULL,
      queue_key jsonb NOT NULL,
      payload jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  // snapshot_update_deadletter
  await sql`
    CREATE TABLE IF NOT EXISTS snapshot_update_deadletter (
      tech_id bigint NOT NULL,
      company_id bigint NOT NULL,
      snapshot_date date NOT NULL,
      events jsonb NOT NULL,
      attempts int NOT NULL,
      failed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tech_id, company_id, snapshot_date)
    );
  `;

  console.log('All snapshot queue tables ensured.');
})();
