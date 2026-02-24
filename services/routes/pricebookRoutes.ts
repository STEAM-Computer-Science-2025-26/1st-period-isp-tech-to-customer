// services/routes/pricebookRoutes.ts
// Flat-rate catalog. Every estimate and invoice line item traces back here.
// Labor tasks, parts, and bundles — all priced at the company level.

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ============================================================
// Types
// ============================================================

interface PricebookRow {
	id: string;
	companyId: string;
}

// ============================================================
// Schemas
// ============================================================

const createItemSchema = z.object({
	itemType: z.enum(["labor", "part", "bundle"]),
	name: z.string().min(1),
	description: z.string().optional(),
	sku: z.string().optional(),
	unit: z.string().default("each"),
	unitCost: z.number().min(0).optional(),
	unitPrice: z.number().min(0),
	taxable: z.boolean().default(true),
	category: z.string().optional()
});

const updateItemSchema = z
	.object({
		name: z.string().min(1).optional(),
		description: z.string().optional(),
		sku: z.string().optional(),
		unit: z.string().optional(),
		unitCost: z.number().min(0).optional(),
		unitPrice: z.number().min(0).optional(),
		taxable: z.boolean().optional(),
		category: z.string().optional(),
		isActive: z.boolean().optional()
	})
	.refine((d) => Object.keys(d).length > 0, {
		message: "At least one field must be provided"
	});

