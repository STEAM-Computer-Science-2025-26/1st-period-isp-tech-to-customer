import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import {
	badRequest,
	execRawSql,
	isSafeReadOnlySql,
	requireDevDbEnabled
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
	const blocked = requireDevDbEnabled();
	if (blocked) return blocked;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return badRequest("Invalid JSON");
	}

	const sqlText = (body as any)?.sql;
	if (typeof sqlText !== "string") return badRequest("Missing sql");
	if (!isSafeReadOnlySql(sqlText)) {
		return badRequest(
			"Only single-statement read-only SQL is allowed (SELECT/WITH/EXPLAIN/SHOW)."
		);
	}

	try {
		const sql = getSql();
		const rows = await execRawSql<any>(sql, sqlText.trim());
		const columns = rows?.[0] ? Object.keys(rows[0]) : [];
		return NextResponse.json({ columns, rows, rowCount: rows.length });
	} catch (error: any) {
		console.error("Dev DB query error:", error);
		return NextResponse.json(
			{ error: error?.message ?? "Query failed" },
			{ status: 400 }
		);
	}
}
