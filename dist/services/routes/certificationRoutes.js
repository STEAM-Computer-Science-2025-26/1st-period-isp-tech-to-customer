// services/routes/certificationRoutes.ts
// Tech certifications — EPA 608, NATE, brand certs.
// Tracks expiry and fires alerts before they lapse.
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const createCertSchema = z.object({
    techId: z.string().uuid("Invalid tech ID"),
    certType: z.string().min(1, "Cert type is required"), // EPA_608, NATE, Carrier, etc.
    certNumber: z.string().optional(),
    issuedDate: z.string().optional(),
    expiryDate: z.string().min(1, "Expiry date is required"),
    issuedBy: z.string().optional(),
    companyId: z.string().uuid().optional() // dev only
});
const updateCertSchema = z
    .object({
    certType: z.string().min(1).optional(),
    certNumber: z.string().optional(),
    issuedDate: z.string().optional(),
    expiryDate: z.string().optional(),
    issuedBy: z.string().optional(),
    isActive: z.boolean().optional(),
    alertSent: z.boolean().optional()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided"
});
// ============================================================
// Helpers
// ============================================================
function getUser(request) {
    return request.user;
}
function isDev(user) {
    return user.role === "dev";
}
function resolveCompanyId(user, bodyCompanyId) {
    if (isDev(user))
        return bodyCompanyId ?? user.companyId ?? null;
    return user.companyId ?? null;
}
function buildSetClause(fields, startIdx = 1) {
    const parts = [];
    const values = [];
    let idx = startIdx;
    for (const [col, val] of fields) {
        if (val !== undefined) {
            parts.push(`${col} = $${idx++}`);
            values.push(val ?? null);
        }
    }
    return { clause: parts.join(", "), values, nextIdx: idx };
}
// ============================================================
// Routes
// ============================================================
export async function certificationRoutes(fastify) {
    // ----------------------------------------------------------
    // POST /certifications
    // Adds a certification to a technician.
    // expiryDate is required — this is the whole point.
    // EPA 608 is a legal requirement, NATE affects insurance rates.
    // ----------------------------------------------------------
    fastify.post("/certifications", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const parsed = createCertSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const companyId = resolveCompanyId(user, body.companyId);
        if (!companyId)
            return reply.code(403).send({ error: "Forbidden - Missing company" });
        const sql = getSql();
        // Verify tech belongs to company
        const tech = await sql `
			SELECT id FROM employees
			WHERE id = ${body.techId} AND company_id = ${companyId}
		`;
        if (!tech[0] && !isDev(user)) {
            return reply.code(404).send({ error: "Technician not found" });
        }
        const result = (await sql `
			INSERT INTO tech_certifications (
				tech_id, company_id, cert_type, cert_number,
				issued_date, expiry_date, issued_by
			) VALUES (
				${body.techId},
				${companyId},
				${body.certType},
				${body.certNumber ?? null},
				${body.issuedDate ?? null},
				${body.expiryDate},
				${body.issuedBy ?? null}
			)
			RETURNING id
		`);
        return reply.code(201).send({ certificationId: result[0].id });
    });
    // ----------------------------------------------------------
    // GET /certifications/tech/:techId
    // All certifications for a technician.
    // Includes days until expiry so UI can color-code urgency.
    // ----------------------------------------------------------
    fastify.get("/certifications/tech/:techId", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const { techId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const certs = isDev(user)
            ? await sql `
				SELECT
					id,
					cert_type   AS "certType",
					cert_number AS "certNumber",
					issued_date AS "issuedDate",
					expiry_date AS "expiryDate",
					issued_by   AS "issuedBy",
					is_active   AS "isActive",
					alert_sent  AS "alertSent",
					-- Days until expiry — negative means already expired
					(expiry_date - CURRENT_DATE)::int AS "daysUntilExpiry",
					created_at  AS "createdAt"
				FROM tech_certifications
				WHERE tech_id = ${techId} AND is_active = true
				ORDER BY expiry_date ASC
			`
            : await sql `
				SELECT
					id,
					cert_type   AS "certType",
					cert_number AS "certNumber",
					issued_date AS "issuedDate",
					expiry_date AS "expiryDate",
					issued_by   AS "issuedBy",
					is_active   AS "isActive",
					alert_sent  AS "alertSent",
					(expiry_date - CURRENT_DATE)::int AS "daysUntilExpiry",
					created_at  AS "createdAt"
				FROM tech_certifications
				WHERE tech_id = ${techId}
				  AND company_id = ${companyId}
				  AND is_active = true
				ORDER BY expiry_date ASC
			`;
        return reply.send({ certifications: certs });
    });
    // ----------------------------------------------------------
    // GET /certifications/expiring
    // All certs expiring within N days across the company.
    // Default: 60 days. This is what powers the alert dashboard.
    // Dispatcher sees this before scheduling jobs.
    // ----------------------------------------------------------
    fastify.get("/certifications/expiring", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const { days = "60" } = request.query;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        if (!companyId && !isDev(user)) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const daysN = Math.min(parseInt(days, 10) || 60, 365);
        const expiring = isDev(user) && !companyId
            ? await sql `
				SELECT
					tc.id,
					tc.cert_type    AS "certType",
					tc.cert_number  AS "certNumber",
					tc.expiry_date  AS "expiryDate",
					tc.issued_by    AS "issuedBy",
					tc.alert_sent   AS "alertSent",
					(tc.expiry_date - CURRENT_DATE)::int AS "daysUntilExpiry",
					e.id            AS "techId",
					e.name          AS "techName",
					e.email         AS "techEmail"
				FROM tech_certifications tc
				JOIN employees e ON e.id = tc.tech_id
				WHERE tc.is_active = true
				  AND tc.expiry_date <= CURRENT_DATE + ${daysN}::int
				ORDER BY tc.expiry_date ASC
			`
            : await sql `
				SELECT
					tc.id,
					tc.cert_type    AS "certType",
					tc.cert_number  AS "certNumber",
					tc.expiry_date  AS "expiryDate",
					tc.issued_by    AS "issuedBy",
					tc.alert_sent   AS "alertSent",
					(tc.expiry_date - CURRENT_DATE)::int AS "daysUntilExpiry",
					e.id            AS "techId",
					e.name          AS "techName",
					e.email         AS "techEmail"
				FROM tech_certifications tc
				JOIN employees e ON e.id = tc.tech_id
				WHERE tc.company_id = ${companyId}
				  AND tc.is_active = true
				  AND tc.expiry_date <= CURRENT_DATE + ${daysN}::int
				ORDER BY tc.expiry_date ASC
			`;
        return reply.send({
            certifications: expiring,
            windowDays: daysN,
            count: expiring.length
        });
    });
    // ----------------------------------------------------------
    // PATCH /certifications/:certId
    // Updates a certification — renewal, number correction, etc.
    // alertSent can be reset to false when cert is renewed.
    // ----------------------------------------------------------
    fastify.patch("/certifications/:certId", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const { certId } = request.params;
        const parsed = updateCertSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const { clause, values, nextIdx } = buildSetClause([
            ["cert_type", body.certType],
            ["cert_number", body.certNumber],
            ["issued_date", body.issuedDate],
            ["expiry_date", body.expiryDate],
            ["issued_by", body.issuedBy],
            ["is_active", body.isActive],
            ["alert_sent", body.alertSent]
        ]);
        const fullClause = [clause, "updated_at = NOW()"].join(", ");
        let idx = nextIdx;
        const whereValues = [...values, certId];
        let where = `WHERE id = $${idx++}`;
        if (!isDev(user)) {
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            whereValues.push(companyId);
            where += ` AND company_id = $${idx++}`;
        }
        const result = (await sql(`UPDATE tech_certifications SET ${fullClause} ${where} RETURNING id`, whereValues));
        if (!result[0])
            return reply.code(404).send({ error: "Certification not found" });
        return reply.send({
            message: "Certification updated",
            certId: result[0].id
        });
    });
    // ----------------------------------------------------------
    // DELETE /certifications/:certId
    // Soft delete. Cert history is permanent.
    // ----------------------------------------------------------
    fastify.delete("/certifications/:certId", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const { certId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        if (!isDev(user) && !companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const result = isDev(user)
            ? (await sql `
				UPDATE tech_certifications SET is_active = false, updated_at = NOW()
				WHERE id = ${certId}
				RETURNING id
			`)
            : (await sql `
				UPDATE tech_certifications SET is_active = false, updated_at = NOW()
				WHERE id = ${certId} AND company_id = ${companyId}
				RETURNING id
			`);
        if (!result[0])
            return reply.code(404).send({ error: "Certification not found" });
        return reply.send({ message: "Certification deactivated" });
    });
    // ----------------------------------------------------------
    // POST /certifications/check-alerts
    // Internal endpoint — called by a cron job daily.
    // Marks certs as alert_sent and returns the list so the
    // cron can fire actual notifications (email/SMS).
    // Does not send notifications itself — that's the cron's job.
    // ----------------------------------------------------------
    fastify.post("/certifications/check-alerts", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        // Only dev or admin can trigger this
        if (!isDev(user) && user.role !== "admin") {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const sql = getSql();
        // Find all certs expiring within 60 days that haven't been alerted yet
        const toAlert = await sql `
			SELECT
				tc.id,
				tc.tech_id      AS "techId",
				tc.company_id   AS "companyId",
				tc.cert_type    AS "certType",
				tc.expiry_date  AS "expiryDate",
				(tc.expiry_date - CURRENT_DATE)::int AS "daysUntilExpiry",
				e.name          AS "techName",
				e.email         AS "techEmail"
			FROM tech_certifications tc
			JOIN employees e ON e.id = tc.tech_id
			WHERE tc.is_active = true
			  AND tc.alert_sent = false
			  AND tc.expiry_date <= CURRENT_DATE + 60
			ORDER BY tc.expiry_date ASC
		`;
        if (toAlert.length === 0) {
            return reply.send({ alerted: 0, certifications: [] });
        }
        // Mark them all as alerted
        const alertIds = toAlert.map((c) => c.id);
        await sql `
			UPDATE tech_certifications
			SET alert_sent = true, updated_at = NOW()
			WHERE id = ANY(${alertIds}::uuid[])
		`;
        return reply.send({
            alerted: alertIds.length,
            certifications: toAlert
        });
    });
}
