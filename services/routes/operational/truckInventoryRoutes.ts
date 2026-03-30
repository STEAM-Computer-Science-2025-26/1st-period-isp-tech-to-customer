// services/routes/truckInventoryRoutes.ts
// Truck (vehicle) inventory management.
//
// Existing partsRoutes handles basic truck stock reads/writes tied to job parts usage.
// This module handles the VEHICLE layer itself:
//   - Vehicle CRUD (fleet management)
//   - Full truck stock manifest (everything on a given truck)
//   - Restocking runs (bulk transfer from warehouse to truck)
//   - Cross-truck transfers (move parts from truck A to truck B)
//   - Low-stock alerts per vehicle
//   - Vehicle assignment to employee
//
// Endpoints:
//   POST   /vehicles                              — add a vehicle
//   GET    /vehicles                              — list fleet
//   GET    /vehicles/:id                          — single vehicle detail + full manifest
//   PUT    /vehicles/:id                          — update vehicle
//   DELETE /vehicles/:id                          — deactivate vehicle
//   POST   /vehicles/:id/assign                   — assign vehicle to employee
//   GET    /vehicles/:id/manifest                 — full stock manifest
//   GET    /vehicles/:id/low-stock                — parts below min on this truck
//   POST   /vehicles/transfer                     — move parts between two trucks
//   POST   /vehicles/:id/restock                  — bulk restock from warehouse

import { FastifyInstance } from "fastify";
import { getSql } from "../../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../../middleware/auth";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createVehicleSchema = z.object({
	vehicleId: z.string().min(1).max(40), // internal ID / plate / unit number
	make: z.string().max(60).optional(),
	model: z.string().max(60).optional(),
	year: z.number().int().min(1990).max(2030).optional(),
	vin: z.string().max(20).optional(),
	licensePlate: z.string().max(20).optional(),
	color: z.string().max(40).optional(),
	notes: z.string().max(500).optional(),
	branchId: z.string().uuid().optional(),
	companyId: z.string().uuid().optional()
});

const updateVehicleSchema = z
	.object({
		make: z.string().max(60).optional().nullable(),
		model: z.string().max(60).optional().nullable(),
		year: z.number().int().min(1990).max(2030).optional().nullable(),
		vin: z.string().max(20).optional().nullable(),
		licensePlate: z.string().max(20).optional().nullable(),
		color: z.string().max(40).optional().nullable(),
		notes: z.string().max(500).optional().nullable(),
		branchId: z.string().uuid().optional().nullable(),
		isActive: z.boolean().optional()
	})
	.refine((d) => Object.keys(d).length > 0, {
		message: "At least one field required"
	});

