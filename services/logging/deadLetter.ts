import { getSql } from '../../db/connection';

/**
 * Replay a dead-letter row by id: move its payload back into the snapshot_update_queue
 * for reprocessing. This is intended as an administrative corrective action.
 */
export async function replayDeadLetterById(deadId: number) {
    const sql = getSql();

    const rows = await sql`
        SELECT id, tech_id, company_id, snapshot_date, payload, attempts
        FROM snapshot_update_deadletter
        WHERE id = ${deadId}
        LIMIT 1
    `;
    if (!rows || rows.length === 0) {
        throw new Error(`dead-letter id=${deadId} not found`);
    }

    const row = rows[0];
    const techId = row.tech_id;
    const companyId = row.company_id;
    const snapshotDate = row.snapshot_date;
    const payload = row.payload || null;

    // Insert or upsert into the queue with immediate scheduled_at
    const scheduledAt = new Date().toISOString();
    const q = await sql`
        INSERT INTO snapshot_update_queue (tech_id, company_id, snapshot_date, scheduled_at, first_enqueued_at, attempts, job_id, created_at)
        VALUES (${techId}, ${companyId}, ${snapshotDate}, ${scheduledAt}, NOW(), 0, NULL, NOW())
        ON CONFLICT (tech_id, company_id, snapshot_date) DO UPDATE
        SET scheduled_at = LEAST(${scheduledAt}, snapshot_update_queue.first_enqueued_at + (30 || ' seconds')::interval)
        RETURNING id
    `;

    const queueId = q[0]?.id;
    // If the payload contains job ids array, record events for provenance
    try {
        if (payload) {
            // payload may be arbitrary; try to extract job_ids if present
            const jobIds = Array.isArray(payload.job_ids) ? payload.job_ids : null;
            if (jobIds && jobIds.length) {
                for (const jid of jobIds) {
                    await sql`
                        INSERT INTO snapshot_update_events (queue_id, job_id, payload, created_at)
                        VALUES (${queueId}, ${jid}, ${null}, NOW())
                    `;
                }
            } else {
                // store entire payload as a single event for traceability
                await sql`
                    INSERT INTO snapshot_update_events (queue_id, job_id, payload, created_at)
                    VALUES (${queueId}, ${null}, ${payload}, NOW())
                `;
            }
        }

        // Remove from dead-letter after successful enqueue
        await sql`DELETE FROM snapshot_update_deadletter WHERE id = ${deadId}`;
    } catch (err) {
        throw new Error(`failed to replay dead-letter ${deadId}: ${String(err)}`);
    }

    return { queueId };
}

export async function replayDeadLettersByDate(date: string, limit = 100) {
    const sql = getSql();
    const rows = await sql`
        SELECT id FROM snapshot_update_deadletter WHERE snapshot_date = ${date} ORDER BY failed_at ASC LIMIT ${limit}
    `;
    const results = [];
    for (const r of rows) {
        try {
            const res = await replayDeadLetterById(Number(r.id));
            results.push({ id: r.id, ok: true, queueId: res.queueId });
        } catch (err) {
            results.push({ id: r.id, ok: false, error: String(err) });
        }
    }
    return results;
}
