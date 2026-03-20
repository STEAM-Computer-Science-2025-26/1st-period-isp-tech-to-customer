// services/routes/accountsPayableRoutes.ts
// Accounts payable automation — vendor bill management, approval workflows,
// payment scheduling, and spend tracking.
//
// This sits alongside the existing PO system. POs track what you ordered;
// AP tracks what you owe and when you pay it.
//
// Flow:
//   1. Vendor sends bill → POST /ap/bills (can be manual entry or linked to a PO)
//   2. Bill goes through approval if over threshold → POST /ap/bills/:id/approve
//   3. Payment is scheduled → POST /ap/bills/:id/schedule-payment
//   4. Payment is marked sent → POST /ap/bills/:id/mark-paid
//   5. Reports surface aging, spend by vendor, cash flow forecast
//
// Endpoints:
//   POST   /ap/vendors                       — create vendor
//   GET    /ap/vendors                       — list vendors
//   GET    /ap/vendors/:id                   — vendor detail + payment history
//   PUT    /ap/vendors/:id                   — update vendor
//
//   POST   /ap/bills                         — create bill
//   GET    /ap/bills                         — list bills (filterable by status, vendor, due date)
//   GET    /ap/bills/:id                     — bill detail with line items
//   PUT    /ap/bills/:id                     — update bill (before approval)
//   POST   /ap/bills/:id/approve             — approve bill for payment
//   POST   /ap/bills/:id/reject              — reject bill (sends back to draft)
//   POST   /ap/bills/:id/schedule-payment    — set payment date + method
//   POST   /ap/bills/:id/mark-paid           — record that payment was sent
//   DELETE /ap/bills/:id                     — void a bill (draft/rejected only)
//
//   GET    /ap/aging                         — AP aging report (current/30/60/90+)
//   GET    /ap/cash-flow                     — upcoming payment obligations by date
//   GET    /ap/spend-by-vendor               — spend totals per vendor per period

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUser(request: FastifyRequest): JWTPayload {
	return request.user as JWTPayload;
}

function isDev(user: JWTPayload): boolean {
	return user.role === "dev";
}

