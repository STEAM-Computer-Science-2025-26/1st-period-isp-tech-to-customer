import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import {
	badRequest,
	execRawSql,
	isSafeIdentifier,
	normalizeDbParam,
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
	const values = (body as any)?.values;

	if (typeof table !== "string" || !table.trim())
		return badRequest("Missing table");
	const tableName = table.trim();
	if (!isSafeIdentifier(tableName)) return badRequest("Invalid table name");

	if (!pk || typeof pk !== "object" || Array.isArray(pk)) {
		return badRequest("pk must be a JSON object");
	}
	if (!values || typeof values !== "object" || Array.isArray(values)) {
		return badRequest("values must be a JSON object");
	}

	const pkKeys = Object.keys(pk);
	if (pkKeys.length === 0) return badRequest("pk must have at least one key");
	if (pkKeys.some((k) => !isSafeIdentifier(k)))
		return badRequest("Invalid pk column name");

	const valueKeys = Object.keys(values);
	if (valueKeys.length === 0) return badRequest("No values provided");
	if (valueKeys.some((k) => !isSafeIdentifier(k)))
		return badRequest("Invalid column name in values");

	try {
		const sql = getSql();

		const tableIdent = quoteIdent(tableName);
		const setPairs = valueKeys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`);
		const wherePairs = pkKeys.map(
			(k, i) => `${quoteIdent(k)} = $${valueKeys.length + i + 1}`
		);

		const params = [
			...valueKeys.map((k) => normalizeDbParam((values as any)[k])),
			...pkKeys.map((k) => normalizeDbParam((pk as any)[k]))
		];

		const text = `UPDATE ${tableIdent} SET ${setPairs.join(", ")} WHERE ${wherePairs.join(
			" AND "
		)} RETURNING *`;

		const rows = await execRawSql<any>(sql, text, params);
		return NextResponse.json({ ok: true, row: rows?.[0] ?? null });
	} catch (error: any) {
		console.error("Dev DB update-row error:", error);
		return NextResponse.json(
			{ error: error?.message ?? "Failed to update row" },
			{ status: 400 }
		);
	}
}
