// services/routes/payrollRoutes.ts
// Payroll run engine — computes gross pay, deductions, and net pay per tech
// per pay period. Marks payroll as run and tracks payment status.
//
// This builds on top of the existing timesheet data in reportingRoutes and
// tech_pay_rates table. No external API needed.
//
// Flow:
//   1. Admin initiates payroll run → POST /payroll/runs
//      → computes pay for all active techs in the period
//   2. Admin reviews → GET /payroll/runs/:id
//   3. Admin approves → POST /payroll/runs/:id/approve
//   4. Each tech marked paid → POST /payroll/runs/:id/pay/:employeeId
//   5. Full run marked complete → POST /payroll/runs/:id/complete
//
// Endpoints:
//   POST   /payroll/runs                  — initiate payroll run (computes pay)
//   GET    /payroll/runs                  — list payroll runs
//   GET    /payroll/runs/:id              — run detail with per-tech breakdown
//   POST   /payroll/runs/:id/approve      — approve run for payment
//   POST   /payroll/runs/:id/pay/:empId   — mark individual tech as paid
//   POST   /payroll/runs/:id/complete     — mark entire run complete
//   DELETE /payroll/runs/:id              — void a draft run
//
//   GET    /payroll/deductions            — list deduction types for company
//   POST   /payroll/deductions            — create deduction type
//   POST   /payroll/employee-deductions   — assign deduction to employee

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSql } from "../../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../../middleware/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUser(r: FastifyRequest): JWTPayload {
	return r.user as JWTPayload;
}
function isDev(u: JWTPayload): boolean {
	return u.role === "dev";
}
function resolveCompanyId(u: JWTPayload): string | null {
	return u.companyId ?? null;
}
function isManager(u: JWTPayload): boolean {
	return ["owner", "admin", "manager", "dev"].includes(u.role);
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createRunSchema = z.object({
	periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	payFrequency: z
		.enum(["weekly", "biweekly", "semimonthly", "monthly"])
		.default("biweekly"),
	overtimeThresholdHours: z.number().min(1).max(60).default(40),
	notes: z.string().max(500).optional()
});

const markPaidSchema = z.object({
	paymentMethod: z
		.enum(["direct_deposit", "check", "cash", "other"])
		.default("direct_deposit"),
	checkNumber: z.string().max(30).optional(),
	referenceNumber: z.string().max(80).optional()
});

const createDeductionSchema = z.object({
	name: z.string().min(1).max(100),
	type: z.enum(["flat", "percent"]),
	defaultAmount: z.number().min(0).optional(),
	description: z.string().max(300).optional(),
	isTaxable: z.boolean().default(false)
});

const employeeDeductionSchema = z.object({
	employeeId: z.string().uuid(),
	deductionTypeId: z.string().uuid(),
	amount: z.number().min(0),
	effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const listRunsSchema = z.object({
	companyId: z.string().uuid().optional(),
	status: z
		.enum(["draft", "approved", "processing", "completed", "voided"])
		.optional(),
	limit: z.coerce.number().int().min(1).max(50).default(20),
	offset: z.coerce.number().int().min(0).default(0)
});

// ─── Pay computation ──────────────────────────────────────────────────────────

async function computePayForEmployee(
	sql: any,
	employeeId: string,
	companyId: string,
	periodStart: string,
	periodEnd: string,
	otThreshold: number
): Promise<{
	employeeId: string;
	regularHours: number;
	overtimeHours: number;
	regularPay: number;
	overtimePay: number;
	grossPay: number;
	totalDeductions: number;
	netPay: number;
	jobsCompleted: number;
	deductions: any[];
}> {
	// Get time totals for the period
	const [timeData] = (await sql`
		SELECT
			e.id,
			COALESCE(
				SUM(
					EXTRACT(EPOCH FROM (
						COALESCE(jtt.work_ended_at, jtt.departed_job_at) -
						COALESCE(jtt.work_started_at, jtt.arrived_at)
					)) / 3600
				) FILTER (
					WHERE jtt.work_started_at IS NOT NULL
						AND (jtt.work_ended_at IS NOT NULL OR jtt.departed_job_at IS NOT NULL)
				),
				0
			)::numeric                              AS total_hours,
			COUNT(j.id) FILTER (WHERE j.status = 'completed') AS jobs_completed
		FROM employees e
		LEFT JOIN jobs j ON j.assigned_tech_id = e.id
			AND j.completed_at >= ${periodStart}::date
			AND j.completed_at <= (${periodEnd}::date + INTERVAL '1 day')
		LEFT JOIN job_time_tracking jtt ON jtt.job_id = j.id
		WHERE e.id = ${employeeId}
		GROUP BY e.id
	`) as any[];

	// Get pay rate
	const [rate] = (await sql`
		SELECT hourly_rate, overtime_rate
		FROM tech_pay_rates
		WHERE employee_id = ${employeeId}
			AND effective_date <= ${periodEnd}::date
		ORDER BY effective_date DESC
		LIMIT 1
	`) as any[];

	const totalHours = Number(timeData?.total_hours ?? 0);
	const hourlyRate = Number(rate?.hourly_rate ?? 0);
	const overtimeRate = Number(rate?.overtime_rate ?? hourlyRate * 1.5);

	const regularHours = Math.min(totalHours, otThreshold);
	const overtimeHours = Math.max(0, totalHours - otThreshold);
	const regularPay = Math.round(regularHours * hourlyRate * 100) / 100;
	const overtimePay = Math.round(overtimeHours * overtimeRate * 100) / 100;
	const grossPay = regularPay + overtimePay;

	// Get deductions
	const deductions = (await sql`
		SELECT
			ed.id, dt.name, dt.type, ed.amount,
			CASE
				WHEN dt.type = 'flat' THEN ed.amount
				WHEN dt.type = 'percent' THEN ROUND(${grossPay} * ed.amount / 100, 2)
			END AS computed_amount
		FROM employee_deduction_assignments ed
		JOIN payroll_deduction_types dt ON dt.id = ed.deduction_type_id
		WHERE ed.employee_id = ${employeeId}
			AND ed.effective_date <= ${periodEnd}::date
			AND (ed.end_date IS NULL OR ed.end_date >= ${periodStart}::date)
	`) as any[];

	const totalDeductions = deductions.reduce(
		(sum: number, d: any) => sum + Number(d.computed_amount ?? 0),
		0
	);
	const netPay = Math.max(
		0,
		Math.round((grossPay - totalDeductions) * 100) / 100
	);

	return {
		employeeId,
		regularHours: Math.round(regularHours * 100) / 100,
		overtimeHours: Math.round(overtimeHours * 100) / 100,
		regularPay,
		overtimePay,
		grossPay,
		totalDeductions: Math.round(totalDeductions * 100) / 100,
		netPay,
		jobsCompleted: Number(timeData?.jobs_completed ?? 0),
		deductions
	};
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function payrollRoutes(fastify: FastifyInstance) {
	// ── POST /payroll/runs ────────────────────────────────────────────────────
	// Compute payroll for all active techs in the period.
	fastify.post(
		"/payroll/runs",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });

			const parsed = createRunSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const {
				periodStart,
				periodEnd,
				payDate,
				payFrequency,
				overtimeThresholdHours,
				notes
			} = parsed.data;
			const sql = getSql();

			// Get all active employees
			const employees = (await sql`
				SELECT id, name, email FROM employees
				WHERE company_id = ${companyId}
					AND is_active = TRUE
			`) as any[];

			if (employees.length === 0) {
				return reply.code(422).send({ error: "No active employees found" });
			}

			// Create the payroll run
			const [run] = (await sql`
				INSERT INTO payroll_runs (
					company_id, period_start, period_end, pay_date,
					pay_frequency, overtime_threshold_hours,
					status, notes, created_by_user_id
				) VALUES (
					${companyId}, ${periodStart}, ${periodEnd}, ${payDate},
					${payFrequency}, ${overtimeThresholdHours},
					'draft', ${notes ?? null}, ${user.userId ?? user.id ?? null}
				)
				RETURNING id, period_start AS "periodStart", period_end AS "periodEnd",
					pay_date AS "payDate", status
			`) as any[];

			// Compute pay for each employee and store line items
			let totalGross = 0;
			let totalNet = 0;
			const lineItems = [];

			for (const emp of employees) {
				const pay = await computePayForEmployee(
					sql,
					emp.id,
					companyId!,
					periodStart,
					periodEnd,
					overtimeThresholdHours
				);

				const [lineItem] = (await sql`
					INSERT INTO payroll_run_employees (
						payroll_run_id, employee_id,
						regular_hours, overtime_hours,
						regular_pay, overtime_pay,
						gross_pay, total_deductions, net_pay,
						jobs_completed, status
					) VALUES (
						${run.id}, ${emp.id},
						${pay.regularHours}, ${pay.overtimeHours},
						${pay.regularPay}, ${pay.overtimePay},
						${pay.grossPay}, ${pay.totalDeductions}, ${pay.netPay},
						${pay.jobsCompleted}, 'pending'
					)
					RETURNING id
				`) as any[];

				totalGross += pay.grossPay;
				totalNet += pay.netPay;
				lineItems.push({
					...pay,
					employeeName: emp.name,
					lineItemId: lineItem.id
				});
			}

			// Update run totals
			await sql`
				UPDATE payroll_runs SET
					total_gross = ${Math.round(totalGross * 100) / 100},
					total_net   = ${Math.round(totalNet * 100) / 100},
					employee_count = ${employees.length}
				WHERE id = ${run.id}
			`;

			return reply.code(201).send({
				run: { ...run, totalGross, totalNet, employeeCount: employees.length },
				lineItems
			});
		}
	);

	// ── GET /payroll/runs ─────────────────────────────────────────────────────
	fastify.get(
		"/payroll/runs",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });

			const parsed = listRunsSchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });

			const { status, limit, offset } = parsed.data;
			const sql = getSql();

			const runs = (await sql`
				SELECT
					id,
					period_start     AS "periodStart",
					period_end       AS "periodEnd",
					pay_date         AS "payDate",
					pay_frequency    AS "payFrequency",
					status,
					employee_count   AS "employeeCount",
					total_gross      AS "totalGross",
					total_net        AS "totalNet",
					approved_at      AS "approvedAt",
					completed_at     AS "completedAt",
					created_at       AS "createdAt"
				FROM payroll_runs
				WHERE company_id = ${companyId}
					AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
				ORDER BY period_start DESC
				LIMIT ${limit} OFFSET ${offset}
			`) as any[];

			return reply.send({ runs, limit, offset });
		}
	);

	// ── GET /payroll/runs/:id ─────────────────────────────────────────────────
	fastify.get(
		"/payroll/runs/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });
			const sql = getSql();

			const [run] = (await sql`
				SELECT * FROM payroll_runs
				WHERE id = ${id}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as any[];

			if (!run) return reply.code(404).send({ error: "Payroll run not found" });

			const employees = (await sql`
				SELECT
					pre.*,
					e.name AS "employeeName",
					e.email AS "employeeEmail"
				FROM payroll_run_employees pre
				JOIN employees e ON e.id = pre.employee_id
				WHERE pre.payroll_run_id = ${id}
				ORDER BY e.name
			`) as any[];

			return reply.send({ run, employees });
		}
	);

	// ── POST /payroll/runs/:id/approve ────────────────────────────────────────
	fastify.post(
		"/payroll/runs/:id/approve",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });
			const sql = getSql();

			const [run] = (await sql`
				UPDATE payroll_runs SET
					status      = 'approved',
					approved_by = ${user.userId ?? user.id ?? null},
					approved_at = NOW(),
					updated_at  = NOW()
				WHERE id = ${id}
					AND status = 'draft'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status, approved_at AS "approvedAt"
			`) as any[];

			if (!run)
				return reply.code(404).send({ error: "Run not found or not in draft" });
			return reply.send({ run });
		}
	);

	// ── POST /payroll/runs/:id/pay/:empId ─────────────────────────────────────
	// Mark an individual employee as paid within this run.
	fastify.post(
		"/payroll/runs/:id/pay/:empId",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id, empId } = request.params as { id: string; empId: string };
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });

			const parsed = markPaidSchema.safeParse(request.body ?? {});
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });

			const b = parsed.data;
			const sql = getSql();

			const [lineItem] = (await sql`
				UPDATE payroll_run_employees SET
					status           = 'paid',
					payment_method   = ${b.paymentMethod},
					check_number     = ${b.checkNumber ?? null},
					reference_number = ${b.referenceNumber ?? null},
					paid_at          = NOW()
				WHERE payroll_run_id = ${id}
					AND employee_id = ${empId}
					AND status = 'pending'
				RETURNING id, status, paid_at AS "paidAt"
			`) as any[];

			if (!lineItem)
				return reply
					.code(404)
					.send({ error: "Employee not found in this run or already paid" });
			return reply.send({ lineItem });
		}
	);

	// ── POST /payroll/runs/:id/complete ───────────────────────────────────────
	fastify.post(
		"/payroll/runs/:id/complete",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });
			const sql = getSql();

			const [run] = (await sql`
				UPDATE payroll_runs SET
					status       = 'completed',
					completed_at = NOW(),
					updated_at   = NOW()
				WHERE id = ${id}
					AND status = 'approved'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status, completed_at AS "completedAt"
			`) as any[];

			if (!run)
				return reply.code(404).send({ error: "Run not found or not approved" });
			return reply.send({ run });
		}
	);

	// ── DELETE /payroll/runs/:id ──────────────────────────────────────────────
	fastify.delete(
		"/payroll/runs/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });
			const sql = getSql();

			const [run] = (await sql`
				UPDATE payroll_runs SET status = 'voided', updated_at = NOW()
				WHERE id = ${id}
					AND status = 'draft'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id
			`) as any[];

			if (!run)
				return reply.code(404).send({ error: "Run not found or not voidable" });
			return reply.send({ voided: true });
		}
	);

	// ── POST /payroll/deductions ──────────────────────────────────────────────
	fastify.post(
		"/payroll/deductions",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });

			const parsed = createDeductionSchema.safeParse(request.body);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });

			const b = parsed.data;
			const sql = getSql();

			const [deduction] = (await sql`
				INSERT INTO payroll_deduction_types (
					company_id, name, type, default_amount, description, is_taxable
				) VALUES (
					${companyId}, ${b.name}, ${b.type},
					${b.defaultAmount ?? null}, ${b.description ?? null}, ${b.isTaxable}
				)
				RETURNING id, name, type, default_amount AS "defaultAmount", is_taxable AS "isTaxable"
			`) as any[];

			return reply.code(201).send({ deduction });
		}
	);

	// ── GET /payroll/deductions ───────────────────────────────────────────────
	fastify.get(
		"/payroll/deductions",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const deductions = (await sql`
				SELECT id, name, type, default_amount AS "defaultAmount",
					description, is_taxable AS "isTaxable", is_active AS "isActive"
				FROM payroll_deduction_types
				WHERE company_id = ${companyId}
				ORDER BY name
			`) as any[];

			return reply.send({ deductions });
		}
	);

	// ── POST /payroll/employee-deductions ─────────────────────────────────────
	fastify.post(
		"/payroll/employee-deductions",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!isManager(user))
				return reply.code(403).send({ error: "Managers only" });

			const parsed = employeeDeductionSchema.safeParse(request.body);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });

			const b = parsed.data;
			const sql = getSql();

			const [assignment] = (await sql`
				INSERT INTO employee_deduction_assignments (
					employee_id, deduction_type_id, amount, effective_date, company_id
				) VALUES (
					${b.employeeId}, ${b.deductionTypeId}, ${b.amount},
					${b.effectiveDate}, ${companyId}
				)
				RETURNING id, employee_id AS "employeeId", amount, effective_date AS "effectiveDate"
			`) as any[];

			return reply.code(201).send({ assignment });
		}
	);
}
