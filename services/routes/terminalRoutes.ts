// services/routes/terminalRoutes.ts
// Stripe Terminal — Tap to Pay (in-person card collection).
//
// This complements the existing card_present PaymentIntent flow in
// paymentCollectionRoutes.ts and stripeRoutes.ts. Those routes create
// the intent; this file handles the Terminal SDK layer that sits in front.
//
// Flow (Tap to Pay on iPhone / physical reader):
//   1. Mobile app calls POST /terminal/connection-token
//      → returns a short-lived token the Stripe Terminal SDK uses to connect
//   2. App discovers/connects to a reader (handled entirely client-side by SDK)
//   3. App calls POST /terminal/readers/:readerId/process-payment
//      → presents the PaymentIntent to the reader (reader taps/dips card)
//   4. On success, app calls POST /terminal/readers/:readerId/capture
//      → captures the manually-held funds, marks invoice paid
//   5. On cancel, app calls POST /terminal/readers/:readerId/cancel
//
// Reader management:
//   POST   /terminal/readers                   — register a physical reader
//   GET    /terminal/readers                   — list readers for company
//   DELETE /terminal/readers/:readerId         — deregister a reader
//
// Endpoints:
//   POST   /terminal/connection-token          — Stripe Terminal SDK init token
//   POST   /terminal/readers/:readerId/process-payment  — present intent to reader
//   POST   /terminal/readers/:readerId/capture — capture after tap
//   POST   /terminal/readers/:readerId/cancel  — cancel pending payment on reader

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Stripe from "stripe";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─── Stripe singleton ────────────────────────────────────────────────────────

function getStripe(): Stripe {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
	return new Stripe(key, { apiVersion: "2026-01-28.clover" });
}

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

const registerReaderSchema = z.object({
	registrationCode: z.string().min(1), // printed on the physical reader
	label: z.string().max(100).optional(), // e.g. "Truck 7 Reader"
	locationId: z.string().optional() // Stripe Terminal Location ID
});

const processPaymentSchema = z.object({
	paymentIntentId: z.string().min(1)
});

