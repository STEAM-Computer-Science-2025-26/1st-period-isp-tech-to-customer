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
	const values = (body as any)?.values;

	if (typeof table !== "string" || !table.trim())
		return badRequest("Missing table");
	const tableName = table.trim();
	if (!isSafeIdentifier(tableName)) return badRequest("Invalid table name");

	if (!values || typeof values !== "object" || Array.isArray(values)) {
		return badRequest("values must be a JSON object");
	}

	const keys = Object.keys(values);
	if (keys.length === 0) return badRequest("No values provided");
	if (keys.some((k) => !isSafeIdentifier(k)))
		return badRequest("Invalid column name");

	try {
		const sql = getSql();

		const tableIdent = quoteIdent(tableName);
		const colIdents = keys.map((k) => quoteIdent(k));
		const placeholders = keys.map((_, i) => `$${i + 1}`);
		const params = keys.map((k) => normalizeDbParam((values as any)[k]));

		const text = `INSERT INTO ${tableIdent} (${colIdents.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
		const rows = await execRawSql<any>(sql, text, params);

		return NextResponse.json({ ok: true, row: rows?.[0] ?? null });
	} catch (error: any) {
		console.error("Dev DB add-row error:", error);
		return NextResponse.json(
			{ error: error?.message ?? "Failed to add row" },
			{ status: 400 }
		);
	}
}
