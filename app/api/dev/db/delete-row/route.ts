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
	const pk = (body as any)?.pk;

	if (typeof table !== "string" || !table.trim())
		return badRequest("Missing table");
	const tableName = table.trim();
	if (!isSafeIdentifier(tableName)) return badRequest("Invalid table name");

	if (!pk || typeof pk !== "object" || Array.isArray(pk)) {
		return badRequest("pk must be a JSON object");
	}

	const pkKeys = Object.keys(pk);
	if (pkKeys.length === 0) return badRequest("pk must have at least one key");
	if (pkKeys.some((k) => !isSafeIdentifier(k)))
		return badRequest("Invalid pk column name");

	try {
		const sql = getSql();
		const tableIdent = quoteIdent(tableName);
		const wherePairs = pkKeys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`);
		const params = pkKeys.map((k) => (pk as any)[k]);
		const text = `DELETE FROM ${tableIdent} WHERE ${wherePairs.join(
			" AND "
		)} RETURNING *`;
		const rows = await execRawSql<any>(sql, text, params);
		return NextResponse.json({ ok: true, row: rows?.[0] ?? null });
	} catch (error: any) {
		console.error("Dev DB delete-row error:", error);
		return NextResponse.json(
			{ error: error?.message ?? "Failed to delete row" },
			{ status: 400 }
		);
	}
}
