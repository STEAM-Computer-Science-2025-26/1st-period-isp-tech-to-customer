import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: { rejectUnauthorized: false }
});

//helper to run queries
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T>(text: string, params?: any[]): Promise<T[]> {
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