const listVehiclesSchema = z.object({
	companyId: z.string().uuid().optional(),
	branchId: z.string().uuid().optional(),
	isActive: z.coerce.boolean().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

const assignVehicleSchema = z.object({
	employeeId: z.string().uuid().nullable() // null = unassign
});

const crossTruckTransferSchema = z.object({
	fromVehicleId: z.string().min(1),
	toVehicleId: z.string().min(1),
	partId: z.string().uuid(),
	quantity: z.number().int().min(1),
	notes: z.string().max(500).optional(),
	companyId: z.string().uuid().optional()
});

const restockSchema = z.object({
	// Array of { partId, quantity } to pull from warehouse
	items: z
		.array(
			z.object({
				partId: z.string().uuid(),
				quantity: z.number().int().min(1)
			})
		)
		.min(1),
	notes: z.string().max(500).optional(),
	companyId: z.string().uuid().optional()
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUser(req: any): JWTPayload {
	return req.user as JWTPayload;
}

function resolveCompanyId(user: JWTPayload, bodyId?: string): string | null {
	if (user.role === "dev") return bodyId ?? user.companyId ?? null;
	return user.companyId ?? null;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function truckInventoryRoutes(fastify: FastifyInstance) {
	fastify.register(async (r) => {
		r.addHook("onRequest", authenticate);

		// ── POST /vehicles ────────────────────────────────────────────────────
		r.post("/vehicles", async (request, reply) => {
			const user = getUser(request);
			const parsed = createVehicleSchema.safeParse(request.body);
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

			const [existing] = (await sql`
				SELECT id FROM vehicles WHERE company_id = ${companyId} AND vehicle_id = ${body.vehicleId}
			`) as any[];
			if (existing)
				return reply
					.code(409)
					.send({ error: "Vehicle ID already exists in this company" });

			const [vehicle] = (await sql`
				INSERT INTO vehicles (
					company_id, branch_id, vehicle_id, make, model, year,
					vin, license_plate, color, notes
				) VALUES (
					${companyId}, ${body.branchId ?? null}, ${body.vehicleId},
					${body.make ?? null}, ${body.model ?? null}, ${body.year ?? null},
					${body.vin ?? null}, ${body.licensePlate ?? null},
					${body.color ?? null}, ${body.notes ?? null}
				)
				RETURNING
					id,
					vehicle_id       AS "vehicleId",
					company_id       AS "companyId",
					branch_id        AS "branchId",
					make, model, year, vin,
					license_plate    AS "licensePlate",
					color, notes,
					is_active        AS "isActive",
					assigned_employee_id AS "assignedEmployeeId",
					created_at       AS "createdAt"
			`) as any[];

			return reply.code(201).send({ vehicle });
		});

		// ── GET /vehicles ─────────────────────────────────────────────────────
		r.get("/vehicles", async (request, reply) => {
			const user = getUser(request);
			const parsed = listVehiclesSchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });

			const { branchId, isActive, limit, offset } = parsed.data;
			const companyId = resolveCompanyId(user, parsed.data.companyId);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const vehicles = (await sql`
				SELECT
					v.id,
					v.vehicle_id             AS "vehicleId",
					v.company_id             AS "companyId",
					v.branch_id              AS "branchId",
					b.name                   AS "branchName",
					v.make, v.model, v.year,
					v.license_plate          AS "licensePlate",
					v.color,
					v.is_active              AS "isActive",
					v.assigned_employee_id   AS "assignedEmployeeId",
					e.name                   AS "assignedEmployeeName",
					-- Stock summary
					COUNT(ti.id)::int        AS "uniqueParts",
					COALESCE(SUM(ti.quantity), 0)::int AS "totalUnits",
					COUNT(ti.id) FILTER (WHERE ti.quantity <= ti.min_quantity)::int AS "lowStockCount",
					v.updated_at AS "updatedAt"
				FROM vehicles v
				LEFT JOIN branches b ON b.id = v.branch_id
				LEFT JOIN employees e ON e.id = v.assigned_employee_id
				LEFT JOIN truck_inventory ti ON ti.vehicle_id = v.vehicle_id
				WHERE (${companyId}::uuid IS NULL OR v.company_id = ${companyId})
				  AND (${branchId ?? null}::uuid IS NULL OR v.branch_id = ${branchId ?? null})
				  AND (${isActive ?? null}::boolean IS NULL OR v.is_active = ${isActive ?? null})
				GROUP BY v.id, b.name, e.name
				ORDER BY v.vehicle_id
				LIMIT ${limit} OFFSET ${offset}
			`) as any[];

			return { vehicles };
		});

		// ── GET /vehicles/:id ─────────────────────────────────────────────────
		r.get("/vehicles/:id", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [vehicle] = (await sql`
				SELECT
					v.id, v.vehicle_id AS "vehicleId", v.company_id AS "companyId",
					v.branch_id AS "branchId", b.name AS "branchName",
					v.make, v.model, v.year, v.vin,
					v.license_plate AS "licensePlate", v.color, v.notes,
					v.is_active AS "isActive",
					v.assigned_employee_id AS "assignedEmployeeId",
					e.name AS "assignedEmployeeName",
					v.created_at AS "createdAt", v.updated_at AS "updatedAt"
				FROM vehicles v
				LEFT JOIN branches b ON b.id = v.branch_id
				LEFT JOIN employees e ON e.id = v.assigned_employee_id
				WHERE v.id = ${id}
				  AND (${companyId}::uuid IS NULL OR v.company_id = ${companyId})
			`) as any[];
			if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });

			return { vehicle };
		});

		// ── PUT /vehicles/:id ─────────────────────────────────────────────────
		r.put("/vehicles/:id", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = updateVehicleSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const sql = getSql();
			const [existing] = (await sql`
				SELECT id FROM vehicles WHERE id = ${id} AND company_id = ${companyId}
			`) as any[];
			if (!existing)
				return reply.code(404).send({ error: "Vehicle not found" });

			const b = parsed.data;

			const [updated] = (await sql`
				UPDATE vehicles SET
					make          = CASE WHEN ${b.make !== undefined ? "true" : "false"} = 'true' THEN ${b.make ?? null} ELSE make END,
					model         = CASE WHEN ${b.model !== undefined ? "true" : "false"} = 'true' THEN ${b.model ?? null} ELSE model END,
					year          = CASE WHEN ${b.year !== undefined ? "true" : "false"} = 'true' THEN ${b.year ?? null} ELSE year END,
					vin           = CASE WHEN ${b.vin !== undefined ? "true" : "false"} = 'true' THEN ${b.vin ?? null} ELSE vin END,
					license_plate = CASE WHEN ${b.licensePlate !== undefined ? "true" : "false"} = 'true' THEN ${b.licensePlate ?? null} ELSE license_plate END,
					color         = CASE WHEN ${b.color !== undefined ? "true" : "false"} = 'true' THEN ${b.color ?? null} ELSE color END,
					notes         = CASE WHEN ${b.notes !== undefined ? "true" : "false"} = 'true' THEN ${b.notes ?? null} ELSE notes END,
					branch_id     = CASE WHEN ${b.branchId !== undefined ? "true" : "false"} = 'true' THEN ${b.branchId ?? null} ELSE branch_id END,
					is_active     = COALESCE(${b.isActive ?? null}, is_active),
					updated_at    = NOW()
				WHERE id = ${id}
				RETURNING id, vehicle_id AS "vehicleId", make, model, year,
				          is_active AS "isActive", updated_at AS "updatedAt"
			`) as any[];

			return { vehicle: updated };
		});

		// ── DELETE /vehicles/:id ──────────────────────────────────────────────
		r.delete("/vehicles/:id", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const [updated] = (await sql`
				UPDATE vehicles SET is_active = false, updated_at = NOW()
				WHERE id = ${id} AND company_id = ${companyId}
				RETURNING id
			`) as any[];

			if (!updated) return reply.code(404).send({ error: "Vehicle not found" });
			return { deactivated: true };
		});

		// ── POST /vehicles/:id/assign ─────────────────────────────────────────
		r.post("/vehicles/:id/assign", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = assignVehicleSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid body" });
			}
			const { employeeId } = parsed.data;

			const sql = getSql();

			if (employeeId) {
				const [emp] = (await sql`
					SELECT id FROM employees WHERE id = ${employeeId} AND company_id = ${companyId} AND is_active = true
				`) as any[];
				if (!emp) return reply.code(404).send({ error: "Employee not found" });
			}

			const [updated] = (await sql`
				UPDATE vehicles SET
					assigned_employee_id = ${employeeId},
					updated_at = NOW()
				WHERE id = ${id} AND company_id = ${companyId}
				RETURNING id, vehicle_id AS "vehicleId", assigned_employee_id AS "assignedEmployeeId"
			`) as any[];

			if (!updated) return reply.code(404).send({ error: "Vehicle not found" });
			return { vehicle: updated };
		});

		// ── GET /vehicles/:id/manifest ────────────────────────────────────────
		// Full stock manifest for a truck.
		r.get("/vehicles/:id/manifest", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			// Resolve vehicle_id string from UUID
			const [vehicle] = (await sql`
				SELECT id, vehicle_id AS "vehicleId", make, model, year,
				       assigned_employee_id AS "assignedEmployeeId"
				FROM vehicles
				WHERE id = ${id} AND (${companyId}::uuid IS NULL OR company_id = ${companyId})
			`) as any[];
			if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });

			const manifest = (await sql`
				SELECT
					ti.part_id              AS "partId",
					p.part_number           AS "partNumber",
					p.part_name             AS "name",
					p.category,
					p.unit_of_measure       AS "unitOfMeasure",
					ti.quantity,
					ti.min_quantity         AS "minQuantity",
					(ti.quantity <= ti.min_quantity) AS "isLowStock",
					p.unit_cost             AS "unitCost",
					(p.unit_cost * ti.quantity) AS "stockValue",
					ti.updated_at           AS "updatedAt"
				FROM truck_inventory ti
				JOIN parts_inventory p ON p.id = ti.part_id
				WHERE ti.vehicle_id = ${vehicle.vehicleId}
				ORDER BY (ti.quantity <= ti.min_quantity) DESC, p.part_name ASC
			`) as any[];

			const totalValue = manifest.reduce(
				(s: number, r: any) => s + Number(r.stockValue ?? 0),
				0
			);
			const lowStockCount = manifest.filter((r: any) => r.isLowStock).length;

			return {
				vehicle,
				manifest,
				summary: {
					uniqueParts: manifest.length,
					totalUnits: manifest.reduce(
						(s: number, r: any) => s + Number(r.quantity),
						0
					),
					totalValue: Math.round(totalValue * 100) / 100,
					lowStockCount
				}
			};
		});

		// ── GET /vehicles/:id/low-stock ───────────────────────────────────────
		r.get("/vehicles/:id/low-stock", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev")
				return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [vehicle] = (await sql`
				SELECT id, vehicle_id AS "vehicleId" FROM vehicles
				WHERE id = ${id} AND (${companyId}::uuid IS NULL OR company_id = ${companyId})
			`) as any[];
			if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });

			const lowStock = (await sql`
				SELECT
					ti.part_id           AS "partId",
					p.part_number        AS "partNumber",
					p.part_name          AS "name",
					ti.quantity          AS "currentQty",
					ti.min_quantity      AS "minQty",
					p.reorder_qty        AS "suggestedRestock",
					p.quantity           AS "warehouseQty"
				FROM truck_inventory ti
				JOIN parts_inventory p ON p.id = ti.part_id
				WHERE ti.vehicle_id = ${vehicle.vehicleId}
				  AND ti.quantity <= ti.min_quantity
				ORDER BY ti.quantity ASC
			`) as any[];

			return { vehicleId: vehicle.vehicleId, lowStockParts: lowStock };
		});

		// ── POST /vehicles/transfer ───────────────────────────────────────────
		// Move parts between two trucks (not from warehouse).
		r.post("/vehicles/transfer", async (request, reply) => {
			const user = getUser(request);
			const parsed = crossTruckTransferSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const body = parsed.data;
			const companyId = resolveCompanyId(user, body.companyId);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			if (body.fromVehicleId === body.toVehicleId) {
				return reply
					.code(400)
					.send({ error: "Source and destination trucks must be different" });
			}

			const sql = getSql();

			// Verify both vehicles belong to company
			const [fromV] = (await sql`
				SELECT id FROM vehicles WHERE vehicle_id = ${body.fromVehicleId} AND company_id = ${companyId}
			`) as any[];
			if (!fromV)
				return reply.code(404).send({ error: "Source vehicle not found" });

			const [toV] = (await sql`
				SELECT id FROM vehicles WHERE vehicle_id = ${body.toVehicleId} AND company_id = ${companyId}
			`) as any[];
			if (!toV)
				return reply.code(404).send({ error: "Destination vehicle not found" });

			// Check source stock
			const [fromStock] = (await sql`
				SELECT quantity FROM truck_inventory
				WHERE vehicle_id = ${body.fromVehicleId} AND part_id = ${body.partId}
			`) as any[];

			if (!fromStock || Number(fromStock.quantity) < body.quantity) {
				return reply.code(409).send({
					error: `Insufficient stock on source truck. Available: ${fromStock?.quantity ?? 0}, requested: ${body.quantity}`
				});
			}

			// Deduct from source
			const newFromQty = Number(fromStock.quantity) - body.quantity;
			await sql`
				UPDATE truck_inventory SET quantity = ${newFromQty}, updated_at = NOW()
				WHERE vehicle_id = ${body.fromVehicleId} AND part_id = ${body.partId}
			`;

			// Add to destination
			await sql`
				INSERT INTO truck_inventory (vehicle_id, part_id, quantity, min_quantity)
				VALUES (${body.toVehicleId}, ${body.partId}, ${body.quantity}, 1)
				ON CONFLICT (vehicle_id, part_id)
				DO UPDATE SET quantity = truck_inventory.quantity + ${body.quantity}, updated_at = NOW()
			`;

			return {
				success: true,
				partId: body.partId,
				fromVehicleId: body.fromVehicleId,
				toVehicleId: body.toVehicleId,
				quantityTransferred: body.quantity,
				fromVehicleQtyAfter: newFromQty
			};
		});

		// ── POST /vehicles/:id/restock ────────────────────────────────────────
		// Bulk restock a truck from the warehouse.
		r.post("/vehicles/:id/restock", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const parsed = restockSchema.safeParse(request.body);
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

			const [vehicle] = (await sql`
				SELECT id, vehicle_id AS "vehicleId" FROM vehicles
				WHERE id = ${id} AND company_id = ${companyId} AND is_active = true
			`) as any[];
			if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });

			const results: any[] = [];
			const errors: any[] = [];

			for (const item of body.items) {
				const [part] = (await sql`
					SELECT id, quantity, part_name AS name FROM parts_inventory
					WHERE id = ${item.partId} AND company_id = ${companyId}
				`) as any[];

				if (!part) {
					errors.push({ partId: item.partId, error: "Part not found" });
					continue;
				}

				if (Number(part.quantity) < item.quantity) {
					errors.push({
						partId: item.partId,
						name: part.name,
						error: `Insufficient warehouse stock. Available: ${part.quantity}, requested: ${item.quantity}`
					});
					continue;
				}

				// Deduct from warehouse
				const newWarehouseQty = Number(part.quantity) - item.quantity;
				await sql`
					UPDATE parts_inventory SET quantity = ${newWarehouseQty}, updated_at = NOW()
					WHERE id = ${item.partId}
				`;

				// Add to truck
				await sql`
					INSERT INTO truck_inventory (vehicle_id, part_id, quantity, min_quantity)
					VALUES (${vehicle.vehicleId}, ${item.partId}, ${item.quantity}, 1)
					ON CONFLICT (vehicle_id, part_id)
					DO UPDATE SET quantity = truck_inventory.quantity + ${item.quantity}, updated_at = NOW()
				`;

				results.push({
					partId: item.partId,
					name: part.name,
					quantityAdded: item.quantity
				});
			}

			return {
				vehicleId: vehicle.vehicleId,
				restocked: results,
				errors,
				notes: body.notes ?? null
			};
		});
	});
}