const captureSchema = z.object({
	paymentIntentId: z.string().min(1),
	invoiceId: z.string().uuid() // to update invoice status after capture
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function terminalRoutes(fastify: FastifyInstance) {
	// ── POST /terminal/connection-token ───────────────────────────────────────
	// The Stripe Terminal SDK calls this on init to get a short-lived token.
	// Must be called from an authenticated session (the tech's app).
	fastify.post(
		"/terminal/connection-token",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const stripe = getStripe();

			const connectionToken = await stripe.terminal.connectionTokens.create();

			return reply.send({ secret: connectionToken.secret });
		}
	);

	// ── POST /terminal/readers ────────────────────────────────────────────────
	// Register a physical Stripe Terminal reader to this company.
	fastify.post(
		"/terminal/readers",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const parsed = registerReaderSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const { registrationCode, label, locationId } = parsed.data;
			const stripe = getStripe();

			const params: Stripe.Terminal.ReaderCreateParams = {
				registration_code: registrationCode,
				label: label ?? `Reader — ${new Date().toLocaleDateString()}`,
				...(locationId ? { location: locationId } : {})
			};

			const reader = await stripe.terminal.readers.create(params);

			// Store reader ID against company so we can list/manage them
			const sql = getSql();
			await sql`
				INSERT INTO terminal_readers (
					company_id, stripe_reader_id, label, device_type, status
				) VALUES (
					${companyId ?? (request.body as any).companyId},
					${reader.id},
					${reader.label ?? null},
					${reader.device_type},
					${reader.status}
				)
				ON CONFLICT (stripe_reader_id) DO UPDATE SET
					label      = EXCLUDED.label,
					status     = EXCLUDED.status,
					updated_at = NOW()
			`;

			return reply.code(201).send({
				readerId: reader.id,
				label: reader.label,
				deviceType: reader.device_type,
				status: reader.status,
				serialNumber: reader.serial_number
			});
		}
	);

	// ── GET /terminal/readers ─────────────────────────────────────────────────
	// List all registered readers for the company.
	fastify.get(
		"/terminal/readers",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const sql = getSql();

			// Pull from our DB, then enrich with live status from Stripe
			const rows = (await sql`
				SELECT stripe_reader_id, label, device_type, status, created_at
				FROM terminal_readers
				WHERE company_id = ${companyId}
				ORDER BY created_at DESC
			`) as any[];

			// Optionally fetch live status from Stripe in parallel
			const stripe = getStripe();
			const enriched = await Promise.allSettled(
				rows.map(async (r: any) => {
					try {
						const live = await stripe.terminal.readers.retrieve(
							r.stripe_reader_id
						);

						// If Stripe returned a deleted object, fall back to our cached row.
						if ("deleted" in live && (live as any).deleted) {
							return {
								readerId: r.stripe_reader_id,
								label: r.label,
								deviceType: r.device_type,
								status: "unknown"
							};
						}

						const reader = live as Stripe.Terminal.Reader;
						return {
							readerId: reader.id,
							label: reader.label,
							deviceType: reader.device_type,
							status: reader.status,
							serialNumber: reader.serial_number,
							batteryLevel: (reader as any).battery_level ?? null
						};
					} catch {
						// Reader may have been deleted from Stripe — return cached row
						return {
							readerId: r.stripe_reader_id,
							label: r.label,
							deviceType: r.device_type,
							status: "unknown"
						};
					}
				})
			);

			const readers = enriched
				.map((r) => (r.status === "fulfilled" ? r.value : null))
				.filter(Boolean);

			return reply.send({ readers });
		}
	);

	// ── DELETE /terminal/readers/:readerId ────────────────────────────────────
	// Deregister a reader from this company.
	fastify.delete(
		"/terminal/readers/:readerId",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { readerId } = request.params as { readerId: string };
			const companyId = resolveCompanyId(user);

			const sql = getSql();

			const [deleted] = (await sql`
				DELETE FROM terminal_readers
				WHERE stripe_reader_id = ${readerId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING stripe_reader_id
			`) as any[];

			if (!deleted) {
				return reply.code(404).send({ error: "Reader not found" });
			}

			// Also delete from Stripe
			try {
				const stripe = getStripe();
				await stripe.terminal.readers.del(readerId);
			} catch {
				// Best-effort — reader may already be removed from Stripe
			}

			return reply.send({ deleted: true, readerId });
		}
	);

	// ── POST /terminal/readers/:readerId/process-payment ─────────────────────
	// Presents a PaymentIntent to a connected reader.
	// The reader will prompt the customer to tap/dip/swipe.
	// Intent must have been created with payment_method_types: ["card_present"]
	// and capture_method: "manual".
	fastify.post(
		"/terminal/readers/:readerId/process-payment",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { readerId } = request.params as { readerId: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const parsed = processPaymentSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const { paymentIntentId } = parsed.data;
			const stripe = getStripe();

			const reader = await stripe.terminal.readers.processPaymentIntent(
				readerId,
				{ payment_intent: paymentIntentId }
			);

			return reply.send({
				readerId: reader.id,
				status: reader.status,
				action: (reader as any).action ?? null
			});
		}
	);

	// ── POST /terminal/readers/:readerId/capture ──────────────────────────────
	// Captures the funds after the reader successfully collected the card.
	// Updates the invoice to paid.
	fastify.post(
		"/terminal/readers/:readerId/capture",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { readerId } = request.params as { readerId: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const parsed = captureSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const { paymentIntentId, invoiceId } = parsed.data;
			const stripe = getStripe();
			const sql = getSql();

			// Verify invoice belongs to this company
			const [invoice] = (await sql`
				SELECT id, total, amount_paid, balance_due, status
				FROM invoices
				WHERE id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as any[];

			if (!invoice) return reply.code(404).send({ error: "Invoice not found" });

			// Capture the PaymentIntent
			const intent = await stripe.paymentIntents.capture(paymentIntentId);

			if (intent.status !== "succeeded") {
				return reply.code(409).send({
					error: `Capture failed — intent status: ${intent.status}`
				});
			}

			// Mark invoice paid
			const amountCaptured =
				Math.round((intent.amount_received / 100) * 100) / 100;
			const newAmountPaid = Math.min(
				Number(invoice.total),
				Math.round((Number(invoice.amount_paid) + amountCaptured) * 100) / 100
			);
			const newStatus =
				newAmountPaid >= Number(invoice.total) ? "paid" : "partial";

			const [updatedInvoice] = (await sql`
				UPDATE invoices SET
					amount_paid              = ${newAmountPaid},
					status                   = ${newStatus},
					paid_at                  = ${newStatus === "paid" ? sql`NOW()` : sql`paid_at`},
					stripe_payment_intent_id = ${intent.id},
					updated_at               = NOW()
				WHERE id = ${invoiceId}
				RETURNING
					id,
					invoice_number AS "invoiceNumber",
					status,
					total,
					amount_paid    AS "amountPaid",
					balance_due    AS "balanceDue",
					paid_at        AS "paidAt"
			`) as any[];

			return reply.send({
				captured: true,
				paymentIntentId: intent.id,
				amountCaptured,
				invoice: updatedInvoice
			});
		}
	);

	// ── POST /terminal/readers/:readerId/cancel ───────────────────────────────
	// Cancels any in-progress payment action on the reader.
	fastify.post(
		"/terminal/readers/:readerId/cancel",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { readerId } = request.params as { readerId: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const stripe = getStripe();

			const reader = await stripe.terminal.readers.cancelAction(readerId);

			return reply.send({
				readerId: reader.id,
				status: reader.status,
				cancelled: true
			});
		}
	);
}
