// services/routes/customerPortalRoutes.ts
// Customer self-service portal — invoice viewing, agreement management
// Uses short-lived portal tokens, not internal JWT
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const generatePortalTokenSchema = z.object({
	customerId: z.string().uuid(),
	expiresInHours: z.number().int().min(1).max(168).default(72) // 1hr–7 days
});
const listPortalInvoicesSchema = z.object({
	status: z.enum(["draft", "sent", "paid", "overdue", "void"]).optional(),
	limit: z.coerce.number().int().min(1).max(50).default(20),
	offset: z.coerce.number().int().min(0).default(0)
});
const portalPaymentSchema = z.object({
	invoiceId: z.string().uuid(),
	paymentMethodId: z.string().min(1) // Stripe PaymentMethod ID from frontend
});
// ============================================================
// Middleware — validates portal token from header
// ============================================================
async function authenticatePortal(request, reply) {
	const token = request.headers["x-portal-token"] ?? "";
	if (!token) {
		reply.code(401).send({ error: "Portal token required" });
		return null;
	}
	const sql = getSql();
	const [record] = await sql`
		SELECT
			customer_id AS "customerId",
			company_id  AS "companyId"
		FROM customer_portal_tokens
		WHERE token = ${token}
		  AND expires_at > NOW()
		  AND revoked = FALSE
	`;
	if (!record) {
		reply.code(401).send({ error: "Invalid or expired portal token" });
		return null;
	}
	return record;
}
// ============================================================
// Admin: generate portal access link for a customer
// ============================================================
export function generatePortalToken(fastify) {
	fastify.post("/portal/token", async (request, reply) => {
		const user = request.user;
		const companyId = user.companyId;
		if (!companyId)
			return reply.code(403).send({ error: "No company on token" });
		const parsed = generatePortalTokenSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply
				.code(400)
				.send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
		}
		const { customerId, expiresInHours } = parsed.data;
		const sql = getSql();
		// Verify customer belongs to company
		const [customer] = await sql`
			SELECT id, first_name AS "firstName", last_name AS "lastName", email
			FROM customers
			WHERE id = ${customerId} AND company_id = ${companyId}
		`;
		if (!customer) return reply.code(404).send({ error: "Customer not found" });
		const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);
		const [tokenRecord] = await sql`
			INSERT INTO customer_portal_tokens (customer_id, company_id, expires_at)
			VALUES (${customerId}, ${companyId}, ${expiresAt.toISOString()})
			RETURNING token, expires_at AS "expiresAt"
		`;
		return {
			token: tokenRecord.token,
			expiresAt: tokenRecord.expiresAt,
			portalUrl: `/portal?token=${tokenRecord.token}`,
			customer: {
				id: customer.id,
				name: `${customer.firstName} ${customer.lastName}`,
				email: customer.email
			}
		};
	});
}
// ============================================================
// Portal endpoints — customer-facing, token auth
// ============================================================
export function getPortalProfile(fastify) {
	fastify.get("/portal/me", async (request, reply) => {
		const ctx = await authenticatePortal(request, reply);
		if (!ctx) return;
		const sql = getSql();
		const [customer] = await sql`
			SELECT
				id, first_name AS "firstName", last_name AS "lastName",
				email, phone, address, city, state, zip,
				customer_type AS "customerType"
			FROM customers
			WHERE id = ${ctx.customerId}
		`;
		if (!customer) return reply.code(404).send({ error: "Customer not found" });
		return { customer };
	});
}
export function getPortalInvoices(fastify) {
	fastify.get("/portal/invoices", async (request, reply) => {
		const ctx = await authenticatePortal(request, reply);
		if (!ctx) return;
		const parsed = listPortalInvoicesSchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid query",
				details: z.treeifyError(parsed.error)
			});
		}
		const { status, limit, offset } = parsed.data;
		const sql = getSql();
		const invoices = await sql`
			SELECT
				i.id,
				i.invoice_number AS "invoiceNumber",
				i.status,
				i.subtotal,
				i.tax_amount     AS "taxAmount",
				i.total,
				i.amount_paid    AS "amountPaid",
				i.balance_due    AS "balanceDue",
				i.due_date       AS "dueDate",
				i.paid_at        AS "paidAt",
				i.created_at     AS "createdAt",
				j.job_type       AS "jobType",
				j.completed_at   AS "jobCompletedAt"
			FROM invoices i
			LEFT JOIN jobs j ON j.id = i.job_id
			WHERE i.customer_id = ${ctx.customerId}
			  AND (${status ?? null}::text IS NULL OR i.status = ${status ?? null})
			ORDER BY i.created_at DESC
			LIMIT ${limit} OFFSET ${offset}
		`;
		return { invoices };
	});
}
export function getPortalInvoiceDetail(fastify) {
	fastify.get("/portal/invoices/:invoiceId", async (request, reply) => {
		const ctx = await authenticatePortal(request, reply);
		if (!ctx) return;
		const { invoiceId } = request.params;
		const sql = getSql();
		const [invoice] = await sql`
			SELECT
				i.*,
				j.job_type AS "jobType", j.address AS "jobAddress",
				j.completed_at AS "jobCompletedAt"
			FROM invoices i
			LEFT JOIN jobs j ON j.id = i.job_id
			WHERE i.id = ${invoiceId} AND i.customer_id = ${ctx.customerId}
		`;
		if (!invoice) return reply.code(404).send({ error: "Invoice not found" });
		// Attach line items
		const lineItems = await sql`
			SELECT id, description, quantity, unit_price AS "unitPrice", total, item_type AS "itemType"
			FROM invoice_line_items
			WHERE invoice_id = ${invoiceId}
			ORDER BY sort_order ASC
		`;
		return { invoice: { ...invoice, lineItems } };
	});
}
export function getPortalAgreements(fastify) {
	fastify.get("/portal/agreements", async (request, reply) => {
		const ctx = await authenticatePortal(request, reply);
		if (!ctx) return;
		const sql = getSql();
		const agreements = await sql`
			SELECT
				ma.id,
				ma.status,
				ma.start_date    AS "startDate",
				ma.end_date      AS "endDate",
				ma.next_billing  AS "nextBilling",
				ma.price,
				ma.billing_cycle AS "billingCycle",
				mat.name         AS "tierName",
				mat.description  AS "tierDescription",
				mat.included_services AS "includedServices"
			FROM maintenance_agreements ma
			JOIN maintenance_agreement_tiers mat ON mat.id = ma.tier_id
			WHERE ma.customer_id = ${ctx.customerId}
			ORDER BY ma.created_at DESC
		`;
		return { agreements };
	});
}
export function getPortalJobHistory(fastify) {
	fastify.get("/portal/jobs", async (request, reply) => {
		const ctx = await authenticatePortal(request, reply);
		if (!ctx) return;
		const sql = getSql();
		const jobs = await sql`
			SELECT
				id, job_type AS "jobType", status,
				scheduled_start AS "scheduledStart",
				completed_at AS "completedAt",
				address, city, state, zip,
				tech_rating AS "techRating"
			FROM jobs
			WHERE customer_id = ${ctx.customerId}
			ORDER BY created_at DESC
			LIMIT 50
		`;
		return { jobs };
	});
}
export async function customerPortalRoutes(fastify) {
	// Portal endpoints — token auth (no JWT)
	getPortalProfile(fastify);
	getPortalInvoices(fastify);
	getPortalInvoiceDetail(fastify);
	getPortalAgreements(fastify);
	getPortalJobHistory(fastify);
	// Admin: generate token — JWT auth
	fastify.register(async (authed) => {
		authed.addHook("onRequest", authenticate);
		generatePortalToken(authed);
	});
}
