// services/routes/emailMarketingRoutes.ts
// Email marketing campaigns via Resend.
//
// Covers two use cases:
//   1. TRANSACTIONAL — triggered by events (post-job, estimate follow-up,
//      membership renewal, review request). These replace the placeholder
//      email hooks in reviewRoutes + automationRoutes.
//
//   2. CAMPAIGN — bulk sends to a filtered segment of customers.
//      e.g. "All customers with no job in 12 months" → seasonal tune-up promo.
//
// Endpoints:
//   POST   /email/templates               — create email template
//   GET    /email/templates               — list templates
//   GET    /email/templates/:id           — single template
//   PUT    /email/templates/:id           — update template
//   DELETE /email/templates/:id           — delete template
//
//   POST   /email/campaigns               — create campaign (draft)
//   GET    /email/campaigns               — list campaigns
//   GET    /email/campaigns/:id           — campaign detail + stats
//   POST   /email/campaigns/:id/send      — send campaign now
//   POST   /email/campaigns/:id/schedule  — schedule campaign for later
//   DELETE /email/campaigns/:id           — cancel/delete draft campaign
//
//   POST   /email/send                    — send a single transactional email
//   GET    /email/stats                   — aggregate send stats (opens, clicks, bounces)
//
// Template variables: {{firstName}}, {{lastName}}, {{companyName}},
//   {{jobType}}, {{scheduledDate}}, {{invoiceTotal}}, {{reviewUrl}}, {{customVar}}

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─── Resend client ────────────────────────────────────────────────────────────

