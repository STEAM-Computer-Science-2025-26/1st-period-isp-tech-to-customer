// services/routes/smsRoutes.ts
// Two-way SMS via Twilio — inbound webhook + outbound send

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload, resolveUserId } from "../middleware/auth";

// ============================================================
// Schemas
// ============================================================

const sendSmsSchema = z.object({
	toPhone: z.string().min(10, "Phone number required"),
	body: z.string().min(1).max(1600),
	jobId: z.string().uuid().optional(),
	customerId: z.string().uuid().optional()
});

const listSmsSchema = z.object({
	companyId: z.string().uuid().optional(),
	customerId: z.string().uuid().optional(),
	jobId: z.string().uuid().optional(),
	direction: z.enum(["inbound", "outbound"]).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

// ============================================================
// Helpers
// ============================================================

async function sendViaTwilio(
	to: string,
	body: string,
	fromPhone: string,
	accountSid: string,
	authToken: string
): Promise<string> {
	const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

	const params = new URLSearchParams({ To: to, From: fromPhone, Body: body });

	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
			"Content-Type": "application/x-www-form-urlencoded"
		},
		body: params.toString()
	});

	if (!res.ok) {
		const err = (await res.json()) as { message?: string };
		throw new Error(err.message ?? "Twilio send failed");
	}

	const data = (await res.json()) as { sid: string };
	return data.sid;
}

// ============================================================
// Route handlers
// ============================================================

export function sendSms(fastify: FastifyInstance) {
	fastify.post("/sms/send", async (request, reply) => {
		const user = request.user as JWTPayload;
		const companyId = user.companyId;
		if (!companyId) return reply.code(403).send({ error: "No company on token" });

		const parsed = sendSmsSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
		}

		const { toPhone, body, jobId, customerId } = parsed.data;
		const sql = getSql();

		// Fetch Twilio credentials from company settings
		const [creds] = (await sql`
			SELECT
				twilio_account_sid AS "accountSid",
				twilio_auth_token  AS "authToken",
				twilio_phone       AS "fromPhone"
			FROM company_settings
			WHERE company_id = ${companyId}
		`) as { accountSid: string; authToken: string; fromPhone: string }[];

		if (!creds?.accountSid) {
			return reply.code(422).send({ error: "Twilio not configured for this company. Add credentials in settings." });
		}

		let externalSid: string | null = null;
		try {
			externalSid = await sendViaTwilio(toPhone, body, creds.fromPhone, creds.accountSid, creds.authToken);
		} catch (err: any) {
			return reply.code(502).send({ error: err.message ?? "Failed to send SMS" });
		}

		const sentById = resolveUserId(user);

		const [msg] = (await sql`
			INSERT INTO sms_messages (
				company_id, direction, from_phone, to_phone,
				body, status, external_sid, job_id, customer_id, sent_by_user_id
			) VALUES (
				${companyId}, 'outbound', ${creds.fromPhone}, ${toPhone},
				${body}, 'sent', ${externalSid}, ${jobId ?? null}, ${customerId ?? null}, ${sentById ?? null}
			)
			RETURNING
				id, direction, from_phone AS "fromPhone", to_phone AS "toPhone",
				body, status, job_id AS "jobId", customer_id AS "customerId",
				created_at AS "createdAt"
		`) as any[];

		return reply.code(201).send({ message: msg });
	});
}

export function inboundSmsWebhook(fastify: FastifyInstance) {
	// Twilio posts to this endpoint when a message arrives
	// No JWT auth — validated by Twilio signature header instead
	fastify.post("/webhooks/sms/inbound", async (request, reply) => {
		const body = request.body as Record<string, string>;

		const fromPhone = body["From"];
		const toPhone = body["To"];
		const msgBody = body["Body"];
		const externalSid = body["MessageSid"];

		if (!fromPhone || !toPhone || !msgBody) {
			return reply.code(400).send({ error: "Missing Twilio fields" });
		}

		const sql = getSql();

		// Find company by their Twilio phone number
		const [company] = (await sql`
			SELECT company_id AS "companyId"
			FROM company_settings
			WHERE twilio_phone = ${toPhone}
			LIMIT 1
		`) as { companyId: string }[];

		if (!company) {
			// Unknown number — still return 200 to Twilio
			return reply.code(200).send();
		}

		// Try to match an existing customer by phone
		const [customer] = (await sql`
			SELECT id FROM customers
			WHERE company_id = ${company.companyId}
			  AND (phone = ${fromPhone} OR alt_phone = ${fromPhone})
			LIMIT 1
		`) as { id: string }[];

		await sql`
			INSERT INTO sms_messages (
				company_id, direction, from_phone, to_phone,
				body, status, external_sid, customer_id
			) VALUES (
				${company.companyId}, 'inbound', ${fromPhone}, ${toPhone},
				${msgBody}, 'received', ${externalSid}, ${customer?.id ?? null}
			)
		`;

		// Return TwiML — empty response tells Twilio we handled it
		reply.header("Content-Type", "text/xml");
		return reply.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
	});
}

export function listSmsMessages(fastify: FastifyInstance) {
	fastify.get("/sms", async (request, reply) => {
		const user = request.user as JWTPayload;
		const isDev = user.role === "dev";
		const companyId = isDev ? undefined : user.companyId;

		const parsed = listSmsSchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({ error: "Invalid query", details: z.treeifyError(parsed.error) });
		}

		const { customerId, jobId, direction, limit, offset } = parsed.data;
		const effectiveCompanyId = isDev ? (parsed.data.companyId ?? null) : companyId;

		const sql = getSql();

		const messages = await sql`
			SELECT
				id, company_id AS "companyId", direction,
				from_phone AS "fromPhone", to_phone AS "toPhone",
				body, status, external_sid AS "externalSid",
				job_id AS "jobId", customer_id AS "customerId",
				sent_by_user_id AS "sentByUserId",
				created_at AS "createdAt"
			FROM sms_messages
			WHERE TRUE
			  AND (${effectiveCompanyId}::uuid IS NULL OR company_id = ${effectiveCompanyId})
			  AND (${customerId ?? null}::uuid IS NULL OR customer_id = ${customerId ?? null})
			  AND (${jobId ?? null}::uuid IS NULL OR job_id = ${jobId ?? null})
			  AND (${direction ?? null}::text IS NULL OR direction = ${direction ?? null})
			ORDER BY created_at DESC
			LIMIT ${limit} OFFSET ${offset}
		`;

		return { messages };
	});
}

export async function smsRoutes(fastify: FastifyInstance) {
	// Inbound webhook — no auth (Twilio calls this)
	inboundSmsWebhook(fastify);

	fastify.register(async (authed) => {
		authed.addHook("onRequest", authenticate);
		sendSms(authed);
		listSmsMessages(authed);
	});
}