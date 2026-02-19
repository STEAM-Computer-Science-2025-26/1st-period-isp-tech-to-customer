import { NextResponse } from "next/server";

export function devDbDisabledResponse() {
	return NextResponse.json(
		{ error: "Dev DB endpoints are disabled." },
		{ status: 404 }
	);
}

export function requireDevDbEnabled(): NextResponse | null {
	// Keep dev tooling out of production builds by default.
	// You can override locally by setting ALLOW_DEV_DB_ROUTES=true.
	const allow = process.env.ALLOW_DEV_DB_ROUTES === "true";
	const isProd = process.env.NODE_ENV === "production";
	if (isProd && !allow) return devDbDisabledResponse();
	return null;
}

export function isSafeIdentifier(value: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

export function quoteIdent(value: string): string {
	// Identifiers can’t be parameterized; quote defensively.
	return `"${value.replaceAll('"', '""')}"`;
}

export function badRequest(message: string) {
	return NextResponse.json({ error: message }, { status: 400 });
}

export function normalizeDbParam(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (!trimmed) return value;
	const looksJsonArray = trimmed.startsWith("[") && trimmed.endsWith("]");
	const looksJsonObject = trimmed.startsWith("{") && trimmed.endsWith("}");
	if (!looksJsonArray && !looksJsonObject) return value;

	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

export function methodNotAllowed() {
	return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export function isSafeReadOnlySql(sql: string): boolean {
	const trimmed = sql.trim();
	if (!trimmed) return false;

	// Reject multiple statements.
	if (trimmed.includes(";")) return false;

	// Allow read-only keywords.
	const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase();
	if (!firstWord) return false;
	if (!["SELECT", "WITH", "EXPLAIN", "SHOW"].includes(firstWord)) return false;

	// Block obviously dangerous keywords even if they appear later.
	const banned = [
		"INSERT",
		"UPDATE",
		"DELETE",
		"DROP",
		"ALTER",
		"TRUNCATE",
		"CREATE",
		"GRANT",
		"REVOKE",
		"COPY",
		"CALL",
		"DO"
	];
	const upper = trimmed.toUpperCase();
	return !banned.some((kw) => upper.includes(kw));
}

export function normalizeColumnType(input: string): string | null {
	const value = input.trim();
	if (!value) return null;

	// Allow a small safe subset for your editor UI.
	// Expand as-needed.
	const simple = [
		"TEXT",
		"INTEGER",
		"INT",
		"BIGINT",
		"SMALLINT",
		"BOOLEAN",
		"UUID",
		"DATE",
		"TIMESTAMP",
		"TIMESTAMPTZ",
		"JSONB",
		"REAL",
		"DOUBLE PRECISION"
	];

	const upper = value.toUpperCase();
	if (simple.includes(upper)) return upper;

	// VARCHAR(n)
	const varchar = upper.match(/^VARCHAR\((\d{1,5})\)$/);
	if (varchar) return `VARCHAR(${varchar[1]})`;

	// DECIMAL(p,s) / NUMERIC(p,s)
	const dec = upper.match(/^(DECIMAL|NUMERIC)\((\d{1,3}),(\d{1,3})\)$/);
	if (dec) return `${dec[1]}(${dec[2]},${dec[3]})`;

	return null;
}

export function normalizeDefaultExpression(input: string): string | null {
	const raw = input.trim();
	if (!raw) return null;

	const upper = raw.toUpperCase();
	if (upper === "NULL") return "NULL";
	if (upper === "TRUE" || upper === "FALSE") return upper;
	if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;

	// Allow a couple of common safe built-ins used in your schema.
	if (/^NOW\(\)$/i.test(raw)) return "NOW()";
	if (/^GEN_RANDOM_UUID\(\)$/i.test(raw)) return "gen_random_uuid()";

	// Treat everything else as a string literal.
	// This avoids allowing arbitrary SQL expressions in DEFAULT.
	const escaped = raw.replaceAll("'", "''");
	return `'${escaped}'`;
}

export async function execRawSql<T = any>(
	sqlClient: unknown,
	text: string,
	params?: unknown[]
): Promise<T[]> {
	const client = sqlClient as any;
	if (typeof client?.query === "function") {
		const result = await client.query(text, params);
		// neon .query() typically returns { rows } in some versions, and rows directly in others.
		if (Array.isArray(result)) return result as T[];
		if (result && Array.isArray(result.rows)) return result.rows as T[];
		return (result?.[0] ? result : []) as T[];
	}

	// Fallback for older neon call signatures.
	const result = await client(text, params);
	return result as T[];
}
