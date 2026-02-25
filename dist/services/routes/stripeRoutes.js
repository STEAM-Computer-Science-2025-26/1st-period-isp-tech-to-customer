// services/routes/stripeRoutes.ts
// Stripe integration: payment intents for online invoice payment,
// on-site terminal payment, refunds, and webhook to sync payment status.
//
// Flow:
//   1. POST /stripe/payment-intent  → creates PaymentIntent, returns client_secret
//   2. Frontend confirms payment with Stripe.js using client_secret
//   3. Stripe fires webhook → POST /stripe/webhook updates invoice status
//
// Webhook MUST receive the raw body — registered before JSON parsing.
import Stripe from "stripe";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Stripe client
// ============================================================
function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key)
        throw new Error("STRIPE_SECRET_KEY is not set");
    return new Stripe(key, { apiVersion: "2026-01-28.clover" });
}
// ============================================================
// Schemas
// ============================================================
const createPaymentIntentSchema = z.object({
    invoiceId: z.string().check(z.uuid()),
    // Optional: if tech is collecting on-site, pass "present"
    paymentMethodType: z.enum(["card", "card_present"]).default("card")
});
const refundSchema = z.object({
    invoiceId: z.string().check(z.uuid()),
    amount: z.number().min(0.01).optional(), // partial refund — omit for full
    reason: z
        .enum(["duplicate", "fraudulent", "requested_by_customer"])
        .default("requested_by_customer")
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
export async function stripeRoutes(fastify) {
    // ----------------------------------------------------------
    // POST /stripe/payment-intent
    // Creates a Stripe PaymentIntent for an invoice.
    // Returns client_secret — frontend uses this to confirm payment.
    // amount is in cents (Stripe standard).
    // ----------------------------------------------------------
    fastify.post("/stripe/payment-intent", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const parsed = createPaymentIntentSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: z.treeifyError(parsed.error)
            });
        }
        const { invoiceId, paymentMethodType } = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [invoice] = (await sql `
				SELECT
					id, company_id, customer_id, invoice_number,
					total, balance_due, status, stripe_payment_intent_id
				FROM invoices
				WHERE id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!invoice)
            return reply.code(404).send({ error: "Invoice not found" });
        if (invoice.status === "paid") {
            return reply.code(409).send({ error: "Invoice is already paid" });
        }
        if (invoice.status === "void") {
            return reply.code(409).send({ error: "Invoice is voided" });
        }
        if (Number(invoice.balance_due) <= 0) {
            return reply
                .code(409)
                .send({ error: "No balance due on this invoice" });
        }
        // Fetch customer for Stripe metadata
        const [customer] = (await sql `
				SELECT first_name, last_name, email FROM customers WHERE id = ${invoice.customer_id}
			`);
        const stripe = getStripe();
        // Reuse existing PaymentIntent if one exists and is still active
        if (invoice.stripe_payment_intent_id) {
            try {
                const existing = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
                if (existing.status !== "canceled" &&
                    existing.status !== "succeeded") {
                    return reply.send({
                        clientSecret: existing.client_secret,
                        paymentIntentId: existing.id,
                        amount: existing.amount,
                        currency: existing.currency
                    });
                }
            }
            catch {
                // Intent not found or invalid — create a new one below
            }
        }
        // Amount in cents
        const amountCents = Math.round(Number(invoice.balance_due) * 100);
        const intent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: "usd",
            payment_method_types: paymentMethodType === "card_present" ? ["card_present"] : ["card"],
            capture_method: paymentMethodType === "card_present" ? "manual" : "automatic",
            metadata: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoice_number,
                companyId: invoice.company_id,
                customerId: invoice.customer_id,
                customerName: customer
                    ? `${customer.first_name} ${customer.last_name}`
                    : "Unknown"
            },
            description: `Invoice ${invoice.invoice_number}`
        });
        // Store intent ID on invoice immediately
        await sql `
				UPDATE invoices
				SET stripe_payment_intent_id = ${intent.id}, updated_at = NOW()
				WHERE id = ${invoiceId}
			`;
        return reply.send({
            clientSecret: intent.client_secret,
            paymentIntentId: intent.id,
            amount: intent.amount,
            currency: intent.currency
        });
    });
    // ----------------------------------------------------------
    // POST /stripe/webhook
    // Stripe calls this when payment events happen.
    // CRITICAL: Must receive raw body for signature verification.
    // Register this route with rawBody: true in Fastify config.
    //
    // Events handled:
    //   payment_intent.succeeded     → mark invoice paid
    //   payment_intent.payment_failed → log failure (no status change)
    //   charge.refunded              → update amount_paid, set status
    // ----------------------------------------------------------
    fastify.post("/stripe/webhook", {
        config: { rawBody: true } // requires @fastify/rawbody plugin
    }, async (request, reply) => {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            fastify.log.error("STRIPE_WEBHOOK_SECRET is not set");
            return reply.code(500).send({ error: "Webhook secret not configured" });
        }
        const sig = request.headers["stripe-signature"];
        if (!sig) {
            return reply
                .code(400)
                .send({ error: "Missing stripe-signature header" });
        }
        const stripe = getStripe();
        let event;
        try {
            // @ts-ignore — rawBody added by @fastify/rawbody
            const rawBody = request.rawBody;
            event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
        }
        catch (err) {
            fastify.log.warn(`Webhook signature verification failed: ${err.message}`);
            return reply.code(400).send({ error: "Invalid signature" });
        }
        const sql = getSql();
        try {
            switch (event.type) {
                // -------------------------------------------------------
                // Payment succeeded — mark invoice paid
                // -------------------------------------------------------
                case "payment_intent.succeeded": {
                    const intent = event.data.object;
                    const invoiceId = intent.metadata?.invoiceId;
                    if (!invoiceId)
                        break;
                    const amountPaid = Math.round((intent.amount_received / 100) * 100) / 100;
                    await sql `
							UPDATE invoices SET
								status      = 'paid',
								amount_paid = ${amountPaid},
								paid_at     = NOW(),
								updated_at  = NOW()
							WHERE id = ${invoiceId}
								AND status != 'void'
						`;
                    fastify.log.info(`Invoice ${invoiceId} marked paid via Stripe intent ${intent.id}`);
                    break;
                }
                // -------------------------------------------------------
                // Payment failed — log it, don't change invoice status
                // -------------------------------------------------------
                case "payment_intent.payment_failed": {
                    const intent = event.data.object;
                    const invoiceId = intent.metadata?.invoiceId;
                    fastify.log.warn(`Payment failed for invoice ${invoiceId ?? "unknown"}: ${intent.last_payment_error?.message ?? "unknown error"}`);
                    break;
                }
                // -------------------------------------------------------
                // Charge refunded — adjust amount_paid and status
                // -------------------------------------------------------
                case "charge.refunded": {
                    const charge = event.data.object;
                    const intentId = charge.payment_intent;
                    if (!intentId)
                        break;
                    const [invoice] = (await sql `
							SELECT id, total, amount_paid FROM invoices
							WHERE stripe_payment_intent_id = ${intentId}
						`);
                    if (!invoice)
                        break;
                    const totalRefunded = Math.round((charge.amount_refunded / 100) * 100) / 100;
                    const newAmountPaid = Math.max(0, Math.round((Number(invoice.amount_paid) - totalRefunded) * 100) /
                        100);
                    const newStatus = newAmountPaid <= 0
                        ? "sent" // refunded entirely — back to sent
                        : newAmountPaid >= Number(invoice.total)
                            ? "paid"
                            : "partial";
                    await sql `
							UPDATE invoices SET
								amount_paid = ${newAmountPaid},
								status      = ${newStatus},
								updated_at  = NOW()
							WHERE id = ${invoice.id}
						`;
                    fastify.log.info(`Invoice ${invoice.id} updated after refund. New amount paid: ${newAmountPaid}`);
                    break;
                }
                default:
                    fastify.log.info(`Unhandled Stripe event: ${event.type}`);
            }
        }
        catch (err) {
            // Log a structured object and a message; serialize unknown errors safely.
            fastify.log.error({
                err: err instanceof Error
                    ? { message: err.message, stack: err.stack }
                    : String(err)
            }, "Webhook handler error");
            // Still return 200 — Stripe will retry on non-2xx
            return reply.send({ received: true });
        }
        return reply.send({ received: true });
    });
    // ----------------------------------------------------------
    // POST /stripe/refund
    // Issue a full or partial refund on a paid invoice.
    // ----------------------------------------------------------
    fastify.post("/stripe/refund", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const parsed = refundSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: z.treeifyError(parsed.error)
            });
        }
        const { invoiceId, amount, reason } = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [invoice] = (await sql `
				SELECT id, total, amount_paid, status, stripe_payment_intent_id
				FROM invoices
				WHERE id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!invoice)
            return reply.code(404).send({ error: "Invoice not found" });
        if (!invoice.stripe_payment_intent_id) {
            return reply.code(409).send({
                error: "No Stripe payment on record for this invoice"
            });
        }
        if (!["paid", "partial"].includes(invoice.status)) {
            return reply.code(409).send({
                error: "Invoice has not been paid — nothing to refund"
            });
        }
        const stripe = getStripe();
        // Get the charge from the intent
        const intent = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id, { expand: ["latest_charge"] });
        const charge = intent.latest_charge;
        if (!charge) {
            return reply
                .code(409)
                .send({ error: "No charge found on this payment intent" });
        }
        // Amount in cents — omit for full refund
        const refundParams = {
            charge: charge.id,
            reason,
            ...(amount !== undefined && {
                amount: Math.round(amount * 100)
            })
        };
        const refund = await stripe.refunds.create(refundParams);
        // Webhook will handle the status update, but we optimistically update here too
        const refundedAmount = Math.round((refund.amount / 100) * 100) / 100;
        const newAmountPaid = Math.max(0, Math.round((Number(invoice.amount_paid) - refundedAmount) * 100) / 100);
        const newStatus = newAmountPaid <= 0
            ? "sent"
            : newAmountPaid >= Number(invoice.total)
                ? "paid"
                : "partial";
        await sql `
				UPDATE invoices SET
					amount_paid = ${newAmountPaid},
					status      = ${newStatus},
					updated_at  = NOW()
				WHERE id = ${invoiceId}
			`;
        return reply.send({
            message: "Refund issued",
            refundId: refund.id,
            refundedAmount,
            newAmountPaid,
            invoiceStatus: newStatus
        });
    });
    // ----------------------------------------------------------
    // GET /stripe/payment-status/:invoiceId
    // Check live payment status from Stripe.
    // Useful if webhook delivery was delayed.
    // ----------------------------------------------------------
    fastify.get("/stripe/payment-status/:invoiceId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { invoiceId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [invoice] = (await sql `
				SELECT id, status, amount_paid, balance_due, stripe_payment_intent_id
				FROM invoices
				WHERE id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!invoice)
            return reply.code(404).send({ error: "Invoice not found" });
        if (!invoice.stripe_payment_intent_id) {
            return reply.send({
                invoiceStatus: invoice.status,
                stripeStatus: null,
                amountPaid: invoice.amount_paid,
                balanceDue: invoice.balance_due
            });
        }
        const stripe = getStripe();
        const intent = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
        return reply.send({
            invoiceStatus: invoice.status,
            stripeStatus: intent.status,
            amountPaid: invoice.amount_paid,
            balanceDue: invoice.balance_due,
            paymentIntentId: intent.id
        });
    });
}
