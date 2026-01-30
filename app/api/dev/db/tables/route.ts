import { NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import { requireDevDbEnabled } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	const blocked = requireDevDbEnabled();
	if (blocked) return blocked;

	try {
		const sql = getSql();
		const rows = (await sql`
      SELECT
        c.relname AS name,
        obj_description(c.oid) AS comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY c.relname ASC
		`) as Array<{ name: string; comment: string | null }>;

		return NextResponse.json({ tables: rows });
	} catch (error) {
		console.error("Dev DB tables error:", error);
		return NextResponse.json(
			{ error: "Failed to list tables" },
			{ status: 500 }
		);
	}
}
