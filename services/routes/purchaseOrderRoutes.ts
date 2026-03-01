// services/routes/purchaseOrderRoutes.ts
// Purchase order generation + three-way PO matching.
//
// Three-way matching = PO ↔ Receipt ↔ Vendor Invoice all agree before AP pays.
// This is standard AP controls for any company spending real money on parts.
//
// Flow:
//   1. Create PO (approved by admin) → status: draft → submitted → approved
//   2. Receive goods against PO → creates PO receipt, bumps warehouse stock
//   3. Enter vendor invoice against PO
//   4. System runs three-way match: PO qty/price ↔ receipt qty ↔ invoice qty/price
//   5. Match result: matched (pay it), partial (flag it), discrepancy (hold it)
//
// Endpoints:
//   POST   /purchase-orders                        — create PO
//   GET    /purchase-orders                        — list POs
//   GET    /purchase-orders/:id                    — PO detail with line items
//   PUT    /purchase-orders/:id                    — update PO (draft only)
//   POST   /purchase-orders/:id/submit             — submit for approval
//   POST   /purchase-orders/:id/approve            — approve PO (admin)
//   POST   /purchase-orders/:id/cancel             — cancel PO
//   POST   /purchase-orders/:id/receive            — record goods receipt
//   GET    /purchase-orders/:id/receipts           — list receipts for PO
//   POST   /purchase-orders/:id/vendor-invoice     — enter vendor invoice
//   GET    /purchase-orders/:id/match              — run / get three-way match result
//   GET    /purchase-orders/reorder-suggestions    — auto-suggest POs from reorder queue

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const lineItemSchema = z.object({
	partId:      z.string().uuid().optional(),   // links to parts_inventory
	description: z.string().min(1).max(300),
	quantity:    z.number().positive(),
	unitCost:    z.number().min(0),
	unit:        z.string().max(20).default("each"),
});

const createPOSchema = z.object({
	vendorName:       z.string().min(1).max(120),
	vendorEmail:      z.string().email().optional(),
	vendorPhone:      z.string().max(30).optional(),
	vendorRef:        z.string().max(80).optional(),  // vendor's catalog/account ref
	expectedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	shippingAddress:  z.string().max(300).optional(),
	branchId:         z.string().uuid().optional(),
	notes:            z.string().max(1000).optional(),
	lineItems:        z.array(lineItemSchema).min(1),
	companyId:        z.string().uuid().optional(),
});

const updatePOSchema = z.object({
	vendorName:       z.string().min(1).max(120).optional(),
	vendorEmail:      z.string().email().optional().nullable(),
	vendorPhone:      z.string().max(30).optional().nullable(),
	vendorRef:        z.string().max(80).optional().nullable(),
	expectedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
	shippingAddress:  z.string().max(300).optional().nullable(),
	notes:            z.string().max(1000).optional().nullable(),
	lineItems:        z.array(lineItemSchema).min(1).optional(),
}).refine(d => Object.keys(d).length > 0, { message: "At least one field required" });

const listPOSchema = z.object({
	companyId:   z.string().uuid().optional(),
	branchId:    z.string().uuid().optional(),
	status:      z.enum(["draft","submitted","approved","partially_received","received","cancelled"]).optional(),
	vendorName:  z.string().optional(),
	since:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	limit:       z.coerce.number().int().min(1).max(200).default(50),
	offset:      z.coerce.number().int().min(0).default(0),
});

const receiptLineSchema = z.object({
	poLineItemId: z.string().uuid(),
	quantityReceived: z.number().positive(),
	notes: z.string().max(300).optional(),
});

const receiptSchema = z.object({
	receivedBy:   z.string().max(120).optional(),
	receivedAt:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	deliveryNote: z.string().max(80).optional(),
	notes:        z.string().max(500).optional(),
	lines:        z.array(receiptLineSchema).min(1),
});

