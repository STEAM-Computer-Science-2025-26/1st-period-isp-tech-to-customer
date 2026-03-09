// services/routes/financingRoutes.ts
// DIY consumer financing — application intake, approval workflow, payment plan
// management. No external lender API required. When you land customers, wire
// in Wisetack/Synchrony by replacing the approval logic.
//
// Flow:
//   1. Tech presents financing option at checkout
//   2. Customer applies → POST /financing/applications
//   3. Admin reviews and approves/declines → POST /financing/applications/:id/approve
//   4. Payment plan created automatically on approval
//   5. Payments tracked → POST /financing/plans/:id/record-payment
//   6. Overdue plans surfaced in GET /financing/overdue
//
// Endpoints:
//   POST   /financing/applications                     — submit application
//   GET    /financing/applications                     — list applications
//   GET    /financing/applications/:id                 — application detail
//   POST   /financing/applications/:id/approve         — approve + create plan
//   POST   /financing/applications/:id/decline         — decline with reason
//   GET    /financing/plans                            — list payment plans
//   GET    /financing/plans/:id                        — plan detail + schedule
//   POST   /financing/plans/:id/record-payment         — record a payment received
//   GET    /financing/overdue                          — overdue plans
//   GET    /financing/calculator                       — monthly payment estimator
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
// ─── Payment calculator ───────────────────────────────────────────────────────
function calculateMonthlyPayment(principal, annualRatePct, termMonths) {
    if (annualRatePct === 0)
        return Math.round((principal / termMonths) * 100) / 100;
    const r = annualRatePct / 100 / 12;
    const payment = (principal * (r * Math.pow(1 + r, termMonths))) /
        (Math.pow(1 + r, termMonths) - 1);
    return Math.round(payment * 100) / 100;
}
function buildPaymentSchedule(principal, annualRatePct, termMonths, firstPaymentDate) {
    const monthlyPayment = calculateMonthlyPayment(principal, annualRatePct, termMonths);
    const monthlyRate = annualRatePct / 100 / 12;
    const schedule = [];
    let balance = principal;
    const start = new Date(firstPaymentDate);
    for (let i = 1; i <= termMonths; i++) {
        const dueDate = new Date(start);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
        const interest = Math.round(balance * monthlyRate * 100) / 100;
        const principalPart = i === termMonths
            ? Math.round(balance * 100) / 100 // last payment clears balance
            : Math.round((monthlyPayment - interest) * 100) / 100;
        balance = Math.max(0, Math.round((balance - principalPart) * 100) / 100);
        schedule.push({
            paymentNumber: i,
            dueDate: dueDate.toISOString().split("T")[0],
            amount: i === termMonths ? principalPart + interest : monthlyPayment,
            principal: principalPart,
            interest
        });
    }
    return schedule;
}
// ─── Schemas ─────────────────────────────────────────────────────────────────
const createApplicationSchema = z.object({
    // Customer info
    customerId: z.string().uuid().optional(),
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    email: z.string().email().optional(),
    phone: z.string().min(7).max(30),
    address: z.string().max(300).optional(),
    city: z.string().max(80).optional(),
    state: z.string().length(2).optional(),
    zip: z.string().max(10).optional(),
    // Application details
    invoiceId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    requestedAmount: z.number().min(100).max(50000),
    requestedTermMonths: z
        .enum(["6", "12", "18", "24", "36", "48", "60"])
        .default("12"),
    // Self-reported financial info
    annualIncome: z.number().min(0).optional(),
    employmentStatus: z
        .enum(["employed", "self_employed", "retired", "other"])
        .optional(),
    notes: z.string().max(500).optional()
});
const approveApplicationSchema = z.object({
    approvedAmount: z.number().min(100),
    termMonths: z.number().int().min(3).max(60),
    annualInterestRate: z.number().min(0).max(35).default(0), // 0 = interest-free promo
    firstPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().max(500).optional()
});
const declineSchema = z.object({
    reason: z.string().min(1).max(500)
});
const recordPaymentSchema = z.object({
    amount: z.number().min(0.01),
    paymentDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    paymentMethod: z.enum(["ach", "card", "check", "cash"]).default("ach"),
    referenceNumber: z.string().max(80).optional(),
    notes: z.string().max(300).optional()
});
const calculatorSchema = z.object({
    amount: z.coerce.number().min(1),
    termMonths: z.coerce.number().int().min(1).max(120),
    annualRatePct: z.coerce.number().min(0).max(35).default(0)
});
const listApplicationsSchema = z.object({
    companyId: z.string().uuid().optional(),
    status: z.enum(["pending", "approved", "declined", "cancelled"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
// ─── Routes ──────────────────────────────────────────────────────────────────
export async function financingRoutes(fastify) {
    // ── GET /financing/calculator ─────────────────────────────────────────────
    // Public-friendly estimator — no auth needed.
    fastify.get("/financing/calculator", async (request, reply) => {
        const parsed = calculatorSchema.safeParse(request.query);
        if (!parsed.success)
            return reply.code(400).send({ error: "Invalid params" });
        const { amount, termMonths, annualRatePct } = parsed.data;
        const monthlyPayment = calculateMonthlyPayment(amount, annualRatePct, termMonths);
        const totalCost = Math.round(monthlyPayment * termMonths * 100) / 100;
        const totalInterest = Math.round((totalCost - amount) * 100) / 100;
        return reply.send({
            principal: amount,
            termMonths,
            annualRatePct,
            monthlyPayment,
            totalCost,
            totalInterest
        });
    });
    // ── POST /financing/applications ──────────────────────────────────────────
    fastify.post("/financing/applications", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const companyId = resolveCompanyId(user);
        if (!companyId && !isDev(user))
            return reply.code(403).send({ error: "Forbidden" });
        const parsed = createApplicationSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const b = parsed.data;
        const sql = getSql();
        const [application] = (await sql `
				INSERT INTO financing_applications (
					company_id, customer_id, invoice_id, job_id,
					first_name, last_name, email, phone,
					address, city, state, zip,
					requested_amount, requested_term_months,
					annual_income, employment_status,
					notes, status,
					submitted_by_user_id
				) VALUES (
					${companyId}, ${b.customerId ?? null}, ${b.invoiceId ?? null}, ${b.jobId ?? null},
					${b.firstName}, ${b.lastName}, ${b.email ?? null}, ${b.phone},
					${b.address ?? null}, ${b.city ?? null}, ${b.state ?? null}, ${b.zip ?? null},
					${b.requestedAmount}, ${parseInt(b.requestedTermMonths)},
					${b.annualIncome ?? null}, ${b.employmentStatus ?? null},
					${b.notes ?? null}, 'pending',
					${user.userId ?? user.id ?? null}
				)
				RETURNING
					id, status, requested_amount AS "requestedAmount",
					requested_term_months AS "requestedTermMonths",
					created_at AS "createdAt"
			`);
        return reply.code(201).send({ application });
    });
    // ── GET /financing/applications ───────────────────────────────────────────
    fastify.get("/financing/applications", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const companyId = resolveCompanyId(user);
        const parsed = listApplicationsSchema.safeParse(request.query);
        if (!parsed.success)
            return reply.code(400).send({ error: "Invalid query" });
        const { status, limit, offset } = parsed.data;
        const sql = getSql();
        const applications = (await sql `
				SELECT
					fa.id,
					fa.first_name || ' ' || fa.last_name AS "applicantName",
					fa.phone, fa.email,
					fa.requested_amount  AS "requestedAmount",
					fa.requested_term_months AS "requestedTermMonths",
					fa.status,
					fa.created_at        AS "createdAt"
				FROM financing_applications fa
				WHERE (${isDev(user) && !companyId} OR fa.company_id = ${companyId})
					AND (${status ?? null}::text IS NULL OR fa.status = ${status ?? null})
				ORDER BY fa.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`);
        return reply.send({ applications, limit, offset });
    });
    // ── GET /financing/applications/:id ───────────────────────────────────────
    fastify.get("/financing/applications/:id", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { id } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [application] = (await sql `
				SELECT fa.*, fp.id AS "planId", fp.status AS "planStatus"
				FROM financing_applications fa
				LEFT JOIN financing_plans fp ON fp.application_id = fa.id
				WHERE fa.id = ${id}
					AND (${isDev(user) && !companyId} OR fa.company_id = ${companyId})
			`);
        if (!application)
            return reply.code(404).send({ error: "Application not found" });
        return reply.send({ application });
    });
    // ── POST /financing/applications/:id/approve ──────────────────────────────
    fastify.post("/financing/applications/:id/approve", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { id } = request.params;
        const companyId = resolveCompanyId(user);
        if (!isManager(user))
            return reply.code(403).send({ error: "Managers only" });
        const parsed = approveApplicationSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const b = parsed.data;
        const sql = getSql();
        const [application] = (await sql `
				UPDATE financing_applications SET
					status      = 'approved',
					approved_by = ${user.userId ?? user.id ?? null},
					approved_at = NOW(),
					updated_at  = NOW()
				WHERE id = ${id}
					AND status = 'pending'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, company_id AS "companyId", customer_id AS "customerId",
					invoice_id AS "invoiceId", first_name AS "firstName"
			`);
        if (!application)
            return reply
                .code(404)
                .send({ error: "Application not found or not pending" });
        // Compute plan
        const monthlyPayment = calculateMonthlyPayment(b.approvedAmount, b.annualInterestRate, b.termMonths);
        const totalCost = Math.round(monthlyPayment * b.termMonths * 100) / 100;
        const schedule = buildPaymentSchedule(b.approvedAmount, b.annualInterestRate, b.termMonths, b.firstPaymentDate);
        // Create payment plan
        const [plan] = (await sql `
				INSERT INTO financing_plans (
					company_id, application_id, customer_id, invoice_id,
					principal, annual_interest_rate, term_months,
					monthly_payment, total_cost,
					amount_paid, balance_due,
					first_payment_date, next_payment_date,
					payment_schedule, status,
					notes
				) VALUES (
					${application.companyId}, ${id},
					${application.customerId ?? null}, ${application.invoiceId ?? null},
					${b.approvedAmount}, ${b.annualInterestRate}, ${b.termMonths},
					${monthlyPayment}, ${totalCost},
					0, ${b.approvedAmount},
					${b.firstPaymentDate}, ${b.firstPaymentDate},
					${JSON.stringify(schedule)}::jsonb, 'active',
					${b.notes ?? null}
				)
				RETURNING
					id, principal, monthly_payment AS "monthlyPayment",
					term_months AS "termMonths", first_payment_date AS "firstPaymentDate",
					status
			`);
        return reply
            .code(201)
            .send({ application: { id, status: "approved" }, plan, schedule });
    });
    // ── POST /financing/applications/:id/decline ──────────────────────────────
    fastify.post("/financing/applications/:id/decline", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { id } = request.params;
        const companyId = resolveCompanyId(user);
        if (!isManager(user))
            return reply.code(403).send({ error: "Managers only" });
        const { reason } = declineSchema.parse(request.body);
        const sql = getSql();
        const [application] = (await sql `
				UPDATE financing_applications SET
					status         = 'declined',
					decline_reason = ${reason},
					updated_at     = NOW()
				WHERE id = ${id}
					AND status = 'pending'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status
			`);
        if (!application)
            return reply
                .code(404)
                .send({ error: "Application not found or not pending" });
        return reply.send({ application });
    });
    // ── GET /financing/plans ──────────────────────────────────────────────────
    fastify.get("/financing/plans", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const plans = (await sql `
				SELECT
					fp.id,
					fa.first_name || ' ' || fa.last_name AS "customerName",
					fp.principal, fp.monthly_payment AS "monthlyPayment",
					fp.term_months AS "termMonths",
					fp.amount_paid AS "amountPaid",
					fp.balance_due AS "balanceDue",
					fp.next_payment_date AS "nextPaymentDate",
					fp.status,
					fp.created_at AS "createdAt"
				FROM financing_plans fp
				JOIN financing_applications fa ON fa.id = fp.application_id
				WHERE fp.company_id = ${companyId}
				ORDER BY fp.next_payment_date ASC NULLS LAST
			`);
        return reply.send({ plans });
    });
    // ── GET /financing/plans/:id ──────────────────────────────────────────────
    fastify.get("/financing/plans/:id", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { id } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [plan] = (await sql `
				SELECT fp.*, fa.first_name || ' ' || fa.last_name AS "customerName",
					fa.phone, fa.email
				FROM financing_plans fp
				JOIN financing_applications fa ON fa.id = fp.application_id
				WHERE fp.id = ${id}
					AND (${isDev(user) && !companyId} OR fp.company_id = ${companyId})
			`);
        if (!plan)
            return reply.code(404).send({ error: "Plan not found" });
        const payments = (await sql `
				SELECT id, amount, payment_date AS "paymentDate",
					payment_method AS "paymentMethod", reference_number AS "referenceNumber",
					created_at AS "createdAt"
				FROM financing_payments
				WHERE plan_id = ${id}
				ORDER BY payment_date DESC
			`);
        return reply.send({ plan, payments });
    });
    // ── POST /financing/plans/:id/record-payment ──────────────────────────────
    fastify.post("/financing/plans/:id/record-payment", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { id } = request.params;
        const companyId = resolveCompanyId(user);
        const parsed = recordPaymentSchema.safeParse(request.body);
        if (!parsed.success)
            return reply.code(400).send({ error: "Invalid body" });
        const b = parsed.data;
        const sql = getSql();
        const [plan] = (await sql `
				SELECT id, balance_due, amount_paid, term_months,
					monthly_payment, payment_schedule
				FROM financing_plans
				WHERE id = ${id}
					AND status = 'active'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!plan)
            return reply.code(404).send({ error: "Plan not found or not active" });
        const newAmountPaid = Math.round((Number(plan.amount_paid) + b.amount) * 100) / 100;
        const newBalanceDue = Math.max(0, Math.round((Number(plan.balance_due) - b.amount) * 100) / 100);
        const isFullyPaid = newBalanceDue === 0;
        // Find next payment due date from schedule
        const schedule = plan.payment_schedule ?? [];
        const nextDue = schedule.find((s) => s.amount > 0)?.dueDate ?? null;
        // Log payment
        await sql `
				INSERT INTO financing_payments (
					plan_id, amount, payment_date,
					payment_method, reference_number, notes,
					recorded_by_user_id
				) VALUES (
					${id}, ${b.amount},
					${b.paymentDate ?? new Date().toISOString().split("T")[0]},
					${b.paymentMethod}, ${b.referenceNumber ?? null}, ${b.notes ?? null},
					${user.userId ?? user.id ?? null}
				)
			`;
        // Update plan
        const [updated] = (await sql `
				UPDATE financing_plans SET
					amount_paid      = ${newAmountPaid},
					balance_due      = ${newBalanceDue},
					status           = ${isFullyPaid ? "paid_off" : "active"},
					next_payment_date = ${nextDue},
					updated_at       = NOW()
				WHERE id = ${id}
				RETURNING id, amount_paid AS "amountPaid", balance_due AS "balanceDue",
					status, next_payment_date AS "nextPaymentDate"
			`);
        return reply.send({ plan: updated, fullyPaid: isFullyPaid });
    });
    // ── GET /financing/overdue ────────────────────────────────────────────────
    fastify.get("/financing/overdue", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const plans = (await sql `
				SELECT
					fp.id,
					fa.first_name || ' ' || fa.last_name AS "customerName",
					fa.phone, fa.email,
					fp.monthly_payment AS "monthlyPayment",
					fp.balance_due     AS "balanceDue",
					fp.next_payment_date AS "nextPaymentDate",
					CURRENT_DATE - fp.next_payment_date::date AS "daysOverdue"
				FROM financing_plans fp
				JOIN financing_applications fa ON fa.id = fp.application_id
				WHERE fp.company_id = ${companyId}
					AND fp.status = 'active'
					AND fp.next_payment_date < CURRENT_DATE
				ORDER BY fp.next_payment_date ASC
			`);
        return reply.send({ overdueCount: plans.length, plans });
    });
}
