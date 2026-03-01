// services/routes/tipRoutes.ts
// Technician tipping at checkout.
//
// Flow:
//   1. Job must be completed and have an assigned tech.
//   2. A separate Stripe PaymentIntent is created for the tip amount.
//   3. Tip record is written to tech_tips with status 'pending'.
//   4. Stripe webhook (payment_intent.succeeded / payment_intent.payment_failed)
//      updates the tip status — same webhook handler already in stripeRoutes.ts
//      just needs the new cases added.
//   5. GET /jobs/:jobId/tip lets the frontend poll tip status.
//
// Endpoints:
//   POST  /tips                  — initiate a tip (creates Stripe PaymentIntent)
//   GET   /jobs/:jobId/tip       — fetch tip record for a job
//   GET   /tips/tech/:techId     — tip history + total for a technician
//
// DB table: tech_tips (migration below)
//
// Migration (run once):
// ─────────────────────────────────────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS tech_tips (
//   id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
//   job_id                  UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
//   tech_id                 UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
//   customer_id             UUID REFERENCES customers(id) ON DELETE SET NULL,
//   amount                  NUMERIC(10,2) NOT NULL CHECK (amount > 0),
//   currency                VARCHAR(3) NOT NULL DEFAULT 'usd',
//   status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
//                             CHECK (status IN ('pending','succeeded','failed','cancelled')),
//   stripe_payment_intent_id VARCHAR(120),
//   stripe_client_secret    TEXT,
//   note                    TEXT,
//   created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//   updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
// CREATE INDEX IF NOT EXISTS idx_tech_tips_job_id    ON tech_tips(job_id);
// CREATE INDEX IF NOT EXISTS idx_tech_tips_tech_id   ON tech_tips(tech_id);
// CREATE INDEX IF NOT EXISTS idx_tech_tips_company_id ON tech_tips(company_id);
// ─────────────────────────────────────────────────────────────────────────────

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";
import Stripe from "stripe";

// ─── Stripe singleton ────────────────────────────────────────────────────────

