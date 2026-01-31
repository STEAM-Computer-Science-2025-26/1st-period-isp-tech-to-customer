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
	if (typeof table !== "string" || !table.trim())
		return badRequest("Missing table");
	const tableName = table.trim();
	if (!isSafeIdentifier(tableName)) return badRequest("Invalid table name");

	try {
		const sql = getSql();
		const tableIdent = quoteIdent(tableName);
		await execRawSql(sql, `DROP TABLE IF EXISTS ${tableIdent}`);
		return NextResponse.json({ ok: true });
	} catch (error: any) {
		console.error("Dev DB drop-table error:", error);
		return NextResponse.json(
			{ error: error?.message ?? "Failed to drop table" },
			{ status: 400 }
		);
	}
}