const listItemsSchema = z.object({
	itemType: z.enum(["labor", "part", "bundle"]).optional(),
	category: z.string().optional(),
	isActive: z.coerce.boolean().optional(),
	search: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

// ============================================================
// Helpers
// ============================================================

function getUser(request: any): JWTPayload {
	return request.user as JWTPayload;
}

function isDev(user: JWTPayload): boolean {
	return user.role === "dev";
}

function resolveCompanyId(user: JWTPayload): string | null {
	return user.companyId ?? null;
}

// ============================================================
// Routes
// ============================================================

export async function pricebookRoutes(fastify: FastifyInstance) {
	// ----------------------------------------------------------
	// POST /pricebook
	// Create a new pricebook item (labor task, part, or bundle).
	// ----------------------------------------------------------
	fastify.post(
		"/pricebook",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const parsed = createItemSchema.safeParse(request.body);

			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: z.treeifyError(parsed.error)
				});
			}

			const body = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const [item] = (await sql`
				INSERT INTO pricebook_items (
					company_id, item_type, name, description, sku,
					unit, unit_cost, unit_price, taxable, category
				) VALUES (
					${companyId},
					${body.itemType},
					${body.name},
					${body.description ?? null},
					${body.sku ?? null},
					${body.unit},
					${body.unitCost ?? null},
					${body.unitPrice},
					${body.taxable},
					${body.category ?? null}
				)
				RETURNING
					id,
					company_id    AS "companyId",
					item_type     AS "itemType",
					name,
					description,
					sku,
					unit,
					unit_cost     AS "unitCost",
					unit_price    AS "unitPrice",
					taxable,
					category,
					is_active     AS "isActive",
					created_at    AS "createdAt"
			`) as PricebookRow[];

			return reply.code(201).send({ item });
		}
	);

	// ----------------------------------------------------------
	// GET /pricebook
	// List all pricebook items. Filter by type, category, search.
	// ----------------------------------------------------------
	fastify.get(
		"/pricebook",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const parsed = listItemsSchema.safeParse(request.query);

			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid query params",
					details: z.treeifyError(parsed.error)
				});
			}

			const { itemType, category, isActive, search, limit, offset } =
				parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const items = await sql`
				SELECT
					id,
					company_id  AS "companyId",
					item_type   AS "itemType",
					name,
					description,
					sku,
					unit,
					unit_cost   AS "unitCost",
					unit_price  AS "unitPrice",
					taxable,
					category,
					is_active   AS "isActive",
					created_at  AS "createdAt",
					updated_at  AS "updatedAt"
				FROM pricebook_items
				WHERE
					(${isDev(user) && !companyId} OR company_id = ${companyId})
					AND (${itemType == null} OR item_type = ${itemType})
					AND (${category == null} OR category = ${category})
					AND (${isActive == null} OR is_active = ${isActive})
					AND (
						${search == null}
						OR name ILIKE ${"%" + (search ?? "") + "%"}
						OR sku ILIKE ${"%" + (search ?? "") + "%"}
					)
				ORDER BY item_type, name
				LIMIT ${limit} OFFSET ${offset}
			`;

			const [{ count }] = (await sql`
				SELECT COUNT(*)::int AS count
				FROM pricebook_items
				WHERE
					(${isDev(user) && !companyId} OR company_id = ${companyId})
					AND (${itemType == null} OR item_type = ${itemType})
					AND (${category == null} OR category = ${category})
					AND (${isActive == null} OR is_active = ${isActive})
					AND (
						${search == null}
						OR name ILIKE ${"%" + (search ?? "") + "%"}
						OR sku ILIKE ${"%" + (search ?? "") + "%"}
					)
			`) as any[];

			return reply.send({ items, total: count, limit, offset });
		}
	);

	// ----------------------------------------------------------
	// GET /pricebook/:itemId
	// Single item detail.
	// ----------------------------------------------------------
	fastify.get(
		"/pricebook/:itemId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { itemId } = request.params as { itemId: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [item] = (await sql`
				SELECT
					id,
					company_id  AS "companyId",
					item_type   AS "itemType",
					name,
					description,
					sku,
					unit,
					unit_cost   AS "unitCost",
					unit_price  AS "unitPrice",
					taxable,
					category,
					is_active   AS "isActive",
					created_at  AS "createdAt",
					updated_at  AS "updatedAt"
				FROM pricebook_items
				WHERE id = ${itemId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as PricebookRow[];

			if (!item) return reply.code(404).send({ error: "Item not found" });

			return reply.send({ item });
		}
	);

	// ----------------------------------------------------------
	// PATCH /pricebook/:itemId
	// Update price, description, or toggle active.
	// ----------------------------------------------------------
	fastify.patch(
		"/pricebook/:itemId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { itemId } = request.params as { itemId: string };
			const parsed = updateItemSchema.safeParse(request.body);

			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: z.treeifyError(parsed.error)
				});
			}

			const body = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const existing = (await sql`
				SELECT id FROM pricebook_items
				WHERE id = ${itemId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as PricebookRow[];

			if (!existing[0])
				return reply.code(404).send({ error: "Item not found" });

			const [item] = await sql`
				UPDATE pricebook_items SET
					name        = COALESCE(${body.name ?? null}, name),
					description = COALESCE(${body.description ?? null}, description),
					sku         = COALESCE(${body.sku ?? null}, sku),
					unit        = COALESCE(${body.unit ?? null}, unit),
					unit_cost   = COALESCE(${body.unitCost ?? null}, unit_cost),
					unit_price  = COALESCE(${body.unitPrice ?? null}, unit_price),
					taxable     = COALESCE(${body.taxable ?? null}, taxable),
					category    = COALESCE(${body.category ?? null}, category),
					is_active   = COALESCE(${body.isActive ?? null}, is_active),
					updated_at  = NOW()
				WHERE id = ${itemId}
				RETURNING
					id,
					item_type   AS "itemType",
					name,
					description,
					sku,
					unit,
					unit_cost   AS "unitCost",
					unit_price  AS "unitPrice",
					taxable,
					category,
					is_active   AS "isActive",
					updated_at  AS "updatedAt"
			`;

			return reply.send({ message: "Item updated", item });
		}
	);

	// ----------------------------------------------------------
	// DELETE /pricebook/:itemId
	// Soft delete — sets is_active = false.
	// Hard deletes break historical line items. Don't do it.
	// ----------------------------------------------------------
	fastify.delete(
		"/pricebook/:itemId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { itemId } = request.params as { itemId: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const result = (await sql`
				UPDATE pricebook_items
				SET is_active = false, updated_at = NOW()
				WHERE id = ${itemId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id
			`) as PricebookRow[];

			if (!result[0]) return reply.code(404).send({ error: "Item not found" });

			return reply.send({ message: "Item deactivated" });
		}
	);

	// ----------------------------------------------------------
	// GET /pricebook/categories
	// Distinct categories in use — for filter dropdowns.
	// ----------------------------------------------------------
	fastify.get(
		"/pricebook/categories",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const rows = (await sql`
				SELECT DISTINCT category
				FROM pricebook_items
				WHERE category IS NOT NULL
					AND is_active = true
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				ORDER BY category
			`) as { category: string }[];

			return reply.send({ categories: rows.map((r) => r.category) });
		}
	);
}
