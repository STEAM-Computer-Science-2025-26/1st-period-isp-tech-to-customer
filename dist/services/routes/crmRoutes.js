// services/routes/crmRoutes.ts
// Built-in CRM lead tracking.
//
// A "lead" is a prospective customer who hasn't converted yet.
// Pipeline stages: new → contacted → qualified → estimate_sent → won | lost
//
// When a lead is won:
//   - Optionally converts to a real customer record
//   - Optionally creates a job
//   - Lead is marked won with conversion metadata
//
// Endpoints:
//   POST   /leads                          — create lead
//   GET    /leads                          — list leads (filterable by stage, source, owner)
//   GET    /leads/:id                      — lead detail with activity timeline
//   PUT    /leads/:id                      — update lead
//   DELETE /leads/:id                      — delete lead
//   POST   /leads/:id/advance              — move to next stage
//   POST   /leads/:id/activity             — log an activity (call, email, note, etc.)
//   GET    /leads/:id/activity             — list activities for a lead
//   POST   /leads/:id/convert              — convert won lead to customer (+ optional job)
//   GET    /leads/pipeline                 — stage counts + value summary (kanban data)
//   GET    /leads/analytics                — conversion rates, source breakdown, avg time to close
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ─── Schemas ──────────────────────────────────────────────────────────────────
const STAGES = [
    "new",
    "contacted",
    "qualified",
    "estimate_sent",
    "won",
    "lost"
];
const SOURCES = [
    "website",
    "referral",
    "google_lsa",
    "google_ads",
    "yelp",
    "facebook",
    "phone",
    "walk_in",
    "other"
];
const createLeadSchema = z.object({
    // Contact info
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    companyName: z.string().max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(30),
    address: z.string().max(300).optional(),
    city: z.string().max(80).optional(),
    state: z.string().length(2).optional(),
    zip: z.string().min(5).max(10).optional(),
    // Lead details
    source: z.enum(SOURCES).default("other"),
    sourceDetail: z.string().max(200).optional(), // e.g. "Google search: AC repair"
    serviceNeeded: z.string().max(200).optional(),
    estimatedValue: z.number().min(0).optional(), // expected job value
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    assignedToUserId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    notes: z.string().max(2000).optional(),
    followUpAt: z.string().datetime().optional(),
    companyId: z.string().uuid().optional()
});
const updateLeadSchema = z
    .object({
    firstName: z.string().min(1).max(80).optional(),
    lastName: z.string().min(1).max(80).optional(),
    companyName: z.string().max(120).optional().nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().min(1).max(30).optional(),
    address: z.string().max(300).optional().nullable(),
    city: z.string().max(80).optional().nullable(),
    state: z.string().length(2).optional().nullable(),
    zip: z.string().min(5).max(10).optional().nullable(),
    source: z.enum(SOURCES).optional(),
    sourceDetail: z.string().max(200).optional().nullable(),
    serviceNeeded: z.string().max(200).optional().nullable(),
    estimatedValue: z.number().min(0).optional().nullable(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    stage: z.enum(STAGES).optional(),
    assignedToUserId: z.string().uuid().optional().nullable(),
    branchId: z.string().uuid().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    followUpAt: z.string().datetime().optional().nullable(),
    lostReason: z.string().max(500).optional().nullable()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field required"
});
const listLeadsSchema = z.object({
    companyId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    stage: z.enum(STAGES).optional(),
    source: z.enum(SOURCES).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    assignedToUserId: z.string().uuid().optional(),
    search: z.string().optional(),
    followUpOverdue: z.coerce.boolean().optional(),
    since: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
const advanceSchema = z.object({
    stage: z.enum(STAGES),
    lostReason: z.string().max(500).optional(),
    notes: z.string().max(500).optional()
});
const activitySchema = z.object({
    type: z.enum(["call", "email", "sms", "meeting", "note", "task"]),
    direction: z.enum(["inbound", "outbound", "internal"]).default("outbound"),
    subject: z.string().max(200).optional(),
    body: z.string().min(1).max(5000),
    outcome: z
        .enum([
        "resolved",
        "follow_up",
        "no_answer",
        "voicemail",
        "interested",
        "not_interested"
    ])
        .optional(),
    followUpAt: z.string().datetime().optional(),
    durationSeconds: z.number().int().min(0).optional()
});
const convertSchema = z.object({
    // Customer creation overrides (defaults to lead contact info)
    customerType: z.enum(["residential", "commercial"]).default("residential"),
    // Optionally create a job immediately on conversion
    createJob: z
        .object({
        title: z.string().min(1),
        jobType: z.string().min(1),
        description: z.string().optional(),
        scheduledTime: z.string().datetime().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        estimatedValue: z.number().min(0).optional()
    })
        .optional(),
    notes: z.string().max(500).optional()
});
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getUser(req) {
    return req.user;
}
function resolveCompanyId(user, bodyId) {
    if (user.role === "dev")
        return bodyId ?? user.companyId ?? null;
    return user.companyId ?? null;
}
const STAGE_ORDER = [
    "new",
    "contacted",
    "qualified",
    "estimate_sent",
    "won",
    "lost"
];
function nextStage(current) {
    const idx = STAGE_ORDER.indexOf(current);
    if (idx < 0 || idx >= STAGE_ORDER.indexOf("won") - 1)
        return null;
    return STAGE_ORDER[idx + 1];
}
// ─── Routes ──────────────────────────────────────────────────────────────────
export async function crmRoutes(fastify) {
    fastify.register(async (r) => {
        r.addHook("onRequest", authenticate);
        // ── POST /leads ───────────────────────────────────────────────────────
        r.post("/leads", async (request, reply) => {
            const user = getUser(request);
            const parsed = createLeadSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const body = parsed.data;
            const companyId = resolveCompanyId(user, body.companyId);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const [lead] = (await sql `
				INSERT INTO crm_leads (
					company_id, branch_id,
					first_name, last_name, company_name,
					email, phone,
					address, city, state, zip,
					source, source_detail, service_needed,
					estimated_value, priority, stage,
					assigned_to_user_id, notes, follow_up_at,
					created_by_user_id
				) VALUES (
					${companyId}, ${body.branchId ?? null},
					${body.firstName}, ${body.lastName}, ${body.companyName ?? null},
					${body.email ?? null}, ${body.phone},
					${body.address ?? null}, ${body.city ?? null}, ${body.state ?? null}, ${body.zip ?? null},
					${body.source}, ${body.sourceDetail ?? null}, ${body.serviceNeeded ?? null},
					${body.estimatedValue ?? null}, ${body.priority}, 'new',
					${body.assignedToUserId ?? null}, ${body.notes ?? null}, ${body.followUpAt ?? null},
					${user.userId ?? user.id ?? null}
				)
				RETURNING
					id,
					company_id          AS "companyId",
					first_name          AS "firstName",
					last_name           AS "lastName",
					company_name        AS "companyName",
					email, phone,
					source, source_detail AS "sourceDetail",
					service_needed      AS "serviceNeeded",
					estimated_value     AS "estimatedValue",
					priority, stage,
					assigned_to_user_id AS "assignedToUserId",
					follow_up_at        AS "followUpAt",
					created_at          AS "createdAt"
			`);
            // Log initial activity
            await sql `
				INSERT INTO crm_lead_activities (
					lead_id, type, direction, body, performed_by_user_id
				) VALUES (
					${lead.id}, 'note', 'internal', 'Lead created', ${user.userId ?? user.id ?? null}
				)
			`;
            return reply.code(201).send({ lead });
        });
        // ── GET /leads ────────────────────────────────────────────────────────
        r.get("/leads", async (request, reply) => {
            const user = getUser(request);
            const parsed = listLeadsSchema.safeParse(request.query);
            if (!parsed.success)
                return reply.code(400).send({ error: "Invalid query" });
            const { branchId, stage, source, priority, assignedToUserId, search, followUpOverdue, since, limit, offset } = parsed.data;
            const companyId = resolveCompanyId(user, parsed.data.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const leads = (await sql `
				SELECT
					l.id,
					l.first_name          AS "firstName",
					l.last_name           AS "lastName",
					l.company_name        AS "companyName",
					l.email,
					l.phone,
					l.city, l.state,
					l.source,
					l.service_needed      AS "serviceNeeded",
					l.estimated_value     AS "estimatedValue",
					l.priority,
					l.stage,
					l.assigned_to_user_id AS "assignedToUserId",
					u.email               AS "assignedToEmail",
					l.follow_up_at        AS "followUpAt",
					l.follow_up_at < NOW() AND l.stage NOT IN ('won','lost') AS "followUpOverdue",
					l.converted_customer_id AS "convertedCustomerId",
					l.won_at,
					l.lost_at,
					l.lost_reason         AS "lostReason",
					l.created_at          AS "createdAt",
					l.updated_at          AS "updatedAt",
					-- Last activity
					(
						SELECT MAX(created_at) FROM crm_lead_activities WHERE lead_id = l.id
					) AS "lastActivityAt"
				FROM crm_leads l
				LEFT JOIN users u ON u.id = l.assigned_to_user_id
				WHERE (${companyId}::uuid IS NULL OR l.company_id = ${companyId})
				  AND (${branchId ?? null}::uuid IS NULL OR l.branch_id = ${branchId ?? null})
				  AND (${stage ?? null}::text IS NULL OR l.stage = ${stage ?? null})
				  AND (${source ?? null}::text IS NULL OR l.source = ${source ?? null})
				  AND (${priority ?? null}::text IS NULL OR l.priority = ${priority ?? null})
				  AND (${assignedToUserId ?? null}::uuid IS NULL OR l.assigned_to_user_id = ${assignedToUserId ?? null})
				  AND (${search ?? null}::text IS NULL OR (
				        l.first_name ILIKE '%' || ${search ?? ""} || '%'
				        OR l.last_name ILIKE '%' || ${search ?? ""} || '%'
				        OR l.email ILIKE '%' || ${search ?? ""} || '%'
				        OR l.phone ILIKE '%' || ${search ?? ""} || '%'
				        OR l.company_name ILIKE '%' || ${search ?? ""} || '%'
				  ))
				  AND (${followUpOverdue ?? null}::boolean IS NULL OR
				       (${followUpOverdue ?? null} = true AND l.follow_up_at < NOW() AND l.stage NOT IN ('won','lost')))
				  AND (${since ?? null}::text IS NULL OR l.created_at >= ${since ?? null}::date)
				ORDER BY
					CASE l.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
					l.follow_up_at ASC NULLS LAST,
					l.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`);
            const [{ total }] = (await sql `
				SELECT COUNT(*)::int AS total FROM crm_leads
				WHERE (${companyId}::uuid IS NULL OR company_id = ${companyId})
				  AND (${stage ?? null}::text IS NULL OR stage = ${stage ?? null})
			`);
            return { leads, total, limit, offset };
        });
        // ── GET /leads/:id ────────────────────────────────────────────────────
        r.get("/leads/:id", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const [lead] = (await sql `
				SELECT
					l.*,
					l.first_name          AS "firstName",
					l.last_name           AS "lastName",
					l.company_name        AS "companyName",
					l.source_detail       AS "sourceDetail",
					l.service_needed      AS "serviceNeeded",
					l.estimated_value     AS "estimatedValue",
					l.assigned_to_user_id AS "assignedToUserId",
					u.email               AS "assignedToEmail",
					l.follow_up_at        AS "followUpAt",
					l.lost_reason         AS "lostReason",
					l.converted_customer_id AS "convertedCustomerId",
					l.converted_job_id    AS "convertedJobId",
					l.won_at              AS "wonAt",
					l.lost_at             AS "lostAt",
					l.created_by_user_id  AS "createdByUserId",
					l.created_at          AS "createdAt",
					l.updated_at          AS "updatedAt"
				FROM crm_leads l
				LEFT JOIN users u ON u.id = l.assigned_to_user_id
				WHERE l.id = ${id}
				  AND (${companyId}::uuid IS NULL OR l.company_id = ${companyId})
			`);
            if (!lead)
                return reply.code(404).send({ error: "Lead not found" });
            // Activity timeline
            const activities = (await sql `
				SELECT
					a.id, a.type, a.direction, a.subject, a.body,
					a.outcome, a.follow_up_at AS "followUpAt",
					a.duration_seconds AS "durationSeconds",
					a.performed_by_user_id AS "performedByUserId",
					u.email AS "performedByEmail",
					a.created_at AS "createdAt"
				FROM crm_lead_activities a
				LEFT JOIN users u ON u.id = a.performed_by_user_id
				WHERE a.lead_id = ${id}
				ORDER BY a.created_at DESC
				LIMIT 50
			`);
            return { lead, activities };
        });
        // ── PUT /leads/:id ────────────────────────────────────────────────────
        r.put("/leads/:id", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = updateLeadSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const sql = getSql();
            const [existing] = (await sql `
				SELECT id, stage FROM crm_leads WHERE id = ${id} AND company_id = ${companyId}
			`);
            if (!existing)
                return reply.code(404).send({ error: "Lead not found" });
            const b = parsed.data;
            const [updated] = (await sql `
				UPDATE crm_leads SET
					first_name          = COALESCE(${b.firstName ?? null}, first_name),
					last_name           = COALESCE(${b.lastName ?? null}, last_name),
					company_name        = CASE WHEN ${b.companyName !== undefined ? "true" : "false"} = 'true' THEN ${b.companyName ?? null} ELSE company_name END,
					email               = CASE WHEN ${b.email !== undefined ? "true" : "false"} = 'true' THEN ${b.email ?? null} ELSE email END,
					phone               = COALESCE(${b.phone ?? null}, phone),
					address             = CASE WHEN ${b.address !== undefined ? "true" : "false"} = 'true' THEN ${b.address ?? null} ELSE address END,
					city                = CASE WHEN ${b.city !== undefined ? "true" : "false"} = 'true' THEN ${b.city ?? null} ELSE city END,
					state               = CASE WHEN ${b.state !== undefined ? "true" : "false"} = 'true' THEN ${b.state ?? null} ELSE state END,
					zip                 = CASE WHEN ${b.zip !== undefined ? "true" : "false"} = 'true' THEN ${b.zip ?? null} ELSE zip END,
					source              = COALESCE(${b.source ?? null}, source),
					source_detail       = CASE WHEN ${b.sourceDetail !== undefined ? "true" : "false"} = 'true' THEN ${b.sourceDetail ?? null} ELSE source_detail END,
					service_needed      = CASE WHEN ${b.serviceNeeded !== undefined ? "true" : "false"} = 'true' THEN ${b.serviceNeeded ?? null} ELSE service_needed END,
					estimated_value     = CASE WHEN ${b.estimatedValue !== undefined ? "true" : "false"} = 'true' THEN ${b.estimatedValue ?? null} ELSE estimated_value END,
					priority            = COALESCE(${b.priority ?? null}, priority),
					stage               = COALESCE(${b.stage ?? null}, stage),
					assigned_to_user_id = CASE WHEN ${b.assignedToUserId !== undefined ? "true" : "false"} = 'true' THEN ${b.assignedToUserId ?? null} ELSE assigned_to_user_id END,
					notes               = CASE WHEN ${b.notes !== undefined ? "true" : "false"} = 'true' THEN ${b.notes ?? null} ELSE notes END,
					follow_up_at        = CASE WHEN ${b.followUpAt !== undefined ? "true" : "false"} = 'true' THEN ${b.followUpAt ?? null}::timestamptz ELSE follow_up_at END,
					lost_reason         = CASE WHEN ${b.lostReason !== undefined ? "true" : "false"} = 'true' THEN ${b.lostReason ?? null} ELSE lost_reason END,
					won_at              = CASE WHEN ${b.stage} = 'won' THEN NOW() ELSE won_at END,
					lost_at             = CASE WHEN ${b.stage} = 'lost' THEN NOW() ELSE lost_at END,
					updated_at          = NOW()
				WHERE id = ${id}
				RETURNING id, stage, priority, updated_at AS "updatedAt"
			`);
            return { lead: updated };
        });
        // ── DELETE /leads/:id ─────────────────────────────────────────────────
        r.delete("/leads/:id", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const [deleted] = (await sql `
				DELETE FROM crm_leads WHERE id = ${id} AND company_id = ${companyId} RETURNING id
			`);
            if (!deleted)
                return reply.code(404).send({ error: "Lead not found" });
            return { deleted: true };
        });
        // ── POST /leads/:id/advance ───────────────────────────────────────────
        // Move lead to a specific stage (validates direction).
        r.post("/leads/:id/advance", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = advanceSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const { stage, lostReason, notes } = parsed.data;
            const sql = getSql();
            const [lead] = (await sql `
				SELECT id, stage FROM crm_leads WHERE id = ${id} AND company_id = ${companyId}
			`);
            if (!lead)
                return reply.code(404).send({ error: "Lead not found" });
            if (lead.stage === "won" || lead.stage === "lost") {
                return reply.code(400).send({ error: `Lead is already ${lead.stage}` });
            }
            const currentIdx = STAGE_ORDER.indexOf(lead.stage);
            const targetIdx = STAGE_ORDER.indexOf(stage);
            if (targetIdx <= currentIdx && stage !== "lost") {
                return reply
                    .code(400)
                    .send({
                    error: `Cannot move from '${lead.stage}' back to '${stage}'`
                });
            }
            const [updated] = (await sql `
				UPDATE crm_leads SET
					stage       = ${stage},
					lost_reason = CASE WHEN ${stage} = 'lost' THEN ${lostReason ?? null} ELSE lost_reason END,
					won_at      = CASE WHEN ${stage} = 'won'  THEN NOW() ELSE won_at END,
					lost_at     = CASE WHEN ${stage} = 'lost' THEN NOW() ELSE lost_at END,
					updated_at  = NOW()
				WHERE id = ${id}
				RETURNING id, stage, won_at AS "wonAt", lost_at AS "lostAt"
			`);
            // Log stage change as activity
            await sql `
				INSERT INTO crm_lead_activities (lead_id, type, direction, body, performed_by_user_id)
				VALUES (
					${id}, 'note', 'internal',
					${"Stage changed: " + lead.stage + " → " + stage + (notes ? ". " + notes : "") + (lostReason ? ". Reason: " + lostReason : "")},
					${user.userId ?? user.id ?? null}
				)
			`;
            return { lead: updated };
        });
        // ── POST /leads/:id/activity ──────────────────────────────────────────
        r.post("/leads/:id/activity", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = activitySchema.safeParse(request.body);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const body = parsed.data;
            const sql = getSql();
            const [lead] = (await sql `
				SELECT id FROM crm_leads WHERE id = ${id} AND company_id = ${companyId}
			`);
            if (!lead)
                return reply.code(404).send({ error: "Lead not found" });
            const [activity] = (await sql `
				INSERT INTO crm_lead_activities (
					lead_id, type, direction, subject, body,
					outcome, follow_up_at, duration_seconds, performed_by_user_id
				) VALUES (
					${id}, ${body.type}, ${body.direction}, ${body.subject ?? null}, ${body.body},
					${body.outcome ?? null}, ${body.followUpAt ?? null}, ${body.durationSeconds ?? null},
					${user.userId ?? user.id ?? null}
				)
				RETURNING
					id, type, direction, subject, body, outcome,
					follow_up_at AS "followUpAt",
					duration_seconds AS "durationSeconds",
					created_at AS "createdAt"
			`);
            // If follow-up set, update lead's follow_up_at
            if (body.followUpAt) {
                await sql `
					UPDATE crm_leads SET follow_up_at = ${body.followUpAt}, updated_at = NOW() WHERE id = ${id}
				`;
            }
            return reply.code(201).send({ activity });
        });
        // ── GET /leads/:id/activity ───────────────────────────────────────────
        r.get("/leads/:id/activity", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const activities = (await sql `
				SELECT
					a.id, a.type, a.direction, a.subject, a.body,
					a.outcome, a.follow_up_at AS "followUpAt",
					a.duration_seconds AS "durationSeconds",
					a.performed_by_user_id AS "performedByUserId",
					u.email AS "performedByEmail",
					a.created_at AS "createdAt"
				FROM crm_lead_activities a
				LEFT JOIN users u ON u.id = a.performed_by_user_id
				WHERE a.lead_id = ${id}
				ORDER BY a.created_at DESC
			`);
            return { activities };
        });
        // ── POST /leads/:id/convert ───────────────────────────────────────────
        // Convert a won lead into a real customer record + optional job.
        r.post("/leads/:id/convert", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = convertSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const body = parsed.data;
            const sql = getSql();
            const [lead] = (await sql `
				SELECT * FROM crm_leads WHERE id = ${id} AND company_id = ${companyId}
			`);
            if (!lead)
                return reply.code(404).send({ error: "Lead not found" });
            if (lead.stage !== "won")
                return reply
                    .code(400)
                    .send({ error: "Only won leads can be converted" });
            if (lead.converted_customer_id) {
                return reply
                    .code(409)
                    .send({
                    error: "Lead already converted",
                    customerId: lead.converted_customer_id
                });
            }
            // Create customer
            const [customer] = (await sql `
				INSERT INTO customers (
					company_id, branch_id,
					first_name, last_name, company_name,
					customer_type, email, phone,
					address, city, state, zip,
					notes, created_by_user_id, geocoding_status
				) VALUES (
					${companyId}, ${lead.branch_id},
					${lead.first_name}, ${lead.last_name}, ${lead.company_name},
					${body.customerType}, ${lead.email}, ${lead.phone},
					${lead.address}, ${lead.city}, ${lead.state}, ${lead.zip},
					${body.notes ?? lead.notes ?? null}, ${user.userId ?? user.id ?? null}, 'pending'
				)
				RETURNING id
			`);
            let jobId = null;
            // Optionally create a job
            if (body.createJob) {
                const j = body.createJob;
                const [job] = (await sql `
					INSERT INTO jobs (
						company_id, branch_id, customer_id,
						title, job_type, description,
						address, city, state, zip,
						status, priority,
						scheduled_time,
						source
					) VALUES (
						${companyId}, ${lead.branch_id}, ${customer.id},
						${j.title}, ${j.jobType}, ${j.description ?? null},
						${lead.address}, ${lead.city}, ${lead.state}, ${lead.zip},
						'unassigned', ${j.priority},
						${j.scheduledTime ?? null},
						'crm'
					)
					RETURNING id
				`);
                jobId = job.id;
            }
            // Mark lead as converted
            await sql `
				UPDATE crm_leads SET
					converted_customer_id = ${customer.id},
					converted_job_id      = ${jobId},
					updated_at            = NOW()
				WHERE id = ${id}
			`;
            await sql `
				INSERT INTO crm_lead_activities (lead_id, type, direction, body, performed_by_user_id)
				VALUES (
					${id}, 'note', 'internal',
					${"Lead converted to customer" + (jobId ? " and job created" : "")},
					${user.userId ?? user.id ?? null}
				)
			`;
            return {
                success: true,
                customerId: customer.id,
                jobId
            };
        });
        // ── GET /leads/pipeline ───────────────────────────────────────────────
        // Kanban-ready stage counts + value summary.
        r.get("/leads/pipeline", async (request, reply) => {
            const user = getUser(request);
            const companyId = resolveCompanyId(user, request.query.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const stages = (await sql `
				SELECT
					stage,
					COUNT(*)::int                                      AS "count",
					COALESCE(SUM(estimated_value), 0)                  AS "totalValue",
					COUNT(*) FILTER (WHERE priority IN ('high','urgent'))::int AS "hotCount",
					COUNT(*) FILTER (WHERE follow_up_at < NOW())::int  AS "overdueCount"
				FROM crm_leads
				WHERE company_id = ${companyId}
				  AND stage NOT IN ('won','lost')
				GROUP BY stage
			`);
            // Fill missing stages with zeros
            const stageMap = Object.fromEntries(stages.map((s) => [s.stage, s]));
            const pipeline = ["new", "contacted", "qualified", "estimate_sent"].map((s) => ({
                stage: s,
                count: stageMap[s]?.count ?? 0,
                totalValue: Number(stageMap[s]?.totalValue ?? 0),
                hotCount: stageMap[s]?.hotCount ?? 0,
                overdueCount: stageMap[s]?.overdueCount ?? 0
            }));
            const [totals] = (await sql `
				SELECT
					COUNT(*) FILTER (WHERE stage NOT IN ('won','lost'))::int AS "activeLeads",
					COUNT(*) FILTER (WHERE stage = 'won')::int               AS "wonTotal",
					COUNT(*) FILTER (WHERE stage = 'lost')::int              AS "lostTotal",
					COALESCE(SUM(estimated_value) FILTER (WHERE stage NOT IN ('won','lost')), 0) AS "pipelineValue",
					COALESCE(SUM(estimated_value) FILTER (WHERE stage = 'won'), 0)               AS "wonValue"
				FROM crm_leads
				WHERE company_id = ${companyId}
			`);
            return { pipeline, totals };
        });
        // ── GET /leads/analytics ──────────────────────────────────────────────
        // Conversion rates, source breakdown, avg time to close.
        r.get("/leads/analytics", async (request, reply) => {
            const user = getUser(request);
            const companyId = resolveCompanyId(user, request.query.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const since = request.query.since ?? null;
            const sql = getSql();
            // Source breakdown
            const bySource = (await sql `
				SELECT
					source,
					COUNT(*)::int                                   AS "total",
					COUNT(*) FILTER (WHERE stage = 'won')::int     AS "won",
					COUNT(*) FILTER (WHERE stage = 'lost')::int    AS "lost",
					ROUND(
						COUNT(*) FILTER (WHERE stage = 'won')::numeric /
						NULLIF(COUNT(*) FILTER (WHERE stage IN ('won','lost')), 0) * 100, 1
					)                                               AS "conversionRatePct",
					COALESCE(SUM(estimated_value) FILTER (WHERE stage = 'won'), 0) AS "wonValue"
				FROM crm_leads
				WHERE company_id = ${companyId}
				  AND (${since}::text IS NULL OR created_at >= ${since}::date)
				GROUP BY source
				ORDER BY "total" DESC
			`);
            // Avg days to close (won leads only)
            const [timeToClose] = (await sql `
				SELECT
					ROUND(AVG(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400)::numeric, 1) AS "avgDaysToClose",
					MIN(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400)::int               AS "minDaysToClose",
					MAX(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400)::int               AS "maxDaysToClose"
				FROM crm_leads
				WHERE company_id = ${companyId}
				  AND stage = 'won'
				  AND won_at IS NOT NULL
				  AND (${since}::text IS NULL OR created_at >= ${since}::date)
			`);
            // Overall funnel
            const [funnel] = (await sql `
				SELECT
					COUNT(*)::int                                               AS "totalLeads",
					COUNT(*) FILTER (WHERE stage != 'new')::int                AS "contacted",
					COUNT(*) FILTER (WHERE stage IN ('qualified','estimate_sent','won'))::int AS "qualified",
					COUNT(*) FILTER (WHERE stage IN ('estimate_sent','won'))::int AS "estimateSent",
					COUNT(*) FILTER (WHERE stage = 'won')::int                 AS "won",
					COUNT(*) FILTER (WHERE stage = 'lost')::int                AS "lost",
					ROUND(
						COUNT(*) FILTER (WHERE stage = 'won')::numeric /
						NULLIF(COUNT(*), 0) * 100, 1
					)                                                          AS "overallConversionPct"
				FROM crm_leads
				WHERE company_id = ${companyId}
				  AND (${since}::text IS NULL OR created_at >= ${since}::date)
			`);
            // Lost reasons breakdown
            const lostReasons = (await sql `
				SELECT
					COALESCE(lost_reason, 'No reason given') AS reason,
					COUNT(*)::int AS count
				FROM crm_leads
				WHERE company_id = ${companyId}
				  AND stage = 'lost'
				  AND (${since}::text IS NULL OR created_at >= ${since}::date)
				GROUP BY lost_reason
				ORDER BY count DESC
				LIMIT 10
			`);
            return { funnel, bySource, timeToClose, lostReasons };
        });
    });
}
