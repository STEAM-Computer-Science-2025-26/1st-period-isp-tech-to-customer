// services/routes/invoiceRoutes.ts
// Invoice lifecycle: draft → sent → paid/partial/overdue/void.
// balance_due is a Postgres generated column — never compute it here.
// Stripe payment intent ID stored here; webhook updates payment status.
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
const createInvoiceSchema = z.object({
    customerId: z.string().check(z.uuid()),
    jobId: z.string().check(z.uuid()).optional(),
    estimateId: z.string().check(z.uuid()).optional(),
    taxRate: z.number().min(0).max(1).default(0),
    dueDate: z.string().optional(),
    notes: z.string().optional(),
    lineItems: z.array(lineItemSchema).min(1)
});
const updateInvoiceSchema = z
    .object({
    status: z
        .enum(["draft", "sent", "paid", "partial", "overdue", "void"])
        .optional(),
    taxRate: z.number().min(0).max(1).optional(),
    dueDate: z.string().optional(),
    notes: z.string().optional(),
    amountPaid: z.number().min(0).optional(),
    stripePaymentIntentId: z.string().optional()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided"
});
const listInvoicesSchema = z.object({
    customerId: z.string().check(z.uuid()).optional(),
    jobId: z.string().check(z.uuid()).optional(),
    status: z
        .enum(["draft", "sent", "paid", "partial", "overdue", "void"])
        .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
const recordPaymentSchema = z.object({
    amount: z.number().min(0.01),
    method: z.enum(["cash", "check", "card", "card_present"]),
    notes: z.string().optional(),
    stripePaymentIntentId: z.string().optional()
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
    const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
    const taxableAmount = lineItems
        .filter((li) => li.taxable)
        .reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
    const taxAmount = Math.round(taxableAmount * taxRate * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    return { subtotal: Math.round(subtotal * 100) / 100, taxAmount, total };
}
// Derive status from payment amounts
function derivePaymentStatus(total, amountPaid, currentStatus) {
    if (currentStatus === "void")
        return "void";
    if (amountPaid <= 0)
        return currentStatus === "sent" ? "sent" : "draft";
    if (amountPaid >= total)
        return "paid";
    return "partial";
}
// ============================================================
// Routes
// ============================================================
export async function invoiceRoutes(fastify) {
    // ----------------------------------------------------------
    // POST /invoices
    // Create invoice directly (no estimate required).
    // For on-the-spot work where estimate step is skipped.
    // ----------------------------------------------------------
    fastify.post("/invoices", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const parsed = createInvoiceSchema.safeParse(request.body);
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
        const [customer] = (await sql `
				SELECT company_id FROM customers WHERE id = ${body.customerId} AND is_active = true
			`);
        if (!customer)
            return reply.code(404).send({ error: "Customer not found" });
        if (!isDev(user) && customer.company_id !== companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const resolvedCompanyId = isDev(user) ? customer.company_id : companyId;
        const { subtotal, taxAmount, total } = calcTotals(body.lineItems, body.taxRate);
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
        const [invoice] = (await sql `
				INSERT INTO invoices (
					company_id, customer_id, job_id, estimate_id,
					invoice_number, subtotal, tax_rate, tax_amount, total,
					due_date, notes
				) VALUES (
					${resolvedCompanyId},
					${body.customerId},
					${body.jobId ?? null},
					${body.estimateId ?? null},
					${invoiceNumber},
					${subtotal},
					${body.taxRate},
					${taxAmount},
					${total},
					${body.dueDate ?? null},
					${body.notes ?? null}
				)
				RETURNING
					id,
					company_id      AS "companyId",
					customer_id     AS "customerId",
					job_id          AS "jobId",
					estimate_id     AS "estimateId",
					invoice_number  AS "invoiceNumber",
					status,
					subtotal,
					tax_rate        AS "taxRate",
					tax_amount      AS "taxAmount",
					total,
					amount_paid     AS "amountPaid",
					balance_due     AS "balanceDue",
					due_date        AS "dueDate",
					notes,
					created_at      AS "createdAt"
			`);
        const invoiceId = invoice.id;
        for (const li of body.lineItems) {
            await sql `
					INSERT INTO invoice_line_items (
						invoice_id, pricebook_item_id, item_type, name, description,
						quantity, unit_price, unit_cost, taxable, sort_order
					) VALUES (
						${invoiceId},
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
        const lineItems = await sql `
				SELECT
					id,
					pricebook_item_id AS "pricebookItemId",
					item_type         AS "itemType",
					name, description, quantity,
					unit_price        AS "unitPrice",
					unit_cost         AS "unitCost",
					taxable,
					sort_order        AS "sortOrder"
				FROM invoice_line_items
				WHERE invoice_id = ${invoiceId}
				ORDER BY sort_order, created_at
			`;
        return reply.code(201).send({ invoice: { ...invoice, lineItems } });
    });
    // ----------------------------------------------------------
    // GET /invoices
    // List invoices. Filter by customer, job, status.
    // ----------------------------------------------------------
    fastify.get("/invoices", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const parsed = listInvoicesSchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid query params",
                details: z.treeifyError(parsed.error)
            });
        }
        const { customerId, jobId, status, limit, offset } = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const invoices = await sql `
				SELECT
					i.id,
					i.company_id      AS "companyId",
					i.customer_id     AS "customerId",
					i.job_id          AS "jobId",
					i.estimate_id     AS "estimateId",
					i.invoice_number  AS "invoiceNumber",
					i.status,
					i.subtotal,
					i.tax_rate        AS "taxRate",
					i.tax_amount      AS "taxAmount",
					i.total,
					i.amount_paid     AS "amountPaid",
					i.balance_due     AS "balanceDue",
					i.due_date        AS "dueDate",
					i.sent_at         AS "sentAt",
					i.paid_at         AS "paidAt",
					i.created_at      AS "createdAt",
					c.first_name || ' ' || c.last_name AS "customerName"
				FROM invoices i
				JOIN customers c ON c.id = i.customer_id
				WHERE
					(${isDev(user) && !companyId} OR i.company_id = ${companyId})
					AND (${customerId == null} OR i.customer_id = ${customerId})
					AND (${jobId == null} OR i.job_id = ${jobId})
					AND (${status == null} OR i.status = ${status})
				ORDER BY i.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`;
        return reply.send({ invoices, limit, offset });
    });
    // ----------------------------------------------------------
    // GET /invoices/:invoiceId
    // Single invoice with line items.
    // ----------------------------------------------------------
    fastify.get("/invoices/:invoiceId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { invoiceId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [invoice] = (await sql `
				SELECT
					i.id,
					i.company_id      AS "companyId",
					i.customer_id     AS "customerId",
					i.job_id          AS "jobId",
					i.estimate_id     AS "estimateId",
					i.invoice_number  AS "invoiceNumber",
					i.status,
					i.subtotal,
					i.tax_rate        AS "taxRate",
					i.tax_amount      AS "taxAmount",
					i.total,
					i.amount_paid     AS "amountPaid",
					i.balance_due     AS "balanceDue",
					i.due_date        AS "dueDate",
					i.sent_at         AS "sentAt",
					i.paid_at         AS "paidAt",
					i.stripe_payment_intent_id AS "stripePaymentIntentId",
					i.notes,
					i.created_at      AS "createdAt",
					i.updated_at      AS "updatedAt",
					c.first_name || ' ' || c.last_name AS "customerName",
					c.email           AS "customerEmail",
					c.phone           AS "customerPhone"
				FROM invoices i
				JOIN customers c ON c.id = i.customer_id
				WHERE i.id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR i.company_id = ${companyId})
			`);
        if (!invoice)
            return reply.code(404).send({ error: "Invoice not found" });
        const lineItems = await sql `
				SELECT
					id,
					pricebook_item_id AS "pricebookItemId",
					item_type         AS "itemType",
					name, description, quantity,
					unit_price        AS "unitPrice",
					unit_cost         AS "unitCost",
					taxable,
					sort_order        AS "sortOrder"
				FROM invoice_line_items
				WHERE invoice_id = ${invoiceId}
				ORDER BY sort_order, created_at
			`;
        return reply.send({ invoice: { ...invoice, lineItems } });
    });
    // ----------------------------------------------------------
    // PATCH /invoices/:invoiceId
    // Update status, due date, notes. Can't edit a paid invoice.
    // ----------------------------------------------------------
    fastify.patch("/invoices/:invoiceId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { invoiceId } = request.params;
        const parsed = updateInvoiceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: z.treeifyError(parsed.error)
            });
        }
        const body = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [existing] = (await sql `
				SELECT id, status, total FROM invoices
				WHERE id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!existing)
            return reply.code(404).send({ error: "Invoice not found" });
        if (existing.status === "void" && !isDev(user)) {
            return reply.code(409).send({ error: "Cannot edit a voided invoice" });
        }
        const sentAt = body.status === "sent" ? sql `NOW()` : sql `sent_at`;
        const paidAt = body.status === "paid" ? sql `NOW()` : sql `paid_at`;
        const [invoice] = await sql `
				UPDATE invoices SET
					status                    = COALESCE(${body.status ?? null}, status),
					tax_rate                  = COALESCE(${body.taxRate ?? null}, tax_rate),
					due_date                  = COALESCE(${body.dueDate ?? null}, due_date),
					notes                     = COALESCE(${body.notes ?? null}, notes),
					amount_paid               = COALESCE(${body.amountPaid ?? null}, amount_paid),
					stripe_payment_intent_id  = COALESCE(${body.stripePaymentIntentId ?? null}, stripe_payment_intent_id),
					sent_at                   = ${sentAt},
					paid_at                   = ${paidAt},
					updated_at                = NOW()
				WHERE id = ${invoiceId}
				RETURNING
					id,
					invoice_number  AS "invoiceNumber",
					status,
					subtotal,
					tax_rate        AS "taxRate",
					tax_amount      AS "taxAmount",
					total,
					amount_paid     AS "amountPaid",
					balance_due     AS "balanceDue",
					due_date        AS "dueDate",
					sent_at         AS "sentAt",
					paid_at         AS "paidAt",
					updated_at      AS "updatedAt"
			`;
        return reply.send({ message: "Invoice updated", invoice });
    });
    // ----------------------------------------------------------
    // POST /invoices/:invoiceId/payment
    // Record a payment. Automatically computes new status.
    // Use this for cash/check. Stripe updates come via webhook.
    // ----------------------------------------------------------
    fastify.post("/invoices/:invoiceId/payment", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { invoiceId } = request.params;
        const parsed = recordPaymentSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: z.treeifyError(parsed.error)
            });
        }
        const { amount, stripePaymentIntentId } = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [existing] = (await sql `
				SELECT id, status, total, amount_paid FROM invoices
				WHERE id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!existing)
            return reply.code(404).send({ error: "Invoice not found" });
        if (existing.status === "void") {
            return reply.code(409).send({ error: "Cannot pay a voided invoice" });
        }
        const newAmountPaid = Math.round((Number(existing.amount_paid) + amount) * 100) / 100;
        const newStatus = derivePaymentStatus(Number(existing.total), newAmountPaid, existing.status);
        const paidAt = newStatus === "paid" ? sql `NOW()` : sql `paid_at`;
        const [invoice] = await sql `
				UPDATE invoices SET
					amount_paid               = ${newAmountPaid},
					status                    = ${newStatus},
					paid_at                   = ${paidAt},
					stripe_payment_intent_id  = COALESCE(${stripePaymentIntentId ?? null}, stripe_payment_intent_id),
					updated_at                = NOW()
				WHERE id = ${invoiceId}
				RETURNING
					id,
					invoice_number  AS "invoiceNumber",
					status,
					total,
					amount_paid     AS "amountPaid",
					balance_due     AS "balanceDue",
					paid_at         AS "paidAt",
					updated_at      AS "updatedAt"
			`;
        return reply.send({ message: "Payment recorded", invoice });
    });
    // ----------------------------------------------------------
    // POST /invoices/:invoiceId/void
    // Void an invoice. Irreversible (for non-devs).
    // Sets status = void, clears balance conceptually.
    // ----------------------------------------------------------
    fastify.post("/invoices/:invoiceId/void", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { invoiceId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [existing] = (await sql `
				SELECT id, status FROM invoices
				WHERE id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!existing)
            return reply.code(404).send({ error: "Invoice not found" });
        if (existing.status === "paid") {
            return reply.code(409).send({
                error: "Cannot void a paid invoice. Issue a refund instead."
            });
        }
        await sql `
				UPDATE invoices
				SET status = 'void', updated_at = NOW()
				WHERE id = ${invoiceId}
			`;
        return reply.send({ message: "Invoice voided" });
    });
    // ----------------------------------------------------------
    // PUT /invoices/:invoiceId/line-items
    // Replace all line items. Recalculates totals.
    // Only allowed on draft invoices.
    // ----------------------------------------------------------
    fastify.put("/invoices/:invoiceId/line-items", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { invoiceId } = request.params;
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
        const [existing] = (await sql `
				SELECT id, status, tax_rate FROM invoices
				WHERE id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!existing)
            return reply.code(404).send({ error: "Invoice not found" });
        if (!["draft"].includes(existing.status) && !isDev(user)) {
            return reply.code(409).send({
                error: "Line items can only be edited on draft invoices"
            });
        }
        const taxRate = Number(existing.tax_rate);
        const { subtotal, taxAmount, total } = calcTotals(lineItems, taxRate);
        await sql `DELETE FROM invoice_line_items WHERE invoice_id = ${invoiceId}`;
        for (const li of lineItems) {
            await sql `
					INSERT INTO invoice_line_items (
						invoice_id, pricebook_item_id, item_type, name, description,
						quantity, unit_price, unit_cost, taxable, sort_order
					) VALUES (
						${invoiceId},
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
        await sql `
				UPDATE invoices
				SET subtotal = ${subtotal}, tax_amount = ${taxAmount}, total = ${total}, updated_at = NOW()
				WHERE id = ${invoiceId}
			`;
        const updated = await sql `
				SELECT
					id,
					pricebook_item_id AS "pricebookItemId",
					item_type         AS "itemType",
					name, description, quantity,
					unit_price        AS "unitPrice",
					unit_cost         AS "unitCost",
					taxable,
					sort_order        AS "sortOrder"
				FROM invoice_line_items
				WHERE invoice_id = ${invoiceId}
				ORDER BY sort_order, created_at
			`;
        return reply.send({
            message: "Line items updated",
            lineItems: updated,
            subtotal,
            taxAmount,
            total
        });
    });
}
