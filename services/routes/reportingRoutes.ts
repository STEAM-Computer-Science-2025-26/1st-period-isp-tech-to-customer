// services/routes/reportingRoutes.ts
// Job profitability reporting + payroll/timesheet reporting.
//
// Job Profitability:
//   Revenue comes from invoices. Cost comes from parts used + labor (estimated
//   from wrench time × tech hourly rate). Margin = revenue - cost.
//
// Payroll/Timesheet:
//   Aggregates time tracking data per tech per pay period. Shows regular hours,
//   overtime, jobs completed, drive time, wrench time, and estimated gross pay.
//   No external payroll API — this is the data layer Gusto/ADP will consume.
//
// Endpoints:
//   GET /reports/job-profitability          — per-job P&L with drill-down
//   GET /reports/job-profitability/summary  — aggregate margins by type/tech/period
//   GET /reports/job-profitability/:jobId   — single job full P&L breakdown
//   GET /reports/payroll/timesheets         — tech timesheets for a pay period
//   GET /reports/payroll/summary            — payroll summary for a period
//   GET /reports/payroll/overtime           — techs approaching/exceeding OT
//   POST /reports/payroll/rates             — set/update tech hourly rates
//   GET  /reports/payroll/rates             — list tech rates

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const profitabilityListSchema = z.object({
	companyId:   z.string().uuid().optional(),
	branchId:    z.string().uuid().optional(),
	techId:      z.string().uuid().optional(),
	jobType:     z.string().optional(),
	since:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	until:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	minMargin:   z.coerce.number().optional(),  // filter by margin % floor
	maxMargin:   z.coerce.number().optional(),  // filter by margin % ceiling (use negative to find losers)
	sortBy:      z.enum(["margin_pct","revenue","profit","completed_at"]).default("completed_at"),
	sortDir:     z.enum(["asc","desc"]).default("desc"),
	limit:       z.coerce.number().int().min(1).max(200).default(50),
	offset:      z.coerce.number().int().min(0).default(0),
});

const profitabilitySummarySchema = z.object({
	companyId: z.string().uuid().optional(),
	branchId:  z.string().uuid().optional(),
	since:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	until:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	groupBy:   z.enum(["job_type","tech","branch","month"]).default("job_type"),
});

