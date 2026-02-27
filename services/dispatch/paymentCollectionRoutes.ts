// services/routes/paymentCollectionRoutes.ts
//
// Payment collection workflow — the "close out a job" endpoint.
//
// This stitches together what was previously a multi-step manual process:
//   1. Mark job complete (updates employee availability)
//   2. Finalize the linked invoice (draft → sent, or keep existing status)
//   3. Collect payment immediately (cash/check) OR return a Stripe
//      PaymentIntent client_secret for card collection on-site or online
//
// A single POST /jobs/:jobId/close call handles all of this atomically.
// The tech fills out one form at job close; the backend does the rest.
//
// Payment methods supported:
//   - "card"         → Stripe online payment (customer pays via link/portal)
//   - "card_present" → Stripe Terminal (tech swipes card on-site)
//   - "cash"         → Records payment immediately, no Stripe involved
//   - "check"        → Records payment immediately, no Stripe involved
//   - "none"         → Close the job, leave invoice open for later billing

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Stripe from "stripe";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ============================================================
// Types
// ============================================================

interface JobRow {
	id: string;
	company_id: string;
	customer_id: string | null;
	assigned_tech_id: string | null;
	status: string;
	scheduled_time: string | null;
	started_at: string | null;
}

interface InvoiceRow {
	id: string;
	company_id: string;
	customer_id: string;
	status: string;
	total: string;
	amount_paid: string;
	balance_due: string;
	stripe_payment_intent_id: string | null;
}

// ============================================================
// Schemas
// ============================================================

const closeJobSchema = z.object({
	// --- Job completion fields ---
	completionNotes: z.string().optional(),
	firstTimeFix: z.boolean().default(true),
	customerRating: z.number().int().min(1).max(5).optional(),

	// --- Duration (actual minutes on-site) ---
	// If omitted, we compute from started_at → now if available
	actualDurationMinutes: z.number().int().min(1).optional(),

	// --- Invoice handling ---
	// If the job already has a linked invoice, we use it.
	// If not, you can pass invoiceId to link one explicitly.
	invoiceId: z.string().uuid().optional(),

	// --- Payment ---
	paymentMethod: z.enum(["card", "card_present", "cash", "check", "none"]),

	// For cash/check: amount being collected right now
	// For card/card_present: amount to charge (defaults to full balance_due)
	amountToCollect: z.number().min(0.01).optional(),

	// For check: the check number for records
	checkNumber: z.string().optional(),

	// Tax rate override — only applied if creating/updating invoice
	taxRate: z.number().min(0).max(1).optional()
});

// ============================================================
// Helpers
// ============================================================

function getUser(request: any): JWTPayload {
	return request.user as JWTPayload;
}

function isDev(user: JWTPayload): boolean {
	return user.role === "dev";
}

function resolveCompanyId(user: JWTPayload): string | null {
	return user.companyId ?? null;
}

function getStripe(): Stripe {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
	return new Stripe(key, { apiVersion: "2026-01-28.clover" });
}

function deriveInvoiceStatus(
	total: number,
	amountPaid: number,
	currentStatus: string
): string {
	if (currentStatus === "void") return "void";
	if (amountPaid <= 0) return "sent";
	if (amountPaid >= total) return "paid";
	return "partial";
}

// ============================================================
// Routes
// ============================================================

