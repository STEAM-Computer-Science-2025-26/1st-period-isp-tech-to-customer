// services/routes/etaRoutes.ts
// Customer-facing ETA endpoint — no auth required, uses a short-lived token
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const generateEtaTokenSchema = z.object({
    jobId: z.string().uuid(),
    expiresInMinutes: z.number().int().min(30).max(1440).default(120)
});
const updateEtaSchema = z.object({
    jobId: z.string().uuid(),
    etaMinutes: z.number().int().min(0).max(480), // 0–8 hrs
    techLatitude: z.number().min(-90).max(90).optional(),
    techLongitude: z.number().min(-180).max(180).optional(),
    note: z.string().max(200).optional()
});
// ============================================================
// Route handlers
// ============================================================
/**
 * Admin/dispatch generates a short-lived ETA link for the customer.
 * Returns a token that the customer uses to poll /eta/:token
 */
export function generateEtaToken(fastify) {
    fastify.post("/eta/token", async (request, reply) => {
        const user = request.user;
        const companyId = user.companyId;
        if (!companyId)
            return reply.code(403).send({ error: "No company on token" });
        const parsed = generateEtaTokenSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
        }
        const { jobId, expiresInMinutes } = parsed.data;
        const sql = getSql();
        // Verify job belongs to this company
        const [job] = (await sql `
			SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId}
		`);
        if (!job)
            return reply.code(404).send({ error: "Job not found" });
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
        // Upsert: one token per job at a time
        const [record] = (await sql `
			INSERT INTO job_eta_tokens (job_id, company_id, expires_at)
			VALUES (${jobId}, ${companyId}, ${expiresAt.toISOString()})
			ON CONFLICT (job_id) DO UPDATE
			SET expires_at = EXCLUDED.expires_at, updated_at = NOW()
			RETURNING token, expires_at AS "expiresAt"
		`);
        return {
            token: record.token,
            expiresAt: record.expiresAt,
            etaUrl: `/eta/${record.token}`
        };
    });
}
/**
 * Public endpoint — customer visits /eta/:token to see their tech's ETA.
 * No auth required. Token is short-lived and job-specific.
 */
export function getEtaByToken(fastify) {
    fastify.get("/eta/:token", async (request, reply) => {
        const { token } = request.params;
        const sql = getSql();
        const [record] = (await sql `
        SELECT
            t.job_id         AS "jobId",
            t.company_id     AS "companyId",
            t.expires_at     AS "expiresAt",
            j.status,
            j.scheduled_time AS "scheduledStart",
            j.eta_minutes    AS "etaMinutes",
            j.eta_updated_at AS "etaUpdatedAt",
            j.eta_note       AS "etaNote",
            e.name           AS "techName",
            e.phone          AS "techPhone"
        FROM job_eta_tokens t
        JOIN jobs j ON j.id = t.job_id
        LEFT JOIN employees e ON e.id = j.assigned_tech_id
        WHERE t.token = ${token}
        AND t.expires_at > NOW()
    `);
        if (!record) {
            return reply.code(404).send({ error: "ETA link expired or invalid" });
        }
        // Don't expose internal IDs or company info to the customer
        return {
            jobId: record.jobId,
            status: record.status,
            scheduledStart: record.scheduledStart,
            etaMinutes: record.etaMinutes,
            etaUpdatedAt: record.etaUpdatedAt,
            etaNote: record.etaNote,
            tech: record.techName
                ? { name: record.techName, phone: record.techPhone }
                : null
        };
    });
}
/**
 * Tech or dispatch updates the ETA for a job.
 * This is what powers the customer's real-time view.
 */
export function updateJobEta(fastify) {
    fastify.patch("/jobs/:jobId/eta", async (request, reply) => {
        const user = request.user;
        const companyId = user.companyId;
        if (!companyId)
            return reply.code(403).send({ error: "No company on token" });
        const { jobId } = request.params;
        const body = request.body ?? {};
        const parsed = updateEtaSchema.safeParse({ ...body, jobId });
        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
        }
        const { etaMinutes, techLatitude, techLongitude, note } = parsed.data;
        const sql = getSql();
        const [job] = (await sql `
			UPDATE jobs
			SET
				eta_minutes    = ${etaMinutes},
				eta_updated_at = NOW(),
				eta_note       = ${note ?? null},
				latitude       = COALESCE(${techLatitude ?? null}, latitude),
				longitude      = COALESCE(${techLongitude ?? null}, longitude),
				updated_at     = NOW()
			WHERE id = ${jobId} AND company_id = ${companyId}
			RETURNING id, eta_minutes AS "etaMinutes", eta_updated_at AS "etaUpdatedAt"
		`);
        if (!job)
            return reply.code(404).send({ error: "Job not found" });
        return { job };
    });
}
export async function etaRoutes(fastify) {
    // Public ETA lookup — no auth
    getEtaByToken(fastify);
    fastify.register(async (authed) => {
        authed.addHook("onRequest", authenticate);
        generateEtaToken(authed);
        updateJobEta(authed);
        // ← ADD THE NEW ROUTE RIGHT HERE, inside this block
        authed.post("/eta/update", async (request, reply) => {
            const user = request.user;
            const companyId = user.companyId;
            if (!companyId)
                return reply.code(403).send({ error: "No company on token" });
            const body = request.body;
            const { jobId, etaMinutes, note } = body;
            if (!jobId || etaMinutes === undefined)
                return reply.code(400).send({ error: "jobId and etaMinutes required" });
            const sql = getSql();
            const [job] = (await sql `
				UPDATE jobs
				SET
					eta_minutes    = ${etaMinutes},
					eta_updated_at = NOW(),
					eta_note       = ${note ?? null},
					updated_at     = NOW()
				WHERE id = ${jobId} AND company_id = ${companyId}
				RETURNING id, eta_minutes AS "etaMinutes", eta_updated_at AS "etaUpdatedAt"
			`);
            if (!job)
                return reply.code(404).send({ error: "Job not found" });
            return { etaMinutes: job.etaMinutes, updatedAt: job.etaUpdatedAt };
        });
    });
}