const timesheetSchema = z.object({
	companyId:   z.string().uuid().optional(),
	branchId:    z.string().uuid().optional(),
	techId:      z.string().uuid().optional(),
	periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	periodEnd:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const payrollSummarySchema = z.object({
	companyId:   z.string().uuid().optional(),
	branchId:    z.string().uuid().optional(),
	periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	periodEnd:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const overtimeSchema = z.object({
	companyId:   z.string().uuid().optional(),
	weekStart:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // defaults to current week Mon
	otThreshold: z.coerce.number().default(40), // hours before OT kicks in
});

const setRateSchema = z.object({
	employeeId:  z.string().uuid(),
	hourlyRate:  z.number().min(0),
	overtimeRate: z.number().min(0).optional(), // defaults to 1.5x
	effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	companyId:   z.string().uuid().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUser(req: any): JWTPayload { return req.user as JWTPayload; }

function resolveCompanyId(user: JWTPayload, bodyId?: string): string | null {
	if (user.role === "dev") return bodyId ?? user.companyId ?? null;
	return user.companyId ?? null;
}

function currentWeekMonday(): string {
	const now = new Date();
	const day = now.getDay(); // 0=Sun
	const diff = day === 0 ? -6 : 1 - day;
	const monday = new Date(now);
	monday.setDate(now.getDate() + diff);
	return monday.toISOString().split("T")[0];
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function reportingRoutes(fastify: FastifyInstance) {
	fastify.register(async (r) => {
		r.addHook("onRequest", authenticate);

		// ── GET /reports/job-profitability ────────────────────────────────────
		// Per-job P&L list. Revenue from invoices, cost from parts + labor.
		r.get("/reports/job-profitability", async (request, reply) => {
			const user = getUser(request);
			const parsed = profitabilityListSchema.safeParse(request.query);
			if (!parsed.success) return reply.code(400).send({ error: "Invalid query", details: parsed.error.flatten().fieldErrors });

			const { branchId, techId, jobType, since, until, minMargin, maxMargin, sortBy, sortDir, limit, offset } = parsed.data;
			const companyId = resolveCompanyId(user, parsed.data.companyId);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			// Sort column mapping (safe — enum validated above)
			const sortCol: Record<string, string> = {
				margin_pct:   "margin_pct",
				revenue:      "revenue",
				profit:       "profit",
				completed_at: "j.completed_at",
			};

			const jobs = await sql`
				SELECT
					j.id                                AS "jobId",
					j.job_type                          AS "jobType",
					j.status,
					j.completed_at                      AS "completedAt",
					j.branch_id                         AS "branchId",
					b.name                              AS "branchName",
					j.assigned_tech_id                  AS "techId",
					e.name                              AS "techName",
					c.first_name || ' ' || c.last_name AS "customerName",

					-- Revenue: sum of paid/partial invoices
					COALESCE(
						(SELECT SUM(i.total)
						 FROM invoices i
						 WHERE i.job_id = j.id AND i.status IN ('paid','partial','sent')),
						0
					)::numeric                           AS revenue,

					-- Parts cost
					COALESCE(
						(SELECT SUM(pul.quantity_used * pul.unit_cost_at_time)
						 FROM parts_usage_log pul
						 WHERE pul.job_id = j.id AND pul.unit_cost_at_time IS NOT NULL),
						0
					)::numeric                           AS "partsCost",

					-- Labor cost: wrench_time_minutes × tech hourly rate
					COALESCE(
						(SELECT
							ROUND((jc.wrench_time_minutes::numeric / 60) * COALESCE(tr.hourly_rate, 0), 2)
						 FROM job_completions jc
						 LEFT JOIN tech_pay_rates tr ON tr.employee_id = j.assigned_tech_id
						 	AND tr.effective_date <= j.completed_at::date
						 WHERE jc.job_id = j.id
						 ORDER BY tr.effective_date DESC
						 LIMIT 1),
						0
					)::numeric                           AS "laborCost",

					-- Wrench time
					(SELECT jc.wrench_time_minutes FROM job_completions jc WHERE jc.job_id = j.id) AS "wrenchMinutes",
					(SELECT jc.drive_time_minutes  FROM job_completions jc WHERE jc.job_id = j.id) AS "driveMinutes"

				FROM jobs j
				LEFT JOIN branches b   ON b.id = j.branch_id
				LEFT JOIN employees e  ON e.id = j.assigned_tech_id
				LEFT JOIN customers c  ON c.id = j.customer_id
				WHERE j.status = 'completed'
				  AND (${companyId}::uuid IS NULL OR j.company_id = ${companyId})
				  AND (${branchId ?? null}::uuid IS NULL OR j.branch_id = ${branchId ?? null})
				  AND (${techId ?? null}::uuid IS NULL OR j.assigned_tech_id = ${techId ?? null})
				  AND (${jobType ?? null}::text IS NULL OR j.job_type = ${jobType ?? null})
				  AND (${since ?? null}::text IS NULL OR j.completed_at >= ${since ?? null}::date)
				  AND (${until ?? null}::text IS NULL OR j.completed_at < (${until ?? null}::date + INTERVAL '1 day'))
				ORDER BY j.completed_at DESC
				LIMIT ${limit + 1} OFFSET ${offset}
			` as any[];

			// Compute derived fields and apply margin filters in JS
			// (avoids complex SQL HAVING on computed expressions)
			let enriched = jobs.map((j: any) => {
				const revenue    = Number(j.revenue);
				const partsCost  = Number(j.partsCost);
				const laborCost  = Number(j.laborCost);
				const totalCost  = partsCost + laborCost;
				const profit     = revenue - totalCost;
				const marginPct  = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null;

				return {
					jobId:        j.jobId,
					jobType:      j.jobType,
					completedAt:  j.completedAt,
					branchId:     j.branchId,
					branchName:   j.branchName,
					techId:       j.techId,
					techName:     j.techName,
					customerName: j.customerName,
					revenue:      Math.round(revenue * 100) / 100,
					partsCost:    Math.round(partsCost * 100) / 100,
					laborCost:    Math.round(laborCost * 100) / 100,
					totalCost:    Math.round(totalCost * 100) / 100,
					profit:       Math.round(profit * 100) / 100,
					marginPct,
					wrenchMinutes: j.wrenchMinutes,
					driveMinutes:  j.driveMinutes,
				};
			});

			if (minMargin !== undefined) enriched = enriched.filter((j: any) => j.marginPct !== null && j.marginPct >= minMargin);
			if (maxMargin !== undefined) enriched = enriched.filter((j: any) => j.marginPct !== null && j.marginPct <= maxMargin);

			// Client-side sort for derived fields
			if (sortBy !== "completed_at") {
				const key = sortBy === "margin_pct" ? "marginPct" : sortBy;
				enriched.sort((a: any, b: any) => sortDir === "asc" ? a[key] - b[key] : b[key] - a[key]);
			}

			const hasMore = enriched.length > limit;
			if (hasMore) enriched.pop();

			return { jobs: enriched, hasMore, limit, offset };
		});

		// ── GET /reports/job-profitability/summary ────────────────────────────
		r.get("/reports/job-profitability/summary", async (request, reply) => {
			const user = getUser(request);
			const parsed = profitabilitySummarySchema.safeParse(request.query);
			if (!parsed.success) return reply.code(400).send({ error: "Invalid query" });

			const { branchId, since, until, groupBy } = parsed.data;
			const companyId = resolveCompanyId(user, parsed.data.companyId);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			// Overall totals
			const [totals] = await sql`
				SELECT
					COUNT(j.id)::int                                         AS "jobCount",
					COALESCE(SUM(inv.total), 0)                              AS "totalRevenue",
					COALESCE(SUM(parts.cost), 0)                             AS "totalPartsCost",
					COALESCE(SUM(labor.cost), 0)                             AS "totalLaborCost",
					COALESCE(SUM(inv.total) - SUM(parts.cost) - SUM(labor.cost), 0) AS "totalProfit",
					ROUND(
						(COALESCE(SUM(inv.total), 0) - COALESCE(SUM(parts.cost), 0) - COALESCE(SUM(labor.cost), 0))
						/ NULLIF(COALESCE(SUM(inv.total), 0), 0) * 100, 1
					)                                                        AS "avgMarginPct"
				FROM jobs j
				LEFT JOIN LATERAL (
					SELECT COALESCE(SUM(total), 0) AS total FROM invoices
					WHERE job_id = j.id AND status IN ('paid','partial','sent')
				) inv ON true
				LEFT JOIN LATERAL (
					SELECT COALESCE(SUM(quantity_used * unit_cost_at_time), 0) AS cost
					FROM parts_usage_log WHERE job_id = j.id AND unit_cost_at_time IS NOT NULL
				) parts ON true
				LEFT JOIN LATERAL (
					SELECT COALESCE(
						ROUND((jc.wrench_time_minutes::numeric / 60) * COALESCE(tr.hourly_rate, 0), 2), 0
					) AS cost
					FROM job_completions jc
					LEFT JOIN tech_pay_rates tr ON tr.employee_id = j.assigned_tech_id
						AND tr.effective_date <= j.completed_at::date
					WHERE jc.job_id = j.id
					ORDER BY tr.effective_date DESC LIMIT 1
				) labor ON true
				WHERE j.status = 'completed'
				  AND (${companyId}::uuid IS NULL OR j.company_id = ${companyId})
				  AND (${branchId ?? null}::uuid IS NULL OR j.branch_id = ${branchId ?? null})
				  AND (${since ?? null}::text IS NULL OR j.completed_at >= ${since ?? null}::date)
				  AND (${until ?? null}::text IS NULL OR j.completed_at < (${until ?? null}::date + INTERVAL '1 day'))
			` as any[];

			// Group breakdown
			let breakdown: any[] = [];

			if (groupBy === "job_type") {
				breakdown = await sql`
					SELECT
						j.job_type                    AS "group",
						COUNT(j.id)::int              AS "jobCount",
						ROUND(AVG(inv.total)::numeric, 2) AS "avgRevenue",
						ROUND((SUM(inv.total) - SUM(parts.cost) - SUM(labor.cost))
							/ NULLIF(SUM(inv.total), 0) * 100, 1) AS "avgMarginPct",
						COALESCE(SUM(inv.total), 0)   AS "totalRevenue"
					FROM jobs j
					LEFT JOIN LATERAL (SELECT COALESCE(SUM(total),0) AS total FROM invoices WHERE job_id=j.id AND status IN ('paid','partial','sent')) inv ON true
					LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity_used*unit_cost_at_time),0) AS cost FROM parts_usage_log WHERE job_id=j.id AND unit_cost_at_time IS NOT NULL) parts ON true
					LEFT JOIN LATERAL (SELECT COALESCE(ROUND((jc.wrench_time_minutes::numeric/60)*COALESCE(tr.hourly_rate,0),2),0) AS cost FROM job_completions jc LEFT JOIN tech_pay_rates tr ON tr.employee_id=j.assigned_tech_id AND tr.effective_date<=j.completed_at::date WHERE jc.job_id=j.id ORDER BY tr.effective_date DESC LIMIT 1) labor ON true
					WHERE j.status='completed' AND (${companyId}::uuid IS NULL OR j.company_id=${companyId})
					  AND (${since ?? null}::text IS NULL OR j.completed_at >= ${since ?? null}::date)
					  AND (${until ?? null}::text IS NULL OR j.completed_at < (${until ?? null}::date + INTERVAL '1 day'))
					GROUP BY j.job_type ORDER BY "totalRevenue" DESC
				` as any[];
			} else if (groupBy === "tech") {
				breakdown = await sql`
					SELECT
						e.name                        AS "group",
						COUNT(j.id)::int              AS "jobCount",
						ROUND(AVG(inv.total)::numeric,2) AS "avgRevenue",
						ROUND((SUM(inv.total)-SUM(parts.cost)-SUM(labor.cost))/NULLIF(SUM(inv.total),0)*100,1) AS "avgMarginPct",
						COALESCE(SUM(inv.total),0)    AS "totalRevenue"
					FROM jobs j
					LEFT JOIN employees e ON e.id=j.assigned_tech_id
					LEFT JOIN LATERAL (SELECT COALESCE(SUM(total),0) AS total FROM invoices WHERE job_id=j.id AND status IN ('paid','partial','sent')) inv ON true
					LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity_used*unit_cost_at_time),0) AS cost FROM parts_usage_log WHERE job_id=j.id AND unit_cost_at_time IS NOT NULL) parts ON true
					LEFT JOIN LATERAL (SELECT COALESCE(ROUND((jc.wrench_time_minutes::numeric/60)*COALESCE(tr.hourly_rate,0),2),0) AS cost FROM job_completions jc LEFT JOIN tech_pay_rates tr ON tr.employee_id=j.assigned_tech_id AND tr.effective_date<=j.completed_at::date WHERE jc.job_id=j.id ORDER BY tr.effective_date DESC LIMIT 1) labor ON true
					WHERE j.status='completed' AND (${companyId}::uuid IS NULL OR j.company_id=${companyId})
					  AND (${since ?? null}::text IS NULL OR j.completed_at >= ${since ?? null}::date)
					  AND (${until ?? null}::text IS NULL OR j.completed_at < (${until ?? null}::date + INTERVAL '1 day'))
					GROUP BY e.id, e.name ORDER BY "totalRevenue" DESC
				` as any[];
			} else if (groupBy === "month") {
				breakdown = await sql`
					SELECT
						TO_CHAR(j.completed_at, 'YYYY-MM') AS "group",
						COUNT(j.id)::int                   AS "jobCount",
						ROUND(AVG(inv.total)::numeric,2)   AS "avgRevenue",
						ROUND((SUM(inv.total)-SUM(parts.cost)-SUM(labor.cost))/NULLIF(SUM(inv.total),0)*100,1) AS "avgMarginPct",
						COALESCE(SUM(inv.total),0)         AS "totalRevenue"
					FROM jobs j
					LEFT JOIN LATERAL (SELECT COALESCE(SUM(total),0) AS total FROM invoices WHERE job_id=j.id AND status IN ('paid','partial','sent')) inv ON true
					LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity_used*unit_cost_at_time),0) AS cost FROM parts_usage_log WHERE job_id=j.id AND unit_cost_at_time IS NOT NULL) parts ON true
					LEFT JOIN LATERAL (SELECT COALESCE(ROUND((jc.wrench_time_minutes::numeric/60)*COALESCE(tr.hourly_rate,0),2),0) AS cost FROM job_completions jc LEFT JOIN tech_pay_rates tr ON tr.employee_id=j.assigned_tech_id AND tr.effective_date<=j.completed_at::date WHERE jc.job_id=j.id ORDER BY tr.effective_date DESC LIMIT 1) labor ON true
					WHERE j.status='completed' AND (${companyId}::uuid IS NULL OR j.company_id=${companyId})
					  AND (${since ?? null}::text IS NULL OR j.completed_at >= ${since ?? null}::date)
					  AND (${until ?? null}::text IS NULL OR j.completed_at < (${until ?? null}::date + INTERVAL '1 day'))
					GROUP BY 1 ORDER BY 1
				` as any[];
			} else if (groupBy === "branch") {
				breakdown = await sql`
					SELECT
						COALESCE(b.name,'No Branch')  AS "group",
						COUNT(j.id)::int              AS "jobCount",
						ROUND(AVG(inv.total)::numeric,2) AS "avgRevenue",
						ROUND((SUM(inv.total)-SUM(parts.cost)-SUM(labor.cost))/NULLIF(SUM(inv.total),0)*100,1) AS "avgMarginPct",
						COALESCE(SUM(inv.total),0)    AS "totalRevenue"
					FROM jobs j
					LEFT JOIN branches b ON b.id=j.branch_id
					LEFT JOIN LATERAL (SELECT COALESCE(SUM(total),0) AS total FROM invoices WHERE job_id=j.id AND status IN ('paid','partial','sent')) inv ON true
					LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity_used*unit_cost_at_time),0) AS cost FROM parts_usage_log WHERE job_id=j.id AND unit_cost_at_time IS NOT NULL) parts ON true
					LEFT JOIN LATERAL (SELECT COALESCE(ROUND((jc.wrench_time_minutes::numeric/60)*COALESCE(tr.hourly_rate,0),2),0) AS cost FROM job_completions jc LEFT JOIN tech_pay_rates tr ON tr.employee_id=j.assigned_tech_id AND tr.effective_date<=j.completed_at::date WHERE jc.job_id=j.id ORDER BY tr.effective_date DESC LIMIT 1) labor ON true
					WHERE j.status='completed' AND (${companyId}::uuid IS NULL OR j.company_id=${companyId})
					  AND (${since ?? null}::text IS NULL OR j.completed_at >= ${since ?? null}::date)
					  AND (${until ?? null}::text IS NULL OR j.completed_at < (${until ?? null}::date + INTERVAL '1 day'))
					GROUP BY b.id, b.name ORDER BY "totalRevenue" DESC
				` as any[];
			}

			return { totals, groupBy, breakdown };
		});

		// ── GET /reports/job-profitability/:jobId ─────────────────────────────
		r.get("/reports/job-profitability/:jobId", async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params as { jobId: string };
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [job] = await sql`
				SELECT
					j.id, j.job_type AS "jobType", j.status,
					j.completed_at AS "completedAt",
					j.estimated_duration_minutes AS "estimatedMinutes",
					j.actual_duration_minutes AS "actualMinutes",
					e.name AS "techName",
					c.first_name || ' ' || c.last_name AS "customerName",
					b.name AS "branchName"
				FROM jobs j
				LEFT JOIN employees e ON e.id = j.assigned_tech_id
				LEFT JOIN customers c ON c.id = j.customer_id
				LEFT JOIN branches b  ON b.id = j.branch_id
				WHERE j.id = ${jobId}
				  AND (${companyId}::uuid IS NULL OR j.company_id = ${companyId})
			` as any[];
			if (!job) return reply.code(404).send({ error: "Job not found" });

			const invoices = await sql`
				SELECT id, invoice_number AS "invoiceNumber", status, total, amount_paid AS "amountPaid"
				FROM invoices WHERE job_id = ${jobId} AND status != 'void'
			` as any[];

			const parts = await sql`
				SELECT
					p.part_name AS name, p.part_number AS "partNumber",
					pul.quantity_used AS qty,
					pul.unit_cost_at_time AS "unitCost",
					(pul.quantity_used * pul.unit_cost_at_time) AS "lineTotal"
				FROM parts_usage_log pul
				JOIN parts_inventory p ON p.id = pul.part_id
				WHERE pul.job_id = ${jobId}
			` as any[];

			const [completion] = await sql`
				SELECT wrench_time_minutes AS "wrenchMinutes", drive_time_minutes AS "driveMinutes"
				FROM job_completions WHERE job_id = ${jobId}
			` as any[];

			const [rate] = await sql`
				SELECT hourly_rate AS "hourlyRate", overtime_rate AS "overtimeRate"
				FROM tech_pay_rates
				WHERE employee_id = (SELECT assigned_tech_id FROM jobs WHERE id = ${jobId})
				ORDER BY effective_date DESC LIMIT 1
			` as any[];

			const revenue    = invoices.reduce((s: number, i: any) => s + Number(i.total), 0);
			const partsCost  = parts.reduce((s: number, p: any) => s + Number(p.lineTotal ?? 0), 0);
			const laborHours = (completion?.wrenchMinutes ?? 0) / 60;
			const laborCost  = laborHours * Number(rate?.hourlyRate ?? 0);
			const totalCost  = partsCost + laborCost;
			const profit     = revenue - totalCost;
			const marginPct  = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null;

			return {
				job,
				revenue:   Math.round(revenue * 100) / 100,
				costs: {
					parts:   Math.round(partsCost * 100) / 100,
					labor:   Math.round(laborCost * 100) / 100,
					total:   Math.round(totalCost * 100) / 100,
				},
				profit:    Math.round(profit * 100) / 100,
				marginPct,
				detail: {
					invoices,
					partsUsed: parts,
					timeTracking: completion ?? null,
					techRate: rate ?? null,
				},
			};
		});

		// ── GET /reports/payroll/timesheets ───────────────────────────────────
		// Per-tech timesheet for a pay period. Source of truth for payroll export.
		r.get("/reports/payroll/timesheets", async (request, reply) => {
			const user = getUser(request);
			const parsed = timesheetSchema.safeParse(request.query);
			if (!parsed.success) return reply.code(400).send({ error: "Invalid query", details: parsed.error.flatten().fieldErrors });

			const { branchId, techId, periodStart, periodEnd } = parsed.data;
			const companyId = resolveCompanyId(user, parsed.data.companyId);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const techs = await sql`
				SELECT
					e.id                              AS "employeeId",
					e.name                            AS "techName",
					e.email,
					b.name                            AS "branchName",
					-- Jobs in period
					COUNT(j.id)::int                  AS "jobsCompleted",
					-- Time totals
					COALESCE(SUM(jc.wrench_time_minutes), 0)::int AS "totalWrenchMinutes",
					COALESCE(SUM(jc.drive_time_minutes),  0)::int AS "totalDriveMinutes",
					COALESCE(SUM(jc.duration_minutes),    0)::int AS "totalOnSiteMinutes",
					-- Derive regular + OT hours (assuming 8hr/day, 5-day week = 40hr threshold)
					ROUND(COALESCE(SUM(jc.wrench_time_minutes + jc.drive_time_minutes), 0)::numeric / 60, 2) AS "totalHours",
					-- Pay rate
					COALESCE(tr.hourly_rate, 0)       AS "hourlyRate",
					COALESCE(tr.overtime_rate, tr.hourly_rate * 1.5, 0) AS "overtimeRate",
					-- First-time fix rate for period
					ROUND(
						COUNT(jc.job_id) FILTER (WHERE jc.first_time_fix = true)::numeric
						/ NULLIF(COUNT(jc.job_id), 0) * 100, 1
					)                                 AS "firstTimeFixPct",
					-- Customer ratings
					ROUND(AVG(jc.customer_rating) FILTER (WHERE jc.customer_rating IS NOT NULL), 2) AS "avgRating"
				FROM employees e
				LEFT JOIN branches b ON b.id = e.branch_id
				LEFT JOIN jobs j ON j.assigned_tech_id = e.id
					AND j.status = 'completed'
					AND j.completed_at >= ${periodStart}::date
					AND j.completed_at < (${periodEnd}::date + INTERVAL '1 day')
				LEFT JOIN job_completions jc ON jc.job_id = j.id
				LEFT JOIN LATERAL (
					SELECT hourly_rate, overtime_rate FROM tech_pay_rates
					WHERE employee_id = e.id AND effective_date <= ${periodEnd}::date
					ORDER BY effective_date DESC LIMIT 1
				) tr ON true
				WHERE e.is_active = true
				  AND (${companyId}::uuid IS NULL OR e.company_id = ${companyId})
				  AND (${branchId ?? null}::uuid IS NULL OR e.branch_id = ${branchId ?? null})
				  AND (${techId ?? null}::uuid IS NULL OR e.id = ${techId ?? null})
				GROUP BY e.id, e.name, e.email, b.name, tr.hourly_rate, tr.overtime_rate
				ORDER BY e.name
			` as any[];

			// Compute gross pay with OT split
			const OT_THRESHOLD = 40;
			const timesheets = techs.map((t: any) => {
				const totalHours = Number(t.totalHours);
				const regularHours = Math.min(totalHours, OT_THRESHOLD);
				const overtimeHours = Math.max(0, totalHours - OT_THRESHOLD);
				const regularPay = regularHours * Number(t.hourlyRate);
				const overtimePay = overtimeHours * Number(t.overtimeRate);
				const grossPay = Math.round((regularPay + overtimePay) * 100) / 100;

				return {
					...t,
					totalHours,
					regularHours: Math.round(regularHours * 100) / 100,
					overtimeHours: Math.round(overtimeHours * 100) / 100,
					regularPay: Math.round(regularPay * 100) / 100,
					overtimePay: Math.round(overtimePay * 100) / 100,
					grossPay,
				};
			});

			return { periodStart, periodEnd, timesheets };
		});

		// ── GET /reports/payroll/summary ──────────────────────────────────────
		r.get("/reports/payroll/summary", async (request, reply) => {
			const user = getUser(request);
			const parsed = payrollSummarySchema.safeParse(request.query);
			if (!parsed.success) return reply.code(400).send({ error: "Invalid query" });

			const { branchId, periodStart, periodEnd } = parsed.data;
			const companyId = resolveCompanyId(user, parsed.data.companyId);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [summary] = await sql`
				SELECT
					COUNT(DISTINCT e.id)::int                      AS "techCount",
					COUNT(j.id)::int                               AS "totalJobs",
					COALESCE(SUM(jc.wrench_time_minutes), 0)::int  AS "totalWrenchMinutes",
					COALESCE(SUM(jc.drive_time_minutes),  0)::int  AS "totalDriveMinutes",
					ROUND(
						COALESCE(SUM(jc.wrench_time_minutes + jc.drive_time_minutes), 0)::numeric / 60, 2
					)                                              AS "totalHours"
				FROM employees e
				JOIN jobs j ON j.assigned_tech_id = e.id
					AND j.status = 'completed'
					AND j.completed_at >= ${periodStart}::date
					AND j.completed_at < (${periodEnd}::date + INTERVAL '1 day')
				JOIN job_completions jc ON jc.job_id = j.id
				WHERE e.is_active = true
				  AND (${companyId}::uuid IS NULL OR e.company_id = ${companyId})
				  AND (${branchId ?? null}::uuid IS NULL OR e.branch_id = ${branchId ?? null})
			` as any[];

			// Estimated total payroll (sum of individual gross pays)
			const rates = await sql`
				SELECT
					e.id,
					COALESCE(tr.hourly_rate, 0) AS hourly_rate,
					COALESCE(tr.overtime_rate, tr.hourly_rate * 1.5, 0) AS overtime_rate,
					ROUND(COALESCE(SUM(jc.wrench_time_minutes + jc.drive_time_minutes), 0)::numeric / 60, 2) AS total_hours
				FROM employees e
				LEFT JOIN jobs j ON j.assigned_tech_id = e.id
					AND j.status = 'completed'
					AND j.completed_at >= ${periodStart}::date
					AND j.completed_at < (${periodEnd}::date + INTERVAL '1 day')
				LEFT JOIN job_completions jc ON jc.job_id = j.id
				LEFT JOIN LATERAL (
					SELECT hourly_rate, overtime_rate FROM tech_pay_rates
					WHERE employee_id = e.id AND effective_date <= ${periodEnd}::date
					ORDER BY effective_date DESC LIMIT 1
				) tr ON true
				WHERE e.is_active = true
				  AND (${companyId}::uuid IS NULL OR e.company_id = ${companyId})
				GROUP BY e.id, tr.hourly_rate, tr.overtime_rate
			` as any[];

			const OT_THRESHOLD = 40;
			const estimatedPayroll = rates.reduce((sum: number, r: any) => {
				const h = Number(r.total_hours);
				const reg = Math.min(h, OT_THRESHOLD) * Number(r.hourly_rate);
				const ot  = Math.max(0, h - OT_THRESHOLD) * Number(r.overtime_rate);
				return sum + reg + ot;
			}, 0);

			return {
				periodStart,
				periodEnd,
				summary: {
					...summary,
					estimatedPayroll: Math.round(estimatedPayroll * 100) / 100,
				},
			};
		});

		// ── GET /reports/payroll/overtime ─────────────────────────────────────
		// Techs at risk of / already in overtime this week.
		r.get("/reports/payroll/overtime", async (request, reply) => {
			const user = getUser(request);
			const parsed = overtimeSchema.safeParse(request.query);
			if (!parsed.success) return reply.code(400).send({ error: "Invalid query" });

			const { otThreshold } = parsed.data;
			const weekStart = parsed.data.weekStart ?? currentWeekMonday();
			const companyId = resolveCompanyId(user, parsed.data.companyId);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekEnd.getDate() + 6);
			const weekEndStr = weekEnd.toISOString().split("T")[0];

			const sql = getSql();

			const techs = await sql`
				SELECT
					e.id AS "employeeId",
					e.name AS "techName",
					ROUND(
						COALESCE(SUM(jc.wrench_time_minutes + jc.drive_time_minutes), 0)::numeric / 60, 2
					) AS "hoursThisWeek",
					COUNT(j.id)::int AS "jobsThisWeek",
					COALESCE(tr.hourly_rate, 0) AS "hourlyRate",
					COALESCE(tr.overtime_rate, tr.hourly_rate * 1.5, 0) AS "overtimeRate"
				FROM employees e
				LEFT JOIN jobs j ON j.assigned_tech_id = e.id
					AND j.status = 'completed'
					AND j.completed_at >= ${weekStart}::date
					AND j.completed_at <= ${weekEndStr}::date
				LEFT JOIN job_completions jc ON jc.job_id = j.id
				LEFT JOIN LATERAL (
					SELECT hourly_rate, overtime_rate FROM tech_pay_rates
					WHERE employee_id = e.id AND effective_date <= NOW()::date
					ORDER BY effective_date DESC LIMIT 1
				) tr ON true
				WHERE e.is_active = true
				  AND (${companyId}::uuid IS NULL OR e.company_id = ${companyId})
				GROUP BY e.id, e.name, tr.hourly_rate, tr.overtime_rate
				HAVING ROUND(COALESCE(SUM(jc.wrench_time_minutes + jc.drive_time_minutes), 0)::numeric / 60, 2) >= (${otThreshold} * 0.8)
				ORDER BY "hoursThisWeek" DESC
			` as any[];

			const enriched = techs.map((t: any) => ({
				...t,
				hoursThisWeek: Number(t.hoursThisWeek),
				isOvertime: Number(t.hoursThisWeek) >= otThreshold,
				hoursUntilOT: Math.max(0, Math.round((otThreshold - Number(t.hoursThisWeek)) * 10) / 10),
			}));

			return { weekStart, weekEnd: weekEndStr, otThreshold, techs: enriched };
		});

		// ── POST /reports/payroll/rates ───────────────────────────────────────
		// Set or update a tech's hourly rate.
		r.post("/reports/payroll/rates", async (request, reply) => {
			const user = getUser(request);
			if (user.role !== "admin" && user.role !== "dev") {
				return reply.code(403).send({ error: "Admin access required" });
			}

			const parsed = setRateSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten().fieldErrors });
			}
			const body = parsed.data;
			const companyId = resolveCompanyId(user, body.companyId);
			if (!companyId) return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const [emp] = await sql`
				SELECT id FROM employees WHERE id = ${body.employeeId} AND company_id = ${companyId}
			` as any[];
			if (!emp) return reply.code(404).send({ error: "Employee not found" });

			const effectiveDate = body.effectiveDate ?? new Date().toISOString().split("T")[0];
			const overtimeRate = body.overtimeRate ?? body.hourlyRate * 1.5;

			const [rate] = await sql`
				INSERT INTO tech_pay_rates (employee_id, company_id, hourly_rate, overtime_rate, effective_date)
				VALUES (${body.employeeId}, ${companyId}, ${body.hourlyRate}, ${overtimeRate}, ${effectiveDate})
				ON CONFLICT (employee_id, effective_date)
				DO UPDATE SET
					hourly_rate   = EXCLUDED.hourly_rate,
					overtime_rate = EXCLUDED.overtime_rate,
					updated_at    = NOW()
				RETURNING
					id, employee_id AS "employeeId",
					hourly_rate AS "hourlyRate", overtime_rate AS "overtimeRate",
					effective_date AS "effectiveDate"
			` as any[];

			return reply.code(201).send({ rate });
		});

		// ── GET /reports/payroll/rates ────────────────────────────────────────
		r.get("/reports/payroll/rates", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user, (request.query as any).companyId);
			if (!companyId && user.role !== "dev") return reply.code(403).send({ error: "Forbidden" });

			const sql = getSql();

			const rates = await sql`
				SELECT DISTINCT ON (tr.employee_id)
					tr.employee_id  AS "employeeId",
					e.name          AS "techName",
					tr.hourly_rate  AS "hourlyRate",
					tr.overtime_rate AS "overtimeRate",
					tr.effective_date AS "effectiveDate"
				FROM tech_pay_rates tr
				JOIN employees e ON e.id = tr.employee_id
				WHERE (${companyId}::uuid IS NULL OR tr.company_id = ${companyId})
				ORDER BY tr.employee_id, tr.effective_date DESC
			` as any[];

			return { rates };
		});
	});
}