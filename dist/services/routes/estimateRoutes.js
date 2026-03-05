// services/routes/estimateRoutes.ts
// Good/better/best estimates. Each estimate has line items pulled from
// the pricebook or entered custom. Converts directly to invoice.
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const lineItemSchema = z.object({
	pricebookItemId: z.string().check(z.uuid()).optional(),
	itemType: z.enum(["labor", "part", "bundle", "custom"]),
	name: z.string().min(1),
	description: z.string().optional(),
	quantity: z.number().min(0.01).default(1),
	unitPrice: z.number().min(0),
	unitCost: z.number().min(0).optional(),
	taxable: z.boolean().default(true),
	sortOrder: z.number().int().default(0)
});
const createEstimateSchema = z.object({
	customerId: z.string().check(z.uuid()),
	jobId: z.string().check(z.uuid()).optional(),
	tier: z.enum(["good", "better", "best"]).optional(),
	taxRate: z.number().min(0).max(1).default(0), // e.g. 0.0825 for 8.25%
	notes: z.string().optional(),
	validUntil: z.string().optional(), // ISO date string
	lineItems: z.array(lineItemSchema).min(1)
});
const updateEstimateSchema = z
	.object({
		tier: z.enum(["good", "better", "best"]).optional(),
		taxRate: z.number().min(0).max(1).optional(),
		notes: z.string().optional(),
		validUntil: z.string().optional(),
		status: z
			.enum(["draft", "sent", "accepted", "declined", "expired"])
			.optional()
	})
	.refine((d) => Object.keys(d).length > 0, {
		message: "At least one field must be provided"
	});
