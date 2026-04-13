// db/index.ts
// Neon HTTP driver only — clean, minimal, typed.

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

let cachedSql: NeonQueryFunction<false, false> | null = null;

function tryLoadDatabaseUrlFromDotenv(): void {
	if (process.env.DATABASE_URL) return;

	const candidates = [
		path.resolve(process.cwd(), ".env.local"),
		path.resolve(process.cwd(), ".env"),
		path.resolve(process.cwd(), "app", ".env.local"),
		path.resolve(process.cwd(), "app", ".env")
	];

	for (const envPath of candidates) {
		if (!fs.existsSync(envPath)) continue;
		dotenv.config({ path: envPath });
		if (process.env.DATABASE_URL) return;
	}
}

export function getSql(): NeonQueryFunction<false, false> {
	tryLoadDatabaseUrlFromDotenv();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL environment variable is not set.");
	}

	if (!cachedSql) {
		cachedSql = neon(databaseUrl);
	}

	return cachedSql;
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<{
	success: boolean;
	error?: unknown;
	currentTime?: string;
}> {
	try {
		const sql = getSql();
		const result = await sql`SELECT NOW() as current_time`;

		return {
			success: true,
			currentTime: result[0]?.current_time
		};
	} catch (error) {
		return { success: false, error };
	}
}

/**
 * Convert snake_case to camelCase
 */
export function toCamelCase<T extends Record<string, unknown>>(
	obj: Record<string, unknown>
): T {
	const result: Record<string, unknown> = {};

	for (const key in obj) {
		const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
			letter.toUpperCase()
		);
		result[camelKey] = obj[key];
	}

	return result as T;
}

/**
 * Convert camelCase to snake_case
 */
export function toSnakeCase<T extends Record<string, unknown>>(
	obj: T
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const key in obj) {
		const snakeKey = key.replace(
			/[A-Z]/g,
			(letter) => `_${letter.toLowerCase()}`
		);
		result[snakeKey] = obj[key];
	}

	return result;
}

/**
 * Convert array of rows to camelCase
 */
export function rowsToCamelCase<T extends Record<string, unknown>>(
	rows: Record<string, unknown>[]
): T[] {
	return rows.map((row) => toCamelCase<T>(row));
}

/**
 * Query one row
 */
export async function queryOne<T>(
	queryFn: (sql: NeonQueryFunction<false, false>) => Promise<T[]>
): Promise<T | null> {
	const sql = getSql();
	const rows = await queryFn(sql);
	return rows.length > 0 ? rows[0] : null;
}

/**
 * Query all rows
 */
export async function queryAll<T>(
	queryFn: (sql: NeonQueryFunction<false, false>) => Promise<T[]>
): Promise<T[]> {
	const sql = getSql();
	return queryFn(sql);
}

/**
 * Execute raw SQL with positional parameters ($1, $2, ...).
 * Parameters must appear in order ($1 first, $2 second, etc.).
 * Reconstructs the call as a tagged template literal so Neon actually executes it.
 */
export async function query(
	sqlString: string,
	params: unknown[] = []
): Promise<unknown[]> {
	const client = getSql();

	// Build a TemplateStringsArray + values array by scanning for $1, $2, ...
	// This reconstructs the original tagged template invocation so Neon
	// correctly interprets `sql.unsafe()` fragments embedded in values.
	const placeholderRe = /\$([0-9]+)/g;
	const parts: string[] = [];
	const values: unknown[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = placeholderRe.exec(sqlString)) !== null) {
		const idx = Number(match[1]) - 1; // $1 -> params[0]
		parts.push(sqlString.slice(lastIndex, match.index));
		values.push(params[idx]);
		lastIndex = placeholderRe.lastIndex;
	}

	// push remaining tail
	parts.push(sqlString.slice(lastIndex));

	// TemplateStringsArray requires a `raw` property that's an array of raw strings
	const template = Object.assign(parts, {
		raw: parts.slice()
	}) as unknown as TemplateStringsArray;

	const result = await (
		client as unknown as (...args: unknown[]) => Promise<unknown>
	)(template, ...values);

	if (Array.isArray(result)) return result;
	if (
		result &&
		typeof result === "object" &&
		Array.isArray((result as any).rows)
	)
		return (result as any).rows;

	return [];
}
