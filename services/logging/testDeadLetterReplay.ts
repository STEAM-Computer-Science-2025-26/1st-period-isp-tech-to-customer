import crypto from 'node:crypto';
import { getSql } from '../../db/connection';
import { replayDeadLetterById } from './deadLetter';

async function main() {
  const sql = getSql();

  // Test setup: ensure the required tables exist (migration should create them in real deployments)
  const setupSql = `
    CREATE TABLE IF NOT EXISTS snapshot_update_queue (
      id BIGSERIAL PRIMARY KEY,
      tech_id UUID NOT NULL,
      company_id UUID NOT NULL,
      snapshot_date DATE NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      first_enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_at TIMESTAMPTZ NULL,
      locked_until TIMESTAMPTZ NULL,
      locked_by TEXT NULL,
      job_id UUID NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS snapshot_update_events (
      id BIGSERIAL PRIMARY KEY,
      queue_id BIGINT NOT NULL REFERENCES snapshot_update_queue(id) ON DELETE CASCADE,
      job_id UUID NULL,
      payload JSONB NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS snapshot_update_deadletter (
      id BIGSERIAL PRIMARY KEY,
      tech_id UUID NOT NULL,
      company_id UUID NOT NULL,
      snapshot_date DATE NOT NULL,
      payload JSONB,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      failed_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await (sql as any).unsafe(setupSql);

  // Create a fake dead-letter row for today
  const techId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const snapshotDate = new Date().toISOString().split('T')[0];
  const payload = { job_ids: [crypto.randomUUID(), crypto.randomUUID()] };

  const inserted = await sql`
    INSERT INTO snapshot_update_deadletter (tech_id, company_id, snapshot_date, payload, attempts, last_error, failed_at, created_at)
    VALUES (${techId}, ${companyId}, ${snapshotDate}, ${payload}, 1, 'test-error', NOW(), NOW()) RETURNING id
  `;

  const deadId = inserted[0].id;
  console.log('Inserted dead-letter id:', deadId);

  // Replay it
  const res = await replayDeadLetterById(Number(deadId));
  console.log('Replayed to queue id:', res.queueId);

  // Confirm queue row exists
  const rows = await sql`SELECT * FROM snapshot_update_queue WHERE id = ${res.queueId}`;
  console.log('Queue row:', rows.length ? rows[0] : null);

  // Confirm dead-letter removed
  const check = await sql`SELECT id FROM snapshot_update_deadletter WHERE id = ${deadId}`;
  console.log('Dead-letter still present?', check.length > 0);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
