// services/routes/communicationLogRoutes.ts
// Unified communication log — SMS, email, calls, notes all in one place per customer
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, resolveUserId } from "../middleware/auth";
import { writeAuditLog } from "./auditRoutes";
// ============================================================
// Schemas
// ============================================================
const createLogSchema = z.object({
    customerId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    channel: z.enum([
        "sms",
        "email",
        "phone_call",
        "in_person",
        "portal",
        "note"
    ]),
    direction: z.enum(["inbound", "outbound", "internal"]).default("outbound"),
    subject: z.string().max(200).optional(),
    body: z.string().min(1).max(5000),
    durationSeconds: z.number().int().min(0).optional(), // for phone calls
    outcome: z
        .enum([
        "resolved",
        "follow_up",
        "no_answer",
        "voicemail",
        "escalated",
        "informational"
    ])
        .optional(),
    followUpAt: z.string().datetime().optional()
});
const updateLogSchema = z
    .object({
    subject: z.string().max(200).optional(),
    body: z.string().min(1).max(5000).optional(),
    outcome: z
        .enum([
        "resolved",
        "follow_up",
        "no_answer",
        "voicemail",
        "escalated",
        "informational"
    ])
        .optional(),
    followUpAt: z.string().datetime().nullable().optional()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field required"
});
const listLogsSchema = z.object({
    companyId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    channel: z
        .enum(["sms", "email", "phone_call", "in_person", "portal", "note"])
        .optional(),
    direction: z.enum(["inbound", "outbound", "internal"]).optional(),
    followUpPending: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
// ============================================================
// Route handlers
// ============================================================
export function createCommunicationLog(fastify) {
    fastify.post("/communication-logs", async (request, reply) => {
        const user = request.user;
        const companyId = user.companyId;
        if (!companyId)
            return reply.code(403).send({ error: "No company on token" });
        const parsed = createLogSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
        }
        const { customerId, jobId, channel, direction, subject, body, durationSeconds, outcome, followUpAt } = parsed.data;
        const actorId = resolveUserId(user);
        const sql = getSql();
        // Verify customer belongs to company
        const [customer] = (await sql `
			SELECT id FROM customers WHERE id = ${customerId} AND company_id = ${companyId}
		`);
        if (!customer)
            return reply.code(404).send({ error: "Customer not found" });
        const [log] = (await sql `
			INSERT INTO communication_logs (
				company_id, customer_id, job_id, actor_user_id,
				channel, direction, subject, body,
				duration_seconds, outcome, follow_up_at
			) VALUES (
				${companyId}, ${customerId}, ${jobId ?? null}, ${actorId ?? null},
				${channel}, ${direction}, ${subject ?? null}, ${body},
				${durationSeconds ?? null}, ${outcome ?? null}, ${followUpAt ?? null}
			)
			RETURNING
				id, channel, direction, subject, body, outcome,
				follow_up_at AS "followUpAt", created_at AS "createdAt"
		`);
        await writeAuditLog({
            companyId,
            actorUserId: actorId,
            actorRole: user.role,
            action: "communication_log.created",
            entityType: "communication_log",
            entityId: log.id,
            meta: { customerId, channel, direction }
        });
        return reply.code(201).send({ log });
    });
}
export function listCommunicationLogs(fastify) {
    fastify.get("/communication-logs", async (request, reply) => {
        const user = request.user;
        const isDev = user.role === "dev";
        const parsed = listLogsSchema.safeParse(request.query);
        if (!parsed.success) {
            return reply
                .code(400)
                .send({
                error: "Invalid query",
                details: z.treeifyError(parsed.error)
            });
        }
        const { customerId, jobId, channel, direction, followUpPending, limit, offset } = parsed.data;
        const effectiveCompanyId = isDev
            ? (parsed.data.companyId ?? null)
            : (user.companyId ?? null);
        const sql = getSql();
        const logs = await sql `
			SELECT
				cl.id,
				cl.company_id       AS "companyId",
				cl.customer_id      AS "customerId",
				cl.job_id           AS "jobId",
				cl.actor_user_id    AS "actorUserId",
				cl.channel,
				cl.direction,
				cl.subject,
				cl.body,
				cl.duration_seconds AS "durationSeconds",
				cl.outcome,
				cl.follow_up_at     AS "followUpAt",
				cl.created_at       AS "createdAt",
				c.first_name        AS "customerFirstName",
				c.last_name         AS "customerLastName",
				u.email             AS "actorEmail"
			FROM communication_logs cl
			LEFT JOIN customers c ON c.id = cl.customer_id
			LEFT JOIN users u ON u.id = cl.actor_user_id
			WHERE TRUE
			  AND (${effectiveCompanyId}::uuid IS NULL OR cl.company_id = ${effectiveCompanyId})
			  AND (${customerId ?? null}::uuid IS NULL OR cl.customer_id = ${customerId ?? null})
			  AND (${jobId ?? null}::uuid IS NULL OR cl.job_id = ${jobId ?? null})
			  AND (${channel ?? null}::text IS NULL OR cl.channel = ${channel ?? null})
			  AND (${direction ?? null}::text IS NULL OR cl.direction = ${direction ?? null})
			  AND (${followUpPending ?? null}::boolean IS NULL OR
				    (${followUpPending ?? null} = TRUE AND cl.follow_up_at IS NOT NULL AND cl.follow_up_at > NOW()) OR
				    (${followUpPending ?? null} = FALSE)
			  )
			ORDER BY cl.created_at DESC
			LIMIT ${limit} OFFSET ${offset}
		`;
        return { logs };
    });
}
export function getCommunicationLog(fastify) {
    fastify.get("/communication-logs/:logId", async (request, reply) => {
        const user = request.user;
        const isDev = user.role === "dev";
        const { logId } = request.params;
        const sql = getSql();
        const [log] = (await sql `
			SELECT
				cl.*, c.first_name AS "customerFirstName", c.last_name AS "customerLastName"
			FROM communication_logs cl
			LEFT JOIN customers c ON c.id = cl.customer_id
			WHERE cl.id = ${logId}
			  AND (${isDev} OR cl.company_id = ${user.companyId ?? ""})
		`);
        if (!log)
            return reply.code(404).send({ error: "Log not found" });
        return { log };
    });
}
export function updateCommunicationLog(fastify) {
    fastify.patch("/communication-logs/:logId", async (request, reply) => {
        const user = request.user;
        const { logId } = request.params;
        const parsed = updateLogSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
        }
        const d = parsed.data;
        const sql = getSql();
        const [log] = (await sql `
			UPDATE communication_logs SET
				subject      = COALESCE(${d.subject ?? null}, subject),
				body         = COALESCE(${d.body ?? null}, body),
				outcome      = COALESCE(${d.outcome ?? null}, outcome),
				follow_up_at = CASE
					WHEN ${d.followUpAt !== undefined} THEN ${d.followUpAt ?? null}
					ELSE follow_up_at
				END,
				updated_at   = NOW()
			WHERE id = ${logId}
			  AND (${user.role === "dev"} OR company_id = ${user.companyId ?? ""})
			RETURNING id, subject, body, outcome, follow_up_at AS "followUpAt", updated_at AS "updatedAt"
		`);
        if (!log)
            return reply.code(404).send({ error: "Log not found" });
        return { log };
    });
}
export async function communicationLogRoutes(fastify) {
    fastify.register(async (authed) => {
        authed.addHook("onRequest", authenticate);
        createCommunicationLog(authed);
        listCommunicationLogs(authed);
        getCommunicationLog(authed);
        updateCommunicationLog(authed);
    });
}