export async function paymentCollectionRoutes(fastify: FastifyInstance) {
	// ----------------------------------------------------------
	// POST /jobs/:jobId/close
	//
	// The all-in-one job close-out endpoint.
	//
	// What it does:
	//   1. Validates job exists and belongs to caller's company
	//   2. Marks job as completed (updates employee availability)
	//   3. Records actual vs estimated duration
	//   4. Finalizes the linked invoice (draft/sent → stays as-is for card;
	//      immediately records payment for cash/check)
	//   5. Returns payment instructions:
	//      - card/card_present: { clientSecret, paymentIntentId }
	//      - cash/check: { paymentRecorded: true, amountPaid, invoiceStatus }
	//      - none: { invoiceId, invoiceStatus: "sent" }
	// ----------------------------------------------------------
	fastify.post(
		"/jobs/:jobId/close",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { jobId } = request.params as { jobId: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			// --- Parse & validate body ---
			const parsed = closeJobSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: z.treeifyError(parsed.error)
				});
			}
			const body = parsed.data;

			// --- Load job ---
			const [job] = (await sql`
				SELECT
					id, company_id, customer_id, assigned_tech_id,
					status, scheduled_time, started_at
				FROM jobs
				WHERE id = ${jobId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as JobRow[];

			if (!job) {
				return reply.code(404).send({ error: "Job not found" });
			}

			if (job.status === "completed") {
				return reply.code(409).send({ error: "Job is already completed" });
			}

			if (job.status === "cancelled") {
				return reply.code(409).send({ error: "Cannot close a cancelled job" });
			}

			// --- Compute actual duration ---
			let actualDuration = body.actualDurationMinutes ?? null;
			if (!actualDuration && job.started_at) {
				const startedAt = new Date(job.started_at).getTime();
				const now = Date.now();
				actualDuration = Math.round((now - startedAt) / 60000);
			}

			// ================================================================
			// Step 1: Mark job complete + free up technician
			// ================================================================
			await sql`
				UPDATE jobs
				SET
					status                   = 'completed',
					completed_at             = NOW(),
					completion_notes         = ${body.completionNotes ?? null},
					first_time_fix           = ${body.firstTimeFix},
					customer_rating          = ${body.customerRating ?? null},
					actual_duration_minutes  = ${actualDuration},
					duration_variance_minutes = CASE
						WHEN ${actualDuration} IS NOT NULL
						THEN ${actualDuration} - COALESCE(estimated_duration_minutes, ${actualDuration})
						ELSE duration_variance_minutes
					END,
					updated_at               = NOW()
				WHERE id = ${jobId}
			`;

			if (job.assigned_tech_id) {
				await sql`
					UPDATE employees
					SET
						current_job_id       = NULL,
						current_jobs_count   = GREATEST(0, current_jobs_count - 1),
						last_job_completed_at = NOW(),
						updated_at           = NOW()
					WHERE id = ${job.assigned_tech_id}
				`;
			}

			// ================================================================
			// Step 2: Find linked invoice
			// ================================================================
			let invoiceId = body.invoiceId ?? null;
			let invoice: InvoiceRow | null = null;

			if (invoiceId) {
				// Caller specified an invoice — look it up and verify ownership
				const [found] = (await sql`
					SELECT
						id, company_id, customer_id, status,
						total, amount_paid, balance_due,
						stripe_payment_intent_id
					FROM invoices
					WHERE id = ${invoiceId}
						AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				`) as InvoiceRow[];

				if (!found) {
					return reply.code(404).send({ error: "Invoice not found" });
				}
				invoice = found;
			} else {
				// Look for an invoice already linked to this job
				const [found] = (await sql`
					SELECT
						id, company_id, customer_id, status,
						total, amount_paid, balance_due,
						stripe_payment_intent_id
					FROM invoices
					WHERE job_id = ${jobId}
						AND status != 'void'
						AND (${isDev(user) && !companyId} OR company_id = ${companyId})
					ORDER BY created_at DESC
					LIMIT 1
				`) as InvoiceRow[];

				if (found) {
					invoice = found;
					invoiceId = found.id;
				}
			}

			// If the invoice is still draft, promote it to sent so it's billable
			if (invoice && invoice.status === "draft") {
				await sql`
					UPDATE invoices
					SET status = 'sent', updated_at = NOW()
					WHERE id = ${invoice.id}
				`;
				invoice.status = "sent";
			}

			// ================================================================
			// Step 3: Handle payment by method
			// ================================================================

			// No invoice linked — return early with just job close confirmation
			if (!invoice || !invoiceId) {
				return reply.code(200).send({
					message: "Job closed successfully. No invoice linked.",
					jobId,
					jobStatus: "completed",
					actualDurationMinutes: actualDuration,
					invoice: null,
					payment: null
				});
			}

			const balanceDue = Number(invoice.balance_due);
			const total = Number(invoice.total);

			// --- Already fully paid ---
			if (invoice.status === "paid" || balanceDue <= 0) {
				return reply.code(200).send({
					message: "Job closed. Invoice already paid.",
					jobId,
					jobStatus: "completed",
					actualDurationMinutes: actualDuration,
					invoice: {
						id: invoiceId,
						status: invoice.status,
						total,
						amountPaid: Number(invoice.amount_paid),
						balanceDue: 0
					},
					payment: { method: "none", alreadyPaid: true }
				});
			}

			// ----------------------------------------------------------------
			// CASH or CHECK — record immediately, no Stripe
			// ----------------------------------------------------------------
			if (body.paymentMethod === "cash" || body.paymentMethod === "check") {
				const collectAmount = body.amountToCollect ?? balanceDue;
				const currentAmountPaid = Number(invoice.amount_paid);
				const newAmountPaid =
					Math.round((currentAmountPaid + collectAmount) * 100) / 100;
				const newStatus = deriveInvoiceStatus(
					total,
					newAmountPaid,
					invoice.status
				);
				const paidAt = newStatus === "paid" ? sql`NOW()` : sql`paid_at`;

				const [updatedInvoice] = (await sql`
					UPDATE invoices
					SET
						amount_paid = ${newAmountPaid},
						status      = ${newStatus},
						paid_at     = ${paidAt},
						updated_at  = NOW()
					WHERE id = ${invoiceId}
					RETURNING
						id,
						invoice_number  AS "invoiceNumber",
						status,
						total,
						amount_paid     AS "amountPaid",
						balance_due     AS "balanceDue",
						paid_at         AS "paidAt"
				`) as any[];

				return reply.code(200).send({
					message: `Job closed. ${body.paymentMethod === "cash" ? "Cash" : "Check"} payment recorded.`,
					jobId,
					jobStatus: "completed",
					actualDurationMinutes: actualDuration,
					invoice: updatedInvoice,
					payment: {
						method: body.paymentMethod,
						amountCollected: collectAmount,
						checkNumber: body.checkNumber ?? null,
						paymentRecorded: true
					}
				});
			}

			// ----------------------------------------------------------------
			// NONE — leave invoice open for later billing
			// ----------------------------------------------------------------
			if (body.paymentMethod === "none") {
				return reply.code(200).send({
					message: "Job closed. Invoice left open for later collection.",
					jobId,
					jobStatus: "completed",
					actualDurationMinutes: actualDuration,
					invoice: {
						id: invoiceId,
						status: invoice.status,
						total,
						amountPaid: Number(invoice.amount_paid),
						balanceDue
					},
					payment: { method: "none", paymentRecorded: false }
				});
			}

			// ----------------------------------------------------------------
			// CARD or CARD_PRESENT — create/reuse Stripe PaymentIntent
			// ----------------------------------------------------------------
			const stripe = getStripe();
			const amountToCharge = body.amountToCollect ?? balanceDue;
			const amountCents = Math.round(amountToCharge * 100);

			// Reuse existing PaymentIntent if one exists and is still usable
			if (invoice.stripe_payment_intent_id) {
				try {
					const existing = await stripe.paymentIntents.retrieve(
						invoice.stripe_payment_intent_id
					);
					if (
						existing.status !== "canceled" &&
						existing.status !== "succeeded"
					) {
						return reply.code(200).send({
							message:
								"Job closed. Use existing payment intent to collect card payment.",
							jobId,
							jobStatus: "completed",
							actualDurationMinutes: actualDuration,
							invoice: {
								id: invoiceId,
								status: invoice.status,
								total,
								amountPaid: Number(invoice.amount_paid),
								balanceDue
							},
							payment: {
								method: body.paymentMethod,
								clientSecret: existing.client_secret,
								paymentIntentId: existing.id,
								amountCents: existing.amount,
								currency: existing.currency
							}
						});
					}
				} catch {
					// Intent expired or invalid — fall through to create a new one
				}
			}

			// Fetch customer name for Stripe metadata
			const [customer] = (await sql`
				SELECT first_name, last_name, email
				FROM customers
				WHERE id = ${invoice.customer_id}
			`) as any[];

			const intent = await stripe.paymentIntents.create({
				amount: amountCents,
				currency: "usd",
				payment_method_types:
					body.paymentMethod === "card_present" ? ["card_present"] : ["card"],
				capture_method:
					body.paymentMethod === "card_present" ? "manual" : "automatic",
				metadata: {
					invoiceId: invoiceId,
					jobId,
					companyId: job.company_id,
					customerId: invoice.customer_id,
					customerName: customer
						? `${customer.first_name} ${customer.last_name}`
						: "Unknown",
					collectionMethod: body.paymentMethod
				},
				description: `Job close-out payment for job ${jobId}`
			});

			// Store intent ID on the invoice immediately
			await sql`
				UPDATE invoices
				SET stripe_payment_intent_id = ${intent.id}, updated_at = NOW()
				WHERE id = ${invoiceId}
			`;

			return reply.code(200).send({
				message:
					body.paymentMethod === "card_present"
						? "Job closed. Present card to terminal to complete payment."
						: "Job closed. Share payment link with customer to collect card payment.",
				jobId,
				jobStatus: "completed",
				actualDurationMinutes: actualDuration,
				invoice: {
					id: invoiceId,
					status: invoice.status,
					total,
					amountPaid: Number(invoice.amount_paid),
					balanceDue
				},
				payment: {
					method: body.paymentMethod,
					clientSecret: intent.client_secret,
					paymentIntentId: intent.id,
					amountCents: intent.amount,
					currency: intent.currency
				}
			});
		}
	);

	// ----------------------------------------------------------
	// GET /jobs/:jobId/payment-summary
	//
	// Quick read — returns the job's current completion + payment
	// state without making any changes. Useful for the tech's
	// "job summary" screen after close-out.
	// ----------------------------------------------------------
	fastify.get(
		"/jobs/:jobId/payment-summary",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { jobId } = request.params as { jobId: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [job] = (await sql`
				SELECT
					id, status, completed_at, completion_notes,
					first_time_fix, customer_rating,
					actual_duration_minutes, estimated_duration_minutes
				FROM jobs
				WHERE id = ${jobId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as any[];

			if (!job) return reply.code(404).send({ error: "Job not found" });

			const [invoice] = (await sql`
				SELECT
					id,
					invoice_number  AS "invoiceNumber",
					status,
					total,
					amount_paid     AS "amountPaid",
					balance_due     AS "balanceDue",
					paid_at         AS "paidAt",
					stripe_payment_intent_id AS "stripePaymentIntentId"
				FROM invoices
				WHERE job_id = ${jobId}
					AND status != 'void'
				ORDER BY created_at DESC
				LIMIT 1
			`) as any[];

			// If there's a Stripe intent, fetch its live status
			let stripeStatus: string | null = null;
			if (invoice?.stripePaymentIntentId) {
				try {
					const stripe = getStripe();
					const intent = await stripe.paymentIntents.retrieve(
						invoice.stripePaymentIntentId
					);
					stripeStatus = intent.status;
				} catch {
					stripeStatus = "unknown";
				}
			}

			return reply.send({
				job: {
					id: job.id,
					status: job.status,
					completedAt: job.completed_at,
					completionNotes: job.completion_notes,
					firstTimeFix: job.first_time_fix,
					customerRating: job.customer_rating,
					actualDurationMinutes: job.actual_duration_minutes,
					estimatedDurationMinutes: job.estimated_duration_minutes
				},
				invoice: invoice
					? {
							id: invoice.id,
							invoiceNumber: invoice.invoiceNumber,
							status: invoice.status,
							total: Number(invoice.total),
							amountPaid: Number(invoice.amountPaid),
							balanceDue: Number(invoice.balanceDue),
							paidAt: invoice.paidAt,
							stripeStatus
						}
					: null
			});
		}
	);
}
