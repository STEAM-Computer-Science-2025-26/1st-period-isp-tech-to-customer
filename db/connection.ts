// db/connection.ts
//
// Neon serverless HTTP driver — used by the test script (db/test-connection.ts)
// and any edge/serverless contexts where a persistent Pool is not appropriate.
//
// For the main Fastify server, use db/index.ts (Pool + WebSocket transport).

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { Agent, setGlobalDispatcher } from "undici";

let cachedSql: NeonQueryFunction<false, false> | null = null;

function maybeAllowSelfSignedCerts(): void {
	const allow = process.env.ALLOW_SELF_SIGNED_CERTS === "true";
	const isProd = process.env.NODE_ENV === "production";
	if (allow && !isProd) {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		try {
			const agent = new Agent({ connect: { rejectUnauthorized: false } });
			setGlobalDispatcher(agent);
		} catch {
			// undici might not be used in this environment, so ignore if it fails
		}
	}
}

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

export function getSql() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set. Cannot create SQL client.");
	}
	cachedSql = neon(databaseUrl);
	return cachedSql;
}

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
	queryFn: (sql: NeonQueryFunction<false, false>) => Promise<T[]>
): Promise<T | null> {
	const sql = getSql();
	const rows = await queryFn(sql);
	return rows.length > 0 ? rows[0] : null;
}

export async function queryAll<T extends Record<string, unknown>>(
	queryFn: (sql: NeonQueryFunction<false, false>) => Promise<T[]>
): Promise<T[]> {
	const sql = getSql();
	return queryFn(sql);
}
export function resetSqlClient() {
	cachedSql = null;
}
