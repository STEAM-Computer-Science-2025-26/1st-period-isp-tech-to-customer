import { Pool } from "pg";
import type { QueryResultRow } from "pg";
import dotenv from "dotenv";

dotenv.config(); // <— ensures DATABASE_URL is loaded from .env

export const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: process.env.DATABASE_URL?.includes("sslmode=require")
		? { rejectUnauthorized: false }
		: false,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
	text: string,
	params?: unknown[]
): Promise<T[]> {
	const client = await pool.connect();
	try {
		const res = await client.query<T>(text, params);
		return res.rows;
	} catch (err) {
		console.error("Database query error:", err);
		throw err;
	} finally {
		client.release();
	}
}
