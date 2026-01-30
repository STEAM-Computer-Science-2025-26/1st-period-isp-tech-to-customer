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
	const column = (body as any)?.column;
	const newName = (body as any)?.newName;
	const type = (body as any)?.type;
	const nullable = (body as any)?.nullable;
	const defaultValue = (body as any)?.defaultValue;

	if (typeof table !== "string" || !table.trim())
		return badRequest("Missing table");
	if (typeof column !== "string" || !column.trim())
		return badRequest("Missing column");

	const tableName = table.trim();
	const columnName = column.trim();
	if (!isSafeIdentifier(tableName)) return badRequest("Invalid table name");
	if (!isSafeIdentifier(columnName)) return badRequest("Invalid column name");

	let normalizedType: string | null = null;
	if (typeof type === "string" && type.trim()) {
		normalizedType = normalizeColumnType(type);
		if (!normalizedType) return badRequest("Unsupported/unsafe column type");
	}

	const defaultExpr =
		typeof defaultValue === "string" && defaultValue.trim()
			? normalizeDefaultExpression(defaultValue)
			: defaultValue === null ||
				  defaultValue === "" ||
				  defaultValue === undefined
				? null
				: null;

	try {
		const sql = getSql();
		const tableIdent = quoteIdent(tableName);
		const colIdent = quoteIdent(columnName);

		// Apply changes as separate ALTER TABLE statements.
		if (typeof newName === "string" && newName.trim()) {
			const nextName = newName.trim();
			if (!isSafeIdentifier(nextName))
				return badRequest("Invalid new column name");
			if (nextName !== columnName) {
				await execRawSql(
					sql,
					`ALTER TABLE ${tableIdent} RENAME COLUMN ${colIdent} TO ${quoteIdent(nextName)}`
				);
			}
		}

		const effectiveName =
			typeof newName === "string" &&
			newName.trim() &&
			isSafeIdentifier(newName.trim())
				? newName.trim()
				: columnName;
		const effectiveIdent = quoteIdent(effectiveName);

		if (normalizedType) {
			await execRawSql(
				sql,
				`ALTER TABLE ${tableIdent} ALTER COLUMN ${effectiveIdent} TYPE ${normalizedType}`
			);
		}

		if (typeof nullable === "boolean") {
			await execRawSql(
				sql,
				`ALTER TABLE ${tableIdent} ALTER COLUMN ${effectiveIdent} ${
					nullable ? "DROP NOT NULL" : "SET NOT NULL"
				}`
			);
		}

		// defaultExpr = null means "drop default" when defaultValue was explicitly cleared.
		if (defaultValue !== undefined) {
			if (defaultExpr) {
				await execRawSql(
					sql,
					`ALTER TABLE ${tableIdent} ALTER COLUMN ${effectiveIdent} SET DEFAULT ${defaultExpr}`
				);
			} else {
				await execRawSql(
					sql,
					`ALTER TABLE ${tableIdent} ALTER COLUMN ${effectiveIdent} DROP DEFAULT`
				);
			}
		}

		return NextResponse.json({ ok: true });
	} catch (error: any) {
		console.error("Dev DB alter-column error:", error);
		return NextResponse.json(
			{ error: error?.message ?? "Failed to alter column" },
			{ status: 400 }
		);
	}
}
