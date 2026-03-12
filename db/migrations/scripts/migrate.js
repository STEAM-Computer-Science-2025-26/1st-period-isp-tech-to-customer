/**
 * db/migrations/scripts/migrate.js
 *
 * Usage:
 *   pnpm migrate:up      – run all pending migrations
 *   pnpm migrate:down    – revert the last applied migration
 *   pnpm migrate:status  – show which migrations have/haven't run
 */

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");

// Load .env / .env.local
for (const f of [".env.local", ".env"]) {
	const p = path.resolve(process.cwd(), f);
	if (fs.existsSync(p)) {
		dotenv.config({ path: p });
		break;
	}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("❌  DATABASE_URL is not set.");
	process.exit(1);
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getClient() {
	const client = new pg.Client({ connectionString: DATABASE_URL });
	await client.connect();
	return client;
}

async function ensureMigrationsTable(client) {
	const { rows } = await client.query(
		"SELECT to_regclass('public.schema_migrations') AS table_name"
	);

	if (!rows[0]?.table_name) {
		await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         SERIAL PRIMARY KEY,
        filename   TEXT        NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
		return;
	}

	const { rows: columns } = await client.query(
		"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schema_migrations'"
	);
	const columnSet = new Set(columns.map((col) => col.column_name));

	if (!columnSet.has("filename")) {
		await client.query("ALTER TABLE schema_migrations ADD COLUMN filename TEXT");
		const fallback = [
			"name",
			"migration",
			"migration_name",
			"file",
			"file_name"
		].find((col) => columnSet.has(col));
		if (fallback) {
			await client.query(
				`UPDATE schema_migrations SET filename = ${fallback} WHERE filename IS NULL`
			);
		}
		const { rows: nullCounts } = await client.query(
			"SELECT COUNT(*)::int AS count FROM schema_migrations WHERE filename IS NULL"
		);
		if (nullCounts[0]?.count === 0) {
			await client.query(
				"ALTER TABLE schema_migrations ALTER COLUMN filename SET NOT NULL"
			);
		}
		await client.query(
			"CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_filename_idx ON schema_migrations(filename)"
		);
	}
}

function parseMigrationVersion(filename) {
	const match = /^\d+/.exec(filename);
	return match ? Number(match[0]) : null;
}

async function getMigrationColumns(client) {
	const { rows } = await client.query(
		"SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schema_migrations'"
	);
	return rows.map((row) => ({
		name: row.column_name,
		isNullable: row.is_nullable === "YES"
	}));
}

async function getMigrationColumn(client) {
	const columns = await getMigrationColumns(client);
	const columnSet = new Set(columns.map((col) => col.name));

	if (columnSet.has("filename")) return "filename";
	if (columnSet.has("version")) return "version";
	for (const candidate of [
		"name",
		"migration",
		"migration_name",
		"file",
		"file_name"
	]) {
		if (columnSet.has(candidate)) return candidate;
	}

	return null;
}

async function getApplied(client, migrationColumn) {
	const column = migrationColumn ?? (await getMigrationColumn(client));
	if (!column) {
		throw new Error("schema_migrations has no recognizable migration column");
	}
	const { rows } = await client.query(
		`SELECT ${column} AS filename FROM schema_migrations ORDER BY ${column}`
	);
	if (column === "version") {
		return new Set(
			rows
				.map((r) => (r.filename === null ? null : Number(r.filename)))
				.filter((value) => Number.isFinite(value))
		);
	}
	return new Set(rows.map((r) => r.filename).filter(Boolean));
}

function isApplied(applied, filename, migrationColumn) {
	if (migrationColumn === "version") {
		const version = parseMigrationVersion(filename);
		return version !== null && applied.has(version);
	}
	return applied.has(filename);
}

/** All numbered *.sql files in the migrations dir, sorted. */
function getMigrationFiles() {
	return fs
		.readdirSync(MIGRATIONS_DIR)
		.filter((f) => /^\d+.*\.sql$/.test(f) && !/\.down\.sql$/.test(f))
		.sort();
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function status() {
	const client = await getClient();
	await ensureMigrationsTable(client);
	const migrationColumn = await getMigrationColumn(client);
	if (!migrationColumn) {
		console.error("❌  schema_migrations has no recognizable migration column.");
		await client.end();
		process.exit(1);
	}
	const applied = await getApplied(client, migrationColumn);
	const files = getMigrationFiles();

	if (files.length === 0) {
		console.log("No migration files found.");
	} else {
		console.log("\nMigration status:\n");
		for (const f of files) {
			const mark = isApplied(applied, f, migrationColumn)
				? "✅ applied"
				: "⏳ pending";
			console.log(`  ${mark}  ${f}`);
		}
		console.log();
	}

	await client.end();
}

async function up() {
	const client = await getClient();
	await ensureMigrationsTable(client);
	const migrationColumn = await getMigrationColumn(client);
	if (!migrationColumn) {
		console.error("❌  schema_migrations has no recognizable migration column.");
		await client.end();
		process.exit(1);
	}
	const applied = await getApplied(client, migrationColumn);
	const pending = getMigrationFiles().filter(
		(f) => !isApplied(applied, f, migrationColumn)
	);

	if (pending.length === 0) {
		console.log("✅  All migrations are already applied.");
		await client.end();
		return;
	}

	for (const filename of pending) {
		const sqlPath = path.join(MIGRATIONS_DIR, filename);
		const sql = fs.readFileSync(sqlPath, "utf8");
		console.log(`⬆  Running: ${filename}`);
		try {
			await client.query("BEGIN");
			await client.query(sql);
			const columns = await getMigrationColumns(client);
			const columnSet = new Set(columns.map((col) => col.name));
			const insertColumns = [migrationColumn];
			const insertValues = [];

			if (migrationColumn === "version") {
				const version = parseMigrationVersion(filename);
				if (version === null) {
					throw new Error(`Migration filename ${filename} has no numeric prefix`);
				}
				insertValues.push(version);
			} else {
				insertValues.push(filename);
			}

			if (
				columnSet.has("version") &&
				migrationColumn !== "version" &&
				columns.find((col) => col.name === "version")?.isNullable === false
			) {
				const version = parseMigrationVersion(filename);
				if (version === null) {
					throw new Error(`Migration filename ${filename} has no numeric prefix`);
				}
				insertColumns.push("version");
				insertValues.push(version);
			}

			await client.query(
				`INSERT INTO schema_migrations (${insertColumns.join(", ")}) VALUES (${insertColumns
					.map((_, index) => `$${index + 1}`)
					.join(", ")})`,
				insertValues
			);
			await client.query("COMMIT");
			console.log(`✅  Applied: ${filename}`);
		} catch (err) {
			await client.query("ROLLBACK");
			console.error(`❌  Failed on ${filename}:`, err.message);
			await client.end();
			process.exit(1);
		}
	}

	await client.end();
}

async function down() {
	const client = await getClient();
	await ensureMigrationsTable(client);
	const migrationColumn = await getMigrationColumn(client);
	if (!migrationColumn) {
		console.error("❌  schema_migrations has no recognizable migration column.");
		await client.end();
		process.exit(1);
	}
	const applied = await getApplied(client, migrationColumn);

	if (applied.size === 0) {
		console.log("Nothing to revert.");
		await client.end();
		return;
	}

	// Revert the most recently applied migration
	const appliedList = [...applied];
	const last = appliedList.sort().at(-1);
	const lastFilename =
		migrationColumn === "version"
			? getMigrationFiles().find(
					(file) => parseMigrationVersion(file) === last
			  )
			: last;
	const downFile = lastFilename.replace(/\.sql$/, ".down.sql");
	const downPath = path.join(MIGRATIONS_DIR, downFile);

	if (!fs.existsSync(downPath)) {
		console.error(
			`❌  No down migration found for ${lastFilename}\n   Create ${downFile} to enable rollback.`
		);
		await client.end();
		process.exit(1);
	}

	const sql = fs.readFileSync(downPath, "utf8");
	console.log(`⬇  Reverting: ${lastFilename}`);
	try {
		await client.query("BEGIN");
		await client.query(sql);
		const column = migrationColumn ?? "filename";
		const deleteValue =
			migrationColumn === "version" ? last : lastFilename;
		await client.query(`DELETE FROM schema_migrations WHERE ${column} = $1`, [
			deleteValue
		]);
		await client.query("COMMIT");
		console.log(`✅  Reverted: ${lastFilename}`);
	} catch (err) {
		await client.query("ROLLBACK");
		console.error(`❌  Rollback failed:`, err.message);
		await client.end();
		process.exit(1);
	}

	await client.end();
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const command = process.argv[2];
if (command === "up") await up();
else if (command === "down") await down();
else if (command === "status") await status();
else {
	console.error("Usage: migrate.js <up|down|status>");
	process.exit(1);
}
