// services/routes/replacementRoutes.ts
// Equipment age-based replacement triggers
//
// Endpoints:
//   GET  /equipment/replacement-alerts        — list equipment past replacement threshold
//   GET  /equipment/replacement-alerts/summary — counts by urgency
//   POST /equipment/replacement-alerts/:equipmentId/dismiss — snooze an alert
//   POST /equipment/replacement-alerts/:equipmentId/trigger-job — create a replacement job
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ─── Config ───────────────────────────────────────────────────────────────────
// Age thresholds in years by equipment type
const REPLACEMENT_THRESHOLDS = {
    furnace: { warn: 15, critical: 20 },
    ac: { warn: 12, critical: 15 },
    heat_pump: { warn: 12, critical: 15 },
    air_handler: { warn: 15, critical: 20 },
    water_heater: { warn: 8, critical: 12 },
    boiler: { warn: 15, critical: 25 },
    mini_split: { warn: 12, critical: 15 },
    package_unit: { warn: 12, critical: 15 },
    thermostat: { warn: 10, critical: 15 },
    other: { warn: 15, critical: 20 }
};
const DEFAULT_THRESHOLD = { warn: 12, critical: 15 };
// ─── Schemas ──────────────────────────────────────────────────────────────────
const listAlertsSchema = z.object({
    companyId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    urgency: z.enum(["warning", "critical", "all"]).default("all"),
    equipmentType: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
const dismissSchema = z.object({
    snoozeDays: z.number().int().min(1).max(365).default(90),
    notes: z.string().max(500).optional()
});
const triggerJobSchema = z.object({
    scheduledTime: z.string().datetime().optional(),
    priority: z.enum(["low", "medium", "high", "emergency"]).default("medium"),
    notes: z.string().max(1000).optional(),
    assignedTechId: z.string().uuid().optional()
});
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getUser(request) {
    return request.user;
}
function resolveCompanyId(user, bodyCompanyId) {
    if (user.role === "dev")
        return bodyCompanyId ?? user.companyId ?? null;
    return user.companyId ?? null;
}
function getUrgency(ageYears, equipmentType) {
    const thresholds = REPLACEMENT_THRESHOLDS[equipmentType] ?? DEFAULT_THRESHOLD;
    if (ageYears >= thresholds.critical)
        return "critical";
    if (ageYears >= thresholds.warn)
        return "warning";
    return null;
}
// ─── Routes ───────────────────────────────────────────────────────────────────
export async function replacementRoutes(fastify) {
    fastify.register(async (r) => {
        r.addHook("onRequest", authenticate);
        // ──────────────────────────────────────────────────────────────────────
        // GET /equipment/replacement-alerts
        // Returns all equipment past warn/critical age thresholds
        // ──────────────────────────────────────────────────────────────────────
        r.get("/equipment/replacement-alerts", async (request, reply) => {
            const user = getUser(request);
            const companyId = resolveCompanyId(user);
            if (!companyId && user.role !== "dev") {
                return reply.code(403).send({ error: "Forbidden" });
            }
            const parsed = listAlertsSchema.safeParse(request.query);
            if (!parsed.success) {
                return reply.code(400).send({
                    error: "Invalid query",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const { customerId, urgency, equipmentType, limit, offset } = parsed.data;
            const effectiveCompanyId = user.role === "dev" ? (parsed.data.companyId ?? companyId) : companyId;
            const sql = getSql();
            // Pull all active equipment with age, optionally filtered
            const rows = (await sql `
				SELECT
					e.id,
					e.customer_id        AS "customerId",
					e.company_id         AS "companyId",
					e.equipment_type     AS "equipmentType",
					e.manufacturer,
					e.model_number       AS "modelNumber",
					e.serial_number      AS "serialNumber",
					e.install_date       AS "installDate",
					e.warranty_expiry    AS "warrantyExpiry",
					e.last_service_date  AS "lastServiceDate",
					e.condition,
					e.refrigerant_type   AS "refrigerantType",
					e.notes,
					EXTRACT(YEAR FROM AGE(NOW(), e.install_date))::int AS "ageYears",
					c.first_name || ' ' || c.last_name                  AS "customerName",
					c.address,
					c.city,
					c.state,
					c.phone,
					-- Check if snoozed
					ra.snoozed_until     AS "snoozedUntil",
					ra.snooze_notes      AS "snoozeNotes"
				FROM equipment e
				JOIN customers c ON c.id = e.customer_id
				LEFT JOIN equipment_replacement_snoozes ra
					ON ra.equipment_id = e.id AND ra.snoozed_until > NOW()
				WHERE e.is_active = TRUE
					AND e.install_date IS NOT NULL
					AND (${effectiveCompanyId}::uuid IS NULL OR e.company_id = ${effectiveCompanyId})
					AND (${customerId ?? null}::uuid IS NULL OR e.customer_id = ${customerId ?? null})
					AND (${equipmentType ?? null}::text IS NULL OR e.equipment_type = ${equipmentType ?? null})
				ORDER BY e.install_date ASC
			`);
            // Filter by urgency in application layer (thresholds are per-type)
            const alerts = rows
                .map((row) => {
                const age = row.ageYears ?? 0;
                const u = getUrgency(age, row.equipmentType);
                const thresholds = REPLACEMENT_THRESHOLDS[row.equipmentType] ?? DEFAULT_THRESHOLD;
                return {
                    ...row,
                    urgency: u,
                    isSnoozed: !!row.snoozedUntil,
                    thresholds,
                    yearsOverWarn: Math.max(0, age - thresholds.warn),
                    yearsToCritical: Math.max(0, thresholds.critical - age)
                };
            })
                .filter((row) => {
                if (!row.urgency)
                    return false; // below warn threshold
                if (row.isSnoozed)
                    return false; // snoozed
                if (urgency === "all")
                    return true;
                return row.urgency === urgency;
            });
            const paginated = alerts.slice(offset, offset + limit);
            return {
                total: alerts.length,
                limit,
                offset,
                alerts: paginated
            };
        });
        // ──────────────────────────────────────────────────────────────────────
        // GET /equipment/replacement-alerts/summary
        // ──────────────────────────────────────────────────────────────────────
        r.get("/equipment/replacement-alerts/summary", async (request, reply) => {
            const user = getUser(request);
            const companyId = resolveCompanyId(user);
            if (!companyId && user.role !== "dev") {
                return reply.code(403).send({ error: "Forbidden" });
            }
            const sql = getSql();
            const rows = (await sql `
				SELECT
					e.equipment_type AS "equipmentType",
					EXTRACT(YEAR FROM AGE(NOW(), e.install_date))::int AS "ageYears"
				FROM equipment e
				LEFT JOIN equipment_replacement_snoozes ra
					ON ra.equipment_id = e.id AND ra.snoozed_until > NOW()
				WHERE e.is_active = TRUE
					AND e.install_date IS NOT NULL
					AND e.company_id = ${companyId}
					AND ra.equipment_id IS NULL
			`);
            let warning = 0;
            let critical = 0;
            const byType = {};
            for (const row of rows) {
                const u = getUrgency(row.ageYears ?? 0, row.equipmentType);
                if (!u)
                    continue;
                if (u === "warning")
                    warning++;
                if (u === "critical")
                    critical++;
                if (!byType[row.equipmentType])
                    byType[row.equipmentType] = { warning: 0, critical: 0 };
                byType[row.equipmentType][u]++;
            }
            return {
                total: warning + critical,
                warning,
                critical,
                byType,
                thresholds: REPLACEMENT_THRESHOLDS
            };
        });
        // ──────────────────────────────────────────────────────────────────────
        // POST /equipment/replacement-alerts/:equipmentId/dismiss
        // Snooze an alert for N days
        // ──────────────────────────────────────────────────────────────────────
        r.post("/equipment/replacement-alerts/:equipmentId/dismiss", async (request, reply) => {
            const user = getUser(request);
            const companyId = resolveCompanyId(user);
            const { equipmentId } = request.params;
            const parsed = dismissSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(400).send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const { snoozeDays, notes } = parsed.data;
            const sql = getSql();
            // Verify equipment belongs to this company
            const [eq] = (await sql `
				SELECT id FROM equipment
				WHERE id = ${equipmentId}
					AND (${companyId}::uuid IS NULL OR company_id = ${companyId})
					AND is_active = TRUE
			`);
            if (!eq)
                return reply.code(404).send({ error: "Equipment not found" });
            const snoozedUntil = new Date(Date.now() + snoozeDays * 86400000);
            await sql `
				INSERT INTO equipment_replacement_snoozes
					(equipment_id, company_id, snoozed_until, snooze_notes)
				VALUES
					(${equipmentId}, ${companyId}, ${snoozedUntil.toISOString()}, ${notes ?? null})
				ON CONFLICT (equipment_id) DO UPDATE
					SET snoozed_until = EXCLUDED.snoozed_until,
						snooze_notes  = EXCLUDED.snooze_notes,
						updated_at    = NOW()
			`;
            return {
                equipmentId,
                snoozedUntil: snoozedUntil.toISOString(),
                snoozeDays
            };
        });
        // ──────────────────────────────────────────────────────────────────────
        // POST /equipment/replacement-alerts/:equipmentId/trigger-job
        // Create a replacement job from an alert
        // ──────────────────────────────────────────────────────────────────────
        r.post("/equipment/replacement-alerts/:equipmentId/trigger-job", async (request, reply) => {
            const user = getUser(request);
            const companyId = resolveCompanyId(user);
            const { equipmentId } = request.params;
            const parsed = triggerJobSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(400).send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const { scheduledTime, priority, notes, assignedTechId } = parsed.data;
            const sql = getSql();
            // Get equipment + customer info
            const [eq] = (await sql `
				SELECT
					e.id, e.equipment_type AS "equipmentType",
					e.manufacturer, e.model_number AS "modelNumber",
					e.customer_id AS "customerId",
					c.first_name || ' ' || c.last_name AS "customerName",
					c.address, c.city, c.state, c.zip, c.phone,
					c.company_id AS "companyId"
				FROM equipment e
				JOIN customers c ON c.id = e.customer_id
				WHERE e.id = ${equipmentId}
					AND (${companyId}::uuid IS NULL OR e.company_id = ${companyId})
					AND e.is_active = TRUE
			`);
            if (!eq)
                return reply.code(404).send({ error: "Equipment not found" });
            const jobNotes = [
                `Replacement job triggered for ${eq.equipmentType.replace("_", " ")} — ${eq.manufacturer ?? ""} ${eq.modelNumber ?? ""}`.trim(),
                notes
            ]
                .filter(Boolean)
                .join("\n");
            const fullAddress = [eq.address, eq.city, eq.state, eq.zip]
                .filter(Boolean)
                .join(", ");
            const [job] = (await sql `
				INSERT INTO jobs (
					company_id, customer_id, customer_name,
					address, phone, job_type, priority, status,
					assigned_tech_id, initial_notes, scheduled_time
				) VALUES (
					${eq.companyId}, ${eq.customerId}, ${eq.customerName},
					${fullAddress}, ${eq.phone ?? null},
					'installation', ${priority}, 'unassigned',
					${assignedTechId ?? null},
					${jobNotes},
					${scheduledTime ?? null}
				)
				RETURNING id, status, created_at AS "createdAt"
			`);
            return {
                jobId: job.id,
                status: job.status,
                createdAt: job.createdAt,
                equipmentId,
                customerName: eq.customerName
            };
        });
    });
}