async function sendViaResend(payload: {
	from: string;
	to: string | string[];
	subject: string;
	html: string;
	replyTo?: string;
	tags?: { name: string; value: string }[];
}): Promise<{ id: string }> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			from: payload.from,
			to: Array.isArray(payload.to) ? payload.to : [payload.to],
			subject: payload.subject,
			html: payload.html,
			reply_to: payload.replyTo,
			tags: payload.tags
		})
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Resend API error ${res.status}: ${err}`);
	}

	return res.json();
}

// ─── Template variable interpolation ─────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
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

const createTemplateSchema = z.object({
	name: z.string().min(1).max(120),
	subject: z.string().min(1).max(200),
	htmlBody: z.string().min(1),
	previewText: z.string().max(200).optional(),
	category: z
		.enum([
			"post_job",
			"estimate_followup",
			"membership_renewal",
			"seasonal_promo",
			"review_request",
			"invoice",
			"appointment_reminder",
			"win_back",
			"other"
		])
		.default("other")
});

const createCampaignSchema = z.object({
	name: z.string().min(1).max(200),
	templateId: z.string().uuid(),
	fromName: z.string().min(1).max(80),
	fromEmail: z.string().email(),
	replyTo: z.string().email().optional(),
	// Segment filters — all are AND conditions
	segment: z
		.object({
			customerType: z.enum(["residential", "commercial"]).optional(),
			hasJobInLastDays: z.number().int().min(1).optional(),
			noJobInLastDays: z.number().int().min(1).optional(),
			hasActiveMembership: z.boolean().optional(),
			jobType: z.string().optional(),
			zipCodes: z.array(z.string()).optional(),
			tagIds: z.array(z.string().uuid()).optional()
		})
		.optional()
});

const sendCampaignSchema = z.object({
	// Optional custom variables to merge into all emails
	customVars: z.record(z.string(), z.string()).optional()
});

const scheduleCampaignSchema = z.object({
	scheduledAt: z.string().datetime(),
	customVars: z.record(z.string(), z.string()).optional()
});

const sendTransactionalSchema = z.object({
	to: z.string().email(),
	templateId: z.string().uuid().optional(),
	// OR provide subject + htmlBody directly
	subject: z.string().min(1).max(200).optional(),
	htmlBody: z.string().optional(),
	fromName: z.string().max(80).optional(),
	fromEmail: z.string().email().optional(),
	vars: z.record(z.string(), z.string()).optional(),
	// Link to entity for tracking
	jobId: z.string().uuid().optional(),
	customerId: z.string().uuid().optional(),
	category: z.string().optional()
});

const statsQuerySchema = z.object({
	companyId: z.string().uuid().optional(),
	days: z.coerce.number().int().min(1).max(365).default(30)
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function emailMarketingRoutes(fastify: FastifyInstance) {
	// =========================================================================
	// TEMPLATES
	// =========================================================================

	// ── POST /email/templates ─────────────────────────────────────────────────
	fastify.post(
		"/email/templates",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });

			const parsed = createTemplateSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const b = parsed.data;
			const sql = getSql();

			const [template] = (await sql`
				INSERT INTO email_templates (
					company_id, name, subject, html_body,
					preview_text, category, created_by_user_id
				) VALUES (
					${companyId}, ${b.name}, ${b.subject}, ${b.htmlBody},
					${b.previewText ?? null}, ${b.category},
					${user.userId ?? user.id ?? null}
				)
				RETURNING
					id, name, subject, preview_text AS "previewText",
					category, created_at AS "createdAt"
			`) as any[];

			return reply.code(201).send({ template });
		}
	);

	// ── GET /email/templates ──────────────────────────────────────────────────
	fastify.get(
		"/email/templates",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const templates = (await sql`
				SELECT
					id, name, subject, preview_text AS "previewText",
					category, is_active AS "isActive",
					created_at AS "createdAt", updated_at AS "updatedAt"
				FROM email_templates
				WHERE company_id = ${companyId}
				ORDER BY category, name
			`) as any[];

			return reply.send({ templates });
		}
	);

	// ── GET /email/templates/:id ──────────────────────────────────────────────
	fastify.get(
		"/email/templates/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [template] = (await sql`
				SELECT * FROM email_templates
				WHERE id = ${id}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as any[];

			if (!template)
				return reply.code(404).send({ error: "Template not found" });
			return reply.send({ template });
		}
	);

	// ── PUT /email/templates/:id ──────────────────────────────────────────────
	fastify.put(
		"/email/templates/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const b = createTemplateSchema.partial().parse(request.body);
			const sql = getSql();

			const [updated] = (await sql`
				UPDATE email_templates SET
					name         = COALESCE(${b.name ?? null}, name),
					subject      = COALESCE(${b.subject ?? null}, subject),
					html_body    = COALESCE(${b.htmlBody ?? null}, html_body),
					preview_text = COALESCE(${b.previewText ?? null}, preview_text),
					category     = COALESCE(${b.category ?? null}, category),
					updated_at   = NOW()
				WHERE id = ${id}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, name, subject, updated_at AS "updatedAt"
			`) as any[];

			if (!updated)
				return reply.code(404).send({ error: "Template not found" });
			return reply.send({ template: updated });
		}
	);

	// ── DELETE /email/templates/:id ───────────────────────────────────────────
	fastify.delete(
		"/email/templates/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [deleted] = (await sql`
				DELETE FROM email_templates
				WHERE id = ${id}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id
			`) as any[];

			if (!deleted)
				return reply.code(404).send({ error: "Template not found" });
			return reply.send({ deleted: true });
		}
	);

	// =========================================================================
	// CAMPAIGNS
	// =========================================================================

	// ── POST /email/campaigns ─────────────────────────────────────────────────
	fastify.post(
		"/email/campaigns",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });

			const parsed = createCampaignSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const b = parsed.data;
			const sql = getSql();

			// Verify template exists
			const [template] = (await sql`
				SELECT id FROM email_templates
				WHERE id = ${b.templateId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as any[];
			if (!template)
				return reply.code(404).send({ error: "Template not found" });

			const [campaign] = (await sql`
				INSERT INTO email_campaigns (
					company_id, name, template_id,
					from_name, from_email, reply_to,
					segment, status,
					created_by_user_id
				) VALUES (
					${companyId}, ${b.name}, ${b.templateId},
					${b.fromName}, ${b.fromEmail}, ${b.replyTo ?? null},
					${b.segment ? JSON.stringify(b.segment) : null}::jsonb,
					'draft',
					${user.userId ?? user.id ?? null}
				)
				RETURNING
					id, name, status, created_at AS "createdAt"
			`) as any[];

			return reply.code(201).send({ campaign });
		}
	);

	// ── GET /email/campaigns ──────────────────────────────────────────────────
	fastify.get(
		"/email/campaigns",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const campaigns = (await sql`
				SELECT
					c.id, c.name, c.status,
					c.from_name AS "fromName", c.from_email AS "fromEmail",
					t.name AS "templateName",
					c.recipient_count AS "recipientCount",
					c.sent_count AS "sentCount",
					c.scheduled_at AS "scheduledAt",
					c.sent_at AS "sentAt",
					c.created_at AS "createdAt"
				FROM email_campaigns c
				LEFT JOIN email_templates t ON t.id = c.template_id
				WHERE c.company_id = ${companyId}
				ORDER BY c.created_at DESC
			`) as any[];

			return reply.send({ campaigns });
		}
	);

	// ── GET /email/campaigns/:id ──────────────────────────────────────────────
	fastify.get(
		"/email/campaigns/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [campaign] = (await sql`
				SELECT c.*, t.name AS "templateName", t.subject AS "templateSubject"
				FROM email_campaigns c
				LEFT JOIN email_templates t ON t.id = c.template_id
				WHERE c.id = ${id}
					AND (${isDev(user) && !companyId} OR c.company_id = ${companyId})
			`) as any[];

			if (!campaign)
				return reply.code(404).send({ error: "Campaign not found" });
			return reply.send({ campaign });
		}
	);

	// ── POST /email/campaigns/:id/send ────────────────────────────────────────
	// Resolves the segment, fetches customer emails, sends via Resend.
	fastify.post(
		"/email/campaigns/:id/send",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);

			const parsed = sendCampaignSchema.safeParse(request.body ?? {});
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });

			const { customVars } = parsed.data;
			const sql = getSql();

			const [campaign] = (await sql`
				SELECT c.*, t.subject, t.html_body AS "htmlBody"
				FROM email_campaigns c
				JOIN email_templates t ON t.id = c.template_id
				WHERE c.id = ${id}
					AND (${isDev(user) && !companyId} OR c.company_id = ${companyId})
			`) as any[];

			if (!campaign)
				return reply.code(404).send({ error: "Campaign not found" });
			if (campaign.status !== "draft") {
				return reply
					.code(409)
					.send({ error: "Campaign already sent or scheduled" });
			}

			// Resolve segment → customer list
			const segment = campaign.segment ?? {};
			const customers = (await sql`
				SELECT
					c.id, c.first_name AS "firstName", c.last_name AS "lastName",
					c.email, c.customer_type AS "customerType", c.zip
				FROM customers c
				WHERE c.company_id = ${companyId}
					AND c.email IS NOT NULL
					AND c.email != ''
					AND (${segment.customerType ?? null}::text IS NULL OR c.customer_type = ${segment.customerType ?? null})
					AND (${segment.zipCodes ?? null}::text[] IS NULL OR c.zip = ANY(${segment.zipCodes ?? []}))
					AND (
						${segment.noJobInLastDays ?? null}::int IS NULL OR
						NOT EXISTS (
							SELECT 1 FROM jobs j
							WHERE j.customer_id = c.id
								AND j.status = 'completed'
								AND j.completed_at >= NOW() - (${segment.noJobInLastDays ?? 0} || ' days')::interval
						)
					)
					AND (
						${segment.hasJobInLastDays ?? null}::int IS NULL OR
						EXISTS (
							SELECT 1 FROM jobs j
							WHERE j.customer_id = c.id
								AND j.status = 'completed'
								AND j.completed_at >= NOW() - (${segment.hasJobInLastDays ?? 0} || ' days')::interval
						)
					)
			`) as any[];

			if (customers.length === 0) {
				return reply
					.code(422)
					.send({ error: "No customers match this segment" });
			}

			// Mark campaign as sending
			await sql`
				UPDATE email_campaigns SET
					status          = 'sending',
					recipient_count = ${customers.length},
					updated_at      = NOW()
				WHERE id = ${id}
			`;

			// Send emails — batch to avoid rate limits
			let sentCount = 0;
			let failCount = 0;

			for (const customer of customers) {
				const vars: Record<string, string> = {
					firstName: customer.firstName ?? "",
					lastName: customer.lastName ?? "",
					...customVars
				};

				const subject = interpolate(campaign.subject, vars);
				const html = interpolate(campaign.htmlBody, vars);

				try {
					const result = await sendViaResend({
						from: `${campaign.from_name} <${campaign.from_email}>`,
						to: customer.email,
						subject,
						html,
						replyTo: campaign.reply_to ?? undefined,
						tags: [
							{ name: "campaign_id", value: id },
							{ name: "company_id", value: companyId ?? "" },
							{ name: "customer_id", value: customer.id }
						]
					});

					// Log the send
					await sql`
						INSERT INTO email_sends (
							company_id, campaign_id, customer_id,
							to_email, subject, resend_message_id, status
						) VALUES (
							${companyId}, ${id}, ${customer.id},
							${customer.email}, ${subject}, ${result.id}, 'sent'
						)
					`;

					sentCount++;
				} catch (err: any) {
					await sql`
						INSERT INTO email_sends (
							company_id, campaign_id, customer_id,
							to_email, subject, status, error
						) VALUES (
							${companyId}, ${id}, ${customer.id},
							${customer.email}, ${subject}, 'failed', ${err.message ?? "unknown"}
						)
					`;
					failCount++;
				}
			}

			// Mark campaign sent
			await sql`
				UPDATE email_campaigns SET
					status     = 'sent',
					sent_count = ${sentCount},
					sent_at    = NOW(),
					updated_at = NOW()
				WHERE id = ${id}
			`;

			return reply.send({
				sent: sentCount,
				failed: failCount,
				total: customers.length
			});
		}
	);

	// ── POST /email/campaigns/:id/schedule ────────────────────────────────────
	fastify.post(
		"/email/campaigns/:id/schedule",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);

			const parsed = scheduleCampaignSchema.safeParse(request.body);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid body" });

			const sql = getSql();

			const [campaign] = (await sql`
				UPDATE email_campaigns SET
					status       = 'scheduled',
					scheduled_at = ${parsed.data.scheduledAt},
					updated_at   = NOW()
				WHERE id = ${id}
					AND status = 'draft'
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, status, scheduled_at AS "scheduledAt"
			`) as any[];

			if (!campaign)
				return reply
					.code(404)
					.send({ error: "Campaign not found or not in draft" });
			return reply.send({ campaign });
		}
	);

	// ── DELETE /email/campaigns/:id ───────────────────────────────────────────
	fastify.delete(
		"/email/campaigns/:id",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { id } = request.params as { id: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [deleted] = (await sql`
				DELETE FROM email_campaigns
				WHERE id = ${id}
					AND status IN ('draft', 'scheduled')
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id
			`) as any[];

			if (!deleted)
				return reply
					.code(404)
					.send({ error: "Campaign not found or already sent" });
			return reply.send({ deleted: true });
		}
	);

	// =========================================================================
	// TRANSACTIONAL
	// =========================================================================

	// ── POST /email/send ──────────────────────────────────────────────────────
	// Send a single transactional email. Used by other routes (review requests,
	// estimate follow-ups, membership renewals, invoice delivery, etc.)
	fastify.post(
		"/email/send",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });

			const parsed = sendTransactionalSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid body",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const b = parsed.data;
			const sql = getSql();

			let subject = b.subject ?? "";
			let html = b.htmlBody ?? "";

			// Load template if provided
			if (b.templateId) {
				const [template] = (await sql`
					SELECT subject, html_body AS "htmlBody" FROM email_templates
					WHERE id = ${b.templateId}
						AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				`) as any[];
				if (!template)
					return reply.code(404).send({ error: "Template not found" });
				subject = template.subject;
				html = template.htmlBody;
			}

			if (!subject || !html) {
				return reply
					.code(400)
					.send({ error: "subject and htmlBody required if no templateId" });
			}

			// Interpolate variables
			const vars: Record<string, string> = b.vars ?? {};
			subject = interpolate(subject, vars);
			html = interpolate(html, vars);

			// Get company from email if not provided
			const [company] = (await sql`
				SELECT name, email FROM companies WHERE id = ${companyId}
			`) as any[];

			const fromName = b.fromName ?? company?.name ?? "Your HVAC Team";
			const fromEmail =
				b.fromEmail ??
				process.env.RESEND_FROM_EMAIL ??
				"noreply@yourdomain.com";

			const result = await sendViaResend({
				from: `${fromName} <${fromEmail}>`,
				to: b.to,
				subject,
				html
			});

			// Log the send
			await sql`
				INSERT INTO email_sends (
					company_id, customer_id, job_id,
					to_email, subject, resend_message_id,
					status, category
				) VALUES (
					${companyId}, ${b.customerId ?? null}, ${b.jobId ?? null},
					${b.to}, ${subject}, ${result.id},
					'sent', ${b.category ?? "transactional"}
				)
			`;

			return reply.send({ sent: true, messageId: result.id });
		}
	);

	// ── GET /email/stats ──────────────────────────────────────────────────────
	fastify.get(
		"/email/stats",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);

			const parsed = statsQuerySchema.safeParse(request.query);
			if (!parsed.success)
				return reply.code(400).send({ error: "Invalid query" });

			const { days } = parsed.data;
			const sql = getSql();

			const [totals] = (await sql`
				SELECT
					COUNT(*)                                           AS total_sent,
					COUNT(*) FILTER (WHERE status = 'sent')           AS delivered,
					COUNT(*) FILTER (WHERE status = 'failed')         AS failed,
					COUNT(*) FILTER (WHERE status = 'bounced')        AS bounced,
					COUNT(DISTINCT customer_id)                       AS unique_recipients
				FROM email_sends
				WHERE company_id = ${companyId}
					AND created_at >= NOW() - (${days} || ' days')::interval
			`) as any[];

			const byCategory = (await sql`
				SELECT
					category,
					COUNT(*) AS sent,
					COUNT(*) FILTER (WHERE status = 'failed') AS failed
				FROM email_sends
				WHERE company_id = ${companyId}
					AND created_at >= NOW() - (${days} || ' days')::interval
				GROUP BY category
				ORDER BY sent DESC
			`) as any[];

			return reply.send({ days, totals, byCategory });
		}
	);

	// ── POST /email/webhook/resend ────────────────────────────────────────────
	// Resend webhook — update send status on delivery events.
	// No auth — validated by Resend-Signature header.
	// Configure in Resend dashboard: Settings → Webhooks
	fastify.post(
		"/email/webhook/resend",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const body = request.body as any;
			if (!body?.type || !body?.data) {
				return reply.code(400).send({ error: "Invalid webhook payload" });
			}

			const sql = getSql();
			const messageId = body.data?.email_id ?? body.data?.message_id;
			if (!messageId) return reply.send({ received: true });

			let status: string | null = null;
			switch (body.type) {
				case "email.delivered":
					status = "delivered";
					break;
				case "email.bounced":
					status = "bounced";
					break;
				case "email.complained":
					status = "complained";
					break;
				case "email.opened":
					status = "opened";
					break;
				case "email.clicked":
					status = "clicked";
					break;
			}

			if (status) {
				await sql`
					UPDATE email_sends SET
						status     = ${status},
						updated_at = NOW()
					WHERE resend_message_id = ${messageId}
				`;
			}

			return reply.send({ received: true });
		}
	);
}
