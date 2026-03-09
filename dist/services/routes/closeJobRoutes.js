// services/routes/closeJobRoutes.ts
// POST /jobs/:jobId/close  — completes job, collects payment
// GET  /jobs/:jobId/payment-summary — returns completed job + invoice
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schema
// ============================================================
const closeJobSchema = z.object({
    completionNotes: z.string().optional(),
    firstTimeFix: z.boolean().optional(),
    customerRating: z.number().int().min(1).max(5).optional(),
    invoiceId: z.string().uuid().optional(),
    paymentMethod: z.enum(["cash", "check", "card", "none"]).default("none"),
    amountToCollect: z.number().min(0).optional(),
    checkNumber: z.string().optional(),
    taxRate: z.number().min(0).max(1).optional()
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
export async function closeJobRoutes(fastify) {
    // ----------------------------------------------------------
    // POST /jobs/:jobId/close
    // ----------------------------------------------------------
    fastify.post("/jobs/:jobId/close", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { jobId } = request.params;
        const parsed = closeJobSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        // 1. Fetch job
        const [job] = (await sql `
				SELECT id, company_id, status
				FROM jobs
				WHERE id = ${jobId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!job)
            return reply.code(404).send({ error: "Job not found" });
        if (job.status === "completed") {
            return reply.code(409).send({ error: "Job is already completed" });
        }
        // 2. Mark job completed
        const [updatedJob] = (await sql `
				UPDATE jobs SET
					status           = 'completed',
					completed_at     = NOW(),
					completion_notes = ${body.completionNotes ?? null},
					updated_at       = NOW()
				WHERE id = ${jobId}
				RETURNING
					id,
					company_id       AS "companyId",
					customer_name    AS "customerName",
					status,
					priority,
					job_type         AS "jobType",
					completion_notes AS "completionNotes",
					completed_at     AS "completedAt",
					updated_at       AS "updatedAt"
			`);
        // 3. Store first_time_fix / customer_rating (graceful — table may not exist)
        try {
            await sql `
					INSERT INTO job_completions (
						job_id, company_id, first_time_fix, customer_rating, completion_notes
					) VALUES (
						${jobId},
						${job.company_id},
						${body.firstTimeFix ?? true},
						${body.customerRating ?? null},
						${body.completionNotes ?? null}
					)
					ON CONFLICT (job_id) DO UPDATE SET
						first_time_fix   = EXCLUDED.first_time_fix,
						customer_rating  = EXCLUDED.customer_rating,
						completion_notes = EXCLUDED.completion_notes
				`;
        }
        catch {
            // job_completions may not exist — not fatal
        }
        // 4. Handle payment
        let paymentResult = { method: body.paymentMethod };
        let invoiceResult = null;
        const method = body.paymentMethod;
        if (method === "cash" || method === "check") {
            if (body.invoiceId &&
                body.amountToCollect != null &&
                body.amountToCollect > 0) {
                const [inv] = (await sql `
						SELECT id, status, total, amount_paid
						FROM invoices
						WHERE id = ${body.invoiceId}
							AND (${isDev(user) && !companyId} OR company_id = ${companyId})
					`);
                if (inv) {
                    const newAmountPaid = Math.round((Number(inv.amount_paid) + body.amountToCollect) * 100) / 100;
                    const newStatus = newAmountPaid >= Number(inv.total)
                        ? "paid"
                        : newAmountPaid > 0
                            ? "partial"
                            : inv.status;
                    const [updated] = (await sql `
							UPDATE invoices SET
								amount_paid = ${newAmountPaid},
								status      = ${newStatus},
								paid_at     = ${newStatus === "paid" ? sql `NOW()` : sql `paid_at`},
								updated_at  = NOW()
							WHERE id = ${body.invoiceId}
							RETURNING
								id,
								invoice_number AS "invoiceNumber",
								status,
								total,
								amount_paid    AS "amountPaid",
								balance_due    AS "balanceDue",
								paid_at        AS "paidAt"
						`);
                    invoiceResult = updated;
                }
            }
            paymentResult = {
                method,
                amountCollected: body.amountToCollect ?? 0,
                ...(method === "check" && body.checkNumber
                    ? { checkNumber: body.checkNumber }
                    : {})
            };
        }
        else if (method === "card") {
            try {
                const Stripe = (await import("stripe")).default;
                const stripeKey = process.env.STRIPE_SECRET_KEY;
                if (!stripeKey)
                    throw new Error("STRIPE_SECRET_KEY not configured");
                const stripe = new Stripe(stripeKey, {
                    apiVersion: "2024-04-10"
                });
                if (!body.invoiceId)
                    throw new Error("invoiceId required for card payment");
                const [inv] = (await sql `
						SELECT id, balance_due, total FROM invoices WHERE id = ${body.invoiceId}
					`);
                const amountCents = Math.round(Number(inv?.balance_due ?? body.amountToCollect ?? 0) * 100);
                const intent = await stripe.paymentIntents.create({
                    amount: amountCents,
                    currency: "usd",
                    metadata: { invoiceId: body.invoiceId, jobId }
                });
                await sql `
						UPDATE invoices
						SET stripe_payment_intent_id = ${intent.id}, updated_at = NOW()
						WHERE id = ${body.invoiceId}
					`;
                paymentResult = {
                    method: "card",
                    clientSecret: intent.client_secret,
                    paymentIntentId: intent.id
                };
                const [updatedInv] = (await sql `
						SELECT id, invoice_number AS "invoiceNumber", status, total,
						       amount_paid AS "amountPaid", balance_due AS "balanceDue"
						FROM invoices WHERE id = ${body.invoiceId}
					`);
                invoiceResult = updatedInv;
            }
            catch (err) {
                return reply.code(503).send({
                    error: "Payment processing unavailable",
                    detail: err.message
                });
            }
        }
        else {
            // none — bill later
            paymentResult = { method: "none" };
            if (body.invoiceId) {
                const [inv] = (await sql `
						SELECT id, invoice_number AS "invoiceNumber", status, total,
						       amount_paid AS "amountPaid", balance_due AS "balanceDue"
						FROM invoices WHERE id = ${body.invoiceId}
					`);
                invoiceResult = inv ?? null;
            }
        }
        return reply.send({
            jobStatus: "completed",
            job: updatedJob,
            payment: paymentResult,
            ...(invoiceResult ? { invoice: invoiceResult } : {})
        });
    });
    // ----------------------------------------------------------
    // GET /jobs/:jobId/payment-summary
    // ----------------------------------------------------------
    fastify.get("/jobs/:jobId/payment-summary", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { jobId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [job] = (await sql `
				SELECT
					j.id,
					j.company_id       AS "companyId",
					j.customer_name    AS "customerName",
					j.status,
					j.priority,
					j.job_type         AS "jobType",
					j.completion_notes AS "completionNotes",
					j.completed_at     AS "completedAt",
					j.updated_at       AS "updatedAt",
					jc.first_time_fix  AS "firstTimeFix",
					jc.customer_rating AS "customerRating"
				FROM jobs j
				LEFT JOIN job_completions jc ON jc.job_id = j.id
				WHERE j.id = ${jobId}
					AND (${isDev(user) && !companyId} OR j.company_id = ${companyId})
			`);
        if (!job)
            return reply.code(404).send({ error: "Job not found" });
        const [invoice] = (await sql `
				SELECT
					id,
					invoice_number AS "invoiceNumber",
					status,
					subtotal,
					tax_rate       AS "taxRate",
					tax_amount     AS "taxAmount",
					total,
					amount_paid    AS "amountPaid",
					balance_due    AS "balanceDue",
					paid_at        AS "paidAt",
					created_at     AS "createdAt"
				FROM invoices
				WHERE job_id = ${jobId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				ORDER BY created_at DESC
				LIMIT 1
			`);
        return reply.send({
            job,
            invoice: invoice ?? null
        });
    });
}
