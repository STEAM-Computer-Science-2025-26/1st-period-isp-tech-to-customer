// services/routes/forecastRoutes.ts
// Seasonal demand forecasting — analyses historical job volume
// to predict busy periods, staffing needs, and parts demand.
//
// Endpoints:
//   GET /forecast/demand          — job volume forecast by month/week
//   GET /forecast/seasonal-trends — year-over-year seasonal patterns
//   GET /forecast/staffing         — recommended staffing levels by period
//   GET /forecast/parts-demand    — predicted parts usage based on trends

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const demandSchema = z.object({
	companyId:  z.string().uuid().optional(),
	branchId:   z.string().uuid().optional(),
	horizon:    z.coerce.number().int().min(1).max(24).default(6), // months ahead
	granularity: z.enum(["week", "month"]).default("month"),
	jobType:    z.string().optional(),
});

const trendsSchema = z.object({
	companyId: z.string().uuid().optional(),
	years:     z.coerce.number().int().min(1).max(5).default(2),
	jobType:   z.string().optional(),
});

const staffingSchema = z.object({
	companyId:       z.string().uuid().optional(),
	horizon:         z.coerce.number().int().min(1).max(12).default(3),
	jobsPerTechPerDay: z.coerce.number().min(1).max(20).default(4),
});