const vendorInvoiceSchema = z.object({
	vendorInvoiceNumber: z.string().min(1).max(80),
	invoiceDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	dueDate:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	lines: z.array(z.object({
		poLineItemId: z.string().uuid(),
		quantityBilled: z.number().positive(),
		unitCostBilled: z.number().min(0),
	})).min(1),
	notes: z.string().max(500).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUser(req: any): JWTPayload { return req.user as JWTPayload; }

function resolveCompanyId(user: JWTPayload, bodyId?: string): string | null {
	if (user.role === "dev") return bodyId ?? user.companyId ?? null;
	return user.companyId ?? null;
}

function requireAdmin(user: JWTPayload): boolean {
	return user.role === "admin" || user.role === "dev";
}

async function generatePONumber(sql: any, companyId: string): Promise<string> {
	const year = new Date().getFullYear();
	const [{ seq }] = await sql`SELECT nextval('po_number_seq') AS seq` as any[];
	return `PO-${year}-${String(seq).padStart(5, "0")}`;
}

function calcLineTotal(qty: number, unitCost: number): number {
	return Math.round(qty * unitCost * 100) / 100;
}

// ─── Three-way match logic ────────────────────────────────────────────────────

type MatchStatus = "matched" | "partial" | "discrepancy" | "pending";

interface MatchResult {
	status: MatchStatus;
	lines: MatchLine[];
	summary: {
		poTotal: number;
		receivedTotal: number;
		invoicedTotal: number;
		variance: number;
	};
	issues: string[];
}

interface MatchLine {
	poLineItemId: string;
	description: string;
	poQty: number;
	poUnitCost: number;
	receivedQty: number;
	invoicedQty: number;
	invoicedUnitCost: number;
	qtyMatch: boolean;
	priceMatch: boolean;
	lineStatus: MatchStatus;
	variance: number;
}

async function runThreeWayMatch(sql: any, poId: string): Promise<MatchResult> {
	const lineItems = await sql`
		SELECT id, description, quantity AS "poQty", unit_cost AS "poUnitCost"
		FROM po_line_items WHERE purchase_order_id = ${poId}
	` as any[];

	const receipts = await sql`
		SELECT pol.id AS "poLineItemId", COALESCE(SUM(rl.quantity_received), 0) AS "receivedQty"
		FROM po_line_items pol
		LEFT JOIN po_receipt_lines rl ON rl.po_line_item_id = pol.id
		WHERE pol.purchase_order_id = ${poId}
		GROUP BY pol.id
	` as any[];

	const invoiceLines = await sql`
		SELECT pol.id AS "poLineItemId",
		       COALESCE(SUM(vil.quantity_billed), 0) AS "invoicedQty",
		       MAX(vil.unit_cost_billed) AS "invoicedUnitCost"
		FROM po_line_items pol
		LEFT JOIN po_vendor_invoice_lines vil ON vil.po_line_item_id = pol.id
		WHERE pol.purchase_order_id = ${poId}
		GROUP BY pol.id
	` as any[];

	const receiptMap = Object.fromEntries(receipts.map((r: any) => [r.poLineItemId, r]));
	const invoiceMap = Object.fromEntries(invoiceLines.map((i: any) => [i.poLineItemId, i]));

	const issues: string[] = [];
	const lines: MatchLine[] = [];
	const PRICE_TOLERANCE = 0.01; // $0.01 tolerance on unit cost

	let poTotal = 0;
	let receivedTotal = 0;
	let invoicedTotal = 0;

	for (const li of lineItems) {
		const received = Number(receiptMap[li.id]?.receivedQty ?? 0);
		const invoicedQty = Number(invoiceMap[li.id]?.invoicedQty ?? 0);
		const invoicedCost = Number(invoiceMap[li.id]?.invoicedUnitCost ?? li.poUnitCost);
		const poQty = Number(li.poQty);
		const poUnitCost = Number(li.poUnitCost);

		const qtyMatch = received >= poQty && invoicedQty <= received;
		const priceMatch = Math.abs(invoicedCost - poUnitCost) <= PRICE_TOLERANCE;

		const variance = (invoicedQty * invoicedCost) - (poQty * poUnitCost);

		let lineStatus: MatchStatus = "matched";
		if (invoicedQty === 0 || received === 0) {
			lineStatus = "pending";
		} else if (!qtyMatch || !priceMatch) {
			lineStatus = Math.abs(variance) > 10 ? "discrepancy" : "partial";
		}

		if (!qtyMatch) issues.push(`Line "${li.description}": qty mismatch — PO: ${poQty}, received: ${received}, invoiced: ${invoicedQty}`);
		if (!priceMatch) issues.push(`Line "${li.description}": price mismatch — PO: $${poUnitCost}, invoiced: $${invoicedCost}`);

		poTotal += poQty * poUnitCost;
		receivedTotal += received * poUnitCost;
		invoicedTotal += invoicedQty * invoicedCost;

		lines.push({
			poLineItemId: li.id,
			description: li.description,
			poQty, poUnitCost, receivedQty: received,
			invoicedQty, invoicedUnitCost: invoicedCost,
			qtyMatch, priceMatch, lineStatus,
			variance: Math.round(variance * 100) / 100,
		});
	}

	const hasDiscrepancy = lines.some(l => l.lineStatus === "discrepancy");
	const hasPartial     = lines.some(l => l.lineStatus === "partial");
	const hasPending     = lines.some(l => l.lineStatus === "pending");
	const allMatched     = lines.every(l => l.lineStatus === "matched");

	const status: MatchStatus = allMatched ? "matched"
		: hasDiscrepancy ? "discrepancy"
		: hasPending ? "pending"
		: "partial";

	return {
		status,
		lines,
		summary: {
			poTotal:       Math.round(poTotal * 100) / 100,
			receivedTotal: Math.round(receivedTotal * 100) / 100,
			invoicedTotal: Math.round(invoicedTotal * 100) / 100,
			variance:      Math.round((invoicedTotal - poTotal) * 100) / 100,
		},
		issues,
	};
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function purchaseOrderRoutes(fastify: FastifyInstance) {
	fastify.register(async (r) => {
		r.addHook("onRequest", authenticate);

		// ── POST /purchase-orders ─────────────────────────────────────────────
		r.post("/purchase-orders", async (request, reply) => {
			const user = getUser(request);
			const parsed = createPOSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten().fieldErrors });
			}
			const body = parsed.data;
			const companyId = resolveCompanyId(user, body.companyId);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const poNumber = await generatePONumber(sql, companyId);

			const subtotal = body.lineItems.reduce((s, li) => s + calcLineTotal(li.quantity, li.unitCost), 0);

			const [po] = await sql`
				INSERT INTO purchase_orders (
					company_id, branch_id, po_number,
					vendor_name, vendor_email, vendor_phone, vendor_ref,
					expected_delivery, shipping_address,
					subtotal, total, notes,
					status, created_by_user_id
				) VALUES (
					${companyId}, ${body.branchId ?? null}, ${poNumber},
					${body.vendorName}, ${body.vendorEmail ?? null}, ${body.vendorPhone ?? null}, ${body.vendorRef ?? null},
					${body.expectedDelivery ?? null}, ${body.shippingAddress ?? null},
					${subtotal}, ${subtotal}, ${body.notes ?? null},
					'draft', ${user.userId ?? user.id ?? null}
				)
				RETURNING id, po_number AS "poNumber", status, subtotal, total, created_at AS "createdAt"
			` as any[];

			// Insert line items
			for (const li of body.lineItems) {
				await sql`
					INSERT INTO po_line_items (
						purchase_order_id, part_id, description, quantity, unit_cost, total, unit
					) VALUES (
						${po.id}, ${li.partId ?? null}, ${li.description},
						${li.quantity}, ${li.unitCost}, ${calcLineTotal(li.quantity, li.unitCost)}, ${li.unit}
					)
				`;
			}

			const lineItems = await sql`
				SELECT id, part_id AS "partId", description, quantity, unit_cost AS "unitCost", total, unit
				FROM po_line_items WHERE purchase_order_id = ${po.id} ORDER BY created_at
			` as any[];

			return reply.code(201).send({ po: { ...po, lineItems } });
		});

		// ── GET /purchase-orders ──────────────────────────────────────────────
		r.get("/purchase-orders", async (request, reply) => {
			const user = getUser(request);
			const parsed = listPOSchema.safeParse(request.query);
			if (!parsed.success) return reply.code(400).send({ error: "Invalid query" });

			const { branchId, status, vendorName, since, limit, offset } = parsed.data;
			const companyId = resolveCompanyId(user, parsed.data.companyId);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const pos = await sql`
				SELECT
					po.id,
					po.po_number        AS "poNumber",
					po.vendor_name      AS "vendorName",
					po.status,
					po.subtotal,
					po.total,
					po.expected_delivery AS "expectedDelivery",
					po.branch_id        AS "branchId",
					b.name              AS "branchName",
					po.created_at       AS "createdAt",
					po.approved_at      AS "approvedAt",
					-- Receipt progress
					COUNT(DISTINCT pr.id)::int AS "receiptCount",
					po.match_status     AS "matchStatus"
				FROM purchase_orders po
				LEFT JOIN branches b ON b.id = po.branch_id
				LEFT JOIN po_receipts pr ON pr.purchase_order_id = po.id
				WHERE (${companyId}::uuid IS NULL OR po.company_id = ${companyId})
				  AND (${status ?? null}::text IS NULL OR po.status = ${status ?? null})
				  AND (${vendorName ?? null}::text IS NULL OR LOWER(po.vendor_name) LIKE '%' || LOWER(${vendorName ?? ""}) || '%')
				  AND (${branchId ?? null}::uuid IS NULL OR po.branch_id = ${branchId ?? null})
				  AND (${since ?? null}::text IS NULL OR po.created_at >= ${since ?? null}::date)
				GROUP BY po.id, b.name
				ORDER BY po.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			` as any[];

			const [{ total }] = await sql`
				SELECT COUNT(*)::int AS total FROM purchase_orders
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
			` as any[];

			return { pos, total, limit, offset };
		});

		// ── GET /purchase-orders/:id ──────────────────────────────────────────
		r.get("/purchase-orders/:id", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [po] = await sql`
				SELECT
					po.*,
					po.po_number          AS "poNumber",
					po.vendor_name        AS "vendorName",
					po.vendor_email       AS "vendorEmail",
					po.vendor_phone       AS "vendorPhone",
					po.vendor_ref         AS "vendorRef",
					po.expected_delivery  AS "expectedDelivery",
					po.shipping_address   AS "shippingAddress",
					po.match_status       AS "matchStatus",
					po.approved_by_user_id AS "approvedByUserId",
					po.approved_at        AS "approvedAt",
					po.created_by_user_id AS "createdByUserId",
					po.created_at         AS "createdAt",
					po.updated_at         AS "updatedAt"
				FROM purchase_orders po
				WHERE po.id = ${id}
				  AND (${companyId}::uuid IS NULL OR po.company_id = ${companyId})
			` as any[];
			if (!po) return reply.code(404).send({ error: "Purchase order not found" });

			const lineItems = await sql`
				SELECT id, part_id AS "partId", description, quantity, unit_cost AS "unitCost", total, unit,
				       quantity_received AS "quantityReceived"
				FROM po_line_items WHERE purchase_order_id = ${id} ORDER BY created_at
			` as any[];

			return { po: { ...po, lineItems } };
		});

		// ── PUT /purchase-orders/:id ──────────────────────────────────────────
		// Only editable in draft status.
		r.put("/purchase-orders/:id", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = updatePOSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten().fieldErrors });
			}

			const sql = getSql();
			const [existing] = await sql`
				SELECT id, status FROM purchase_orders WHERE id = ${id} AND company_id = ${companyId}
			` as any[];
			if (!existing) return reply.code(404).send({ error: "PO not found" });
			if (existing.status !== "draft") {
				return reply.code(400).send({ error: `Cannot edit a PO in '${existing.status}' status` });
			}

			const b = parsed.data;

			// Recalculate subtotal if line items changed
			let subtotal: number | null = null;
			if (b.lineItems) {
				await sql`DELETE FROM po_line_items WHERE purchase_order_id = ${id}`;
				subtotal = b.lineItems.reduce((s, li) => s + calcLineTotal(li.quantity, li.unitCost), 0);
				for (const li of b.lineItems) {
					await sql`
						INSERT INTO po_line_items (purchase_order_id, part_id, description, quantity, unit_cost, total, unit)
						VALUES (${id}, ${li.partId ?? null}, ${li.description}, ${li.quantity}, ${li.unitCost}, ${calcLineTotal(li.quantity, li.unitCost)}, ${li.unit})
					`;
				}
			}

			const [updated] = await sql`
				UPDATE purchase_orders SET
					vendor_name      = COALESCE(${b.vendorName ?? null}, vendor_name),
					vendor_email     = CASE WHEN ${b.vendorEmail !== undefined ? "true" : "false"} = 'true' THEN ${b.vendorEmail ?? null} ELSE vendor_email END,
					vendor_phone     = CASE WHEN ${b.vendorPhone !== undefined ? "true" : "false"} = 'true' THEN ${b.vendorPhone ?? null} ELSE vendor_phone END,
					vendor_ref       = CASE WHEN ${b.vendorRef !== undefined ? "true" : "false"} = 'true' THEN ${b.vendorRef ?? null} ELSE vendor_ref END,
					expected_delivery = CASE WHEN ${b.expectedDelivery !== undefined ? "true" : "false"} = 'true' THEN ${b.expectedDelivery ?? null}::date ELSE expected_delivery END,
					notes            = CASE WHEN ${b.notes !== undefined ? "true" : "false"} = 'true' THEN ${b.notes ?? null} ELSE notes END,
					subtotal         = COALESCE(${subtotal}, subtotal),
					total            = COALESCE(${subtotal}, total),
					updated_at       = NOW()
				WHERE id = ${id}
				RETURNING id, po_number AS "poNumber", status, subtotal, total, updated_at AS "updatedAt"
			` as any[];

			return { po: updated };
		});

		// ── POST /purchase-orders/:id/submit ──────────────────────────────────
		r.post("/purchase-orders/:id/submit", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const [po] = await sql`
				UPDATE purchase_orders SET status = 'submitted', updated_at = NOW()
				WHERE id = ${id} AND company_id = ${companyId} AND status = 'draft'
				RETURNING id, status
			` as any[];

			if (!po) return reply.code(400).send({ error: "PO not found or not in draft status" });
			return { success: true, status: po.status };
		});

		// ── POST /purchase-orders/:id/approve ─────────────────────────────────
		r.post("/purchase-orders/:id/approve", async (request, reply) => {
			const user = getUser(request);
			if (!requireAdmin(user)) return reply.code(403).send({ error: "Admin access required" });

			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const [po] = await sql`
				UPDATE purchase_orders SET
					status             = 'approved',
					approved_by_user_id = ${user.userId ?? user.id ?? null},
					approved_at        = NOW(),
					updated_at         = NOW()
				WHERE id = ${id} AND company_id = ${companyId} AND status = 'submitted'
				RETURNING id, status, approved_at AS "approvedAt"
			` as any[];

			if (!po) return reply.code(400).send({ error: "PO not found or not in submitted status" });
			return { success: true, po };
		});

		// ── POST /purchase-orders/:id/cancel ──────────────────────────────────
		r.post("/purchase-orders/:id/cancel", async (request, reply) => {
			const user = getUser(request);
			if (!requireAdmin(user)) return reply.code(403).send({ error: "Admin access required" });

			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const [po] = await sql`
				UPDATE purchase_orders SET status = 'cancelled', updated_at = NOW()
				WHERE id = ${id} AND company_id = ${companyId}
				  AND status IN ('draft', 'submitted', 'approved')
				RETURNING id, status
			` as any[];

			if (!po) return reply.code(400).send({ error: "PO not found or cannot be cancelled" });
			return { success: true };
		});

		// ── POST /purchase-orders/:id/receive ─────────────────────────────────
		// Record goods receipt — bumps warehouse inventory.
		r.post("/purchase-orders/:id/receive", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = receiptSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten().fieldErrors });
			}
			const body = parsed.data;

			const sql = getSql();
			const [po] = await sql`
				SELECT id, status FROM purchase_orders
				WHERE id = ${id} AND company_id = ${companyId}
				  AND status IN ('approved', 'partially_received')
			` as any[];
			if (!po) return reply.code(400).send({ error: "PO not found or not in approved/partially_received status" });

			// Create receipt header
			const [receipt] = await sql`
				INSERT INTO po_receipts (
					purchase_order_id, received_by, received_at, delivery_note, notes
				) VALUES (
					${id},
					${body.receivedBy ?? null},
					${body.receivedAt ?? new Date().toISOString().split("T")[0]},
					${body.deliveryNote ?? null},
					${body.notes ?? null}
				)
				RETURNING id, received_at AS "receivedAt"
			` as any[];

			const receiptLines = [];

			for (const line of body.lines) {
				// Validate line item belongs to this PO
				const [li] = await sql`
					SELECT id, part_id, unit_cost FROM po_line_items
					WHERE id = ${line.poLineItemId} AND purchase_order_id = ${id}
				` as any[];
				if (!li) continue;

				// Insert receipt line
				await sql`
					INSERT INTO po_receipt_lines (po_receipt_id, po_line_item_id, quantity_received, notes)
					VALUES (${receipt.id}, ${line.poLineItemId}, ${line.quantityReceived}, ${line.notes ?? null})
				`;

				// Update PO line item quantity_received
				await sql`
					UPDATE po_line_items SET
						quantity_received = COALESCE(quantity_received, 0) + ${line.quantityReceived}
					WHERE id = ${line.poLineItemId}
				`;

				// Bump warehouse inventory if part is linked
				if (li.part_id) {
					await sql`
						UPDATE parts_inventory SET
							quantity   = quantity + ${line.quantityReceived},
							unit_cost  = ${li.unit_cost},
							updated_at = NOW()
						WHERE id = ${li.part_id}
					`;

					// Log the warehouse movement
					await sql`
						INSERT INTO warehouse_inventory_log (
							company_id, part_id, movement_type, quantity_change, quantity_after,
							reference_id, reference_type, notes
						)
						SELECT ${companyId}, ${li.part_id}, 'receive',
						       ${line.quantityReceived},
						       quantity,
						       ${id}::uuid, 'purchase_order',
						       ${"PO Receipt: " + (body.deliveryNote ?? receipt.id)}
						FROM parts_inventory WHERE id = ${li.part_id}
					`;
				}

				receiptLines.push({ poLineItemId: line.poLineItemId, quantityReceived: line.quantityReceived });
			}

			// Update PO status
			const allLines = await sql`
				SELECT quantity, COALESCE(quantity_received, 0) AS received
				FROM po_line_items WHERE purchase_order_id = ${id}
			` as any[];

			const fullyReceived = allLines.every((l: any) => Number(l.received) >= Number(l.quantity));
			const newStatus = fullyReceived ? "received" : "partially_received";

			await sql`
				UPDATE purchase_orders SET status = ${newStatus}, updated_at = NOW() WHERE id = ${id}
			`;

			return {
				receipt: { ...receipt, lines: receiptLines },
				poStatus: newStatus,
			};
		});

		// ── GET /purchase-orders/:id/receipts ─────────────────────────────────
		r.get("/purchase-orders/:id/receipts", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [po] = await sql`
				SELECT id FROM purchase_orders WHERE id = ${id}
				AND (${companyId}::uuid IS NULL OR company_id = ${companyId})
			` as any[];
			if (!po) return reply.code(404).send({ error: "PO not found" });

			const receipts = await sql`
				SELECT
					r.id, r.received_by AS "receivedBy",
					r.received_at AS "receivedAt", r.delivery_note AS "deliveryNote",
					r.notes, r.created_at AS "createdAt",
					JSON_AGG(JSON_BUILD_OBJECT(
						'poLineItemId', rl.po_line_item_id,
						'quantityReceived', rl.quantity_received,
						'notes', rl.notes
					)) AS lines
				FROM po_receipts r
				JOIN po_receipt_lines rl ON rl.po_receipt_id = r.id
				WHERE r.purchase_order_id = ${id}
				GROUP BY r.id
				ORDER BY r.received_at DESC
			` as any[];

			return { receipts };
		});

		// ── POST /purchase-orders/:id/vendor-invoice ──────────────────────────
		// Enter the vendor's invoice for three-way matching.
		r.post("/purchase-orders/:id/vendor-invoice", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const parsed = vendorInvoiceSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten().fieldErrors });
			}
			const body = parsed.data;

			const sql = getSql();
			const [po] = await sql`
				SELECT id FROM purchase_orders WHERE id = ${id} AND company_id = ${companyId}
				AND status NOT IN ('draft', 'cancelled')
			` as any[];
			if (!po) return reply.code(400).send({ error: "PO not found or not eligible for invoicing" });

			const invoiceTotal = body.lines.reduce(
				(s, l) => s + l.quantityBilled * l.unitCostBilled, 0
			);

			const [vinvoice] = await sql`
				INSERT INTO po_vendor_invoices (
					purchase_order_id, vendor_invoice_number, invoice_date, due_date, total, notes
				) VALUES (
					${id}, ${body.vendorInvoiceNumber},
					${body.invoiceDate}, ${body.dueDate ?? null},
					${Math.round(invoiceTotal * 100) / 100}, ${body.notes ?? null}
				)
				RETURNING id, vendor_invoice_number AS "vendorInvoiceNumber", total, created_at AS "createdAt"
			` as any[];

			for (const l of body.lines) {
				await sql`
					INSERT INTO po_vendor_invoice_lines (
						po_vendor_invoice_id, po_line_item_id, quantity_billed, unit_cost_billed
					) VALUES (
						${vinvoice.id}, ${l.poLineItemId}, ${l.quantityBilled}, ${l.unitCostBilled}
					)
				`;
			}

			// Auto-run match after invoice entry
			const match = await runThreeWayMatch(sql, id);

			// Persist match status on PO
			await sql`
				UPDATE purchase_orders SET match_status = ${match.status}, updated_at = NOW() WHERE id = ${id}
			`;

			return {
				vendorInvoice: vinvoice,
				matchResult: match,
			};
		});

		// ── GET /purchase-orders/:id/match ────────────────────────────────────
		// Run or re-run three-way match and return result.
		r.get("/purchase-orders/:id/match", async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();
			const [po] = await sql`
				SELECT id, po_number AS "poNumber", status, match_status AS "matchStatus"
				FROM purchase_orders WHERE id = ${id}
				AND (${companyId}::uuid IS NULL OR company_id = ${companyId})
			` as any[];
			if (!po) return reply.code(404).send({ error: "PO not found" });

			const match = await runThreeWayMatch(sql, id);

			// Update match status
			await sql`
				UPDATE purchase_orders SET match_status = ${match.status}, updated_at = NOW() WHERE id = ${id}
			`;

			return { po, matchResult: match };
		});

		// ── GET /purchase-orders/reorder-suggestions ──────────────────────────
		// Auto-generates draft PO suggestions from the warehouse reorder queue.
		// Groups by manufacturer so you get one suggested PO per vendor.
		r.get("/purchase-orders/reorder-suggestions", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user, (request.query as any).companyId);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const reorderItems = await sql`
				SELECT
					id, part_number AS "partNumber", part_name AS "name",
					manufacturer, category,
					quantity AS "currentQty", reorder_level AS "reorderLevel",
					reorder_qty AS "reorderQty", unit_cost AS "unitCost",
					(reorder_qty * unit_cost) AS "lineTotal"
				FROM parts_inventory
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				  AND is_active = true
				  AND quantity <= reorder_level
				ORDER BY manufacturer NULLS LAST, part_name
			` as any[];

			// Group by manufacturer to suggest one PO per vendor
			const byVendor: Record<string, any> = {};
			for (const item of reorderItems) {
				const vendor = item.manufacturer ?? "Unknown Vendor";
				if (!byVendor[vendor]) {
					byVendor[vendor] = {
						suggestedVendor: vendor,
						lineItems: [],
						estimatedTotal: 0,
					};
				}
				byVendor[vendor].lineItems.push({
					partId: item.id,
					partNumber: item.partNumber,
					name: item.name,
					currentQty: item.currentQty,
					reorderQty: item.reorderQty,
					unitCost: item.unitCost,
					lineTotal: item.lineTotal,
				});
				byVendor[vendor].estimatedTotal += Number(item.lineTotal ?? 0);
			}

			const suggestions = Object.values(byVendor).map((v: any) => ({
				...v,
				estimatedTotal: Math.round(v.estimatedTotal * 100) / 100,
				itemCount: v.lineItems.length,
			}));

			return {
				totalPartsNeedingReorder: reorderItems.length,
				suggestedPOs: suggestions.length,
				suggestions,
			};
		});
	});
}