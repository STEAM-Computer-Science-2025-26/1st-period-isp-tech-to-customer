// services/routes/warehouseRoutes.ts
// Warehouse parts inventory tracking.
//
// This sits ABOVE the existing partsRoutes (truck-level) and handles:
//   - Warehouse locations (physical bins/shelves)
//   - Receiving stock (PO receipts bump quantity)
//   - Warehouse-to-truck transfers
//   - Reorder alerts and reorder queue
//   - Full inventory audit trail (every quantity change logged)
//
// Endpoints:
//   POST   /warehouse/parts                      — create a part in the catalog
//   GET    /warehouse/parts                      — list parts with stock levels
//   GET    /warehouse/parts/:id                  — single part detail
//   PUT    /warehouse/parts/:id                  — update part metadata
//   POST   /warehouse/parts/:id/receive          — receive stock (adds quantity)
//   POST   /warehouse/parts/:id/adjust           — manual adjustment (shrinkage, damage)
//   POST   /warehouse/transfer                   — transfer parts warehouse → truck
//   GET    /warehouse/reorder-queue              — parts at or below reorder level
//   GET    /warehouse/audit/:partId              — full movement history for a part
//   GET    /warehouse/valuation                  — total inventory value on hand

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createPartSchema = z.object({
	partNumber: z.string().min(1).max(80),
	name: z.string().min(1).max(200),
	description: z.string().max(1000).optional(),
	category: z.string().max(80).optional(),
	manufacturer: z.string().max(120).optional(),
	unitOfMeasure: z
		.enum(["each", "lb", "ft", "box", "case", "roll"])
		.default("each"),
	unitCost: z.number().min(0),
	sellPrice: z.number().min(0).optional(),
	reorderLevel: z.number().int().min(0).default(5),
	reorderQty: z.number().int().min(1).default(10),
	location: z.string().max(80).optional(), // bin/shelf label e.g. "A-3-2"
	isActive: z.boolean().default(true),
	companyId: z.string().uuid().optional()
});

const updatePartSchema = z
	.object({
		partNumber: z.string().min(1).max(80).optional(),
		name: z.string().min(1).max(200).optional(),
		description: z.string().max(1000).optional().nullable(),
		category: z.string().max(80).optional().nullable(),
		manufacturer: z.string().max(120).optional().nullable(),
		unitOfMeasure: z
			.enum(["each", "lb", "ft", "box", "case", "roll"])
			.optional(),
		unitCost: z.number().min(0).optional(),
		sellPrice: z.number().min(0).optional().nullable(),
		reorderLevel: z.number().int().min(0).optional(),
		reorderQty: z.number().int().min(1).optional(),
		location: z.string().max(80).optional().nullable(),
		isActive: z.boolean().optional()
	})
	.refine((d) => Object.keys(d).length > 0, {
		message: "At least one field required"
	});