const partsDemandSchema = z.object({
	companyId: z.string().uuid().optional(),
	horizon:   z.coerce.number().int().min(1).max(6).default(3),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUser(request: any): JWTPayload {
	return request.user as JWTPayload;
}

function resolveCompanyId(user: JWTPayload, bodyCompanyId?: string): string | null {
	if (user.role === "dev") return bodyCompanyId ?? user.companyId ?? null;
	return user.companyId ?? null;
}

// Month names for output
const MONTH_NAMES = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// HVAC seasonal multipliers by month (index 0 = Jan)
// Summer (AC) and winter (heating) are peak seasons
const SEASONAL_MULTIPLIERS = [
	0.85, // Jan — moderate heating demand
	0.80, // Feb — low (shoulder)
	0.90, // Mar — spring ramp-up
	1.05, // Apr — pre-summer checks
	1.20, // May — AC season starts
	1.40, // Jun — peak AC
	1.50, // Jul — peak AC
	1.45, // Aug — peak AC
	1.15, // Sep — post-summer
	0.95, // Oct — fall ramp-up
	1.10, // Nov — heating season
	1.00, // Dec — holiday dip
];

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function forecastRoutes(fastify: FastifyInstance) {
	fastify.register(async (r) => {
		r.addHook("onRequest", authenticate);

		// ──────────────────────────────────────────────────────────────────────
		// GET /forecast/demand
		// Forecasts job volume for the next N months/weeks based on
		// historical averages + seasonal multipliers
		// ──────────────────────────────────────────────────────────────────────
		r.get("/forecast/demand", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev") {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const parsed = demandSchema.safeParse(request.query);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid query",
					details: parsed.error.flatten().fieldErrors,
				});
			}

			const { horizon, granularity, jobType } = parsed.data;
			const effectiveCompanyId = user.role === "dev"
				? (parsed.data.companyId ?? companyId)
				: companyId;

			const sql = getSql();

			// Get historical monthly averages over the past 2 years
			const historical = (await sql`
				SELECT
					EXTRACT(MONTH FROM scheduled_time)::int AS month,
					EXTRACT(YEAR  FROM scheduled_time)::int AS year,
					COUNT(*) AS job_count
				FROM jobs
				WHERE company_id = ${effectiveCompanyId}
					AND scheduled_time IS NOT NULL
					AND scheduled_time >= NOW() - INTERVAL '2 years'
					AND status NOT IN ('cancelled')
					AND (${jobType ?? null}::text IS NULL OR job_type = ${jobType ?? null})
				GROUP BY 1, 2
				ORDER BY 2, 1
			`) as any[];

			// Build monthly averages from history
			const monthlyAvg: Record<number, number> = {};
			const monthCounts: Record<number, number[]> = {};

			for (const row of historical) {
				const m = row.month as number;
				if (!monthCounts[m]) monthCounts[m] = [];
				monthCounts[m].push(Number(row.job_count));
			}

			// Overall average jobs/month (fallback for months with no history)
			const allCounts = historical.map((r: any) => Number(r.job_count));
			const overallAvg = allCounts.length
				? allCounts.reduce((a: number, b: number) => a + b, 0) / allCounts.length
				: 10; // default if no history

			for (let m = 1; m <= 12; m++) {
				const counts = monthCounts[m] ?? [];
				monthlyAvg[m] = counts.length
					? counts.reduce((a, b) => a + b, 0) / counts.length
					: overallAvg;
			}

			// Generate forecast periods
			const forecast = [];
			const now = new Date();

			if (granularity === "month") {
				for (let i = 0; i < horizon; i++) {
					const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
					const month = d.getMonth() + 1; // 1-12
					const year  = d.getFullYear();
					const base  = monthlyAvg[month] ?? overallAvg;
					const multiplier = SEASONAL_MULTIPLIERS[month - 1] ?? 1;
					const predicted = Math.round(base * multiplier);
					const historicalAvg = Math.round(monthlyAvg[month] ?? overallAvg);

					forecast.push({
						period:        `${MONTH_NAMES[month - 1]} ${year}`,
						year,
						month,
						predictedJobs: predicted,
						historicalAvg,
						multiplier,
						trend:         predicted > historicalAvg ? "above_average" : predicted < historicalAvg ? "below_average" : "average",
					});
				}
			} else {
				// Weekly granularity
				for (let i = 0; i < horizon * 4; i++) {
					const d = new Date(now);
					d.setDate(d.getDate() + (i + 1) * 7);
					const month = d.getMonth() + 1;
					const weekOfYear = Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7);
					const monthlyBase = monthlyAvg[month] ?? overallAvg;
					const weeklyBase  = monthlyBase / 4.3;
					const multiplier  = SEASONAL_MULTIPLIERS[month - 1] ?? 1;
					const predicted   = Math.round(weeklyBase * multiplier);

					forecast.push({
						period:        `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
						year:          d.getFullYear(),
						month,
						week:          weekOfYear,
						predictedJobs: predicted,
						multiplier,
					});
				}
			}

			// Get total historical jobs for context
			const [totals] = (await sql`
				SELECT COUNT(*) AS total_jobs,
					MIN(scheduled_time) AS earliest_job
				FROM jobs
				WHERE company_id = ${effectiveCompanyId}
					AND scheduled_time IS NOT NULL
					AND status NOT IN ('cancelled')
			`) as any[];

			return {
				granularity,
				horizon,
				historicalDataPoints: historical.length,
				totalHistoricalJobs:  Number(totals?.total_jobs ?? 0),
				earliestJob:          totals?.earliest_job ?? null,
				overallMonthlyAverage: Math.round(overallAvg),
				forecast,
			};
		});

		// ──────────────────────────────────────────────────────────────────────
		// GET /forecast/seasonal-trends
		// Year-over-year job volume by month
		// ──────────────────────────────────────────────────────────────────────
		r.get("/forecast/seasonal-trends", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev") {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const parsed = trendsSchema.safeParse(request.query);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid query" });
			}

			const { years, jobType } = parsed.data;
			const effectiveCompanyId = user.role === "dev"
				? (parsed.data.companyId ?? companyId)
				: companyId;

			const sql = getSql();

			const rows = (await sql`
				SELECT
					EXTRACT(YEAR  FROM scheduled_time)::int AS year,
					EXTRACT(MONTH FROM scheduled_time)::int AS month,
					COUNT(*) AS job_count,
					COUNT(*) FILTER (WHERE status = 'completed') AS completed,
					COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
					ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - scheduled_time)) / 3600)::numeric, 2) AS avg_duration_hours
				FROM jobs
				WHERE company_id = ${effectiveCompanyId}
					AND scheduled_time IS NOT NULL
					AND scheduled_time >= NOW() - (${years} || ' years')::interval
					AND (${jobType ?? null}::text IS NULL OR job_type = ${jobType ?? null})
				GROUP BY 1, 2
				ORDER BY 1, 2
			`) as any[];

			// Reshape into year → monthly breakdown
			const byYear: Record<number, any[]> = {};
			for (const row of rows) {
				const y = Number(row.year);
				if (!byYear[y]) byYear[y] = [];
				byYear[y].push({
					month:            Number(row.month),
					monthName:        MONTH_NAMES[Number(row.month) - 1],
					jobCount:         Number(row.job_count),
					completed:        Number(row.completed),
					cancelled:        Number(row.cancelled),
					avgDurationHours: row.avg_duration_hours ? Number(row.avg_duration_hours) : null,
				});
			}

			// Find peak months
			const allMonthly = rows.map((r: any) => ({ month: Number(r.month), count: Number(r.job_count) }));
			const peakMonth = allMonthly.length
				? allMonthly.reduce((best: any, cur: any) => cur.count > best.count ? cur : best, allMonthly[0])
				: null;
			const slowMonth = allMonthly.length
				? allMonthly.reduce((best: any, cur: any) => cur.count < best.count ? cur : best, allMonthly[0])
				: null;

			return {
				years,
				byYear,
				insights: {
					peakMonth:  peakMonth ? { month: peakMonth.month, name: MONTH_NAMES[peakMonth.month - 1], avgJobs: peakMonth.count } : null,
					slowMonth:  slowMonth ? { month: slowMonth.month, name: MONTH_NAMES[slowMonth.month - 1], avgJobs: slowMonth.count } : null,
					seasonalMultipliers: SEASONAL_MULTIPLIERS.map((m, i) => ({
						month: i + 1,
						name:  MONTH_NAMES[i],
						multiplier: m,
					})),
				},
			};
		});

		// ──────────────────────────────────────────────────────────────────────
		// GET /forecast/staffing
		// Recommended tech headcount per upcoming month based on predicted demand
		// ──────────────────────────────────────────────────────────────────────
		r.get("/forecast/staffing", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev") {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const parsed = staffingSchema.safeParse(request.query);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid query" });
			}

			const { horizon, jobsPerTechPerDay } = parsed.data;
			const effectiveCompanyId = user.role === "dev"
				? (parsed.data.companyId ?? companyId)
				: companyId;

			const sql = getSql();

			// Get current active tech count
			const [techCount] = (await sql`
				SELECT COUNT(*) AS count
				FROM employees
				WHERE company_id = ${effectiveCompanyId}
					AND is_active = TRUE
					AND role = 'technician'
			`) as any[];

			const currentTechs = Number(techCount?.count ?? 0);

			// Get historical monthly job avg (same as demand forecast)
			const historical = (await sql`
				SELECT
					EXTRACT(MONTH FROM scheduled_time)::int AS month,
					COUNT(*) AS job_count
				FROM jobs
				WHERE company_id = ${effectiveCompanyId}
					AND scheduled_time IS NOT NULL
					AND scheduled_time >= NOW() - INTERVAL '2 years'
					AND status NOT IN ('cancelled')
				GROUP BY 1
			`) as any[];

			const monthlyAvg: Record<number, number> = {};
			for (const row of historical) {
				monthlyAvg[Number(row.month)] = Number(row.job_count);
			}
			const overallAvg = historical.length
				? historical.reduce((s: number, r: any) => s + Number(r.job_count), 0) / historical.length
				: 10;

			const WORK_DAYS_PER_MONTH = 21.5;

			const staffing = [];
			const now = new Date();

			for (let i = 0; i < horizon; i++) {
				const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
				const month = d.getMonth() + 1;
				const year  = d.getFullYear();
				const base  = monthlyAvg[month] ?? overallAvg;
				const multiplier = SEASONAL_MULTIPLIERS[month - 1] ?? 1;
				const predictedJobs = Math.round(base * multiplier);
				const techsNeeded = Math.ceil(predictedJobs / (jobsPerTechPerDay * WORK_DAYS_PER_MONTH));
				const delta = techsNeeded - currentTechs;

				staffing.push({
					period:        `${MONTH_NAMES[month - 1]} ${year}`,
					month,
					year,
					predictedJobs,
					techsNeeded,
					currentTechs,
					delta,
					recommendation: delta > 0
						? `Hire ${delta} more tech${delta > 1 ? "s" : ""}`
						: delta < 0
							? `${Math.abs(delta)} tech${Math.abs(delta) > 1 ? "s" : ""} may be underutilized`
							: "Staffing looks good",
					utilizationPct: Math.round((predictedJobs / (currentTechs * jobsPerTechPerDay * WORK_DAYS_PER_MONTH)) * 100),
				});
			}

			return {
				horizon,
				currentTechs,
				jobsPerTechPerDay,
				workDaysPerMonth: WORK_DAYS_PER_MONTH,
				staffing,
			};
		});

		// ──────────────────────────────────────────────────────────────────────
		// GET /forecast/parts-demand
		// Predicts parts usage based on historical job type patterns
		// ──────────────────────────────────────────────────────────────────────
		r.get("/forecast/parts-demand", async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && user.role !== "dev") {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const parsed = partsDemandSchema.safeParse(request.query);
			if (!parsed.success) {
				return reply.code(400).send({ error: "Invalid query" });
			}

			const { horizon } = parsed.data;
			const effectiveCompanyId = user.role === "dev"
				? (parsed.data.companyId ?? companyId)
				: companyId;

			const sql = getSql();

			// Get historical parts usage per month
			const partsUsage = (await sql`
				SELECT
					p.name                                              AS "partName",
					p.part_number                                       AS "partNumber",
					p.unit_cost                                         AS "unitCost",
					SUM(pu.quantity_used)                               AS "totalUsed",
					COUNT(DISTINCT pu.job_id)                           AS "jobsUsedIn",
					EXTRACT(MONTH FROM j.scheduled_time)::int           AS month,
					EXTRACT(YEAR  FROM j.scheduled_time)::int           AS year
				FROM parts_usage pu
				JOIN parts p    ON p.id = pu.part_id
				JOIN jobs  j    ON j.id = pu.job_id
				WHERE pu.company_id = ${effectiveCompanyId}
					AND j.scheduled_time >= NOW() - INTERVAL '1 year'
				GROUP BY 1, 2, 3, 5, 6
				ORDER BY "totalUsed" DESC
			`) as any[];

			// Aggregate by part → monthly average
			const partMap: Record<string, any> = {};
			for (const row of partsUsage) {
				const key = row.partNumber ?? row.partName;
				if (!partMap[key]) {
					partMap[key] = {
						partName:   row.partName,
						partNumber: row.partNumber,
						unitCost:   Number(row.unitCost ?? 0),
						monthlyData: {} as Record<number, number>,
					};
				}
				const m = Number(row.month);
				partMap[key].monthlyData[m] = (partMap[key].monthlyData[m] ?? 0) + Number(row.totalUsed);
			}

			const now = new Date();
			const predictions = Object.values(partMap).map((part: any) => {
				const counts = Object.values(part.monthlyData) as number[];
				const avgMonthly = counts.length
					? counts.reduce((a, b) => a + b, 0) / counts.length
					: 0;

				const forecastMonths = [];
				for (let i = 0; i < horizon; i++) {
					const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
					const month = d.getMonth() + 1;
					const multiplier = SEASONAL_MULTIPLIERS[month - 1] ?? 1;
					const predicted = Math.round(avgMonthly * multiplier);
					forecastMonths.push({
						period:         `${MONTH_NAMES[month - 1]} ${d.getFullYear()}`,
						month,
						predictedUnits: predicted,
						estimatedCost:  Math.round(predicted * part.unitCost * 100) / 100,
					});
				}

				const totalPredictedUnits = forecastMonths.reduce((s, m) => s + m.predictedUnits, 0);
				const totalPredictedCost  = forecastMonths.reduce((s, m) => s + m.estimatedCost, 0);

				return {
					partName:            part.partName,
					partNumber:          part.partNumber,
					unitCost:            part.unitCost,
					avgMonthlyUsage:     Math.round(avgMonthly * 10) / 10,
					forecast:            forecastMonths,
					totalPredictedUnits,
					totalPredictedCost:  Math.round(totalPredictedCost * 100) / 100,
				};
			}).sort((a: any, b: any) => b.totalPredictedUnits - a.totalPredictedUnits);

			return {
				horizon,
				parts: predictions,
				totalParts: predictions.length,
			};
		});
	});
}