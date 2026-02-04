#!/usr/bin/env node
import { getSql } from '../db/connection';
import { replayDeadLetterById } from '../services/logging/deadLetter';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: replayDeadLetter.ts <deadletter-id>');
    process.exit(1);
  }
  const id = Number(arg);
  if (!Number.isFinite(id)) {
    console.error('Invalid id:', arg);
    process.exit(2);
  }

  console.log('Replaying dead-letter id', id);
  try {
    const res = await replayDeadLetterById(id);
    console.log('Replayed to queue id', res.queueId);
  } catch (err) {
    console.error('Replay failed:', err);
    process.exit(3);
  }
}

main().catch((err) => { console.error(err); process.exit(4); });