function getStripe(): Stripe {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
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

const createTipSchema = z.object({
	jobId: z.string().uuid(),
	amount: z.number().positive().max(500), // sanity cap — $500 max tip
	note: z.string().max(500).optional(),
	// Optional: pass a payment method ID if the frontend already has one
	paymentMethodId: z.string().optional()
});

const techTipHistorySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
	status: z.enum(["pending", "succeeded", "failed", "cancelled"]).optional()
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function tipRoutes(fastify: FastifyInstance) {
	// ── POST /tips ────────────────────────────────────────────────────────────
	// Create a tip for the technician on a completed job.
	// Returns a Stripe client_secret so the frontend can confirm the payment.
	fastify.post(
		"/tips",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const parsed = createTipSchema.safeParse(request.body);

			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const { jobId, amount, note, paymentMethodId } = parsed.data;
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const sql = getSql();

			// Load job — must be completed and have a tech
			const [job] = (await sql`
				SELECT
					j.id,
					j.company_id,
					j.customer_id,
					j.assigned_tech_id,
					j.status,
					e.name AS tech_name
				FROM jobs j
				LEFT JOIN employees e ON e.id = j.assigned_tech_id
				WHERE j.id = ${jobId}
					AND (${isDev(user) && !companyId} OR j.company_id = ${companyId})
			`) as any[];

			if (!job) return reply.code(404).send({ error: "Job not found" });

			if (job.status !== "completed") {
				return reply.code(409).send({
					error: "Tips can only be added to completed jobs"
				});
			}

			if (!job.assigned_tech_id) {
				return reply.code(409).send({
					error: "Job has no assigned technician to tip"
				});
			}

			// Check for an existing tip on this job — one tip per job
			const [existing] = (await sql`
				SELECT id, status FROM tech_tips WHERE job_id = ${jobId}
			`) as any[];

			if (existing) {
				if (existing.status === "succeeded") {
					return reply.code(409).send({
						error: "A tip has already been collected for this job"
					});
				}
				// If pending or failed, allow re-attempt — fall through to create new intent
			}

			const amountCents = Math.round(amount * 100);

			// Create Stripe PaymentIntent
			const stripe = getStripe();

			const intentParams: Stripe.PaymentIntentCreateParams = {
				amount: amountCents,
				currency: "usd",
				payment_method_types: ["card"],
				metadata: {
					type: "technician_tip",
					jobId,
					techId: job.assigned_tech_id,
					techName: job.tech_name ?? "",
					companyId: job.company_id
				},
				description: `Tip for technician${job.tech_name ? ` ${job.tech_name}` : ""} — Job ${jobId}`
			};

			if (paymentMethodId) {
				intentParams.payment_method = paymentMethodId;
				intentParams.confirm = true;
			}

			const intent = await stripe.paymentIntents.create(intentParams);

			// Upsert tip record
			const [tip] = (await sql`
				INSERT INTO tech_tips (
					company_id, job_id, tech_id, customer_id,
					amount, currency, status,
					stripe_payment_intent_id, stripe_client_secret,
					note
				) VALUES (
					${job.company_id},
					${jobId},
					${job.assigned_tech_id},
					${job.customer_id ?? null},
					${amount},
					'usd',
					${intent.status === "succeeded" ? "succeeded" : "pending"},
					${intent.id},
					${intent.client_secret},
					${note ?? null}
				)
				ON CONFLICT (job_id) DO UPDATE SET
					amount                   = EXCLUDED.amount,
					status                   = EXCLUDED.status,
					stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
					stripe_client_secret     = EXCLUDED.stripe_client_secret,
					note                     = EXCLUDED.note,
					updated_at               = NOW()
				RETURNING
					id,
					job_id              AS "jobId",
					tech_id             AS "techId",
					amount,
					currency,
					status,
					stripe_payment_intent_id AS "paymentIntentId",
					stripe_client_secret     AS "clientSecret",
					note,
					created_at          AS "createdAt"
			`) as any[];

			return reply.code(201).send({
				tip,
				clientSecret: intent.client_secret,
				paymentIntentId: intent.id
			});
		}
	);

	// ── GET /jobs/:jobId/tip ──────────────────────────────────────────────────
	// Fetch the tip record for a job (for polling after payment confirmation).
	fastify.get(
		"/jobs/:jobId/tip",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { jobId } = request.params as { jobId: string };
			const companyId = resolveCompanyId(user);

			const sql = getSql();

			const [tip] = (await sql`
				SELECT
					t.id,
					t.job_id              AS "jobId",
					t.tech_id             AS "techId",
					e.name                AS "techName",
					t.amount,
					t.currency,
					t.status,
					t.stripe_payment_intent_id AS "paymentIntentId",
					t.note,
					t.created_at          AS "createdAt",
					t.updated_at          AS "updatedAt"
				FROM tech_tips t
				LEFT JOIN employees e ON e.id = t.tech_id
				JOIN jobs j ON j.id = t.job_id
				WHERE t.job_id = ${jobId}
					AND (${isDev(user) && !companyId} OR j.company_id = ${companyId})
			`) as any[];

			if (!tip) {
				return reply.code(404).send({ error: "No tip found for this job" });
			}

			return reply.send({ tip });
		}
	);

	// ── GET /tips/tech/:techId ────────────────────────────────────────────────
	// Tip history + earnings total for a technician.
	fastify.get(
		"/tips/tech/:techId",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { techId } = request.params as { techId: string };
			const companyId = resolveCompanyId(user);

			const parsed = techTipHistorySchema.safeParse(request.query);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid query params" });
			}
			const { limit, offset, status } = parsed.data;

			const sql = getSql();

			// Verify tech belongs to this company
			const [tech] = (await sql`
				SELECT id, name FROM employees
				WHERE id = ${techId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as any[];

			if (!tech) return reply.code(404).send({ error: "Technician not found" });

			const tips = (await sql`
				SELECT
					t.id,
					t.job_id    AS "jobId",
					t.amount,
					t.currency,
					t.status,
					t.note,
					t.created_at AS "createdAt"
				FROM tech_tips t
				WHERE t.tech_id = ${techId}
					AND (${status == null} OR t.status = ${status ?? null})
				ORDER BY t.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`) as any[];

			const [totals] = (await sql`
				SELECT
					COUNT(*)                                          AS total_tips,
					COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0) AS total_earned,
					COALESCE(SUM(amount) FILTER (WHERE status = 'pending'),   0) AS total_pending
				FROM tech_tips
				WHERE tech_id = ${techId}
			`) as any[];

			return reply.send({
				tech: { id: tech.id, name: tech.name },
				summary: {
					totalTips: Number(totals.total_tips),
					totalEarned: Number(totals.total_earned),
					totalPending: Number(totals.total_pending)
				},
				tips,
				limit,
				offset
			});
		}
	);
}
