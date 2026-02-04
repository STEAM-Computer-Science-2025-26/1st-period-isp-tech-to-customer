// This helper previously created the snapshot_update_queue table at runtime.
// Runtime schema creation is unsafe in production. Use migrations instead.
console.log('This helper is deprecated. Apply migrations via `npx tsx scripts/applyMigration.ts` to create the snapshot_update_queue table.');
process.exit(0);
