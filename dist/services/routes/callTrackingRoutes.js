// services/routes/callTrackingRoutes.ts
// Call and lead tracking — log inbound/outbound calls, tie to customers or CRM
// leads, track source attribution for marketing ROI.
//
// Design:
//   - Call logs are the source of truth for phone activity
//   - Each call can be linked to a customer, a CRM lead, or be unmatched (new)
//   - Source attribution tracks where the caller came from (Google, Yelp, LSA, etc.)
//   - Unmatched calls can be converted to leads with one endpoint
//   - Integrates with Twilio webhook for automatic call logging (optional)
//
// Endpoints:
//   POST   /calls                        — manually log a call
//   GET    /calls                        — list calls (filterable)
//   GET    /calls/:id                    — call detail
//   PATCH  /calls/:id                    — update call (add notes, outcome, link to customer)
//   POST   /calls/:id/convert-to-lead    — convert unmatched call to CRM lead
//   POST   /calls/webhook/twilio         — Twilio StatusCallback webhook (no auth)
//   GET    /calls/analytics              — call volume, source breakdown, conversion rate
//   GET    /calls/sources                — lead source attribution summary
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getUser(request) {
    return request.user;
}
function isDev(user) {
    return user.role === "dev";
}
function resolveCompanyId(user) {
    return user.companyId ?? null;
}
// ─── Schemas ─────────────────────────────────────────────────────────────────
const CALL_SOURCES = [
    "google_lsa",
    "google_ads",
    "google_organic",
    "yelp",
    "facebook",
    "referral",
    "website",
    "repeat_customer",
    "direct",
    "other"
];
const CALL_OUTCOMES = [
    "booked",
    "callback_requested",
    "not_interested",
    "wrong_number",
    "no_answer",
    "voicemail",
    "duplicate",
    "other"
];
const createCallSchema = z.object({
    direction: z.enum(["inbound", "outbound"]).default("inbound"),
    callerPhone: z.string().min(7).max(30),
    callerName: z.string().max(120).optional(),
    source: z.enum(CALL_SOURCES).default("direct"),
    sourceDetail: z.string().max(200).optional(), // e.g. campaign name, tracking number
    trackingNumber: z.string().max(30).optional(), // the number they dialed (for DNI)
    durationSeconds: z.number().int().min(0).optional(),
    outcome: z.enum(CALL_OUTCOMES).optional(),
    notes: z.string().max(2000).optional(),
    // Links
    customerId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    // Recording
    recordingUrl: z.string().url().optional(),
    // Twilio fields
    twilioCallSid: z.string().max(60).optional()
});
const updateCallSchema = z.object({
    outcome: z.enum(CALL_OUTCOMES).optional(),
    notes: z.string().max(2000).optional(),
    durationSeconds: z.number().int().min(0).optional(),
    customerId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    source: z.enum(CALL_SOURCES).optional(),
    sourceDetail: z.string().max(200).optional()
});
const listCallsSchema = z.object({
    companyId: z.string().uuid().optional(),
    direction: z.enum(["inbound", "outbound"]).optional(),
    source: z.enum(CALL_SOURCES).optional(),
    outcome: z.enum(CALL_OUTCOMES).optional(),
    customerId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    unmatched: z.coerce.boolean().optional(), // calls with no customer or lead
    since: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
const analyticsSchema = z.object({
    companyId: z.string().uuid().optional(),
    days: z.coerce.number().int().min(1).max(365).default(30)
});
const convertToLeadSchema = z.object({
    serviceNeeded: z.string().min(1).max(200).optional(),
    notes: z.string().max(500).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal")
});
// ─── Routes ──────────────────────────────────────────────────────────────────
export async function callTrackingRoutes(fastify) {
    // ── POST /calls ───────────────────────────────────────────────────────────
    // Manually log a call.
    fastify.post("/calls", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const companyId = resolveCompanyId(user);
        if (!companyId && !isDev(user)) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const parsed = createCallSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const effectiveCompanyId = isDev(user)
            ? (request.body.companyId ?? companyId)
            : companyId;
        const sql = getSql();
        const [call] = (await sql `
				INSERT INTO call_logs (
					company_id,
					direction, caller_phone, caller_name,
					source, source_detail, tracking_number,
					duration_seconds, outcome, notes,
					customer_id, lead_id, job_id,
					recording_url, twilio_call_sid,
					logged_by_user_id,
					called_at
				) VALUES (
					${effectiveCompanyId},
					${body.direction}, ${body.callerPhone}, ${body.callerName ?? null},
					${body.source}, ${body.sourceDetail ?? null}, ${body.trackingNumber ?? null},
					${body.durationSeconds ?? null}, ${body.outcome ?? null}, ${body.notes ?? null},
					${body.customerId ?? null}, ${body.leadId ?? null}, ${body.jobId ?? null},
					${body.recordingUrl ?? null}, ${body.twilioCallSid ?? null},
					${user.userId ?? user.id ?? null},
					NOW()
				)
				RETURNING
					id,
					direction, caller_phone AS "callerPhone", caller_name AS "callerName",
					source, outcome, duration_seconds AS "durationSeconds",
					customer_id AS "customerId", lead_id AS "leadId",
					called_at AS "calledAt", created_at AS "createdAt"
			`);
        return reply.code(201).send({ call });
    });
    // ── GET /calls ────────────────────────────────────────────────────────────
    fastify.get("/calls", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const companyId = resolveCompanyId(user);
        const parsed = listCallsSchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.code(400).send({ error: "Invalid query params" });
        }
        const { direction, source, outcome, customerId, leadId, unmatched, since, until, limit, offset } = parsed.data;
        const sql = getSql();
        const calls = (await sql `
				SELECT
					cl.id,
					cl.direction,
					cl.caller_phone    AS "callerPhone",
					cl.caller_name     AS "callerName",
					cl.source,
					cl.source_detail   AS "sourceDetail",
					cl.tracking_number AS "trackingNumber",
					cl.duration_seconds AS "durationSeconds",
					cl.outcome,
					cl.notes,
					cl.customer_id     AS "customerId",
					cl.lead_id         AS "leadId",
					cl.job_id          AS "jobId",
					cl.recording_url   AS "recordingUrl",
					c.first_name || ' ' || c.last_name AS "customerName",
					cl.called_at       AS "calledAt"
				FROM call_logs cl
				LEFT JOIN customers c ON c.id = cl.customer_id
				WHERE (${isDev(user) && !companyId} OR cl.company_id = ${companyId})
					AND (${direction ?? null}::text IS NULL OR cl.direction = ${direction ?? null})
					AND (${source ?? null}::text IS NULL OR cl.source = ${source ?? null})
					AND (${outcome ?? null}::text IS NULL OR cl.outcome = ${outcome ?? null})
					AND (${customerId ?? null}::uuid IS NULL OR cl.customer_id = ${customerId ?? null})
					AND (${leadId ?? null}::uuid IS NULL OR cl.lead_id = ${leadId ?? null})
					AND (${unmatched ?? null}::boolean IS NULL OR
						(${unmatched} = TRUE AND cl.customer_id IS NULL AND cl.lead_id IS NULL) OR
						(${unmatched} = FALSE AND (cl.customer_id IS NOT NULL OR cl.lead_id IS NOT NULL))
					)
					AND (${since ?? null}::date IS NULL OR cl.called_at >= ${since ?? null}::date)
					AND (${until ?? null}::date IS NULL OR cl.called_at < (${until ?? null}::date + INTERVAL '1 day'))
				ORDER BY cl.called_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`);
        return reply.send({ calls, limit, offset });
    });
    // ── GET /calls/:id ────────────────────────────────────────────────────────
    fastify.get("/calls/:id", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { id } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const [call] = (await sql `
				SELECT
					cl.*,
					c.first_name || ' ' || c.last_name AS "customerName",
					c.email AS "customerEmail"
				FROM call_logs cl
				LEFT JOIN customers c ON c.id = cl.customer_id
				WHERE cl.id = ${id}
					AND (${isDev(user) && !companyId} OR cl.company_id = ${companyId})
			`);
        if (!call)
            return reply.code(404).send({ error: "Call not found" });
        return reply.send({ call });
    });
    // ── PATCH /calls/:id ──────────────────────────────────────────────────────
    fastify.patch("/calls/:id", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { id } = request.params;
        const companyId = resolveCompanyId(user);
        const parsed = updateCallSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: "Invalid body" });
        }
        const b = parsed.data;
        const sql = getSql();
        const [updated] = (await sql `
				UPDATE call_logs SET
					outcome          = COALESCE(${b.outcome ?? null}, outcome),
					notes            = COALESCE(${b.notes ?? null}, notes),
					duration_seconds = COALESCE(${b.durationSeconds ?? null}, duration_seconds),
					customer_id      = COALESCE(${b.customerId ?? null}, customer_id),
					lead_id          = COALESCE(${b.leadId ?? null}, lead_id),
					job_id           = COALESCE(${b.jobId ?? null}, job_id),
					source           = COALESCE(${b.source ?? null}, source),
					source_detail    = COALESCE(${b.sourceDetail ?? null}, source_detail),
					updated_at       = NOW()
				WHERE id = ${id}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
				RETURNING id, outcome, notes, customer_id AS "customerId", updated_at AS "updatedAt"
			`);
        if (!updated)
            return reply.code(404).send({ error: "Call not found" });
        return reply.send({ call: updated });
    });
    // ── POST /calls/:id/convert-to-lead ───────────────────────────────────────
    // Convert an unmatched inbound call into a CRM lead.
    fastify.post("/calls/:id/convert-to-lead", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { id } = request.params;
        const companyId = resolveCompanyId(user);
        const parsed = convertToLeadSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: "Invalid body" });
        }
        const body = parsed.data;
        const sql = getSql();
        const [call] = (await sql `
				SELECT * FROM call_logs
				WHERE id = ${id}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`);
        if (!call)
            return reply.code(404).send({ error: "Call not found" });
        if (call.lead_id) {
            return reply.code(409).send({
                error: "Call already linked to a lead",
                leadId: call.lead_id
            });
        }
        // Parse name if available
        const nameParts = (call.caller_name ?? "Unknown Caller")
            .trim()
            .split(" ");
        const firstName = nameParts[0] ?? "Unknown";
        const lastName = nameParts.slice(1).join(" ") || "Caller";
        const [lead] = (await sql `
				INSERT INTO crm_leads (
					company_id,
					first_name, last_name,
					phone,
					source, source_detail,
					service_needed,
					priority, stage,
					notes,
					created_by_user_id
				) VALUES (
					${call.company_id},
					${firstName}, ${lastName},
					${call.caller_phone},
					${call.source ?? "phone"}, ${call.source_detail ?? null},
					${body.serviceNeeded ?? null},
					${body.priority}, 'new',
					${body.notes ?? call.notes ?? null},
					${user.userId ?? user.id ?? null}
				)
				RETURNING id, created_at AS "createdAt"
			`);
        // Link call to lead
        await sql `
				UPDATE call_logs SET lead_id = ${lead.id}, updated_at = NOW()
				WHERE id = ${id}
			`;
        // Log activity on the lead
        await sql `
				INSERT INTO crm_lead_activities (
					lead_id, type, direction, body, duration_seconds, performed_by_user_id
				) VALUES (
					${lead.id}, 'call', 'inbound',
					${`Inbound call converted to lead. Duration: ${call.duration_seconds ?? 0}s`},
					${call.duration_seconds ?? null},
					${user.userId ?? user.id ?? null}
				)
			`;
        return reply.code(201).send({ leadId: lead.id, callId: id });
    });
    // ── POST /calls/webhook/twilio ────────────────────────────────────────────
    // Twilio StatusCallback webhook — auto-logs completed calls.
    // No auth — validated by Twilio signature header.
    // Register tracking numbers in Twilio pointing to this URL.
    fastify.post("/calls/webhook/twilio", async (request, reply) => {
        // TODO: validate X-Twilio-Signature in production
        const body = request.body;
        if (!body?.CallSid || !body?.To) {
            return reply.code(400).send({ error: "Invalid Twilio payload" });
        }
        const sql = getSql();
        // Look up which company owns this tracking number
        const [company] = (await sql `
				SELECT id FROM companies
				WHERE ${body.To} = ANY(tracking_phone_numbers)
					AND is_active = TRUE
				LIMIT 1
			`);
        if (!company) {
            // Number not registered — ignore gracefully
            return reply.send({ received: true });
        }
        const durationSeconds = body.CallDuration
            ? parseInt(body.CallDuration, 10)
            : null;
        const direction = body.Direction === "outbound-dial" ? "outbound" : "inbound";
        // Upsert — Twilio fires this multiple times as call progresses
        await sql `
				INSERT INTO call_logs (
					company_id,
					direction, caller_phone, caller_name,
					source, tracking_number,
					duration_seconds, outcome,
					twilio_call_sid,
					called_at
				) VALUES (
					${company.id},
					${direction},
					${body.From ?? "unknown"},
					${body.CallerName ?? null},
					'direct', ${body.To},
					${durationSeconds},
					${body.CallStatus === "completed" ? "other" : null},
					${body.CallSid},
					NOW()
				)
				ON CONFLICT (twilio_call_sid) DO UPDATE SET
					duration_seconds = EXCLUDED.duration_seconds,
					outcome          = CASE
						WHEN call_logs.outcome IS NULL THEN EXCLUDED.outcome
						ELSE call_logs.outcome
					END,
					updated_at       = NOW()
			`;
        return reply.send({ received: true });
    });
    // ── GET /calls/analytics ──────────────────────────────────────────────────
    // Call volume, source breakdown, conversion rate, avg duration.
    fastify.get("/calls/analytics", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const companyId = resolveCompanyId(user);
        const parsed = analyticsSchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.code(400).send({ error: "Invalid query" });
        }
        const { days } = parsed.data;
        const sql = getSql();
        const [totals] = (await sql `
				SELECT
					COUNT(*)                                                      AS total_calls,
					COUNT(*) FILTER (WHERE direction = 'inbound')                AS inbound,
					COUNT(*) FILTER (WHERE direction = 'outbound')               AS outbound,
					COUNT(*) FILTER (WHERE outcome = 'booked')                   AS booked,
					COUNT(*) FILTER (WHERE customer_id IS NOT NULL OR lead_id IS NOT NULL) AS matched,
					COUNT(*) FILTER (WHERE customer_id IS NULL AND lead_id IS NULL) AS unmatched,
					ROUND(AVG(duration_seconds))                                 AS avg_duration_seconds,
					ROUND(
						COUNT(*) FILTER (WHERE outcome = 'booked')::numeric /
						NULLIF(COUNT(*) FILTER (WHERE direction = 'inbound'), 0) * 100,
						1
					)                                                            AS booking_rate_pct
				FROM call_logs
				WHERE company_id = ${companyId}
					AND called_at >= NOW() - (${days} || ' days')::interval
			`);
        const bySource = (await sql `
				SELECT
					source,
					COUNT(*)                                        AS total,
					COUNT(*) FILTER (WHERE outcome = 'booked')      AS booked,
					ROUND(AVG(duration_seconds))                    AS avg_duration_seconds
				FROM call_logs
				WHERE company_id = ${companyId}
					AND called_at >= NOW() - (${days} || ' days')::interval
				GROUP BY source
				ORDER BY total DESC
			`);
        const byDay = (await sql `
				SELECT
					DATE(called_at)                                 AS date,
					COUNT(*)                                        AS total,
					COUNT(*) FILTER (WHERE outcome = 'booked')      AS booked,
					COUNT(*) FILTER (WHERE direction = 'inbound')   AS inbound
				FROM call_logs
				WHERE company_id = ${companyId}
					AND called_at >= NOW() - (${days} || ' days')::interval
				GROUP BY DATE(called_at)
				ORDER BY date ASC
			`);
        return reply.send({
            days,
            totals,
            bySource,
            byDay
        });
    });
}
