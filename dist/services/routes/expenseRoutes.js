// services/routes/expenseRoutes.ts
// Employee expense tracking — submission, receipt logging, approval workflow,
// reimbursement tracking. No external card provider needed.
//
// Flow:
//   1. Employee submits expense → POST /expenses
//   2. Manager reviews → POST /expenses/:id/approve or /reject
//   3. Finance marks reimbursed → POST /expenses/:id/reimburse
//   4. Reports surface spend by category, employee, period
//
// Endpoints:
//   POST   /expenses                      — submit expense
//   GET    /expenses                      — list expenses (filterable)
//   GET    /expenses/:id                  — expense detail
//   PUT    /expenses/:id                  — update (draft only)
//   DELETE /expenses/:id                  — delete (draft only)
//   POST   /expenses/:id/approve          — approve for reimbursement
//   POST   /expenses/:id/reject           — reject with reason
//   POST   /expenses/:id/reimburse        — mark as reimbursed
//   GET    /expenses/summary              — spend by category/employee/period
//   GET    /expenses/pending              — all pending approval (manager view)
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getUser(r) {
	return r.user;
}
function isDev(u) {
	return u.role === "dev";
}
function resolveCompanyId(u) {
	return u.companyId ?? null;
}
function isManager(u) {
	return ["owner", "admin", "manager", "dev"].includes(u.role);
}
// ─── Schemas ─────────────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
	"fuel",
	"parts",
	"tools",
	"meals",
	"lodging",
	"vehicle",
	"training",
	"uniforms",
	"permits",
	"subcontractor",
	"other"
];
const createExpenseSchema = z.object({
	category: z.enum(EXPENSE_CATEGORIES),
	amount: z.number().min(0.01).max(50000),
	description: z.string().min(1).max(500),
	expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	receiptUrl: z.string().url().optional(), // uploaded receipt image URL
	jobId: z.string().uuid().optional(), // link to a specific job
	vehicleId: z.string().optional(), // link to a truck
	notes: z.string().max(1000).optional()
});
const updateExpenseSchema = createExpenseSchema.partial();
const rejectSchema = z.object({
	reason: z.string().min(1).max(500)
});
const reimburseSchema = z.object({
	paymentMethod: z
		.enum(["check", "direct_deposit", "cash", "other"])
		.default("check"),
	checkNumber: z.string().max(30).optional(),
	notes: z.string().max(300).optional()
});
const listExpensesSchema = z.object({
	companyId: z.string().uuid().optional(),
	employeeId: z.string().uuid().optional(),
	category: z.enum(EXPENSE_CATEGORIES).optional(),
	status: z
		.enum(["draft", "submitted", "approved", "rejected", "reimbursed"])
		.optional(),
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
const summarySchema = z.object({
	companyId: z.string().uuid().optional(),
	days: z.coerce.number().int().min(1).max(365).default(30),
	groupBy: z.enum(["category", "employee", "month"]).default("category")
});
// ─── Routes ──────────────────────────────────────────────────────────────────
export async function expenseRoutes(fastify) {
	// ── POST /expenses ────────────────────────────────────────────────────────
	fastify.post(
		"/expenses",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });
			const parsed = createExpenseSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const b = parsed.data;
			const sql = getSql();
			const [expense] = await sql`
				INSERT INTO employee_expenses (
					company_id, employee_id,
					category, amount, description,
					expense_date, receipt_url,
					job_id, vehicle_id, notes,
					status
				) VALUES (
					${companyId},
					${user.userId ?? user.id ?? null},
					${b.category}, ${b.amount}, ${b.description},
					${b.expenseDate}, ${b.receiptUrl ?? null},
					${b.jobId ?? null}, ${b.vehicleId ?? null}, ${b.notes ?? null},
					'submitted'
				)
				RETURNING
					id, category, amount, description,
					expense_date AS "expenseDate", status,
					created_at AS "createdAt"
			`;
			return reply.code(201).send({ expense });
		}
	);
	// ── GET /expenses ─────────────────────────────────────────────────────────
	fastify.get(
		"/expenses",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const parsed = listExpensesSchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });
			const { employeeId, category, status, since, until, limit, offset } =
				parsed.data;
			const sql = getSql();
			// Non-managers can only see their own expenses
			const effectiveEmployeeId = isManager(user)
				? (employeeId ?? null)
				: (user.userId ?? user.id ?? null);
			const expenses = await sql`
				SELECT
					e.id, e.category, e.amount, e.description,
					e.expense_date   AS "expenseDate",
					e.receipt_url    AS "receiptUrl",
					e.status,
					e.job_id         AS "jobId",
					emp.name         AS "employeeName",
					e.created_at     AS "createdAt"
				FROM employee_expenses e
				LEFT JOIN employees emp ON emp.id = e.employee_id
				WHERE (${isDev(user) && !companyId} OR e.company_id = ${companyId})
					AND (${effectiveEmployeeId ?? null}::uuid IS NULL OR e.employee_id = ${effectiveEmployeeId ?? null})
					AND (${category ?? null}::text IS NULL OR e.category = ${category ?? null})
					AND (${status ?? null}::text IS NULL OR e.status = ${status ?? null})
					AND (${since ?? null}::date IS NULL OR e.expense_date >= ${since ?? null}::date)
					AND (${until ?? null}::date IS NULL OR e.expense_date <= ${until ?? null}::date)
				ORDER BY e.expense_date DESC
				LIMIT ${limit} OFFSET ${offset}
			`;
			return reply.send({ expenses, limit, offset });
		}
	);
	// ── GET /expenses/pending ─────────────────────────────────────────────────
	fastify.get(
		"/expenses/pending",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });
			const sql = getSql();
			const expenses = await sql`
				SELECT
					e.id, e.category, e.amount, e.description,
					e.expense_date AS "expenseDate",
					e.receipt_url  AS "receiptUrl",
					emp.name       AS "employeeName",
					e.created_at   AS "submittedAt"
				FROM employee_expenses e
				LEFT JOIN employees emp ON emp.id = e.employee_id
				WHERE e.company_id = ${companyId}
					AND e.status = 'submitted'
				ORDER BY e.created_at ASC
			`;
			return reply.send({ expenses, count: expenses.length });
		}
	);
	// ── GET /expenses/:id ─────────────────────────────────────────────────────
	fastify.get(
		"/expenses/:id",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const [expense] = await sql`
				SELECT e.*, emp.name AS "employeeName"
				FROM employee_expenses e
				LEFT JOIN employees emp ON emp.id = e.employee_id
				WHERE e.id = ${id}
					AND (${isDev(user) && !companyId} OR e.company_id = ${companyId})
					AND (${isManager(user)} OR e.employee_id = ${user.userId ?? user.id ?? null})
			`;
			if (!expense) return reply.code(404).send({ error: "Expense not found" });
			return reply.send({ expense });
		}
	);
	// ── PUT /expenses/:id ─────────────────────────────────────────────────────
	fastify.put(
		"/expenses/:id",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params;
			const companyId = resolveCompanyId(user);
			const b = updateExpenseSchema.parse(request.body);
			const sql = getSql();
			const [updated] = await sql`
				UPDATE employee_expenses SET
					category     = COALESCE(${b.category ?? null}, category),
					amount       = COALESCE(${b.amount ?? null}, amount),
					description  = COALESCE(${b.description ?? null}, description),
					expense_date = COALESCE(${b.expenseDate ?? null}::date, expense_date),
					receipt_url  = COALESCE(${b.receiptUrl ?? null}, receipt_url),
					notes        = COALESCE(${b.notes ?? null}, notes),
					updated_at   = NOW()
				WHERE id = ${id}
					AND status = 'submitted'
					AND employee_id = ${user.userId ?? user.id ?? null}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, category, amount, status, updated_at AS "updatedAt"
			`;
			if (!updated)
				return reply
					.code(404)
					.send({ error: "Expense not found or not editable" });
			return reply.send({ expense: updated });
		}
	);
	// ── DELETE /expenses/:id ──────────────────────────────────────────────────
	fastify.delete(
		"/expenses/:id",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params;
			const companyId = resolveCompanyId(user);
			const sql = getSql();
			const [deleted] = await sql`
				DELETE FROM employee_expenses
				WHERE id = ${id}
					AND status = 'submitted'
					AND employee_id = ${user.userId ?? user.id ?? null}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id
			`;
			if (!deleted)
				return reply
					.code(404)
					.send({ error: "Expense not found or not deletable" });
			return reply.send({ deleted: true });
		}
	);
	// ── POST /expenses/:id/approve ────────────────────────────────────────────
	fastify.post(
		"/expenses/:id/approve",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params;
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });
			const sql = getSql();
			const [expense] = await sql`
				UPDATE employee_expenses SET
					status      = 'approved',
					approved_by = ${user.userId ?? user.id ?? null},
					approved_at = NOW(),
					updated_at  = NOW()
				WHERE id = ${id}
					AND status = 'submitted'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status, approved_at AS "approvedAt"
			`;
			if (!expense)
				return reply
					.code(404)
					.send({ error: "Expense not found or not pending" });
			return reply.send({ expense });
		}
	);
	// ── POST /expenses/:id/reject ─────────────────────────────────────────────
	fastify.post(
		"/expenses/:id/reject",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params;
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });
			const { reason } = rejectSchema.parse(request.body);
			const sql = getSql();
			const [expense] = await sql`
				UPDATE employee_expenses SET
					status        = 'rejected',
					reject_reason = ${reason},
					updated_at    = NOW()
				WHERE id = ${id}
					AND status = 'submitted'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status
			`;
			if (!expense)
				return reply
					.code(404)
					.send({ error: "Expense not found or not pending" });
			return reply.send({ expense });
		}
	);
	// ── POST /expenses/:id/reimburse ──────────────────────────────────────────
	fastify.post(
		"/expenses/:id/reimburse",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { id } = request.params;
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });
			const parsed = reimburseSchema.safeParse(request.body ?? {});
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });
			const b = parsed.data;
			const sql = getSql();
			const [expense] = await sql`
				UPDATE employee_expenses SET
					status           = 'reimbursed',
					reimbursed_by    = ${user.userId ?? user.id ?? null},
					reimbursed_at    = NOW(),
					payment_method   = ${b.paymentMethod},
					check_number     = ${b.checkNumber ?? null},
					updated_at       = NOW()
				WHERE id = ${id}
					AND status = 'approved'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status, reimbursed_at AS "reimbursedAt"
			`;
			if (!expense)
				return reply
					.code(404)
					.send({ error: "Expense not found or not approved" });
			return reply.send({ expense });
		}
	);
	// ── GET /expenses/summary ─────────────────────────────────────────────────
	fastify.get(
		"/expenses/summary",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const parsed = summarySchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });
			const { days, groupBy } = parsed.data;
			const sql = getSql();
			const rows =
				groupBy === "category"
					? await sql`
					SELECT
						category,
						COUNT(*)                                          AS "expenseCount",
						SUM(amount)                                       AS "totalAmount",
						SUM(amount) FILTER (WHERE status = 'reimbursed') AS "reimbursed",
						SUM(amount) FILTER (WHERE status = 'approved')   AS "pendingReimbursement",
						SUM(amount) FILTER (WHERE status = 'submitted')  AS "pendingApproval"
					FROM employee_expenses
					WHERE company_id = ${companyId}
						AND expense_date >= CURRENT_DATE - (${days} || ' days')::interval
					GROUP BY category
					ORDER BY "totalAmount" DESC
				`
					: groupBy === "employee"
						? await sql`
					SELECT
						emp.name                                          AS "employeeName",
						COUNT(e.id)                                       AS "expenseCount",
						SUM(e.amount)                                     AS "totalAmount",
						SUM(e.amount) FILTER (WHERE e.status = 'reimbursed') AS "reimbursed",
						SUM(e.amount) FILTER (WHERE e.status IN ('submitted','approved')) AS "outstanding"
					FROM employee_expenses e
					LEFT JOIN employees emp ON emp.id = e.employee_id
					WHERE e.company_id = ${companyId}
						AND e.expense_date >= CURRENT_DATE - (${days} || ' days')::interval
					GROUP BY emp.id, emp.name
					ORDER BY "totalAmount" DESC
				`
						: await sql`
					SELECT
						DATE_TRUNC('month', expense_date)::date           AS "month",
						COUNT(*)                                          AS "expenseCount",
						SUM(amount)                                       AS "totalAmount"
					FROM employee_expenses
					WHERE company_id = ${companyId}
						AND expense_date >= CURRENT_DATE - (${days} || ' days')::interval
					GROUP BY DATE_TRUNC('month', expense_date)
					ORDER BY "month" DESC
				`;
			return reply.send({ days, groupBy, data: rows });
		}
	);
}