const listEstimatesSchema = z.object({
	customerId: z.string().check(z.uuid()).optional(),
	jobId: z.string().check(z.uuid()).optional(),
	status: z
		.enum(["draft", "sent", "accepted", "declined", "expired"])
		.optional(),
	tier: z.enum(["good", "better", "best"]).optional(),
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
function calcTotals(lineItems, taxRate) {
	const subtotal = lineItems.reduce(
		(sum, li) => sum + li.quantity * li.unitPrice,
		0
	);
	const taxableAmount = lineItems
		.filter((li) => li.taxable)
		.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
	const taxAmount = Math.round(taxableAmount * taxRate * 100) / 100;
	const total = Math.round((subtotal + taxAmount) * 100) / 100;
	return { subtotal: Math.round(subtotal * 100) / 100, taxAmount, total };
}
function generateEstimateNumber() {
	const ts = Date.now().toString(36).toUpperCase();
	return `EST-${ts}`;
}
// ============================================================
// Routes
// ============================================================
export async function estimateRoutes(fastify) {
	// ----------------------------------------------------------
	// POST /estimates
	// Create estimate with line items in one shot.
	// Totals are computed server-side — client sends quantities + prices.
	// ----------------------------------------------------------
	fastify.post(
		"/estimates",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const parsed = createEstimateSchema.safeParse(request.body);
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
			// Verify customer belongs to company
			const [customer] = await sql`
				SELECT company_id FROM customers WHERE id = ${body.customerId} AND is_active = true
			`;
			if (!customer)
				return reply.code(404).send({ error: "Customer not found" });
			if (!isDev(user) && customer.company_id !== companyId) {
				return reply.code(403).send({ error: "Forbidden" });
			}
			const resolvedCompanyId = isDev(user) ? customer.company_id : companyId;
			const { subtotal, taxAmount, total } = calcTotals(
				body.lineItems,
				body.taxRate
			);
			const estimateNumber = generateEstimateNumber();
			// Insert estimate + line items in a transaction
			const [estimate] = await sql`
				INSERT INTO estimates (
					company_id, customer_id, job_id, estimate_number,
					tier, subtotal, tax_rate, tax_amount, total, notes, valid_until
				) VALUES (
					${resolvedCompanyId},
					${body.customerId},
					${body.jobId ?? null},
					${estimateNumber},
					${body.tier ?? null},
					${subtotal},
					${body.taxRate},
					${taxAmount},
					${total},
					${body.notes ?? null},
					${body.validUntil ?? null}
				)
				RETURNING
					id,
					company_id      AS "companyId",
					customer_id     AS "customerId",
					job_id          AS "jobId",
					estimate_number AS "estimateNumber",
					tier,
					status,
					subtotal,
					tax_rate        AS "taxRate",
					tax_amount      AS "taxAmount",
					total,
					notes,
					valid_until     AS "validUntil",
					created_at      AS "createdAt"
			`;
			const estimateId = estimate.id;
			// Bulk insert line items
			for (const li of body.lineItems) {
				await sql`
					INSERT INTO estimate_line_items (
						estimate_id, pricebook_item_id, item_type, name, description,
						quantity, unit_price, unit_cost, taxable, sort_order
					) VALUES (
						${estimateId},
						${li.pricebookItemId ?? null},
						${li.itemType},
						${li.name},
						${li.description ?? null},
						${li.quantity},
						${li.unitPrice},
						${li.unitCost ?? null},
						${li.taxable},
						${li.sortOrder}
					)
				`;
			}
			const lineItems = await sql`
				SELECT
					id,
					pricebook_item_id AS "pricebookItemId",
					item_type         AS "itemType",
					name,
					description,
					quantity,
					unit_price        AS "unitPrice",
					unit_cost         AS "unitCost",
					taxable,
					sort_order        AS "sortOrder"
				FROM estimate_line_items
				WHERE estimate_id = ${estimateId}
				ORDER BY sort_order, created_at
			`;
			return reply.code(201).send({ estimate: { ...estimate, lineItems } });
		}
	);
	// ----------------------------------------------------------
	// GET /estimates
	// List estimates. Filter by customer, job, status, tier.
	// ----------------------------------------------------------
	fastify.get(
		"/estimates",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const parsed = listEstimatesSchema.safeParse(request.query);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid query params",
					details: z.treeifyError(parsed.error)
				});
			}
			const { customerId, jobId, status, tier, limit, offset } = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const estimates = await sql`
				SELECT
					e.id,
					e.company_id      AS "companyId",
					e.customer_id     AS "customerId",
					e.job_id          AS "jobId",
					e.estimate_number AS "estimateNumber",
					e.tier,
					e.status,
					e.subtotal,
					e.tax_rate        AS "taxRate",
					e.tax_amount      AS "taxAmount",
					e.total,
					e.notes,
					e.valid_until     AS "validUntil",
					e.sent_at         AS "sentAt",
					e.accepted_at     AS "acceptedAt",
					e.created_at      AS "createdAt",
					c.first_name || ' ' || c.last_name AS "customerName"
				FROM estimates e
				JOIN customers c ON c.id = e.customer_id
				WHERE
					(${isDev(user) && !companyId} OR e.company_id = ${companyId})
					AND (${customerId == null} OR e.customer_id = ${customerId})
					AND (${jobId == null} OR e.job_id = ${jobId})
					AND (${status == null} OR e.status = ${status})
					AND (${tier == null} OR e.tier = ${tier})
				ORDER BY e.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`;
			return reply.send({ estimates, limit, offset });
		}
	);
	// ----------------------------------------------------------
	// GET /estimates/:estimateId
	// Single estimate with all line items.
	// ----------------------------------------------------------
	fastify.get(
		"/estimates/:estimateId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { estimateId } = request.params;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const [estimate] = await sql`
				SELECT
					e.id,
					e.company_id      AS "companyId",
					e.customer_id     AS "customerId",
					e.job_id          AS "jobId",
					e.estimate_number AS "estimateNumber",
					e.tier,
					e.status,
					e.subtotal,
					e.tax_rate        AS "taxRate",
					e.tax_amount      AS "taxAmount",
					e.total,
					e.notes,
					e.valid_until     AS "validUntil",
					e.sent_at         AS "sentAt",
					e.accepted_at     AS "acceptedAt",
					e.created_at      AS "createdAt",
					c.first_name || ' ' || c.last_name AS "customerName",
					c.email           AS "customerEmail",
					c.phone           AS "customerPhone"
				FROM estimates e
				JOIN customers c ON c.id = e.customer_id
				WHERE e.id = ${estimateId}
					AND (${isDev(user) && !companyId} OR e.company_id = ${companyId})
			`;
			if (!estimate)
				return reply.code(404).send({ error: "Estimate not found" });
			const lineItems = await sql`
				SELECT
					id,
					pricebook_item_id AS "pricebookItemId",
					item_type         AS "itemType",
					name,
					description,
					quantity,
					unit_price        AS "unitPrice",
					unit_cost         AS "unitCost",
					taxable,
					sort_order        AS "sortOrder"
				FROM estimate_line_items
				WHERE estimate_id = ${estimateId}
				ORDER BY sort_order, created_at
			`;
			return reply.send({ estimate: { ...estimate, lineItems } });
		}
	);
	// ----------------------------------------------------------
	// PATCH /estimates/:estimateId
	// Update metadata (tier, notes, valid_until, status).
	// Line items are replaced via the line-items sub-routes below.
	// ----------------------------------------------------------
	fastify.patch(
		"/estimates/:estimateId",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { estimateId } = request.params;
			const parsed = updateEstimateSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: z.treeifyError(parsed.error)
				});
			}
			const body = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const existing = await sql`
				SELECT id, status FROM estimates
				WHERE id = ${estimateId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`;
			if (!existing[0])
				return reply.code(404).send({ error: "Estimate not found" });
			// Can't edit an accepted/declined estimate
			if (
				["accepted", "declined"].includes(existing[0].status) &&
				!isDev(user)
			) {
				return reply.code(409).send({ error: "Cannot edit a closed estimate" });
			}
			const sentAt = body.status === "sent" ? sql`NOW()` : sql`sent_at`;
			const acceptedAt =
				body.status === "accepted" ? sql`NOW()` : sql`accepted_at`;
			const [estimate] = await sql`
				UPDATE estimates SET
					tier        = COALESCE(${body.tier ?? null}, tier),
					tax_rate    = COALESCE(${body.taxRate ?? null}, tax_rate),
					notes       = COALESCE(${body.notes ?? null}, notes),
					valid_until = COALESCE(${body.validUntil ?? null}, valid_until),
					status      = COALESCE(${body.status ?? null}, status),
					sent_at     = ${sentAt},
					accepted_at = ${acceptedAt},
					updated_at  = NOW()
				WHERE id = ${estimateId}
				RETURNING
					id,
					estimate_number AS "estimateNumber",
					tier,
					status,
					subtotal,
					tax_rate        AS "taxRate",
					tax_amount      AS "taxAmount",
					total,
					notes,
					valid_until     AS "validUntil",
					sent_at         AS "sentAt",
					accepted_at     AS "acceptedAt",
					updated_at      AS "updatedAt"
			`;
			return reply.send({ message: "Estimate updated", estimate });
		}
	);
	// ----------------------------------------------------------
	// POST /estimates/:estimateId/convert
	// Convert an accepted estimate to an invoice.
	// Copies all line items. Estimate status → accepted.
	// ----------------------------------------------------------
	fastify.post(
		"/estimates/:estimateId/convert",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { estimateId } = request.params;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const [estimate] = await sql`
				SELECT
					id, company_id, customer_id, job_id,
					subtotal, tax_rate, tax_amount, total, notes
				FROM estimates
				WHERE id = ${estimateId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`;
			if (!estimate)
				return reply.code(404).send({ error: "Estimate not found" });
			const lineItems = await sql`
				SELECT item_type, name, description, quantity, unit_price, unit_cost, taxable, sort_order, pricebook_item_id
				FROM estimate_line_items
				WHERE estimate_id = ${estimateId}
				ORDER BY sort_order
			`;
			const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
			const [invoice] = await sql`
				INSERT INTO invoices (
					company_id, customer_id, job_id, estimate_id,
					invoice_number, subtotal, tax_rate, tax_amount, total,
					due_date, notes
				) VALUES (
					${estimate.company_id},
					${estimate.customer_id},
					${estimate.job_id ?? null},
					${estimateId},
					${invoiceNumber},
					${estimate.subtotal},
					${estimate.tax_rate},
					${estimate.tax_amount},
					${estimate.total},
					(CURRENT_DATE + INTERVAL '30 days'),
					${estimate.notes ?? null}
				)
				RETURNING
					id,
					invoice_number AS "invoiceNumber",
					status,
					total,
					due_date       AS "dueDate",
					created_at     AS "createdAt"
			`;
			// Copy line items to invoice
			for (const li of lineItems) {
				await sql`
					INSERT INTO invoice_line_items (
						invoice_id, pricebook_item_id, item_type, name, description,
						quantity, unit_price, unit_cost, taxable, sort_order
					) VALUES (
						${invoice.id},
						${li.pricebook_item_id ?? null},
						${li.item_type},
						${li.name},
						${li.description ?? null},
						${li.quantity},
						${li.unit_price},
						${li.unit_cost ?? null},
						${li.taxable},
						${li.sort_order}
					)
				`;
			}
			// Mark estimate as accepted
			await sql`
				UPDATE estimates
				SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
				WHERE id = ${estimateId}
			`;
			return reply.code(201).send({
				message: "Estimate converted to invoice",
				invoice
			});
		}
	);
	// ----------------------------------------------------------
	// PUT /estimates/:estimateId/line-items
	// Replace all line items. Recalculates totals.
	// Full replace — not partial. Client sends complete list.
	// ----------------------------------------------------------
	fastify.put(
		"/estimates/:estimateId/line-items",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { estimateId } = request.params;
			const parsed = z
				.object({ lineItems: z.array(lineItemSchema).min(1) })
				.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: z.treeifyError(parsed.error)
				});
			}
			const { lineItems } = parsed.data;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const [existing] = await sql`
				SELECT id, tax_rate FROM estimates
				WHERE id = ${estimateId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`;
			if (!existing)
				return reply.code(404).send({ error: "Estimate not found" });
			const taxRate = Number(existing.tax_rate);
			const { subtotal, taxAmount, total } = calcTotals(lineItems, taxRate);
			// Delete old, insert new
			await sql`DELETE FROM estimate_line_items WHERE estimate_id = ${estimateId}`;
			for (const li of lineItems) {
				await sql`
					INSERT INTO estimate_line_items (
						estimate_id, pricebook_item_id, item_type, name, description,
						quantity, unit_price, unit_cost, taxable, sort_order
					) VALUES (
						${estimateId},
						${li.pricebookItemId ?? null},
						${li.itemType},
						${li.name},
						${li.description ?? null},
						${li.quantity},
						${li.unitPrice},
						${li.unitCost ?? null},
						${li.taxable},
						${li.sortOrder}
					)
				`;
			}
			await sql`
				UPDATE estimates
				SET subtotal = ${subtotal}, tax_amount = ${taxAmount}, total = ${total}, updated_at = NOW()
				WHERE id = ${estimateId}
			`;
			const updated = await sql`
				SELECT
					id,
					pricebook_item_id AS "pricebookItemId",
					item_type         AS "itemType",
					name,
					description,
					quantity,
					unit_price        AS "unitPrice",
					unit_cost         AS "unitCost",
					taxable,
					sort_order        AS "sortOrder"
				FROM estimate_line_items
				WHERE estimate_id = ${estimateId}
				ORDER BY sort_order, created_at
			`;
			return reply.send({
				message: "Line items updated",
				lineItems: updated,
				subtotal,
				taxAmount,
				total
			});
		}
	);
}
