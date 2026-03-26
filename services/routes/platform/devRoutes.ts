// services/routes/devRoutes.ts
//
// Dev-only database inspection and mutation endpoints.
// Disabled in production unless ALLOW_DEV_DB_ROUTES=true.
// Ported from Next.js app/api/dev/db/* route files.
//
// All routes live under /dev/db/* which the frontend reaches via
// the Next.js /api/dev/db/* proxy rewrite.

import type { FastifyInstance, FastifyReply } from "fastify";
import { getSql } from "../../../db/connection";

// ─── Guard ───────────────────────────────────────────────────────────────────

function devDbEnabled(): boolean {
	const allow = process.env.ALLOW_DEV_DB_ROUTES === "true";
	const isProd = process.env.NODE_ENV === "production";
	return !isProd || allow;
}

// ─── Utilities (mirrored from app/api/dev/db/_utils.ts) ──────────────────────

function isSafeIdentifier(value: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function quoteIdent(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function normalizeDbParam(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (!trimmed) return value;
	const looksJson =
		(trimmed.startsWith("[") && trimmed.endsWith("]")) ||
		(trimmed.startsWith("{") && trimmed.endsWith("}"));
	if (!looksJson) return value;
	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

function isSafeReadOnlySql(sql: string): boolean {
	const trimmed = sql.trim();
	if (!trimmed || trimmed.includes(";")) return false;
	const first = trimmed.split(/\s+/)[0]?.toUpperCase();
	if (!["SELECT", "WITH", "EXPLAIN", "SHOW"].includes(first ?? ""))
		return false;
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
	return !banned.some((kw) => trimmed.toUpperCase().includes(kw));
}

function normalizeColumnType(input: string): string | null {
	const upper = input.trim().toUpperCase();
	if (!upper) return null;
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
	if (simple.includes(upper)) return upper;
	const varchar = upper.match(/^VARCHAR\((\d{1,5})\)$/);
	if (varchar) return `VARCHAR(${varchar[1]})`;
	const dec = upper.match(/^(DECIMAL|NUMERIC)\((\d{1,3}),(\d{1,3})\)$/);
	if (dec) return `${dec[1]}(${dec[2]},${dec[3]})`;
	return null;
}

function normalizeDefaultExpression(input: string): string | null {
	const raw = input.trim();
	if (!raw) return null;
	const upper = raw.toUpperCase();
	if (upper === "NULL") return "NULL";
	if (upper === "TRUE" || upper === "FALSE") return upper;
	if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;
	if (/^NOW\(\)$/i.test(raw)) return "NOW()";
	if (/^GEN_RANDOM_UUID\(\)$/i.test(raw)) return "gen_random_uuid()";
	return `'${raw.replaceAll("'", "''")}'`;
}

async function execRawSql<T = Record<string, unknown>>(
	sqlClient: ReturnType<typeof getSql>,
	text: string,
	params?: unknown[]
): Promise<T[]> {
	const client = sqlClient as any;
	if (typeof client?.query === "function") {
		const result = await client.query(text, params);
		if (Array.isArray(result)) return result as T[];
		if (result && Array.isArray(result.rows)) return result.rows as T[];
		return [];
	}
	const result = await client(text, params);
	return result as T[];
}

function disabled(reply: FastifyReply) {
	return reply.code(404).send({ error: "Dev DB endpoints are disabled." });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function devRoutes(fastify: FastifyInstance): Promise<void> {
	// GET /dev/db/tables
	fastify.get("/dev/db/tables", async (_request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const sql = getSql();
		const rows = await sql`
			SELECT c.relname AS name, obj_description(c.oid) AS comment
			FROM pg_class c
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'public' AND c.relkind = 'r'
			ORDER BY c.relname ASC
		`;
		return reply.send({ tables: rows });
	});

	// GET /dev/db/table?name=tableName
	fastify.get("/dev/db/table", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const name = (request.query as any)?.name?.trim();
		if (!name) return reply.code(400).send({ error: "Missing table name" });
		if (!isSafeIdentifier(name))
			return reply.code(400).send({ error: "Invalid table name" });

		const sql = getSql();
		const exists = await sql`
			SELECT EXISTS(
				SELECT 1 FROM pg_class c
				JOIN pg_namespace n ON n.oid = c.relnamespace
				WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ${name}
			) AS exists
		`;
		if (!(exists[0] as any)?.exists) {
			return reply.code(400).send({ error: "Unknown table" });
		}

		const columns = await sql`
			SELECT a.attname AS name,
				pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
				NOT a.attnotnull AS nullable,
				pg_get_expr(ad.adbin, ad.adrelid) AS "defaultValue",
				COALESCE(pk.is_primary, false) AS "isPrimaryKey",
				col_description(a.attrelid, a.attnum) AS comment
			FROM pg_attribute a
			JOIN pg_class c ON c.oid = a.attrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
			LEFT JOIN (
				SELECT i.indrelid, unnest(i.indkey) AS attnum, true AS is_primary
				FROM pg_index i WHERE i.indisprimary
			) pk ON pk.indrelid = a.attrelid AND pk.attnum = a.attnum
			WHERE n.nspname = 'public' AND c.relname = ${name}
				AND a.attnum > 0 AND NOT a.attisdropped
			ORDER BY a.attnum ASC
		`;

		const rows = await execRawSql<any>(
			sql,
			`SELECT * FROM ${quoteIdent(name)} LIMIT 200`
		);
		return reply.send({ columns, rows });
	});

	// POST /dev/db/query
	fastify.post("/dev/db/query", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const sqlText = (request.body as any)?.sql;
		if (typeof sqlText !== "string")
			return reply.code(400).send({ error: "Missing sql" });
		if (!isSafeReadOnlySql(sqlText)) {
			return reply.code(400).send({
				error:
					"Only single-statement read-only SQL allowed (SELECT/WITH/EXPLAIN/SHOW)."
			});
		}
		const sql = getSql();
		const rows = await execRawSql<any>(sql, sqlText.trim());
		const columns = rows?.[0] ? Object.keys(rows[0]) : [];
		return reply.send({ columns, rows, rowCount: rows.length });
	});

	// POST /dev/db/create-table
	fastify.post("/dev/db/create-table", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const name = (request.body as any)?.name;
		if (typeof name !== "string" || !name.trim())
			return reply.code(400).send({ error: "Missing name" });
		const tableName = name.trim();
		if (!isSafeIdentifier(tableName))
			return reply.code(400).send({ error: "Invalid table name" });

		const sql = getSql();
		await execRawSql(
			sql,
			`CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (id UUID PRIMARY KEY DEFAULT gen_random_uuid())`
		);
		return reply.send({ ok: true });
	});

	// POST /dev/db/drop-table
	fastify.post("/dev/db/drop-table", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const table = (request.body as any)?.table;
		if (typeof table !== "string" || !table.trim())
			return reply.code(400).send({ error: "Missing table" });
		const tableName = table.trim();
		if (!isSafeIdentifier(tableName))
			return reply.code(400).send({ error: "Invalid table name" });

		const sql = getSql();
		await execRawSql(sql, `DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
		return reply.send({ ok: true });
	});

	// POST /dev/db/add-column
	fastify.post("/dev/db/add-column", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const b = request.body as any;
		const table = b?.table,
			name = b?.name,
			type = b?.type,
			nullable = b?.nullable,
			defaultValue = b?.defaultValue;

		if (typeof table !== "string" || !table.trim())
			return reply.code(400).send({ error: "Missing table" });
		if (typeof name !== "string" || !name.trim())
			return reply.code(400).send({ error: "Missing column name" });
		if (typeof type !== "string" || !type.trim())
			return reply.code(400).send({ error: "Missing column type" });

		const tableName = table.trim(),
			colName = name.trim();
		if (!isSafeIdentifier(tableName))
			return reply.code(400).send({ error: "Invalid table name" });
		if (!isSafeIdentifier(colName))
			return reply.code(400).send({ error: "Invalid column name" });

		const normalizedType = normalizeColumnType(type);
		if (!normalizedType)
			return reply.code(400).send({ error: "Unsupported/unsafe column type" });

		const defaultExpr =
			typeof defaultValue === "string" && defaultValue.trim()
				? normalizeDefaultExpression(defaultValue)
				: null;

		const sql = getSql();
		const pieces = [
			`ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${quoteIdent(colName)} ${normalizedType}`
		];
		if (nullable === false) pieces.push("NOT NULL");
		if (defaultExpr) pieces.push(`DEFAULT ${defaultExpr}`);
		await execRawSql(sql, pieces.join(" "));
		return reply.send({ ok: true });
	});

	// POST /dev/db/drop-column
	fastify.post("/dev/db/drop-column", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const b = request.body as any;
		const table = b?.table,
			column = b?.column;

		if (typeof table !== "string" || !table.trim())
			return reply.code(400).send({ error: "Missing table" });
		if (typeof column !== "string" || !column.trim())
			return reply.code(400).send({ error: "Missing column" });

		const tableName = table.trim(),
			colName = column.trim();
		if (!isSafeIdentifier(tableName))
			return reply.code(400).send({ error: "Invalid table name" });
		if (!isSafeIdentifier(colName))
			return reply.code(400).send({ error: "Invalid column name" });

		const sql = getSql();
		await execRawSql(
			sql,
			`ALTER TABLE ${quoteIdent(tableName)} DROP COLUMN ${quoteIdent(colName)}`
		);
		return reply.send({ ok: true });
	});

	// POST /dev/db/alter-column
	fastify.post("/dev/db/alter-column", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const b = request.body as any;
		const table = b?.table,
			column = b?.column,
			newName = b?.newName,
			type = b?.type,
			nullable = b?.nullable,
			defaultValue = b?.defaultValue;

		if (typeof table !== "string" || !table.trim())
			return reply.code(400).send({ error: "Missing table" });
		if (typeof column !== "string" || !column.trim())
			return reply.code(400).send({ error: "Missing column" });

		const tableName = table.trim(),
			colName = column.trim();
		if (!isSafeIdentifier(tableName))
			return reply.code(400).send({ error: "Invalid table name" });
		if (!isSafeIdentifier(colName))
			return reply.code(400).send({ error: "Invalid column name" });

		let normalizedType: string | null = null;
		if (typeof type === "string" && type.trim()) {
			normalizedType = normalizeColumnType(type);
			if (!normalizedType)
				return reply
					.code(400)
					.send({ error: "Unsupported/unsafe column type" });
		}

		const defaultExpr =
			typeof defaultValue === "string" && defaultValue.trim()
				? normalizeDefaultExpression(defaultValue)
				: null;

		const sql = getSql();
		const tableIdent = quoteIdent(tableName);
		const colIdent = quoteIdent(colName);

		if (
			typeof newName === "string" &&
			newName.trim() &&
			newName.trim() !== colName
		) {
			const next = newName.trim();
			if (!isSafeIdentifier(next))
				return reply.code(400).send({ error: "Invalid new column name" });
			await execRawSql(
				sql,
				`ALTER TABLE ${tableIdent} RENAME COLUMN ${colIdent} TO ${quoteIdent(next)}`
			);
		}

		const effectiveName =
			typeof newName === "string" &&
			newName.trim() &&
			isSafeIdentifier(newName.trim())
				? newName.trim()
				: colName;
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
				`ALTER TABLE ${tableIdent} ALTER COLUMN ${effectiveIdent} ${nullable ? "DROP NOT NULL" : "SET NOT NULL"}`
			);
		}
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
		return reply.send({ ok: true });
	});

	// POST /dev/db/add-row
	fastify.post("/dev/db/add-row", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const b = request.body as any;
		const table = b?.table,
			values = b?.values;

		if (typeof table !== "string" || !table.trim())
			return reply.code(400).send({ error: "Missing table" });
		const tableName = table.trim();
		if (!isSafeIdentifier(tableName))
			return reply.code(400).send({ error: "Invalid table name" });
		if (!values || typeof values !== "object" || Array.isArray(values))
			return reply.code(400).send({ error: "values must be a JSON object" });

		const keys = Object.keys(values);
		if (keys.length === 0)
			return reply.code(400).send({ error: "No values provided" });
		if (keys.some((k) => !isSafeIdentifier(k)))
			return reply.code(400).send({ error: "Invalid column name" });

		const sql = getSql();
		const colIdents = keys.map((k) => quoteIdent(k));
		const placeholders = keys.map((_, i) => `$${i + 1}`);
		const params = keys.map((k) => normalizeDbParam(values[k]));
		const text = `INSERT INTO ${quoteIdent(tableName)} (${colIdents.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
		const rows = await execRawSql<any>(sql, text, params);
		return reply.send({ ok: true, row: rows?.[0] ?? null });
	});

	// POST /dev/db/update-row
	fastify.post("/dev/db/update-row", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const b = request.body as any;
		const table = b?.table,
			pk = b?.pk,
			values = b?.values;

		if (typeof table !== "string" || !table.trim())
			return reply.code(400).send({ error: "Missing table" });
		const tableName = table.trim();
		if (!isSafeIdentifier(tableName))
			return reply.code(400).send({ error: "Invalid table name" });
		if (!pk || typeof pk !== "object" || Array.isArray(pk))
			return reply.code(400).send({ error: "pk must be a JSON object" });
		if (!values || typeof values !== "object" || Array.isArray(values))
			return reply.code(400).send({ error: "values must be a JSON object" });

		const pkKeys = Object.keys(pk);
		const valueKeys = Object.keys(values);
		if (pkKeys.length === 0)
			return reply.code(400).send({ error: "pk must have at least one key" });
		if (pkKeys.some((k) => !isSafeIdentifier(k)))
			return reply.code(400).send({ error: "Invalid pk column name" });
		if (valueKeys.length === 0)
			return reply.code(400).send({ error: "No values provided" });
		if (valueKeys.some((k) => !isSafeIdentifier(k)))
			return reply.code(400).send({ error: "Invalid column name in values" });

		const sql = getSql();
		const tableIdent = quoteIdent(tableName);
		const setPairs = valueKeys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`);
		const wherePairs = pkKeys.map(
			(k, i) => `${quoteIdent(k)} = $${valueKeys.length + i + 1}`
		);
		const params = [
			...valueKeys.map((k) => normalizeDbParam(values[k])),
			...pkKeys.map((k) => normalizeDbParam(pk[k]))
		];
		const text = `UPDATE ${tableIdent} SET ${setPairs.join(", ")} WHERE ${wherePairs.join(" AND ")} RETURNING *`;
		const rows = await execRawSql<any>(sql, text, params);
		return reply.send({ ok: true, row: rows?.[0] ?? null });
	});

	// POST /dev/db/delete-row
	fastify.post("/dev/db/delete-row", async (request, reply) => {
		if (!devDbEnabled()) return disabled(reply);
		const b = request.body as any;
		const table = b?.table,
			pk = b?.pk;

		if (typeof table !== "string" || !table.trim())
			return reply.code(400).send({ error: "Missing table" });
		const tableName = table.trim();
		if (!isSafeIdentifier(tableName))
			return reply.code(400).send({ error: "Invalid table name" });
		if (!pk || typeof pk !== "object" || Array.isArray(pk))
			return reply.code(400).send({ error: "pk must be a JSON object" });

		const pkKeys = Object.keys(pk);
		if (pkKeys.length === 0)
			return reply.code(400).send({ error: "pk must have at least one key" });
		if (pkKeys.some((k) => !isSafeIdentifier(k)))
			return reply.code(400).send({ error: "Invalid pk column name" });

		const sql = getSql();
		const tableIdent = quoteIdent(tableName);
		const wherePairs = pkKeys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`);
		const params = pkKeys.map((k) => pk[k]);
		const text = `DELETE FROM ${tableIdent} WHERE ${wherePairs.join(" AND ")} RETURNING *`;
		const rows = await execRawSql<any>(sql, text, params);
		return reply.send({ ok: true, row: rows?.[0] ?? null });
	});
}
