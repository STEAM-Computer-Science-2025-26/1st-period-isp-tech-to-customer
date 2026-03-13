/**
 * db/migrations/scripts/create-migration.js
 *
 * Usage:
 *   pnpm migrate:create <name>
 *   e.g. pnpm migrate:create add_invoice_table
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");

const name = process.argv[2];
if (!name) {
	console.error("Usage: create-migration.js <migration_name>");
	console.error("Example: create-migration.js add_invoice_table");
	process.exit(1);
}

// Find next number
const existing = fs
	.readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d+.*\.sql$/.test(f))
	.sort();

const lastNum =
	existing.length > 0 ? parseInt(existing.at(-1).match(/^(\d+)/)[1], 10) : 0;

const nextNum = String(lastNum + 1).padStart(3, "0");
const slug = name.toLowerCase().replace(/\s+/g, "_");
const filename = `${nextNum}_${slug}.sql`;
const downFilename = `${nextNum}_${slug}.down.sql`;

const upPath = path.join(MIGRATIONS_DIR, filename);
const downPath = path.join(MIGRATIONS_DIR, downFilename);

const upTemplate = `-- Migration: ${filename}
-- Created: ${new Date().toISOString()}
--
-- Write your UP migration SQL here.
-- This file runs inside a transaction — if anything fails, it rolls back.

`;

const downTemplate = `-- Down migration: ${downFilename}
-- Reverts: ${filename}
--
-- Write your DOWN migration SQL here (DROP TABLE, DROP COLUMN, etc.)

`;

fs.writeFileSync(upPath, upTemplate);
fs.writeFileSync(downPath, downTemplate);

console.log(`✅  Created:`);
console.log(`   up:   db/migrations/${filename}`);
console.log(`   down: db/migrations/${downFilename}`);
