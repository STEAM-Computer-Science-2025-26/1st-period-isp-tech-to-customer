// services/routes/partsRoutes.ts
// Parts usage per job + truck inventory management.
//
// Parts usage: tracks what parts a tech used on a job.
//   Decrements parts_inventory.quantity automatically.
//   Optionally decrements truck_inventory if tech pulls from their truck.
//
// Truck inventory: per-vehicle stock levels.
//   Alerts when quantity drops below min_quantity.
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const logPartsUsageSchema = z.object({
	partId: z.string().check(z.uuid()),
	quantityUsed: z.number().int().min(1),
	techId: z.string().check(z.uuid()).optional(), // defaults to calling user
	notes: z.string().optional(),
	deductFromTruck: z.boolean().default(false),
	vehicleId: z.string().optional() // required if deductFromTruck = true
});
const listPartsUsageSchema = z.object({
	jobId: z.string().check(z.uuid()).optional(),
	techId: z.string().check(z.uuid()).optional(),
	partId: z.string().check(z.uuid()).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});
const upsertTruckInventorySchema = z.object({
	vehicleId: z.string().min(1),
	partId: z.string().check(z.uuid()),
	quantity: z.number().int().min(0),
	minQuantity: z.number().int().min(0).default(1)
});
const adjustTruckInventorySchema = z.object({
	quantity: z.number().int(), // positive = restock, negative = consume
	minQuantity: z.number().int().min(0).optional()
});
const listTruckInventorySchema = z.object({
	vehicleId: z.string().optional(),
	lowStockOnly: z.coerce.boolean().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});
