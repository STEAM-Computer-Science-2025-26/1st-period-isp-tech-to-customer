// db/index.ts
// Neon HTTP driver only — clean, minimal, typed.
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
let cachedSql = null;
function tryLoadDatabaseUrlFromDotenv() {
    if (process.env.DATABASE_URL)
        return;
    const candidates = [
        path.resolve(process.cwd(), ".env.local"),
        path.resolve(process.cwd(), ".env"),
        path.resolve(process.cwd(), "app", ".env.local"),
        path.resolve(process.cwd(), "app", ".env")
    ];
    for (const envPath of candidates) {
        if (!fs.existsSync(envPath))
            continue;
        dotenv.config({ path: envPath });
        if (process.env.DATABASE_URL)
            return;
    }
}
export function getSql() {
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
export async function testConnection() {
    try {
        const sql = getSql();
        const result = await sql `SELECT NOW() as current_time`;
        return {
            success: true,
            currentTime: result[0]?.current_time
        };
    }
    catch (error) {
        return { success: false, error };
    }
}
/**
 * Convert snake_case to camelCase
 */
export function toCamelCase(obj) {
    const result = {};
    for (const key in obj) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        result[camelKey] = obj[key];
    }
    return result;
}
/**
 * Convert camelCase to snake_case
 */
export function toSnakeCase(obj) {
    const result = {};
    for (const key in obj) {
        const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        result[snakeKey] = obj[key];
    }
    return result;
}
/**
 * Convert array of rows to camelCase
 */
export function rowsToCamelCase(rows) {
    return rows.map((row) => toCamelCase(row));
}
/**
 * Query one row
 */
export async function queryOne(queryFn) {
    const sql = getSql();
    const rows = await queryFn(sql);
    return rows.length > 0 ? rows[0] : null;
}
/**
 * Query all rows
 */
export async function queryAll(queryFn) {
    const sql = getSql();
    return queryFn(sql);
}
export async function query(sql, params = []) {
    const client = getSql();
    // Neon's tagged template doesn't accept raw strings with $N params directly,
    // so we use the unsafe() escape hatch which accepts a raw SQL string + params.
    return client.unsafe(sql, params);
}
