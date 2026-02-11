import { Pool } from "pg";
import type { QueryResultRow } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
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
