// services/dispatch/paymentCollectionRoutes.ts
// POST /jobs/:jobId/close  — completes job, collects payment, updates invoice status

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
	estimated_duration_minutes: number | null;
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
// Schema
// ============================================================

const closeJobSchema = z.object({
	// Job completion
	completionNotes: z.string().optional(),
	firstTimeFix: z.boolean().default(true),
	callbackRequired: z.boolean().default(false), // Phase 3
	customerRating: z.number().int().min(1).max(5).optional(),

	// Duration
	actualDurationMinutes: z.number().int().min(1).optional(),

	// Invoice
	invoiceId: z.string().uuid().optional(),

	// Payment
	paymentMethod: z.enum(["card", "card_present", "cash", "check", "none"]),
	amountToCollect: z.number().min(0.01).optional(),
	checkNumber: z.string().optional(),
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
	// ----------------------------------------------------------
	fastify.post(
		"/jobs/:jobId/close",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { jobId } = request.params as { jobId: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const parsed = closeJobSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}
			const body = parsed.data;

			// 1. Load job
			const [job] = (await sql`
				SELECT
					id, company_id, customer_id, assigned_tech_id,
					status, scheduled_time, started_at,
					estimated_duration_minutes
				FROM jobs
				WHERE id = ${jobId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as JobRow[];

			if (!job) return reply.code(404).send({ error: "Job not found" });
			if (job.status === "completed")
				return reply.code(409).send({ error: "Job is already completed" });
			if (job.status === "cancelled")
				return reply.code(409).send({ error: "Cannot close a cancelled job" });

			// 2. Compute actual duration
			let actualDuration = body.actualDurationMinutes ?? null;
			if (!actualDuration && job.started_at) {
				const startedAt = new Date(job.started_at).getTime();
				actualDuration = Math.round((Date.now() - startedAt) / 60000);
			}

			const durationVariance =
				actualDuration != null && job.estimated_duration_minutes != null
					? actualDuration - job.estimated_duration_minutes
					: null;

			// 3. Mark job completed
			await sql`
				UPDATE jobs SET
					status                    = 'completed',
					completed_at              = NOW(),
					completion_notes          = ${body.completionNotes ?? null},
					first_time_fix            = ${body.firstTimeFix},
					customer_rating           = ${body.customerRating ?? null},
					actual_duration_minutes   = ${actualDuration},
					duration_variance_minutes = ${durationVariance},
					updated_at                = NOW()
				WHERE id = ${jobId}
			`;

			// 4. Free up technician
			if (job.assigned_tech_id) {
				await sql`
					UPDATE employees SET
						current_job_id        = NULL,
						current_jobs_count    = GREATEST(0, current_jobs_count - 1),
						last_job_completed_at = NOW(),
						updated_at            = NOW()
					WHERE id = ${job.assigned_tech_id}
				`;
			}

			// 5. Write job_completions row (Phase 3 — full row including callback_required)
			//    Pull drive/wrench from job_time_tracking if available
			const [timeTracking] = (await sql`
				SELECT
					departed_at, arrived_at, work_started_at, work_ended_at
				FROM job_time_tracking
				WHERE job_id = ${jobId}
			`) as any[];

			const driveMinutes =
				timeTracking?.departed_at && timeTracking?.arrived_at
					? Math.round(
							(new Date(timeTracking.arrived_at).getTime() -
								new Date(timeTracking.departed_at).getTime()) /
								60000
						)
					: null;

			const wrenchMinutes =
				timeTracking?.work_started_at && timeTracking?.work_ended_at
					? Math.round(
							(new Date(timeTracking.work_ended_at).getTime() -
								new Date(timeTracking.work_started_at).getTime()) /
								60000
						)
					: null;

			await sql`
				INSERT INTO job_completions (
					job_id, company_id, tech_id,
					first_time_fix, callback_required,
					customer_rating, completion_notes,
					duration_minutes, wrench_time_minutes, drive_time_minutes,
					completed_at
				) VALUES (
					${jobId},
					${job.company_id},
					${job.assigned_tech_id ?? null},
					${body.firstTimeFix},
					${body.callbackRequired},
					${body.customerRating ?? null},
					${body.completionNotes ?? null},
					${actualDuration},
					${wrenchMinutes},
					${driveMinutes},
					NOW()
				)
				ON CONFLICT (job_id) DO UPDATE SET
					first_time_fix      = EXCLUDED.first_time_fix,
					callback_required   = EXCLUDED.callback_required,
					customer_rating     = EXCLUDED.customer_rating,
					completion_notes    = EXCLUDED.completion_notes,
					duration_minutes    = EXCLUDED.duration_minutes,
					wrench_time_minutes = COALESCE(EXCLUDED.wrench_time_minutes, job_completions.wrench_time_minutes),
					drive_time_minutes  = COALESCE(EXCLUDED.drive_time_minutes,  job_completions.drive_time_minutes)
			`;

			// 6. Find linked invoice
			let invoiceId = body.invoiceId ?? null;
			let invoice: InvoiceRow | null = null;

			if (invoiceId) {
				const [found] = (await sql`
					SELECT id, company_id, customer_id, status,
					       total, amount_paid, balance_due, stripe_payment_intent_id
					FROM invoices
					WHERE id = ${invoiceId}
					  AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				`) as InvoiceRow[];
				if (!found) return reply.code(404).send({ error: "Invoice not found" });
				invoice = found;
			} else {
				const [found] = (await sql`
					SELECT id, company_id, customer_id, status,
					       total, amount_paid, balance_due, stripe_payment_intent_id
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

			if (invoice && invoice.status === "draft") {
				await sql`UPDATE invoices SET status = 'sent', updated_at = NOW() WHERE id = ${invoice.id}`;
				invoice.status = "sent";
			}

			if (!invoice || !invoiceId) {
				return reply.code(200).send({
					message: "Job closed successfully. No invoice linked.",
					jobStatus: "completed",
					firstTimeFix: body.firstTimeFix,
					callbackRequired: body.callbackRequired,
					payment: { method: body.paymentMethod }
				});
			}

			// 7. Handle payment by method
			const method = body.paymentMethod;

			if (method === "none") {
				return reply.code(200).send({
					jobStatus: "completed",
					firstTimeFix: body.firstTimeFix,
					callbackRequired: body.callbackRequired,
					invoice: {
						id: invoice.id,
						status: invoice.status,
						total: invoice.total,
						amountPaid: invoice.amount_paid,
						balanceDue: invoice.balance_due
					},
					payment: { method: "none" }
				});
			}

			if (method === "cash" || method === "check") {
				const amountToCollect =
					body.amountToCollect ?? Number(invoice.balance_due);
				const newAmountPaid =
					Math.round((Number(invoice.amount_paid) + amountToCollect) * 100) /
					100;
				const newStatus = deriveInvoiceStatus(
					Number(invoice.total),
					newAmountPaid,
					invoice.status
				);

				const [updatedInvoice] = (await sql`
					UPDATE invoices SET
						amount_paid = ${newAmountPaid},
						status      = ${newStatus},
						paid_at     = ${newStatus === "paid" ? sql`NOW()` : sql`paid_at`},
						updated_at  = NOW()
					WHERE id = ${invoiceId}
					RETURNING
						id, invoice_number AS "invoiceNumber", status,
						total, amount_paid AS "amountPaid",
						balance_due AS "balanceDue", paid_at AS "paidAt"
				`) as any[];

				return reply.code(200).send({
					jobStatus: "completed",
					firstTimeFix: body.firstTimeFix,
					callbackRequired: body.callbackRequired,
					invoice: updatedInvoice,
					payment: {
						method,
						amountCollected: amountToCollect,
						...(method === "check" && body.checkNumber
							? { checkNumber: body.checkNumber }
							: {})
					}
				});
			}

			if (method === "card" || method === "card_present") {
				const stripe = getStripe();
				const amountCents = Math.round(
					(body.amountToCollect ?? Number(invoice.balance_due)) * 100
				);

				let paymentIntent;
				if (invoice.stripe_payment_intent_id) {
					paymentIntent = await stripe.paymentIntents.retrieve(
						invoice.stripe_payment_intent_id
					);
				} else {
					paymentIntent = await stripe.paymentIntents.create({
						amount: amountCents,
						currency: "usd",
						payment_method_types:
							method === "card_present" ? ["card_present"] : ["card"],
						metadata: { invoiceId: invoice.id, jobId }
					});
					await sql`
						UPDATE invoices SET
							stripe_payment_intent_id = ${paymentIntent.id},
							updated_at = NOW()
						WHERE id = ${invoiceId}
					`;
				}

				return reply.code(200).send({
					jobStatus: "completed",
					firstTimeFix: body.firstTimeFix,
					callbackRequired: body.callbackRequired,
					invoice: {
						id: invoice.id,
						status: invoice.status,
						total: invoice.total,
						balanceDue: invoice.balance_due
					},
					payment: {
						method,
						clientSecret: paymentIntent.client_secret,
						paymentIntentId: paymentIntent.id
					}
				});
			}
		}
	);

	// ----------------------------------------------------------
	// GET /jobs/:jobId/payment-summary
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
					id, status, completion_notes AS "completionNotes",
					first_time_fix AS "firstTimeFix",
					customer_rating AS "customerRating",
					actual_duration_minutes AS "actualDurationMinutes",
					completed_at AS "completedAt"
				FROM jobs
				WHERE id = ${jobId}
				  AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as any[];

			if (!job) return reply.code(404).send({ error: "Job not found" });

			const [invoice] = (await sql`
				SELECT
					id, invoice_number AS "invoiceNumber", status,
					total, amount_paid AS "amountPaid",
					balance_due AS "balanceDue", paid_at AS "paidAt"
				FROM invoices
				WHERE job_id = ${jobId} AND status != 'void'
				ORDER BY created_at DESC
				LIMIT 1
			`) as any[];

			const [completion] = (await sql`
				SELECT
					first_time_fix    AS "firstTimeFix",
					callback_required AS "callbackRequired",
					customer_rating   AS "customerRating",
					duration_minutes  AS "durationMinutes",
					wrench_time_minutes AS "wrenchTimeMinutes",
					drive_time_minutes  AS "driveTimeMinutes"
				FROM job_completions
				WHERE job_id = ${jobId}
			`) as any[];

			return { job, invoice: invoice ?? null, completion: completion ?? null };
		}
	);
}
