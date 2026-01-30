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

	const name = (body as any)?.name;
	if (typeof name !== "string" || !name.trim())
		return badRequest("Missing name");
	const tableName = name.trim();
	if (!isSafeIdentifier(tableName)) return badRequest("Invalid table name");

	try {
		const sql = getSql();
		const tableIdent = quoteIdent(tableName);
		await execRawSql(
			sql,
			`CREATE TABLE IF NOT EXISTS ${tableIdent} (id UUID PRIMARY KEY DEFAULT gen_random_uuid())`
		);
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("Dev DB create-table error:", error);
		return NextResponse.json(
			{ error: "Failed to create table" },
			{ status: 500 }
		);
	}
}
