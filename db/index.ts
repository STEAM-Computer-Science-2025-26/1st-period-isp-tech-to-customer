// db/index.ts
// STANDARDIZED - Uses Neon HTTP driver only
// Works in serverless (Next.js) and traditional Node.js (Fastify)

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import dotenv from "dotenv";
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
		throw new Error(
			"DATABASE_URL environment variable is not set. Cannot create SQL client."
		);
	}

	if (!cachedSql) {
		cachedSql = neon(databaseUrl);
	}

	return cachedSql;
}

/**
 * Execute a query and return all rows
 * @deprecated Use getSql() directly for better type safety
 */
export async function query<T = any>(
	text: string,
	params?: unknown[]
): Promise<T[]> {
	const sql = getSql();
	
	// Neon uses tagged template literals, but we need to support parameterized queries
	// for backward compatibility. Convert $1, $2 syntax to work with Neon.
	
	if (params && params.length > 0) {
		// Build a query using Neon's tagged template format
		// This is a compatibility layer - new code should use getSql() directly
		const values = params;
		let query = text;
		
		// Replace $1, $2, etc with actual values
		for (let i = 0; i < values.length; i++) {
			query = query.replace(new RegExp(`\\$${i + 1}\\b`, 'g'), `$${i + 1}`);
		}
		
		// Execute raw query with Neon
		// Note: This uses Neon's array parameter syntax
		const result = await (sql as any)(text, params);
		return Array.isArray(result) ? result : [result];
	}
	
	// For queries without parameters
	const result = await (sql as any)(text, []);
	return Array.isArray(result) ? result : [result];
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
		console.log("✅ Database connected successfully!");
		console.log("Current database time:", result[0].current_time);
		return { success: true, currentTime: result[0].current_time };
	} catch (error) {
		console.error("❌ Database connection failed:", error);
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
 * Query one row (returns null if not found)
 */
export async function queryOne<T extends Record<string, unknown>>(
	queryFn: (sql: NeonQueryFunction<false, false>) => Promise<T[]>
): Promise<T | null> {
	const sql = getSql();
	const rows = await queryFn(sql);
	return rows.length > 0 ? rows[0] : null;
}

/**
 * Query all rows
 */
export async function queryAll<T extends Record<string, unknown>>(
	queryFn: (sql: NeonQueryFunction<false, false>) => Promise<T[]>
): Promise<T[]> {
	const sql = getSql();
	return queryFn(sql);
}

/**
 * Get a client for transactions
 * Note: Neon HTTP doesn't support traditional transactions like pg Pool
 * For true ACID transactions, consider using Neon's WebSocket mode or pg Pool
 * 
 * This is a compatibility shim that executes queries immediately
 */
export async function getClient() {
	const sql = getSql();
	
	return {
		query: async (text: string, params?: unknown[]) => {
			const result = await query(text, params);
			return { rows: result, rowCount: result.length };
		},
		release: () => {
			// No-op for Neon HTTP (connectionless)
		}
	};
}

/**
 * Execute a function within a transaction
 * Note: This is a best-effort implementation for Neon HTTP
 * For critical transactions, use Neon WebSocket mode or pg Pool
 */
export async function transaction<T>(
	callback: (client: Awaited<ReturnType<typeof getClient>>) => Promise<T>
): Promise<T> {
	const client = await getClient();
	
	try {
		// Begin transaction
		await client.query("BEGIN");
		
		// Execute callback
		const result = await callback(client);
		
		// Commit
		await client.query("COMMIT");
		
		return result;
	} catch (error) {
		// Rollback on error
		await client.query("ROLLBACK").catch(() => {
			// Ignore rollback errors
		});
		throw error;
	} finally {
		client.release();
	}
}