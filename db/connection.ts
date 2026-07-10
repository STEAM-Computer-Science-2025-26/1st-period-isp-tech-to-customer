// db/connection.ts
//
// PostgreSQL connection — uses pg.Pool for both serverless and server contexts.
// Works with Supabase, Neon (via pooled connection string), or any standard
// PostgreSQL instance.

import { Pool, type QueryResult, type QueryResultRow } from "pg";

let cachedPool: Pool | null = null;

function maybeAllowSelfSignedCerts(): void {
	const allow = process.env.ALLOW_SELF_SIGNED_CERTS === "true";
	const isProd = process.env.NODE_ENV === "production";
	if (allow && !isProd) {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	}
}

/**
 * Get the shared pg.Pool instance.
 * In serverless/edge contexts, each warm invocation reuses the pool.
 */
export function getPool(): Pool {
	if (cachedPool) return cachedPool;
	maybeAllowSelfSignedCerts();
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set. Cannot create connection pool.");
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
 *
 * Usage:
 *   const sql = getSql();
 *   const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;
 *
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

export async function testConnection(): Promise<{
	success: boolean;
	error?: unknown;
	currentTime?: string;
}> {
	try {
		const pool = getPool();
		const result = await pool.query("SELECT NOW() as current_time");
		console.log("✅ Database connected successfully!");
		console.log("Current database time:", result.rows[0].current_time);
		return { success: true, currentTime: result.rows[0].current_time };
	} catch (error) {
		console.error("❌ Database connection failed:", error);
		return { success: false, error };
	}
}

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

export function rowsToCamelCase<T extends Record<string, unknown>>(
	rows: Record<string, unknown>[]
): T[] {
	return rows.map((row) => toCamelCase<T>(row));
}

export async function queryOne<T extends Record<string, unknown>>(
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

export async function queryAll<T extends Record<string, unknown>>(
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
export function resetSqlClient() {
	cachedPool = null;
}
