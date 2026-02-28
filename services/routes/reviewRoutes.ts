// services/routes/reviewRoutes.ts
// Google review request automation — triggered post-job completion
// Sends SMS or email with a review link, tracks status

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";
import { writeAuditLog } from "./auditRoutes";

// ============================================================
// Schemas
// ============================================================

const triggerReviewRequestSchema = z.object({
	jobId: z.string().uuid(),
	channel: z.enum(["sms", "email", "both"]).default("sms"),
	delayMinutes: z.number().int().min(0).max(1440).default(30) // default 30 min after job
});

const updateReviewSettingsSchema = z.object({
	googlePlaceId: z.string().min(1).optional(),
	autoTriggerEnabled: z.boolean().optional(),
	autoTriggerDelayMinutes: z.number().int().min(0).max(1440).optional(),
	defaultChannel: z.enum(["sms", "email", "both"]).optional(),
	smsTemplate: z.string().max(320).optional(),
	emailSubject: z.string().max(200).optional(),
	emailTemplate: z.string().max(2000).optional()
});

const listReviewRequestsSchema = z.object({
	companyId: z.string().uuid().optional(),
	status: z.enum(["pending", "sent", "clicked", "reviewed", "failed"]).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

// ============================================================
// Helpers
// ============================================================

function buildGoogleReviewUrl(placeId: string): string {
	return `https://search.google.com/local/writereview?placeid=${placeId}`;
}

function buildSmsBody(template: string, customerName: string, reviewUrl: string): string {
	return template
		.replace("{name}", customerName)
		.replace("{url}", reviewUrl);
}

const DEFAULT_SMS_TEMPLATE =
	"Hi {name}! Thanks for choosing us. If you have a moment, we'd love a Google review: {url}";

// ============================================================
// Route handlers
// ============================================================

export function triggerReviewRequest(fastify: FastifyInstance) {
	fastify.post("/reviews/request", async (request, reply) => {
		const user = request.user as JWTPayload;
		const companyId = user.companyId;
		if (!companyId) return reply.code(403).send({ error: "No company on token" });

		const parsed = triggerReviewRequestSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
		}

		const { jobId, channel, delayMinutes } = parsed.data;
		const sql = getSql();

		// Get job + customer info
		const [job] = (await sql`
			SELECT
				j.id, j.status, j.company_id AS "companyId",
				j.customer_id AS "customerId",
				c.first_name AS "firstName", c.last_name AS "lastName",
				c.phone, c.email
			FROM jobs j
			LEFT JOIN customers c ON c.id = j.customer_id
			WHERE j.id = ${jobId} AND j.company_id = ${companyId}
		`) as any[];

		if (!job) return reply.code(404).send({ error: "Job not found" });

		if (job.status !== "completed") {
			return reply.code(422).send({ error: "Review requests can only be sent for completed jobs" });
		}

		// Get company review settings
		const [settings] = (await sql`
			SELECT
				google_place_id     AS "googlePlaceId",
				sms_template        AS "smsTemplate",
				email_subject       AS "emailSubject",
				email_template      AS "emailTemplate",
				twilio_account_sid  AS "accountSid",
				twilio_auth_token   AS "authToken",
				twilio_phone        AS "fromPhone"
			FROM company_settings
			WHERE company_id = ${companyId}
		`) as any[];

		if (!settings?.googlePlaceId) {
			return reply.code(422).send({ error: "Google Place ID not configured. Add it in company settings." });
		}

		const reviewUrl = buildGoogleReviewUrl(settings.googlePlaceId);
		const customerName = job.firstName ?? "there";
		const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

		// Create the review request record
		const [reviewRequest] = (await sql`
			INSERT INTO review_requests (
				company_id, job_id, customer_id, channel,
				review_url, scheduled_at, status
			) VALUES (
				${companyId}, ${jobId}, ${job.customerId ?? null}, ${channel},
				${reviewUrl}, ${scheduledAt.toISOString()}, 'pending'
			)
			ON CONFLICT (job_id) DO UPDATE
			SET
				channel = EXCLUDED.channel,
				scheduled_at = EXCLUDED.scheduled_at,
				status = 'pending',
				updated_at = NOW()
			RETURNING id, scheduled_at AS "scheduledAt"
		`) as any[];

		// If delayMinutes is 0, send immediately
		if (delayMinutes === 0) {
			if ((channel === "sms" || channel === "both") && job.phone && settings.accountSid) {
				const smsBody = buildSmsBody(
					settings.smsTemplate ?? DEFAULT_SMS_TEMPLATE,
					customerName,
					reviewUrl
				);

				try {
					const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${settings.accountSid}/Messages.json`;
					const params = new URLSearchParams({
						To: job.phone,
						From: settings.fromPhone,
						Body: smsBody
					});
					await fetch(twilioUrl, {
						method: "POST",
						headers: {
							Authorization: `Basic ${Buffer.from(`${settings.accountSid}:${settings.authToken}`).toString("base64")}`,
							"Content-Type": "application/x-www-form-urlencoded"
						},
						body: params.toString()
					});

					await sql`
						UPDATE review_requests
						SET status = 'sent', sent_at = NOW()
						WHERE id = ${reviewRequest.id}
					`;
				} catch {
					await sql`
						UPDATE review_requests SET status = 'failed' WHERE id = ${reviewRequest.id}
					`;
				}
			}
		}

		await writeAuditLog({
			companyId,
			actorUserId: user.userId ?? user.id,
			actorRole: user.role,
			action: "review_request.created",
			entityType: "review_request",
			entityId: reviewRequest.id,
			meta: { jobId, channel, delayMinutes }
		});

		return reply.code(201).send({
			reviewRequest: {
				id: reviewRequest.id,
				scheduledAt: reviewRequest.scheduledAt,
				reviewUrl,
				status: delayMinutes === 0 ? "sent" : "pending"
			}
		});
	});
}

export function listReviewRequests(fastify: FastifyInstance) {
	fastify.get("/reviews/requests", async (request, reply) => {
		const user = request.user as JWTPayload;
		const isDev = user.role === "dev";

		const parsed = listReviewRequestsSchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({ error: "Invalid query", details: z.treeifyError(parsed.error) });
		}

		const { status, limit, offset } = parsed.data;
		const effectiveCompanyId = isDev ? (parsed.data.companyId ?? null) : (user.companyId ?? null);
		const sql = getSql();

		const requests = await sql`
			SELECT
				rr.id,
				rr.company_id   AS "companyId",
				rr.job_id       AS "jobId",
				rr.customer_id  AS "customerId",
				rr.channel,
				rr.review_url   AS "reviewUrl",
				rr.status,
				rr.scheduled_at AS "scheduledAt",
				rr.sent_at      AS "sentAt",
				rr.clicked_at   AS "clickedAt",
				rr.created_at   AS "createdAt",
				c.first_name    AS "customerFirstName",
				c.last_name     AS "customerLastName"
			FROM review_requests rr
			LEFT JOIN customers c ON c.id = rr.customer_id
			WHERE TRUE
			  AND (${effectiveCompanyId}::uuid IS NULL OR rr.company_id = ${effectiveCompanyId})
			  AND (${status ?? null}::text IS NULL OR rr.status = ${status ?? null})
			ORDER BY rr.created_at DESC
			LIMIT ${limit} OFFSET ${offset}
		`;

		return { requests };
	});
}

/**
 * Tracking pixel / redirect endpoint — when customer clicks the review link
 * we intercept to record the click before redirecting to Google
 */
export function trackReviewClick(fastify: FastifyInstance) {
	fastify.get("/reviews/click/:requestId", async (request, reply) => {
		const { requestId } = request.params as { requestId: string };
		const sql = getSql();

		const [record] = (await sql`
			UPDATE review_requests
			SET clicked_at = NOW(), status = 'clicked'
			WHERE id = ${requestId} AND clicked_at IS NULL
			RETURNING review_url AS "reviewUrl"
		`) as { reviewUrl: string }[];

		const redirectTo = record?.reviewUrl ?? "https://www.google.com";
		return reply.redirect(redirectTo, 302);
	});
}

export function updateReviewSettings(fastify: FastifyInstance) {
	fastify.patch("/settings/reviews", async (request, reply) => {
		const user = request.user as JWTPayload;
		if (user.role !== "admin" && user.role !== "dev") {
			return reply.code(403).send({ error: "Forbidden - Admin access required" });
		}

		const companyId = user.companyId;
		if (!companyId) return reply.code(403).send({ error: "No company on token" });

		const parsed = updateReviewSettingsSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
		}

		const d = parsed.data;
		const sql = getSql();

		await sql`
			UPDATE company_settings SET
				google_place_id              = COALESCE(${d.googlePlaceId ?? null}, google_place_id),
				auto_review_trigger          = COALESCE(${d.autoTriggerEnabled ?? null}, auto_review_trigger),
				auto_review_delay_minutes    = COALESCE(${d.autoTriggerDelayMinutes ?? null}, auto_review_delay_minutes),
				review_default_channel       = COALESCE(${d.defaultChannel ?? null}, review_default_channel),
				review_sms_template          = COALESCE(${d.smsTemplate ?? null}, review_sms_template),
				review_email_subject         = COALESCE(${d.emailSubject ?? null}, review_email_subject),
				review_email_template        = COALESCE(${d.emailTemplate ?? null}, review_email_template),
				updated_at                   = NOW()
			WHERE company_id = ${companyId}
		`;

		return { ok: true };
	});
}

export async function reviewRoutes(fastify: FastifyInstance) {
	// Click tracking — no auth (customer follows link)
	trackReviewClick(fastify);

	fastify.register(async (authed) => {
		authed.addHook("onRequest", authenticate);
		triggerReviewRequest(authed);
		listReviewRequests(authed);
		updateReviewSettings(authed);
	});
}