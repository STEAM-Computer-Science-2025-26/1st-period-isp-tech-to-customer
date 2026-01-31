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

export async function POST(request: NextRequest) {
	const blocked = requireDevDbEnabled();
	if (blocked) return blocked;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return badRequest("Invalid JSON");
	}

	const table = (body as any)?.table;
	const column = (body as any)?.column;

	if (typeof table !== "string" || !table.trim())
		return badRequest("Missing table");
	if (typeof column !== "string" || !column.trim())
		return badRequest("Missing column");

	const tableName = table.trim();
	const columnName = column.trim();
	if (!isSafeIdentifier(tableName)) return badRequest("Invalid table name");
	if (!isSafeIdentifier(columnName)) return badRequest("Invalid column name");

	try {
		const sql = getSql();
		const tableIdent = quoteIdent(tableName);
		const colIdent = quoteIdent(columnName);
		await execRawSql(sql, `ALTER TABLE ${tableIdent} DROP COLUMN ${colIdent}`);
		return NextResponse.json({ ok: true });
	} catch (error: any) {
		console.error("Dev DB drop-column error:", error);
		return NextResponse.json(
			{ error: error?.message ?? "Failed to drop column" },
			{ status: 400 }
		);
	}
}
