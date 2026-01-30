import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import {
	badRequest,
	execRawSql,
	isSafeIdentifier,
	quoteIdent,
	requireDevDbEnabled
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const blocked = requireDevDbEnabled();
	if (blocked) return blocked;

	const { searchParams } = new URL(request.url);
	const name = searchParams.get("name")?.trim();
	if (!name) return badRequest("Missing table name");
	if (!isSafeIdentifier(name)) return badRequest("Invalid table name");

	try {
		const sql = getSql();

		// Verify table exists in public schema.
		const existsRows = (await sql`
      SELECT EXISTS(
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname = ${name}
      ) AS exists
		`) as Array<{ exists: boolean }>;
		if (!existsRows[0]?.exists) return badRequest("Unknown table");

		const columns = (await sql`
      SELECT
        a.attname AS name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
        NOT a.attnotnull AS nullable,
        pg_get_expr(ad.adbin, ad.adrelid) AS "defaultValue",
        COALESCE(pk.is_primary, false) AS "isPrimaryKey",
        col_description(a.attrelid, a.attnum) AS comment
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      LEFT JOIN (
        SELECT
          i.indrelid,
          unnest(i.indkey) AS attnum,
          true AS is_primary
        FROM pg_index i
        WHERE i.indisprimary
      ) pk ON pk.indrelid = a.attrelid AND pk.attnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relname = ${name}
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum ASC
		`) as Array<{
			name: string;
			type: string;
			nullable: boolean;
			defaultValue: string | null;
			isPrimaryKey: boolean;
			comment: string | null;
		}>;

		// Load up to 200 rows for inspection.
		const tableIdent = quoteIdent(name);
		const rowSql = `SELECT * FROM ${tableIdent} LIMIT 200`;
		const rows = await execRawSql<any>(sql, rowSql);

		return NextResponse.json({ columns, rows });
	} catch (error: any) {
		console.error("Dev DB table error:", error);
		return NextResponse.json(
			{ error: error?.message ?? "Failed to load table" },
			{ status: 500 }
		);
	}
}