function resolveCompanyId(user: JWTPayload): string | null {
	return user.companyId ?? null;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createVendorSchema = z.object({
	name: z.string().min(1).max(200),
	contactName: z.string().max(120).optional(),
	email: z.string().email().optional(),
	phone: z.string().max(30).optional(),
	address: z.string().max(300).optional(),
	city: z.string().max(80).optional(),
	state: z.string().length(2).optional(),
	zip: z.string().max(10).optional(),
	paymentTerms: z
		.enum(["net15", "net30", "net45", "net60", "due_on_receipt"])
		.default("net30"),
	defaultPaymentMethod: z
		.enum(["check", "ach", "wire", "card", "other"])
		.default("check"),
	accountNumber: z.string().max(80).optional(), // your account # with this vendor
	notes: z.string().max(1000).optional()
});

const createBillSchema = z.object({
	vendorId: z.string().uuid(),
	billNumber: z.string().max(80).optional(), // vendor's invoice number
	purchaseOrderId: z.string().uuid().optional(), // link to existing PO
	billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	lineItems: z
		.array(
			z.object({
				description: z.string().min(1).max(300),
				quantity: z.number().positive(),
				unitCost: z.number().min(0),
				category: z.string().max(80).optional() // e.g. "parts", "subcontractor", "equipment"
			})
		)
		.min(1),
	notes: z.string().max(1000).optional()
});

const approveBillSchema = z.object({
	notes: z.string().max(500).optional()
});

const rejectBillSchema = z.object({
	reason: z.string().min(1).max(500)
});

const schedulePaymentSchema = z.object({
	paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	paymentMethod: z.enum(["check", "ach", "wire", "card", "other"]),
	checkNumber: z.string().max(30).optional(),
	notes: z.string().max(500).optional()
});

const markPaidSchema = z.object({
	paidDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	checkNumber: z.string().max(30).optional(),
	referenceNumber: z.string().max(80).optional(), // ACH trace, wire ref, etc.
	notes: z.string().max(500).optional()
});

const listBillsSchema = z.object({
	companyId: z.string().uuid().optional(),
	vendorId: z.string().uuid().optional(),
	status: z
		.enum([
			"draft",
			"pending_approval",
			"approved",
			"scheduled",
			"paid",
			"rejected",
			"void"
		])
		.optional(),
	overdue: z.coerce.boolean().optional(),
	since: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	until: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

const agingSchema = z.object({
	companyId: z.string().uuid().optional()
});

const cashFlowSchema = z.object({
	companyId: z.string().uuid().optional(),
	days: z.coerce.number().int().min(7).max(90).default(30)
});

const spendSchema = z.object({
	companyId: z.string().uuid().optional(),
	days: z.coerce.number().int().min(1).max(365).default(90)
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function accountsPayableRoutes(fastify: FastifyInstance) {
	// =========================================================================
	// VENDORS
	// =========================================================================

	// ── POST /ap/vendors ──────────────────────────────────────────────────────
	fastify.post(
		"/ap/vendors",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });

			const parsed = createVendorSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const b = parsed.data;
			const sql = getSql();

			const [vendor] = (await sql`
				INSERT INTO ap_vendors (
					company_id, name, contact_name, email, phone,
					address, city, state, zip,
					payment_terms, default_payment_method,
					account_number, notes
				) VALUES (
					${companyId}, ${b.name}, ${b.contactName ?? null}, ${b.email ?? null}, ${b.phone ?? null},
					${b.address ?? null}, ${b.city ?? null}, ${b.state ?? null}, ${b.zip ?? null},
					${b.paymentTerms}, ${b.defaultPaymentMethod},
					${b.accountNumber ?? null}, ${b.notes ?? null}
				)
				RETURNING
					id, name, contact_name AS "contactName", email, phone,
					payment_terms AS "paymentTerms", default_payment_method AS "defaultPaymentMethod",
					created_at AS "createdAt"
			`) as any[];

			return reply.code(201).send({ vendor });
		}
	);

	// ── GET /ap/vendors ───────────────────────────────────────────────────────
	fastify.get(
		"/ap/vendors",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const vendors = (await sql`
				SELECT
					v.id, v.name, v.contact_name AS "contactName",
					v.email, v.phone,
					v.payment_terms AS "paymentTerms",
					v.default_payment_method AS "defaultPaymentMethod",
					v.is_active AS "isActive",
					COUNT(b.id) FILTER (WHERE b.status NOT IN ('paid', 'void')) AS "openBills",
					COALESCE(SUM(b.total) FILTER (WHERE b.status NOT IN ('paid', 'void')), 0) AS "amountOwed"
				FROM ap_vendors v
				LEFT JOIN ap_bills b ON b.vendor_id = v.id
				WHERE v.company_id = ${companyId}
				GROUP BY v.id
				ORDER BY v.name
			`) as any[];

			return reply.send({ vendors });
		}
	);

	// ── PUT /ap/vendors/:id ───────────────────────────────────────────────────
	fastify.put(
		"/ap/vendors/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const b = createVendorSchema.partial().parse(request.body);
			const sql = getSql();

			const [updated] = (await sql`
				UPDATE ap_vendors SET
					name                   = COALESCE(${b.name ?? null}, name),
					contact_name           = COALESCE(${b.contactName ?? null}, contact_name),
					email                  = COALESCE(${b.email ?? null}, email),
					phone                  = COALESCE(${b.phone ?? null}, phone),
					payment_terms          = COALESCE(${b.paymentTerms ?? null}, payment_terms),
					default_payment_method = COALESCE(${b.defaultPaymentMethod ?? null}, default_payment_method),
					notes                  = COALESCE(${b.notes ?? null}, notes),
					updated_at             = NOW()
				WHERE id = ${id}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, name, updated_at AS "updatedAt"
			`) as any[];

			if (!updated) return reply.code(404).send({ error: "Vendor not found" });
			return reply.send({ vendor: updated });
		}
	);

	// =========================================================================
	// BILLS
	// =========================================================================

	// ── POST /ap/bills ────────────────────────────────────────────────────────
	fastify.post(
		"/ap/bills",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });

			const parsed = createBillSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const b = parsed.data;
			const sql = getSql();

			// Verify vendor belongs to company
			const [vendor] = (await sql`
				SELECT id, payment_terms FROM ap_vendors
				WHERE id = ${b.vendorId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as any[];

			if (!vendor) return reply.code(404).send({ error: "Vendor not found" });

			const total = b.lineItems.reduce(
				(sum, li) => sum + li.quantity * li.unitCost,
				0
			);

			// Fetch company approval threshold
			const [company] = (await sql`
				SELECT ap_approval_threshold FROM companies WHERE id = ${companyId}
			`) as any[];

			const threshold = Number(company?.ap_approval_threshold ?? 500);
			const needsApproval = total >= threshold;

			const [bill] = (await sql`
				INSERT INTO ap_bills (
					company_id, vendor_id, purchase_order_id,
					bill_number, bill_date, due_date,
					total, amount_paid, balance_due,
					status, notes,
					created_by_user_id
				) VALUES (
					${companyId}, ${b.vendorId}, ${b.purchaseOrderId ?? null},
					${b.billNumber ?? null}, ${b.billDate}, ${b.dueDate},
					${total}, 0, ${total},
					${needsApproval ? "pending_approval" : "approved"},
					${b.notes ?? null},
					${user.userId ?? user.id ?? null}
				)
				RETURNING
					id, bill_number AS "billNumber", bill_date AS "billDate",
					due_date AS "dueDate", total, status,
					created_at AS "createdAt"
			`) as any[];

			// Insert line items
			for (const li of b.lineItems) {
				await sql`
					INSERT INTO ap_bill_line_items (
						bill_id, description, quantity, unit_cost, total, category
					) VALUES (
						${bill.id}, ${li.description}, ${li.quantity},
						${li.unitCost}, ${li.quantity * li.unitCost},
						${li.category ?? null}
					)
				`;
			}

			return reply.code(201).send({ bill, needsApproval });
		}
	);

	// ── GET /ap/bills ─────────────────────────────────────────────────────────
	fastify.get(
		"/ap/bills",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);

			const parsed = listBillsSchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });

			const { vendorId, status, overdue, since, until, limit, offset } =
				parsed.data;
			const sql = getSql();

			const bills = (await sql`
				SELECT
					b.id,
					b.bill_number    AS "billNumber",
					b.bill_date      AS "billDate",
					b.due_date       AS "dueDate",
					b.total,
					b.amount_paid    AS "amountPaid",
					b.balance_due    AS "balanceDue",
					b.status,
					v.name           AS "vendorName",
					b.created_at     AS "createdAt",
					CASE WHEN b.due_date < CURRENT_DATE AND b.status NOT IN ('paid', 'void') THEN TRUE ELSE FALSE END AS "isOverdue",
					CURRENT_DATE - b.due_date::date AS "daysOverdue"
				FROM ap_bills b
				JOIN ap_vendors v ON v.id = b.vendor_id
				WHERE (${isDev(user) && !companyId} OR b.company_id = ${companyId})
					AND (${vendorId ?? null}::uuid IS NULL OR b.vendor_id = ${vendorId ?? null})
					AND (${status ?? null}::text IS NULL OR b.status = ${status ?? null})
					AND (${overdue ?? null}::boolean IS NULL OR
						(${overdue} = TRUE AND b.due_date < CURRENT_DATE AND b.status NOT IN ('paid', 'void')) OR
						(${overdue} = FALSE)
					)
					AND (${since ?? null}::date IS NULL OR b.bill_date >= ${since ?? null}::date)
					AND (${until ?? null}::date IS NULL OR b.bill_date <= ${until ?? null}::date)
				ORDER BY b.due_date ASC
				LIMIT ${limit} OFFSET ${offset}
			`) as any[];

			return reply.send({ bills, limit, offset });
		}
	);

	// ── GET /ap/bills/:id ─────────────────────────────────────────────────────
	fastify.get(
		"/ap/bills/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [bill] = (await sql`
				SELECT b.*, v.name AS "vendorName", v.email AS "vendorEmail"
				FROM ap_bills b
				JOIN ap_vendors v ON v.id = b.vendor_id
				WHERE b.id = ${id}
					AND (${isDev(user) && !companyId} OR b.company_id = ${companyId})
			`) as any[];

			if (!bill) return reply.code(404).send({ error: "Bill not found" });

			const lineItems = (await sql`
				SELECT id, description, quantity, unit_cost AS "unitCost", total, category
				FROM ap_bill_line_items WHERE bill_id = ${id}
				ORDER BY id
			`) as any[];

			return reply.send({ bill: { ...bill, lineItems } });
		}
	);

	// ── POST /ap/bills/:id/approve ────────────────────────────────────────────
	fastify.post(
		"/ap/bills/:id/approve",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const { notes } = approveBillSchema.parse(request.body ?? {});
			const sql = getSql();

			const [bill] = (await sql`
				UPDATE ap_bills SET
					status       = 'approved',
					approved_by  = ${user.userId ?? user.id ?? null},
					approved_at  = NOW(),
					notes        = COALESCE(${notes ?? null}, notes),
					updated_at   = NOW()
				WHERE id = ${id}
					AND status = 'pending_approval'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status, approved_at AS "approvedAt"
			`) as any[];

			if (!bill)
				return reply
					.code(404)
					.send({ error: "Bill not found or not pending approval" });
			return reply.send({ bill });
		}
	);

	// ── POST /ap/bills/:id/reject ─────────────────────────────────────────────
	fastify.post(
		"/ap/bills/:id/reject",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const { reason } = rejectBillSchema.parse(request.body);
			const sql = getSql();

			const [bill] = (await sql`
				UPDATE ap_bills SET
					status     = 'rejected',
					notes      = ${reason},
					updated_at = NOW()
				WHERE id = ${id}
					AND status = 'pending_approval'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status
			`) as any[];

			if (!bill)
				return reply
					.code(404)
					.send({ error: "Bill not found or not pending approval" });
			return reply.send({ bill });
		}
	);

	// ── POST /ap/bills/:id/schedule-payment ───────────────────────────────────
	fastify.post(
		"/ap/bills/:id/schedule-payment",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);

			const parsed = schedulePaymentSchema.safeParse(request.body);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });

			const b = parsed.data;
			const sql = getSql();

			const [bill] = (await sql`
				UPDATE ap_bills SET
					status              = 'scheduled',
					scheduled_pay_date  = ${b.paymentDate},
					payment_method      = ${b.paymentMethod},
					check_number        = ${b.checkNumber ?? null},
					notes               = COALESCE(${b.notes ?? null}, notes),
					updated_at          = NOW()
				WHERE id = ${id}
					AND status = 'approved'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status, scheduled_pay_date AS "scheduledPayDate", payment_method AS "paymentMethod"
			`) as any[];

			if (!bill)
				return reply
					.code(404)
					.send({ error: "Bill not found or not approved" });
			return reply.send({ bill });
		}
	);

	// ── POST /ap/bills/:id/mark-paid ──────────────────────────────────────────
	fastify.post(
		"/ap/bills/:id/mark-paid",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);

			const parsed = markPaidSchema.safeParse(request.body ?? {});
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });

			const b = parsed.data;
			const sql = getSql();

			const [bill] = (await sql`
				UPDATE ap_bills SET
					status           = 'paid',
					amount_paid      = total,
					balance_due      = 0,
					paid_date        = ${b.paidDate ?? new Date().toISOString().split("T")[0]},
					check_number     = COALESCE(${b.checkNumber ?? null}, check_number),
					reference_number = ${b.referenceNumber ?? null},
					paid_by          = ${user.userId ?? user.id ?? null},
					notes            = COALESCE(${b.notes ?? null}, notes),
					updated_at       = NOW()
				WHERE id = ${id}
					AND status IN ('approved', 'scheduled')
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status, paid_date AS "paidDate", total, amount_paid AS "amountPaid"
			`) as any[];

			if (!bill)
				return reply.code(404).send({ error: "Bill not found or not payable" });
			return reply.send({ bill });
		}
	);

	// ── DELETE /ap/bills/:id (void) ───────────────────────────────────────────
	fastify.delete(
		"/ap/bills/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [bill] = (await sql`
				UPDATE ap_bills SET status = 'void', updated_at = NOW()
				WHERE id = ${id}
					AND status IN ('draft', 'rejected', 'pending_approval')
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status
			`) as any[];

			if (!bill)
				return reply
					.code(404)
					.send({ error: "Bill not found or cannot be voided" });
			return reply.send({ voided: true, id });
		}
	);

	// =========================================================================
	// REPORTS
	// =========================================================================

	// ── GET /ap/aging ─────────────────────────────────────────────────────────
	// AP aging report — buckets unpaid bills by how overdue they are.
	fastify.get(
		"/ap/aging",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const rows = (await sql`
				SELECT
					v.name                                                        AS "vendorName",
					b.id, b.bill_number AS "billNumber", b.due_date AS "dueDate",
					b.balance_due AS "balanceDue",
					CURRENT_DATE - b.due_date::date                              AS "daysOverdue",
					CASE
						WHEN CURRENT_DATE <= b.due_date::date                    THEN 'current'
						WHEN CURRENT_DATE - b.due_date::date <= 30              THEN '1_30'
						WHEN CURRENT_DATE - b.due_date::date <= 60              THEN '31_60'
						WHEN CURRENT_DATE - b.due_date::date <= 90              THEN '61_90'
						ELSE '90_plus'
					END                                                           AS "bucket"
				FROM ap_bills b
				JOIN ap_vendors v ON v.id = b.vendor_id
				WHERE b.company_id = ${companyId}
					AND b.status NOT IN ('paid', 'void')
				ORDER BY b.due_date ASC
			`) as any[];

			// Summarize by bucket
			const summary = {
				current: 0,
				"1_30": 0,
				"31_60": 0,
				"61_90": 0,
				"90_plus": 0,
				total: 0
			} as Record<string, number>;

			for (const r of rows) {
				summary[r.bucket] = (summary[r.bucket] ?? 0) + Number(r.balanceDue);
				summary.total += Number(r.balanceDue);
			}

			return reply.send({ summary, bills: rows });
		}
	);

	// ── GET /ap/cash-flow ─────────────────────────────────────────────────────
	// Upcoming payment obligations grouped by day.
	fastify.get(
		"/ap/cash-flow",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);

			const parsed = cashFlowSchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });

			const { days } = parsed.data;
			const sql = getSql();

			const rows = (await sql`
				SELECT
					b.due_date::date                                  AS "date",
					COUNT(*)                                          AS "billCount",
					SUM(b.balance_due)                               AS "totalDue",
					ARRAY_AGG(v.name ORDER BY v.name)                AS "vendors"
				FROM ap_bills b
				JOIN ap_vendors v ON v.id = b.vendor_id
				WHERE b.company_id = ${companyId}
					AND b.status NOT IN ('paid', 'void')
					AND b.due_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + (${days} || ' days')::interval
				GROUP BY b.due_date::date
				ORDER BY b.due_date::date ASC
			`) as any[];

			const totalDue = rows.reduce(
				(s: number, r: any) => s + Number(r.totalDue),
				0
			);

			return reply.send({ days, totalDue, byDate: rows });
		}
	);

	// ── GET /ap/spend-by-vendor ───────────────────────────────────────────────
	fastify.get(
		"/ap/spend-by-vendor",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);

			const parsed = spendSchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });

			const { days } = parsed.data;
			const sql = getSql();

			const rows = (await sql`
				SELECT
					v.id                                             AS "vendorId",
					v.name                                           AS "vendorName",
					COUNT(b.id)                                      AS "billCount",
					SUM(b.total)                                     AS "totalBilled",
					SUM(b.amount_paid)                               AS "totalPaid",
					SUM(b.balance_due)                               AS "totalOwed",
					MAX(b.bill_date)                                 AS "lastBillDate"
				FROM ap_vendors v
				JOIN ap_bills b ON b.vendor_id = v.id
				WHERE v.company_id = ${companyId}
					AND b.bill_date >= CURRENT_DATE - (${days} || ' days')::interval
					AND b.status != 'void'
				GROUP BY v.id, v.name
				ORDER BY "totalBilled" DESC
			`) as any[];

			return reply.send({ days, vendors: rows });
		}
	);
}
