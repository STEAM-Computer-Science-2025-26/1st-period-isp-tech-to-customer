#!/usr/bin/env node
// scripts/create-migration.js
// Creates a new migration file with proper naming

import { writeFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createMigration() {
	const migrationName = process.argv[2];

	if (!migrationName) {
		console.error("❌ Error: Migration name is required");
		console.log("\nUsage:");
		console.log("  npm run migrate:create <migration_name>");
		console.log("\nExample:");
		console.log("  npm run migrate:create add_customer_notes");
		process.exit(1);
	}

	// Get next migration number
	const migrationsDir = join(__dirname, "..", "migrations");
	const files = await readdir(migrationsDir);

	const migrationNumbers = files
		.filter((f) => f.match(/^\d+_/))
		.map((f) => parseInt(f.split("_")[0]))
		.filter((n) => !isNaN(n));

	const nextNumber =
		migrationNumbers.length > 0 ? Math.max(...migrationNumbers) + 1 : 1;

	const version = String(nextNumber).padStart(3, "0");
	const filename = `${version}_${migrationName}.sql`;
	const filepath = join(migrationsDir, filename);

	const template = `-- Migration: ${version}_${migrationName}.sql
-- Description: [Add description here]
-- Created: ${new Date().toISOString().split("T")[0]}

-- Add your migration SQL here

-- Example:
-- ALTER TABLE your_table ADD COLUMN new_column TEXT;

-- Remember to:
-- 1. Keep migrations atomic (one logical change)
-- 2. Test locally before committing
-- 3. Make changes backward compatible when possible
-- 4. Add comments for complex operations
`;

	await writeFile(filepath, template, "utf8");

	console.log(`\n✅ Created migration: ${filename}`);
	console.log(`📝 Edit the file at: migrations/${filename}`);
	console.log(`\nWhen ready, run: npm run migrate:up\n`);
}

createMigration().catch((error) => {
	console.error("❌ Failed to create migration:", error);
	process.exit(1);
});
