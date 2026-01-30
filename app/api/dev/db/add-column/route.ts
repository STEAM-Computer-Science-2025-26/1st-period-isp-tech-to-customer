import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/db/connection";
import {
	badRequest,
	execRawSql,
	isSafeIdentifier,
	normalizeColumnType,
	normalizeDefaultExpression,
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
	const name = (body as any)?.name;
	const type = (body as any)?.type;
	const nullable = (body as any)?.nullable;
	const defaultValue = (body as any)?.defaultValue;

	if (typeof table !== "string" || !table.trim())
		return badRequest("Missing table");
	if (typeof name !== "string" || !name.trim())
		return badRequest("Missing column name");
	if (typeof type !== "string" || !type.trim())
		return badRequest("Missing column type");

	const tableName = table.trim();
	const colName = name.trim();
	if (!isSafeIdentifier(tableName)) return badRequest("Invalid table name");
	if (!isSafeIdentifier(colName)) return badRequest("Invalid column name");

	const normalizedType = normalizeColumnType(type);
	if (!normalizedType) return badRequest("Unsupported/unsafe column type");

	const defaultExpr =
		typeof defaultValue === "string" && defaultValue.trim()
			? normalizeDefaultExpression(defaultValue)
			: null;

	try {
		const sql = getSql();

		const tableIdent = quoteIdent(tableName);
		const colIdent = quoteIdent(colName);

		const pieces: string[] = [];
		pieces.push(
			`ALTER TABLE ${tableIdent} ADD COLUMN ${colIdent} ${normalizedType}`
		);

		if (nullable === false) {
			pieces.push("NOT NULL");
		}
		if (defaultExpr) {
			pieces.push(`DEFAULT ${defaultExpr}`);
		}

		await execRawSql(sql, pieces.join(" "));
		return NextResponse.json({ ok: true });
	} catch (error: any) {
		console.error("Dev DB add-column error:", error);
		return NextResponse.json(
			{ error: error?.message ?? "Failed to add column" },
			{ status: 400 }
		);
	}
}
