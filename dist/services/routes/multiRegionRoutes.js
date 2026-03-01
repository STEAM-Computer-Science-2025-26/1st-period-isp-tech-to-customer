// services/routes/multiRegionRoutes.ts
// Multi-region branch management.
//
// What this adds ON TOP of existing branchRoutes:
//   - Region grouping (a "region" is a named group of branches, e.g. "Texas South")
//   - Region-level analytics rollup (jobs, revenue, techs across branches)
//   - Branch transfer (move a job or employee from one branch to another)
//   - Region capacity overview (who's available where)
//
// Endpoints:
//   POST   /regions                          — create a region
//   GET    /regions                          — list regions
//   PUT    /regions/:id                      — update region
//   DELETE /regions/:id                      — delete region (must have no branches)
//   POST   /regions/:id/branches             — assign branch to region
//   DELETE /regions/:id/branches/:branchId   — remove branch from region
//   GET    /regions/:id/analytics            — rollup analytics for a region
//   GET    /regions/capacity                 — live capacity across all regions
//   POST   /jobs/:jobId/transfer             — transfer job to a different branch
//   POST   /employees/:employeeId/transfer   — transfer employee to a different branch
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ─── Schemas ──────────────────────────────────────────────────────────────────
const createRegionSchema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    timezone: z.string().max(64).optional().default("America/Chicago"),
    // Geographic bounding hints (optional, for display)
    states: z.array(z.string().length(2)).optional().default([]),
    companyId: z.string().uuid().optional() // dev only
});
const updateRegionSchema = z
    .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional().nullable(),
    timezone: z.string().max(64).optional(),
    states: z.array(z.string().length(2)).optional(),
    isActive: z.boolean().optional()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field required"
});
const listRegionsSchema = z.object({
    companyId: z.string().uuid().optional(),
    isActive: z.coerce.boolean().optional()
});
const regionAnalyticsSchema = z.object({
    since: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
});
const capacitySchema = z.object({
    companyId: z.string().uuid().optional(),
    regionId: z.string().uuid().optional()
});
const transferJobSchema = z.object({
    toBranchId: z.string().uuid(),
    reason: z.string().max(500).optional()
});
const transferEmployeeSchema = z.object({
    toBranchId: z.string().uuid(),
    reason: z.string().max(500).optional(),
    effectiveDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
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
function requireAdmin(user, reply) {
    if (user.role !== "admin" && user.role !== "dev") {
        reply.code(403).send({ error: "Admin access required" });
        return false;
    }
    return true;
}
// ─── Routes ──────────────────────────────────────────────────────────────────
export async function multiRegionRoutes(fastify) {
    fastify.register(async (r) => {
        r.addHook("onRequest", authenticate);
        // ── POST /regions ─────────────────────────────────────────────────────
        r.post("/regions", async (request, reply) => {
            const user = getUser(request);
            if (!requireAdmin(user, reply))
                return;
            const parsed = createRegionSchema.safeParse(request.body);
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
            // Name must be unique within company
            const [existing] = (await sql `
				SELECT id FROM company_regions WHERE company_id = ${companyId} AND LOWER(name) = LOWER(${body.name})
			`);
            if (existing)
                return reply
                    .code(409)
                    .send({ error: "A region with that name already exists" });
            const [region] = (await sql `
				INSERT INTO company_regions (
					company_id, name, description, timezone, states, created_by_user_id
				) VALUES (
					${companyId},
					${body.name},
					${body.description ?? null},
					${body.timezone},
					${body.states},
					${user.userId ?? user.id ?? null}
				)
				RETURNING
					id,
					company_id    AS "companyId",
					name,
					description,
					timezone,
					states,
					is_active     AS "isActive",
					created_at    AS "createdAt"
			`);
            return reply.code(201).send({ region });
        });
        // ── GET /regions ──────────────────────────────────────────────────────
        r.get("/regions", async (request, reply) => {
            const user = getUser(request);
            const parsed = listRegionsSchema.safeParse(request.query);
            if (!parsed.success)
                return reply.code(400).send({ error: "Invalid query" });
            const companyId = resolveCompanyId(user, parsed.data.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const { isActive } = parsed.data;
            const sql = getSql();
            const regions = (await sql `
				SELECT
					r.id,
					r.company_id      AS "companyId",
					r.name,
					r.description,
					r.timezone,
					r.states,
					r.is_active       AS "isActive",
					r.created_at      AS "createdAt",
					r.updated_at      AS "updatedAt",
					-- Attached branches
					COALESCE(
						JSON_AGG(
							JSON_BUILD_OBJECT(
								'id', b.id,
								'name', b.name,
								'city', b.city,
								'state', b.state
							) ORDER BY b.name
						) FILTER (WHERE b.id IS NOT NULL),
						'[]'
					) AS branches
				FROM company_regions r
				LEFT JOIN branches b ON b.region_id = r.id AND b.is_active = true
				WHERE (${companyId}::uuid IS NULL OR r.company_id = ${companyId})
				  AND (${isActive ?? null}::boolean IS NULL OR r.is_active = ${isActive ?? null})
				GROUP BY r.id
				ORDER BY r.name
			`);
            return { regions };
        });
        // ── PUT /regions/:id ──────────────────────────────────────────────────
        r.put("/regions/:id", async (request, reply) => {
            const user = getUser(request);
            if (!requireAdmin(user, reply))
                return;
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = updateRegionSchema.safeParse(request.body);
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
				SELECT id FROM company_regions WHERE id = ${id} AND company_id = ${companyId}
			`);
            if (!existing)
                return reply.code(404).send({ error: "Region not found" });
            const b = parsed.data;
            const [updated] = (await sql `
				UPDATE company_regions SET
					name        = COALESCE(${b.name ?? null}, name),
					description = CASE WHEN ${b.description !== undefined ? "true" : "false"} = 'true' THEN ${b.description ?? null} ELSE description END,
					timezone    = COALESCE(${b.timezone ?? null}, timezone),
					states      = COALESCE(${b.states ?? null}, states),
					is_active   = COALESCE(${b.isActive ?? null}, is_active),
					updated_at  = NOW()
				WHERE id = ${id}
				RETURNING
					id, name, description, timezone, states,
					is_active  AS "isActive",
					updated_at AS "updatedAt"
			`);
            return { region: updated };
        });
        // ── DELETE /regions/:id ───────────────────────────────────────────────
        r.delete("/regions/:id", async (request, reply) => {
            const user = getUser(request);
            if (!requireAdmin(user, reply))
                return;
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            // Block delete if branches are still assigned
            const [{ count }] = (await sql `
				SELECT COUNT(*)::int AS count FROM branches WHERE region_id = ${id}
			`);
            if (count > 0) {
                return reply.code(400).send({
                    error: `Cannot delete region with ${count} assigned branch${count > 1 ? "es" : ""}. Remove branches first.`
                });
            }
            const [deleted] = (await sql `
				DELETE FROM company_regions WHERE id = ${id} AND company_id = ${companyId}
				RETURNING id
			`);
            if (!deleted)
                return reply.code(404).send({ error: "Region not found" });
            return { deleted: true };
        });
        // ── POST /regions/:id/branches ─────────────────────────────────────────
        // Assigns a branch to a region (sets branch.region_id)
        r.post("/regions/:id/branches", async (request, reply) => {
            const user = getUser(request);
            if (!requireAdmin(user, reply))
                return;
            const { id: regionId } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const { branchId } = request.body;
            if (!branchId)
                return reply.code(400).send({ error: "branchId required" });
            const sql = getSql();
            // Validate both belong to company
            const [region] = (await sql `
				SELECT id FROM company_regions WHERE id = ${regionId} AND company_id = ${companyId}
			`);
            if (!region)
                return reply.code(404).send({ error: "Region not found" });
            const [branch] = (await sql `
				SELECT id FROM branches WHERE id = ${branchId} AND company_id = ${companyId}
			`);
            if (!branch)
                return reply.code(404).send({ error: "Branch not found" });
            await sql `
				UPDATE branches SET region_id = ${regionId}, updated_at = NOW() WHERE id = ${branchId}
			`;
            return { success: true, regionId, branchId };
        });
        // ── DELETE /regions/:id/branches/:branchId ────────────────────────────
        r.delete("/regions/:id/branches/:branchId", async (request, reply) => {
            const user = getUser(request);
            if (!requireAdmin(user, reply))
                return;
            const { id: regionId, branchId } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            await sql `
				UPDATE branches SET region_id = NULL, updated_at = NOW()
				WHERE id = ${branchId} AND company_id = ${companyId} AND region_id = ${regionId}
			`;
            return { success: true };
        });
        // ── GET /regions/:id/analytics ────────────────────────────────────────
        // Rolls up job/revenue/tech stats across all branches in a region.
        r.get("/regions/:id/analytics", async (request, reply) => {
            const user = getUser(request);
            const { id: regionId } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = regionAnalyticsSchema.safeParse(request.query);
            if (!parsed.success)
                return reply.code(400).send({ error: "Invalid query" });
            const { since, until } = parsed.data;
            const sql = getSql();
            // Validate region
            const [region] = (await sql `
				SELECT r.id, r.name, r.timezone,
				       ARRAY_AGG(b.id) AS branch_ids
				FROM company_regions r
				LEFT JOIN branches b ON b.region_id = r.id
				WHERE r.id = ${regionId}
				  AND (${companyId}::uuid IS NULL OR r.company_id = ${companyId})
				GROUP BY r.id, r.name, r.timezone
			`);
            if (!region)
                return reply.code(404).send({ error: "Region not found" });
            const branchIds = (region.branch_ids ?? []).filter(Boolean);
            if (branchIds.length === 0) {
                return {
                    regionId,
                    regionName: region.name,
                    branchIds: [],
                    message: "No branches assigned to this region",
                    analytics: null
                };
            }
            // Per-branch rollup
            const branchStats = (await sql `
				SELECT
					j.branch_id                                     AS "branchId",
					b.name                                          AS "branchName",
					COUNT(*)::int                                   AS "totalJobs",
					COUNT(*) FILTER (WHERE j.status = 'completed')::int AS "completedJobs",
					COUNT(*) FILTER (WHERE j.status = 'cancelled')::int AS "cancelledJobs",
					ROUND(AVG(i.total) FILTER (WHERE i.total IS NOT NULL)::numeric, 2) AS "avgInvoiceValue",
					COALESCE(SUM(i.total) FILTER (WHERE i.status IN ('paid', 'partial')), 0)::numeric AS "revenueCollected"
				FROM jobs j
				JOIN branches b ON b.id = j.branch_id
				LEFT JOIN invoices i ON i.job_id = j.id
				WHERE j.branch_id = ANY(${branchIds}::uuid[])
				  AND (${since ?? null}::text IS NULL OR j.created_at >= ${since ?? null}::date)
				  AND (${until ?? null}::text IS NULL OR j.created_at <= ${until ?? null}::date)
				GROUP BY j.branch_id, b.name
				ORDER BY "revenueCollected" DESC
			`);
            // Tech counts per branch
            const techCounts = (await sql `
				SELECT
					branch_id                AS "branchId",
					COUNT(*)::int            AS "totalTechs",
					COUNT(*) FILTER (WHERE is_available = true)::int AS "availableTechs"
				FROM employees
				WHERE branch_id = ANY(${branchIds}::uuid[]) AND is_active = true
				GROUP BY branch_id
			`);
            const techMap = Object.fromEntries(techCounts.map((t) => [t.branchId, t]));
            const enrichedBranches = branchStats.map((b) => ({
                ...b,
                totalTechs: techMap[b.branchId]?.totalTechs ?? 0,
                availableTechs: techMap[b.branchId]?.availableTechs ?? 0
            }));
            // Region totals
            const totals = enrichedBranches.reduce((acc, b) => ({
                totalJobs: acc.totalJobs + b.totalJobs,
                completedJobs: acc.completedJobs + b.completedJobs,
                cancelledJobs: acc.cancelledJobs + b.cancelledJobs,
                revenueCollected: Number(acc.revenueCollected) + Number(b.revenueCollected),
                totalTechs: acc.totalTechs + b.totalTechs,
                availableTechs: acc.availableTechs + b.availableTechs
            }), {
                totalJobs: 0,
                completedJobs: 0,
                cancelledJobs: 0,
                revenueCollected: 0,
                totalTechs: 0,
                availableTechs: 0
            });
            return {
                regionId,
                regionName: region.name,
                since: since ?? null,
                until: until ?? null,
                totals: {
                    ...totals,
                    completionRate: totals.totalJobs > 0
                        ? Math.round((totals.completedJobs / totals.totalJobs) * 100)
                        : 0
                },
                branches: enrichedBranches
            };
        });
        // ── GET /regions/capacity ──────────────────────────────────────────────
        // Live capacity snapshot across all regions and their branches.
        r.get("/regions/capacity", async (request, reply) => {
            const user = getUser(request);
            const parsed = capacitySchema.safeParse(request.query);
            if (!parsed.success)
                return reply.code(400).send({ error: "Invalid query" });
            const companyId = resolveCompanyId(user, parsed.data.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const { regionId } = parsed.data;
            const sql = getSql();
            const capacity = (await sql `
				SELECT
					cr.id                   AS "regionId",
					cr.name                 AS "regionName",
					cr.timezone,
					b.id                    AS "branchId",
					b.name                  AS "branchName",
					b.city,
					b.state,
					-- Tech capacity
					COUNT(DISTINCT e.id) FILTER (WHERE e.is_active = true)::int AS "totalTechs",
					COUNT(DISTINCT e.id) FILTER (WHERE e.is_available = true AND e.is_active = true)::int AS "availableTechs",
					-- Open jobs
					COUNT(DISTINCT j.id) FILTER (WHERE j.status IN ('unassigned', 'assigned', 'in_progress'))::int AS "openJobs",
					COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'unassigned')::int AS "unassignedJobs"
				FROM company_regions cr
				JOIN branches b ON b.region_id = cr.id AND b.is_active = true
				LEFT JOIN employees e ON e.branch_id = b.id
				LEFT JOIN jobs j ON j.branch_id = b.id AND j.created_at >= NOW() - INTERVAL '7 days'
				WHERE cr.company_id = ${companyId}
				  AND cr.is_active = true
				  AND (${regionId ?? null}::uuid IS NULL OR cr.id = ${regionId ?? null})
				GROUP BY cr.id, cr.name, cr.timezone, b.id, b.name, b.city, b.state
				ORDER BY cr.name, b.name
			`);
            // Group by region
            const byRegion = {};
            for (const row of capacity) {
                if (!byRegion[row.regionId]) {
                    byRegion[row.regionId] = {
                        regionId: row.regionId,
                        regionName: row.regionName,
                        timezone: row.timezone,
                        branches: [],
                        totals: {
                            totalTechs: 0,
                            availableTechs: 0,
                            openJobs: 0,
                            unassignedJobs: 0
                        }
                    };
                }
                byRegion[row.regionId].branches.push({
                    branchId: row.branchId,
                    branchName: row.branchName,
                    city: row.city,
                    state: row.state,
                    totalTechs: row.totalTechs,
                    availableTechs: row.availableTechs,
                    openJobs: row.openJobs,
                    unassignedJobs: row.unassignedJobs,
                    utilizationPct: row.totalTechs > 0
                        ? Math.round(((row.totalTechs - row.availableTechs) / row.totalTechs) * 100)
                        : 0
                });
                byRegion[row.regionId].totals.totalTechs += row.totalTechs;
                byRegion[row.regionId].totals.availableTechs += row.availableTechs;
                byRegion[row.regionId].totals.openJobs += row.openJobs;
                byRegion[row.regionId].totals.unassignedJobs += row.unassignedJobs;
            }
            return {
                snapshotAt: new Date().toISOString(),
                regions: Object.values(byRegion)
            };
        });
        // ── POST /jobs/:jobId/transfer ─────────────────────────────────────────
        // Transfers a job to a different branch within the same company.
        r.post("/jobs/:jobId/transfer", async (request, reply) => {
            const user = getUser(request);
            if (!requireAdmin(user, reply))
                return;
            const { jobId } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = transferJobSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const { toBranchId, reason } = parsed.data;
            const sql = getSql();
            // Validate job
            const [job] = (await sql `
				SELECT id, branch_id, status FROM jobs
				WHERE id = ${jobId} AND company_id = ${companyId}
			`);
            if (!job)
                return reply.code(404).send({ error: "Job not found" });
            if (job.status === "completed" || job.status === "cancelled") {
                return reply
                    .code(400)
                    .send({ error: `Cannot transfer a ${job.status} job` });
            }
            // Validate target branch
            const [targetBranch] = (await sql `
				SELECT id, name FROM branches WHERE id = ${toBranchId} AND company_id = ${companyId} AND is_active = true
			`);
            if (!targetBranch)
                return reply.code(404).send({ error: "Target branch not found" });
            if (job.branch_id === toBranchId) {
                return reply.code(400).send({ error: "Job is already in that branch" });
            }
            // Transfer: unassign tech (cross-branch assignment is invalid), move branch
            await sql `
				UPDATE jobs SET
					branch_id        = ${toBranchId},
					assigned_tech_id = NULL,
					status           = CASE WHEN status = 'assigned' THEN 'unassigned' ELSE status END,
					updated_at       = NOW()
				WHERE id = ${jobId}
			`;
            // Log the transfer
            await sql `
				INSERT INTO job_transfer_log (
					job_id, from_branch_id, to_branch_id, transferred_by_user_id, reason
				) VALUES (
					${jobId}, ${job.branch_id}, ${toBranchId},
					${user.userId ?? user.id ?? null}, ${reason ?? null}
				)
			`;
            return {
                success: true,
                jobId,
                fromBranchId: job.branch_id,
                toBranchId,
                note: "Assigned tech was cleared — job needs reassignment in new branch"
            };
        });
        // ── POST /employees/:employeeId/transfer ───────────────────────────────
        // Transfers an employee to a different branch.
        r.post("/employees/:employeeId/transfer", async (request, reply) => {
            const user = getUser(request);
            if (!requireAdmin(user, reply))
                return;
            const { employeeId } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = transferEmployeeSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid body",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const { toBranchId, reason, effectiveDate } = parsed.data;
            const sql = getSql();
            const [employee] = (await sql `
				SELECT id, branch_id, name FROM employees
				WHERE id = ${employeeId} AND company_id = ${companyId} AND is_active = true
			`);
            if (!employee)
                return reply.code(404).send({ error: "Employee not found" });
            const [targetBranch] = (await sql `
				SELECT id, name FROM branches WHERE id = ${toBranchId} AND company_id = ${companyId} AND is_active = true
			`);
            if (!targetBranch)
                return reply.code(404).send({ error: "Target branch not found" });
            if (employee.branch_id === toBranchId) {
                return reply
                    .code(400)
                    .send({ error: "Employee is already in that branch" });
            }
            await sql `
				UPDATE employees SET
					branch_id  = ${toBranchId},
					updated_at = NOW()
				WHERE id = ${employeeId}
			`;
            // Log the transfer
            await sql `
				INSERT INTO employee_transfer_log (
					employee_id, from_branch_id, to_branch_id,
					transferred_by_user_id, effective_date, reason
				) VALUES (
					${employeeId}, ${employee.branch_id}, ${toBranchId},
					${user.userId ?? user.id ?? null},
					${effectiveDate ?? new Date().toISOString().split("T")[0]},
					${reason ?? null}
				)
			`;
            return {
                success: true,
                employeeId,
                employeeName: employee.name,
                fromBranchId: employee.branch_id,
                toBranchId,
                targetBranchName: targetBranch.name,
                effectiveDate: effectiveDate ?? new Date().toISOString().split("T")[0]
            };
        });
    });
}
