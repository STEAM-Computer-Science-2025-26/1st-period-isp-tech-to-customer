// db/index.ts
// PostgreSQL connection — works with Supabase or any standard PostgreSQL.
// Uses pg.Pool for connection management.

import { Pool, type QueryResult, type QueryResultRow } from "pg";

let cachedPool: Pool | null = null;

export function getPool(): Pool {
	if (cachedPool) return cachedPool;
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL environment variable is not set.");
	}
	cachedPool = new Pool({
		connectionString: databaseUrl,
		max: 10,
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 10_000
	});
	return cachedPool;
}

/**
 * Tagged template SQL function — drop-in replacement for Neon's `sql` tagged template.
 * Values are automatically parameterized — no SQL injection risk.
 */
export function getSql() {
	const pool = getPool();

	const sql = async (
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<QueryResultRow[]> => {
		let queryText = "";
		for (let i = 0; i < strings.length; i++) {
			queryText += strings[i];
			if (i < values.length) {
				queryText += `$${i + 1}`;
			}
		}
		const result: QueryResult = await pool.query(
			queryText,
			values as unknown[]
		);
		return result.rows;
	};

	return sql;
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
	queryFn: (
		sql: (
			strings: TemplateStringsArray,
			...values: unknown[]
		) => Promise<QueryResultRow[]>
	) => Promise<T[]>
): Promise<T | null> {
	const sql = getSql();
	const rows = await queryFn(sql);
	return rows.length > 0 ? rows[0] : null;
}

/**
 * Query all rows
 */
export async function queryAll<T>(
	queryFn: (
		sql: (
			strings: TemplateStringsArray,
			...values: unknown[]
		) => Promise<QueryResultRow[]>
	) => Promise<T[]>
): Promise<T[]> {
	const sql = getSql();
	return queryFn(sql);
}

/**
 * Execute raw SQL with positional parameters ($1, $2, ...).
 * Uses pg.Pool directly — parameters are passed as-is.
 */
export async function query(
	sqlString: string,
	params: unknown[] = []
): Promise<unknown[]> {
	const pool = getPool();
	const result = await pool.query(sqlString, params as unknown[]);
	return result.rows;
}