const listPartsSchema = z.object({
	companyId: z.string().uuid().optional(),
	category: z.string().optional(),
	search: z.string().optional(),
	lowStockOnly: z.coerce.boolean().optional(),
	isActive: z.coerce.boolean().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

const receiveStockSchema = z.object({
	quantity: z.number().int().min(1),
	unitCost: z.number().min(0).optional(), // updates cost if provided
	purchaseOrderId: z.string().uuid().optional(),
	vendorName: z.string().max(120).optional(),
	invoiceRef: z.string().max(80).optional(),
	notes: z.string().max(500).optional()
});

const adjustSchema = z.object({
	quantity: z.number().int(), // negative = shrinkage/damage, positive = found stock
	reason: z.enum(["shrinkage", "damage", "count_correction", "other"]),
	notes: z.string().max(500).optional()
});

const transferSchema = z.object({
	partId: z.string().uuid(),
	vehicleId: z.string().min(1),
	quantity: z.number().int().min(1),
	notes: z.string().max(500).optional(),
	companyId: z.string().uuid().optional()
});

const auditSchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUser(req: any): JWTPayload {
	return req.user as JWTPayload;
}

function resolveCompanyId(user: JWTPayload, bodyId?: string): string | null {
	if (user.role === "dev") return bodyId ?? user.companyId ?? null;
	return user.companyId ?? null;
}

async function logInventoryMovement(
	sql: any,
	opts: {
		companyId: string;
		partId: string;
		movementType: string;
		quantityChange: number;
		quantityAfter: number;
		referenceId?: string | null;
		referenceType?: string | null;
		vehicleId?: string | null;
		performedByUserId?: string | null;
		notes?: string | null;
	}
) {
	await sql`
		INSERT INTO warehouse_inventory_log (
			company_id, part_id, movement_type, quantity_change, quantity_after,
			reference_id, reference_type, vehicle_id, performed_by_user_id, notes
		) VALUES (
			${opts.companyId}, ${opts.partId}, ${opts.movementType},
			${opts.quantityChange}, ${opts.quantityAfter},
			${opts.referenceId ?? null}, ${opts.referenceType ?? null},
			${opts.vehicleId ?? null}, ${opts.performedByUserId ?? null},
			${opts.notes ?? null}
		)
	`;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function warehouseRoutes(fastify: FastifyInstance) {
	fastify.register(async (r) => {
		r.addHook("onRequest", authenticate);

		// ── POST /warehouse/parts ─────────────────────────────────────────────
		r.post("/warehouse/parts", async (request, reply) => {
			const user = getUser(request);
			const parsed = createPartSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const body = parsed.data;
			const companyId = resolveCompanyId(user, body.companyId);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			// Part number must be unique per company
			const [existing] = (await sql`
				SELECT id FROM parts_inventory WHERE company_id = ${companyId} AND part_number = ${body.partNumber}
			`) as any[];
			if (existing)
				return reply.code(409).send({ error: "Part number already exists" });

			const [part] = (await sql`
				INSERT INTO parts_inventory (
					company_id, part_number, part_name, description,
					category, manufacturer, unit_of_measure,
					unit_cost, sell_price, quantity,
					reorder_level, reorder_qty, location, is_active
				) VALUES (
					${companyId}, ${body.partNumber}, ${body.name}, ${body.description ?? null},
					${body.category ?? null}, ${body.manufacturer ?? null}, ${body.unitOfMeasure},
					${body.unitCost}, ${body.sellPrice ?? null}, 0,
					${body.reorderLevel}, ${body.reorderQty}, ${body.location ?? null}, ${body.isActive}
				)
				RETURNING
					id, part_number AS "partNumber", part_name AS "name",
					description, category, manufacturer,
					unit_of_measure AS "unitOfMeasure",
					unit_cost AS "unitCost", sell_price AS "sellPrice",
					quantity, reorder_level AS "reorderLevel",
					reorder_qty AS "reorderQty", location,
					is_active AS "isActive", created_at AS "createdAt"
			`) as any[];

			return reply.code(201).send({ part });
		});

		// ── GET /warehouse/parts ──────────────────────────────────────────────
		r.get("/warehouse/parts", async (request, reply) => {
			const user = getUser(request);
			const parsed = listPartsSchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });

			const { category, search, lowStockOnly, isActive, limit, offset } =
				parsed.data;
			const companyId = resolveCompanyId(user, parsed.data.companyId);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const parts = (await sql`
				SELECT
					id,
					part_number      AS "partNumber",
					part_name        AS "name",
					description,
					category,
					manufacturer,
					unit_of_measure  AS "unitOfMeasure",
					unit_cost        AS "unitCost",
					sell_price       AS "sellPrice",
					quantity,
					reorder_level    AS "reorderLevel",
					reorder_qty      AS "reorderQty",
					location,
					is_active        AS "isActive",
					-- Computed fields
					(quantity <= reorder_level)          AS "isLowStock",
					(unit_cost * quantity)               AS "totalValue",
					updated_at AS "updatedAt"
				FROM parts_inventory
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				  AND (${category ?? null}::text IS NULL OR LOWER(category) = LOWER(${category ?? ""}))
				  AND (${search ?? null}::text IS NULL
				       OR part_name ILIKE '%' || ${search ?? ""} || '%'
				       OR part_number ILIKE '%' || ${search ?? ""} || '%')
				  AND (${lowStockOnly ?? null}::boolean IS NULL OR (quantity <= reorder_level) = ${lowStockOnly ?? null})
				  AND (${isActive ?? null}::boolean IS NULL OR is_active = ${isActive ?? null})
				ORDER BY
					(quantity <= reorder_level) DESC, -- low stock first
					part_name ASC
				LIMIT ${limit} OFFSET ${offset}
			`) as any[];

			const [{ total }] = (await sql`
				SELECT COUNT(*)::int AS total FROM parts_inventory
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				  AND (${isActive ?? null}::boolean IS NULL OR is_active = ${isActive ?? null})
			`) as any[];

			return { parts, total, limit, offset };
		});

		// ── GET /warehouse/parts/:id ──────────────────────────────────────────
		r.get("/warehouse/parts/:id", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [part] = (await sql`
				SELECT
					id, part_number AS "partNumber", part_name AS "name",
					description, category, manufacturer,
					unit_of_measure AS "unitOfMeasure",
					unit_cost AS "unitCost", sell_price AS "sellPrice",
					quantity, reorder_level AS "reorderLevel",
					reorder_qty AS "reorderQty", location,
					is_active AS "isActive",
					(quantity <= reorder_level) AS "isLowStock",
					(unit_cost * quantity) AS "totalValue",
					created_at AS "createdAt", updated_at AS "updatedAt"
				FROM parts_inventory
				WHERE id = ${id}
				  AND (${companyId}::uuid IS NULL OR company_id = ${companyId})
			`) as any[];

			if (!part) return reply.code(404).send({ error: "Part not found" });

			// Also fetch truck stock levels for this part
			const truckStock = (await sql`
				SELECT
					vehicle_id AS "vehicleId",
					quantity,
					min_quantity AS "minQuantity",
					updated_at AS "updatedAt"
				FROM truck_inventory
				WHERE part_id = ${id}
				ORDER BY vehicle_id
			`) as any[];

			return { part: { ...part, truckStock } };
		});

		// ── PUT /warehouse/parts/:id ──────────────────────────────────────────
		r.put("/warehouse/parts/:id", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = updatePartSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const sql = getSql();
			const [existing] = (await sql`
				SELECT id FROM parts_inventory WHERE id = ${id} AND company_id = ${companyId}
			`) as any[];
			if (!existing) return reply.code(404).send({ error: "Part not found" });

			const b = parsed.data;

			const [updated] = (await sql`
				UPDATE parts_inventory SET
					part_number     = COALESCE(${b.partNumber ?? null}, part_number),
					part_name       = COALESCE(${b.name ?? null}, part_name),
					description     = CASE WHEN ${b.description !== undefined ? "true" : "false"} = 'true' THEN ${b.description ?? null} ELSE description END,
					category        = CASE WHEN ${b.category !== undefined ? "true" : "false"} = 'true' THEN ${b.category ?? null} ELSE category END,
					manufacturer    = CASE WHEN ${b.manufacturer !== undefined ? "true" : "false"} = 'true' THEN ${b.manufacturer ?? null} ELSE manufacturer END,
					unit_of_measure = COALESCE(${b.unitOfMeasure ?? null}, unit_of_measure),
					unit_cost       = COALESCE(${b.unitCost ?? null}, unit_cost),
					sell_price      = CASE WHEN ${b.sellPrice !== undefined ? "true" : "false"} = 'true' THEN ${b.sellPrice ?? null} ELSE sell_price END,
					reorder_level   = COALESCE(${b.reorderLevel ?? null}, reorder_level),
					reorder_qty     = COALESCE(${b.reorderQty ?? null}, reorder_qty),
					location        = CASE WHEN ${b.location !== undefined ? "true" : "false"} = 'true' THEN ${b.location ?? null} ELSE location END,
					is_active       = COALESCE(${b.isActive ?? null}, is_active),
					updated_at      = NOW()
				WHERE id = ${id}
				RETURNING
					id, part_number AS "partNumber", part_name AS "name",
					quantity, reorder_level AS "reorderLevel",
					is_active AS "isActive", updated_at AS "updatedAt"
			`) as any[];

			return { part: updated };
		});

		// ── POST /warehouse/parts/:id/receive ─────────────────────────────────
		// Receive stock into warehouse — used when a PO delivery arrives.
		r.post("/warehouse/parts/:id/receive", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = receiveStockSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const body = parsed.data;

			const sql = getSql();
			const [part] = (await sql`
				SELECT id, quantity, unit_cost FROM parts_inventory
				WHERE id = ${id} AND company_id = ${companyId}
			`) as any[];
			if (!part) return reply.code(404).send({ error: "Part not found" });

			// Update cost if provided (weighted average cost)
			const newCost = body.unitCost ?? part.unit_cost;
			const newQty = Number(part.quantity) + body.quantity;

			const [updated] = (await sql`
				UPDATE parts_inventory SET
					quantity   = ${newQty},
					unit_cost  = ${newCost},
					updated_at = NOW()
				WHERE id = ${id}
				RETURNING quantity
			`) as any[];

			await logInventoryMovement(sql, {
				companyId,
				partId: id,
				movementType: "receive",
				quantityChange: body.quantity,
				quantityAfter: updated.quantity,
				referenceId: body.purchaseOrderId ?? null,
				referenceType: body.purchaseOrderId ? "purchase_order" : null,
				performedByUserId: user.userId ?? user.id ?? null,
				notes:
					[
						body.vendorName ? `Vendor: ${body.vendorName}` : null,
						body.invoiceRef ? `Invoice: ${body.invoiceRef}` : null,
						body.notes
					]
						.filter(Boolean)
						.join(" | ") || null
			});

			return {
				partId: id,
				quantityAdded: body.quantity,
				newQuantity: updated.quantity,
				unitCost: newCost
			};
		});

		// ── POST /warehouse/parts/:id/adjust ──────────────────────────────────
		// Manual quantity adjustment (shrinkage, damage, count correction).
		r.post("/warehouse/parts/:id/adjust", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = adjustSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const body = parsed.data;

			const sql = getSql();
			const [part] = (await sql`
				SELECT id, quantity FROM parts_inventory WHERE id = ${id} AND company_id = ${companyId}
			`) as any[];
			if (!part) return reply.code(404).send({ error: "Part not found" });

			const newQty = Math.max(0, Number(part.quantity) + body.quantity);

			const [updated] = (await sql`
				UPDATE parts_inventory SET quantity = ${newQty}, updated_at = NOW()
				WHERE id = ${id}
				RETURNING quantity
			`) as any[];

			await logInventoryMovement(sql, {
				companyId,
				partId: id,
				movementType: `adjustment_${body.reason}`,
				quantityChange: body.quantity,
				quantityAfter: updated.quantity,
				performedByUserId: user.userId ?? user.id ?? null,
				notes: body.notes ?? null
			});

			return {
				partId: id,
				adjustment: body.quantity,
				reason: body.reason,
				newQuantity: updated.quantity
			};
		});

		// ── POST /warehouse/transfer ───────────────────────────────────────────
		// Transfer parts from warehouse to a truck.
		r.post("/warehouse/transfer", async (request, reply) => {
			const user = getUser(request);
			const parsed = transferSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const body = parsed.data;
			const companyId = resolveCompanyId(user, body.companyId);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [part] = (await sql`
				SELECT id, quantity FROM parts_inventory WHERE id = ${body.partId} AND company_id = ${companyId}
			`) as any[];
			if (!part) return reply.code(404).send({ error: "Part not found" });

			if (Number(part.quantity) < body.quantity) {
				return reply.code(409).send({
					error: `Insufficient warehouse stock. Available: ${part.quantity}, requested: ${body.quantity}`
				});
			}

			// Deduct from warehouse
			const newWarehouseQty = Number(part.quantity) - body.quantity;
			await sql`
				UPDATE parts_inventory SET quantity = ${newWarehouseQty}, updated_at = NOW()
				WHERE id = ${body.partId}
			`;

			// Upsert truck inventory
			await sql`
				INSERT INTO truck_inventory (vehicle_id, part_id, quantity, min_quantity)
				VALUES (${body.vehicleId}, ${body.partId}, ${body.quantity}, 1)
				ON CONFLICT (vehicle_id, part_id)
				DO UPDATE SET
					quantity   = truck_inventory.quantity + ${body.quantity},
					updated_at = NOW()
			`;

			await logInventoryMovement(sql, {
				companyId,
				partId: body.partId,
				movementType: "transfer_to_truck",
				quantityChange: -body.quantity,
				quantityAfter: newWarehouseQty,
				vehicleId: body.vehicleId,
				performedByUserId: user.userId ?? user.id ?? null,
				notes: body.notes ?? null
			});

			return {
				success: true,
				partId: body.partId,
				vehicleId: body.vehicleId,
				quantityTransferred: body.quantity,
				warehouseQuantityAfter: newWarehouseQty
			};
		});

		// ── GET /warehouse/reorder-queue ──────────────────────────────────────
		// Parts at or below reorder level — the buying list.
		r.get("/warehouse/reorder-queue", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(
				user,
				(request.query as any).companyId
			);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const parts = (await sql`
				SELECT
					id,
					part_number      AS "partNumber",
					part_name        AS "name",
					category,
					manufacturer,
					quantity          AS "currentQty",
					reorder_level    AS "reorderLevel",
					reorder_qty      AS "reorderQty",
					unit_cost        AS "unitCost",
					(reorder_qty * unit_cost) AS "estimatedCost",
					location,
					-- Last received date
					(
						SELECT MAX(created_at) FROM warehouse_inventory_log
						WHERE part_id = p.id AND movement_type = 'receive'
					) AS "lastReceivedAt"
				FROM parts_inventory p
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				  AND is_active = true
				  AND quantity <= reorder_level
				ORDER BY (reorder_level - quantity) DESC -- most critical first
			`) as any[];

			const totalEstimatedCost = parts.reduce(
				(sum: number, p: any) => sum + Number(p.estimatedCost ?? 0),
				0
			);

			return {
				count: parts.length,
				totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
				parts
			};
		});

		// ── GET /warehouse/audit/:partId ──────────────────────────────────────
		// Full movement history for a part.
		r.get("/warehouse/audit/:partId", async (request, reply) => {
			const user = getUser(request);
			const { partId } = request.params as { partId: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const parsed = auditSchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });
			const { limit, offset } = parsed.data;

			const sql = getSql();

			const [part] = (await sql`
				SELECT id, part_name AS name FROM parts_inventory
				WHERE id = ${partId} AND (${companyId}::uuid IS NULL OR company_id = ${companyId})
			`) as any[];
			if (!part) return reply.code(404).send({ error: "Part not found" });

			const movements = (await sql`
				SELECT
					id,
					movement_type    AS "movementType",
					quantity_change  AS "quantityChange",
					quantity_after   AS "quantityAfter",
					reference_id     AS "referenceId",
					reference_type   AS "referenceType",
					vehicle_id       AS "vehicleId",
					notes,
					created_at       AS "createdAt"
				FROM warehouse_inventory_log
				WHERE part_id = ${partId}
				ORDER BY created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`) as any[];

			return { part, movements, limit, offset };
		});

		// ── GET /warehouse/valuation ──────────────────────────────────────────
		// Total inventory value on hand, broken down by category.
		r.get("/warehouse/valuation", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(
				user,
				(request.query as any).companyId
			);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const byCategory = (await sql`
				SELECT
					COALESCE(category, 'Uncategorized') AS category,
					COUNT(*)::int                        AS "partCount",
					SUM(quantity)::int                   AS "totalUnits",
					ROUND(SUM(unit_cost * quantity)::numeric, 2) AS "totalValue"
				FROM parts_inventory
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				  AND is_active = true
				GROUP BY category
				ORDER BY "totalValue" DESC
			`) as any[];

			const [totals] = (await sql`
				SELECT
					COUNT(*)::int                        AS "totalParts",
					SUM(quantity)::int                   AS "totalUnits",
					ROUND(SUM(unit_cost * quantity)::numeric, 2) AS "totalValue",
					COUNT(*) FILTER (WHERE quantity <= reorder_level)::int AS "lowStockCount"
				FROM parts_inventory
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				  AND is_active = true
			`) as any[];

			return { totals, byCategory };
		});
	});
}
