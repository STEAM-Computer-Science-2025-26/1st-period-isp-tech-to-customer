#!/usr/bin/env node
// scripts/migrate.js
// Simple migration runner - run with: node scripts/migrate.js up|down|status

import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import pg from "pg";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
	ssl:
		process.env.NODE_ENV === "production"
			? { rejectUnauthorized: false }
			: false
});

// Calculate SHA-256 checksum of file
function calculateChecksum(content) {
	return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

// Ensure migration tracking table exists
async function ensureMigrationTable() {
	const client = await pool.connect();
	try {
		await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        checksum VARCHAR(64),
        execution_time_ms INTEGER
      )
    `);
		console.log("✅ Migration tracking table ready");
	} finally {
		client.release();
	}
}

// Get list of applied migrations
async function getAppliedMigrations() {
	const result = await pool.query(
		"SELECT version, checksum FROM schema_migrations ORDER BY version"
	);
	return new Map(result.rows.map((row) => [row.version, row.checksum]));
}

// Get list of migration files
async function getMigrationFiles() {
	const migrationsDir = join(__dirname, "..", "migrations");
	const files = await readdir(migrationsDir);

	return files
		.filter((f) => f.endsWith(".sql") && f !== "000_migration_tracker.sql")
		.sort()
		.map((f) => {
			const match = f.match(/^(\d+)_(.+)\.sql$/);
			if (!match) throw new Error(`Invalid migration filename: ${f}`);
			return {
				version: match[1],
				name: match[2],
				filename: f,
				path: join(migrationsDir, f)
			};
		});
}

// Run a single migration
async function runMigration(migration, direction = "up") {
	const client = await pool.connect();
	const startTime = Date.now();

	try {
		console.log(
			`\n📦 Running migration ${migration.version}: ${migration.name}`
		);

		const sql = await readFile(migration.path, "utf8");
		const checksum = calculateChecksum(sql);

		await client.query("BEGIN");

		// Execute the migration SQL
		await client.query(sql);

		// Record in migration table
		await client.query(
			`INSERT INTO schema_migrations (version, name, checksum, execution_time_ms)
       VALUES ($1, $2, $3, $4)`,
			[migration.version, migration.name, checksum, Date.now() - startTime]
		);

		await client.query("COMMIT");

		console.log(
			`✅ Migration ${migration.version} applied successfully (${Date.now() - startTime}ms)`
		);
		return true;
	} catch (error) {
		await client.query("ROLLBACK");
		console.error(`❌ Migration ${migration.version} failed:`, error.message);
		throw error;
	} finally {
		client.release();
	}
}

// Migrate up
async function migrateUp() {
	await ensureMigrationTable();

	const applied = await getAppliedMigrations();
	const migrations = await getMigrationFiles();

	const pending = migrations.filter((m) => !applied.has(m.version));

	if (pending.length === 0) {
		console.log("\n✅ No pending migrations. Database is up to date.");
		return;
	}

	console.log(`\n📋 Found ${pending.length} pending migration(s)`);

	for (const migration of pending) {
		await runMigration(migration);
	}

	console.log("\n✅ All migrations applied successfully!");
}

// Migrate down (rollback last migration)
async function migrateDown() {
	await ensureMigrationTable();

	const applied = await getAppliedMigrations();

	if (applied.size === 0) {
		console.log("\n⚠️  No migrations to rollback.");
		return;
	}

	const versions = Array.from(applied.keys()).sort().reverse();
	const lastVersion = versions[0];

	console.log(`\n⚠️  WARNING: Rolling back migration ${lastVersion}`);
	console.log("⚠️  This operation cannot be undone automatically.");
	console.log("⚠️  Make sure you have a database backup!");

	// In production, you'd want to create specific rollback SQL files
	// For now, just remove from tracking table
	await pool.query("DELETE FROM schema_migrations WHERE version = $1", [
		lastVersion
	]);

	console.log(`\n✅ Migration ${lastVersion} rolled back from tracking table`);
	console.log("⚠️  Note: You must manually revert database changes");
}

// Show migration status
async function showStatus() {
	await ensureMigrationTable();

	const applied = await getAppliedMigrations();
	const migrations = await getMigrationFiles();

	console.log("\n📊 Migration Status:\n");
	console.log("Version | Name                          | Status   | Checksum");
	console.log(
		"--------|-------------------------------|----------|------------------"
	);

	for (const migration of migrations) {
		const isApplied = applied.has(migration.version);
		const status = isApplied ? "✅ Applied" : "⏳ Pending";
		const checksum = isApplied
			? applied.get(migration.version).slice(0, 8)
			: "—";

		console.log(
			`${migration.version.padEnd(7)} | ${migration.name.padEnd(29)} | ${status.padEnd(8)} | ${checksum}`
		);
	}

	console.log(
		`\nTotal: ${migrations.length} migrations (${applied.size} applied, ${migrations.length - applied.size} pending)`
	);
}

// Main
async function main() {
	const command = process.argv[2];

	try {
		switch (command) {
			case "up":
				await migrateUp();
				break;
			case "down":
				await migrateDown();
				break;
			case "status":
				await showStatus();
				break;
			default:
				console.log(`
Migration Runner

Usage:
  node scripts/migrate.js <command>

Commands:
  up       - Apply all pending migrations
  down     - Rollback the last migration (removes from tracking only)
  status   - Show current migration status

Examples:
  node scripts/migrate.js up
  node scripts/migrate.js status
  node scripts/migrate.js down
        `);
				process.exit(1);
		}

		await pool.end();
		process.exit(0);
	} catch (error) {
		console.error("\n❌ Migration failed:", error);
		await pool.end();
		process.exit(1);
	}
}

main();
