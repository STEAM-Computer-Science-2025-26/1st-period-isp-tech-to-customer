// /server/db/connection.ts
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cachedSql: NeonQueryFunction<false, false> | null = null;

/**
 * Lazily create the SQL query function.
 *
 * Important: Do not throw at import-time.
 * Next.js `next build` evaluates route modules while collecting data.
 */
export function getSql(): NeonQueryFunction<false, false> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  if (!cachedSql) {
    cachedSql = neon(databaseUrl);
  }

  return cachedSql;
}

/**
 * Test database connection
 * Returns structured result for production-safe logging
 */
export async function testConnection(): Promise<{ success: boolean; error?: unknown; currentTime?: string }> {
  try {
    const sql = getSql();
    const result = await sql`SELECT NOW() as current_time`;
    console.log('✅ Database connected successfully!');
    console.log('Current database time:', result[0].current_time);
    return { success: true, currentTime: result[0].current_time };
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return { success: false, error };
  }
}

/**
 * Convert snake_case object keys to camelCase
 */
export function toCamelCase<T extends Record<string, unknown>>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result as T;
}

/**
 * Convert camelCase object keys to snake_case
 */
export function toSnakeCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = obj[key];
  }
  return result;
}

/**
 * Convert an array of rows from snake_case to camelCase
 */
export function rowsToCamelCase<T extends Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map(row => toCamelCase<T>(row));
}

/**
 * Execute a query that should return a single row
 * Returns null if no rows found
 */
export async function queryOne<T extends Record<string, unknown>>(
  query: TemplateStringsArray,
  ...params: unknown[]
): Promise<T | null> {
  const sql = getSql();
  const rows = await sql(query, ...(params as never[]));
  /* 
  Code Review said this:
    The type assertion as never[] bypasses TypeScript's type checking in an unsafe way. Consider
    using a more specific type or restructuring the function signature to properly handle
    the parameter spread.
  */
 // TODO: Refactor to avoid unsafe type assertion
  return rows.length > 0 ? toCamelCase<T>(rows[0]) : null;
}

/**
 * Execute a query and return all rows mapped to camelCase
 */
export async function queryAll<T extends Record<string, unknown>>(
  query: TemplateStringsArray,
  ...params: unknown[]
): Promise<T[]> {
  const sql = getSql();
  const rows = await sql(query, ...(params as never[]));
  /* 
  Code Review said this:
    The type assertion as never[] bypasses TypeScript's type checking in an unsafe way. Consider
    using a more specific type or restructuring the function signature to properly handle
    the parameter spread.
  */
  return rowsToCamelCase<T>(rows);
}