import 'dotenv/config';
import { getSql } from '../db/connection';

const sql = getSql();

interface SnapshotEvent {
  event: string;
  details: string;
}

interface SeedRow {
  tech_id: number;
  company_id: number;
  snapshot_date: string; // ISO date
  events: SnapshotEvent[];
}

const seedData: SeedRow[] = [
  { tech_id: 1, company_id: 101, snapshot_date: '2026-02-03', events: [{ event: 'job_completed', details: 'Test 1' }] },
  { tech_id: 2, company_id: 102, snapshot_date: '2026-02-03', events: [{ event: 'job_failed', details: 'Test 2' }] },
  { tech_id: 3, company_id: 103, snapshot_date: '2026-02-03', events: [{ event: 'job_completed', details: 'Test 3' }] },
  { tech_id: 4, company_id: 104, snapshot_date: '2026-02-03', events: [{ event: 'job_completed', details: 'Test 4' }] },
  { tech_id: 5, company_id: 105, snapshot_date: '2026-02-03', events: [{ event: 'job_failed', details: 'Test 5' }] },
];

async function seedQueue() {
  for (const row of seedData) {
    try {
      await sql`
        INSERT INTO snapshot_update_queue
          (tech_id, company_id, snapshot_date, scheduled_at, events, attempts)
        VALUES
          (${row.tech_id}, ${row.company_id}, ${row.snapshot_date}, now(), ${JSON.stringify(row.events)}, 0)
      `;
      console.log(`Inserted row for tech_id=${row.tech_id}, company_id=${row.company_id}`);
    } catch (err) {
      console.error('Error inserting row', row, err);
    }
  }
}

seedQueue()
  .then(() => console.log('Snapshot queue seeded successfully.'))
  .catch((err) => console.error('Seeding failed', err));