// ============================================================
// Helpers
// ============================================================
function getUser(request) {
	return request.user;
}
function isDev(user) {
	return user.role === "dev";
}
function resolveCompanyId(user) {
	return user.companyId ?? null;
}
// ============================================================
// Routes
// ============================================================
export async function partsRoutes(fastify) {
	// ============================================================
	// PARTS USAGE PER JOB
	// ============================================================
	// ----------------------------------------------------------
	// POST /jobs/:jobId/parts
	// Log parts used on a job. Decrements warehouse inventory.
	// Optionally decrements truck inventory if deductFromTruck=true.
	// ----------------------------------------------------------
	fastify.post(
		"/jobs/:jobId/parts",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params;
			const parsed = logPartsUsageSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: z.treeifyError(parsed.error)
				});
			}
			const body = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			if (body.deductFromTruck && !body.vehicleId) {
				return reply.code(400).send({
					error: "vehicleId is required when deductFromTruck is true"
				});
			}
			// Verify job belongs to company
			const [job] = await sql`
				SELECT id, company_id FROM jobs
				WHERE id = ${jobId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`;
			if (!job) return reply.code(404).send({ error: "Job not found" });
			// Verify part exists and belongs to company
			const [part] = await sql`
				SELECT id, part_name, quantity, unit_cost, sell_price
				FROM parts_inventory
				WHERE id = ${body.partId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`;
			if (!part) return reply.code(404).send({ error: "Part not found" });
			if (part.quantity < body.quantityUsed) {
				return reply.code(409).send({
					error: `Insufficient inventory. Available: ${part.quantity}, requested: ${body.quantityUsed}`
				});
			}
			const techId = body.techId ?? user.userId ?? null;
			// Log the usage
			const [usage] = await sql`
				INSERT INTO parts_usage_log (
					job_id, part_id, tech_id, quantity_used, unit_cost_at_time, notes
				) VALUES (
					${jobId},
					${body.partId},
					${techId},
					${body.quantityUsed},
					${part.unit_cost ?? null},
					${body.notes ?? null}
				)
				RETURNING
					id,
					job_id            AS "jobId",
					part_id           AS "partId",
					tech_id           AS "techId",
					quantity_used     AS "quantityUsed",
					unit_cost_at_time AS "unitCostAtTime",
					notes,
					used_at           AS "usedAt"
			`;
			// Decrement warehouse inventory
			await sql`
				UPDATE parts_inventory
				SET quantity   = quantity - ${body.quantityUsed},
				    updated_at = NOW()
				WHERE id = ${body.partId}
			`;
			// Optionally decrement truck inventory
			if (body.deductFromTruck && body.vehicleId) {
				const [truckItem] = await sql`
					SELECT id, quantity FROM truck_inventory
					WHERE vehicle_id = ${body.vehicleId}
						AND part_id = ${body.partId}
				`;
				if (truckItem) {
					await sql`
						UPDATE truck_inventory
						SET quantity   = GREATEST(0, quantity - ${body.quantityUsed}),
						    updated_at = NOW()
						WHERE id = ${truckItem.id}
					`;
				}
			}
			// Check if reorder needed
			const [updatedPart] = await sql`
				SELECT quantity, reorder_level FROM parts_inventory WHERE id = ${body.partId}
			`;
			const needsReorder =
				updatedPart.reorder_level !== null &&
				updatedPart.quantity <= updatedPart.reorder_level;
			return reply.code(201).send({
				usage,
				remainingStock: updatedPart.quantity,
				needsReorder
			});
		}
	);
	// ----------------------------------------------------------
	// GET /jobs/:jobId/parts
	// All parts used on a specific job.
	// ----------------------------------------------------------
	fastify.get(
		"/jobs/:jobId/parts",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const [job] = await sql`
				SELECT id FROM jobs
				WHERE id = ${jobId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`;
			if (!job) return reply.code(404).send({ error: "Job not found" });
			const parts = await sql`
				SELECT
					pul.id,
					pul.part_id           AS "partId",
					pi.part_name          AS "partName",
					pi.part_number        AS "partNumber",
					pul.quantity_used     AS "quantityUsed",
					pul.unit_cost_at_time AS "unitCostAtTime",
					pi.sell_price         AS "sellPrice",
					pul.notes,
					pul.tech_id           AS "techId",
					e.name                AS "techName",
					pul.used_at           AS "usedAt"
				FROM parts_usage_log pul
				JOIN parts_inventory pi ON pi.id = pul.part_id
				LEFT JOIN employees e ON e.id = pul.tech_id
				WHERE pul.job_id = ${jobId}
				ORDER BY pul.used_at
			`;
			const totalCost = parts.reduce(
				(sum, p) => sum + Number(p.unitCostAtTime ?? 0) * p.quantityUsed,
				0
			);
			return reply.send({
				parts,
				totalCost: Math.round(totalCost * 100) / 100
			});
		}
	);
	// ----------------------------------------------------------
	// GET /parts/usage
	// Cross-job parts usage. Filter by tech, part, job.
	// ----------------------------------------------------------
	fastify.get(
		"/parts/usage",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const parsed = listPartsUsageSchema.safeParse(request.query);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid query params",
					details: z.treeifyError(parsed.error)
				});
			}
			const { jobId, techId, partId, limit, offset } = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const usage = await sql`
				SELECT
					pul.id,
					pul.job_id            AS "jobId",
					pul.part_id           AS "partId",
					pi.part_name          AS "partName",
					pi.part_number        AS "partNumber",
					pul.quantity_used     AS "quantityUsed",
					pul.unit_cost_at_time AS "unitCostAtTime",
					pi.sell_price         AS "sellPrice",
					pul.notes,
					pul.tech_id           AS "techId",
					e.name                AS "techName",
					pul.used_at           AS "usedAt"
				FROM parts_usage_log pul
				JOIN parts_inventory pi ON pi.id = pul.part_id
				JOIN jobs j ON j.id = pul.job_id
				LEFT JOIN employees e ON e.id = pul.tech_id
				WHERE
					(${isDev(user) && !companyId} OR j.company_id = ${companyId})
					AND (${jobId == null} OR pul.job_id = ${jobId})
					AND (${techId == null} OR pul.tech_id = ${techId})
					AND (${partId == null} OR pul.part_id = ${partId})
				ORDER BY pul.used_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`;
			return reply.send({ usage, limit, offset });
		}
	);
	// ----------------------------------------------------------
	// DELETE /jobs/:jobId/parts/:usageId
	// Remove a parts usage entry. Restores inventory.
	// ----------------------------------------------------------
	fastify.delete(
		"/jobs/:jobId/parts/:usageId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { jobId, usageId } = request.params;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const [usage] = await sql`
				SELECT pul.id, pul.part_id, pul.quantity_used
				FROM parts_usage_log pul
				JOIN jobs j ON j.id = pul.job_id
				WHERE pul.id = ${usageId}
					AND pul.job_id = ${jobId}
					AND (${isDev(user) && !companyId} OR j.company_id = ${companyId})
			`;
			if (!usage)
				return reply.code(404).send({ error: "Usage record not found" });
			await sql`DELETE FROM parts_usage_log WHERE id = ${usageId}`;
			// Restore inventory
			await sql`
				UPDATE parts_inventory
				SET quantity = quantity + ${usage.quantity_used}, updated_at = NOW()
				WHERE id = ${usage.part_id}
			`;
			return reply.send({ message: "Parts usage removed, inventory restored" });
		}
	);
	// ============================================================
	// TRUCK INVENTORY
	// ============================================================
	// ----------------------------------------------------------
	// PUT /truck-inventory
	// Set or update stock for a part on a specific vehicle.
	// Upserts — safe to call repeatedly.
	// ----------------------------------------------------------
	fastify.put(
		"/truck-inventory",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const parsed = upsertTruckInventorySchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: z.treeifyError(parsed.error)
				});
			}
			const { vehicleId, partId, quantity, minQuantity } = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}
			// Verify part belongs to company
			const [part] = await sql`
				SELECT id FROM parts_inventory
				WHERE id = ${partId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`;
			if (!part) return reply.code(404).send({ error: "Part not found" });
			const [item] = await sql`
				INSERT INTO truck_inventory (company_id, vehicle_id, part_id, quantity, min_quantity)
				VALUES (${companyId}, ${vehicleId}, ${partId}, ${quantity}, ${minQuantity})
				ON CONFLICT (vehicle_id, part_id) DO UPDATE SET
					quantity     = EXCLUDED.quantity,
					min_quantity = EXCLUDED.min_quantity,
					updated_at   = NOW()
				RETURNING
					id,
					vehicle_id   AS "vehicleId",
					part_id      AS "partId",
					quantity,
					min_quantity AS "minQuantity",
					updated_at   AS "updatedAt"
			`;
			return reply.send({ item });
		}
	);
	// ----------------------------------------------------------
	// PATCH /truck-inventory/:vehicleId/:partId
	// Adjust quantity on a truck (restock or consume).
	// Positive = adding stock, negative = removing.
	// ----------------------------------------------------------
	fastify.patch(
		"/truck-inventory/:vehicleId/:partId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { vehicleId, partId } = request.params;
			const parsed = adjustTruckInventorySchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: z.treeifyError(parsed.error)
				});
			}
			const { quantity, minQuantity } = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const [item] = await sql`
				UPDATE truck_inventory SET
					quantity     = GREATEST(0, quantity + ${quantity}),
					min_quantity = COALESCE(${minQuantity ?? null}, min_quantity),
					updated_at   = NOW()
				WHERE vehicle_id = ${vehicleId}
					AND part_id  = ${partId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING
					id,
					vehicle_id   AS "vehicleId",
					part_id      AS "partId",
					quantity,
					min_quantity AS "minQuantity",
					updated_at   AS "updatedAt"
			`;
			if (!item) {
				return reply.code(404).send({
					error:
						"Truck inventory record not found. Use PUT /truck-inventory to create it."
				});
			}
			const isLow = item.quantity <= item.minQuantity;
			return reply.send({ item, isLow });
		}
	);
	// ----------------------------------------------------------
	// GET /truck-inventory
	// List truck inventory. Filter by vehicle or low stock.
	// ----------------------------------------------------------
	fastify.get(
		"/truck-inventory",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const parsed = listTruckInventorySchema.safeParse(request.query);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid query params",
					details: z.treeifyError(parsed.error)
				});
			}
			const { vehicleId, lowStockOnly, limit, offset } = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const items = await sql`
				SELECT
					ti.id,
					ti.vehicle_id   AS "vehicleId",
					ti.part_id      AS "partId",
					pi.part_name    AS "partName",
					pi.part_number  AS "partNumber",
					ti.quantity,
					ti.min_quantity AS "minQuantity",
					(ti.quantity <= ti.min_quantity) AS "isLow",
					ti.updated_at   AS "updatedAt"
				FROM truck_inventory ti
				JOIN parts_inventory pi ON pi.id = ti.part_id
				WHERE
					(${isDev(user) && !companyId} OR ti.company_id = ${companyId})
					AND (${vehicleId == null} OR ti.vehicle_id = ${vehicleId})
					AND (${!lowStockOnly} OR ti.quantity <= ti.min_quantity)
				ORDER BY ti.vehicle_id, pi.part_name
				LIMIT ${limit} OFFSET ${offset}
			`;
			return reply.send({ items, limit, offset });
		}
	);
	// ----------------------------------------------------------
	// GET /truck-inventory/vehicles
	// Distinct vehicle IDs for this company — for dropdowns.
	// ----------------------------------------------------------
	fastify.get(
		"/truck-inventory/vehicles",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const rows = await sql`
				SELECT DISTINCT vehicle_id AS "vehicleId"
				FROM truck_inventory
				WHERE (${isDev(user) && !companyId} OR company_id = ${companyId})
				ORDER BY vehicle_id
			`;
			return reply.send({ vehicles: rows.map((r) => r.vehicleId) });
		}
	);
	// ----------------------------------------------------------
	// DELETE /truck-inventory/:vehicleId/:partId
	// Remove a part from a truck's inventory record.
	// ----------------------------------------------------------
	fastify.delete(
		"/truck-inventory/:vehicleId/:partId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { vehicleId, partId } = request.params;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const result = await sql`
				DELETE FROM truck_inventory
				WHERE vehicle_id = ${vehicleId}
					AND part_id  = ${partId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id
			`;
			if (!result[0]) {
				return reply
					.code(404)
					.send({ error: "Truck inventory record not found" });
			}
			return reply.send({ message: "Removed from truck inventory" });
		}
	);
}
