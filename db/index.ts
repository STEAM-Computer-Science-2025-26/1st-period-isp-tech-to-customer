import "dotenv/config";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

// Configure WebSocket for local development
neonConfig.webSocketConstructor = ws;

export const pool = new Pool({
	connectionString: process.env.DATABASE_URL
});

// Helper to run queries
export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
	const client = await pool.connect();
	try {
		const res = await client.query(text, params);
		return res.rows;
	} catch (err) {
		console.error("Database query error", err);
		throw err;
	} finally {
		client.release();
	}
}
