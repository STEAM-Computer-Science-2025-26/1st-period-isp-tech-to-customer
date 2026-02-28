// services/routes/kpiRoutes.ts
// KPI threshold management + alert log.

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const createThresholdSchema = z
	.object({
		metricKey: z.string().min(1),
		warnBelow: z.number().optional(),
		critBelow: z.number().optional(),
		warnAbove: z.number().optional(),
		critAbove: z.number().optional()
	})
	.refine(
		(d) =>
			d.warnBelow != null ||
			d.critBelow != null ||
			d.warnAbove != null ||
			d.critAbove != null,
		{ message: "At least one threshold value required" }
	);

const updateThresholdSchema = z
	.object({
		warnBelow: z.number().optional(),
		critBelow: z.number().optional(),
		warnAbove: z.number().optional(),
		critAbove: z.number().optional()
	})
	.refine((d) => Object.keys(d).length > 0, {
		message: "At least one field required"
	});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getUser(request: any): JWTPayload {
	return request.user as JWTPayload;
}

function resolveCompanyId(user: JWTPayload): string | null {
	return user.companyId ?? null;
}

function isDev(user: JWTPayload): boolean {
	return user.role === "dev";
}

// ─────────────────────────────────────────────────────────────────────────────
// Core KPI evaluation
// ─────────────────────────────────────────────────────────────────────────────

export async function evaluateKpiThresholds(companyId: string): Promise<{
	evaluated: number;
	fired: number;
}> {
	const sql = getSql();

	const thresholds = (await sql`
    SELECT * FROM kpi_thresholds
    WHERE company_id = ${companyId}
  `) as any[];

	if (thresholds.length === 0) return { evaluated: 0, fired: 0 };

	const [metrics] = (await sql`
    SELECT
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE jc.first_time_fix = TRUE)
        / NULLIF(COUNT(jc.id), 0), 2
      ) AS first_time_fix_rate,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE jc.callback_required = TRUE)
        / NULLIF(COUNT(jc.id), 0), 2
      ) AS callback_rate,
      ROUND(AVG(jc.customer_rating), 2) AS avg_customer_rating,
      COUNT(jc.id) AS jobs_completed_30d
    FROM job_completions jc
    JOIN jobs j ON j.id = jc.job_id
    WHERE j.company_id = ${companyId}
      AND jc.completed_at >= NOW() - INTERVAL '30 days'
  `) as any[];

	const metricValues: Record<string, number | null> = {
		first_time_fix_rate:
			metrics?.first_time_fix_rate != null
				? parseFloat(metrics.first_time_fix_rate)
				: null,
		callback_rate:
			metrics?.callback_rate != null ? parseFloat(metrics.callback_rate) : null,
		avg_customer_rating:
			metrics?.avg_customer_rating != null
				? parseFloat(metrics.avg_customer_rating)
				: null,
		jobs_completed_30d:
			metrics?.jobs_completed_30d != null
				? parseInt(metrics.jobs_completed_30d)
				: null
	};

	let fired = 0;

	for (const threshold of thresholds) {
		const value = metricValues[threshold.metric_key];
		if (value === null || value === undefined) continue;

		const checks = [
			{
				level: "warning",
				breach: threshold.warn_below != null && value < threshold.warn_below
			},
			{
				level: "critical",
				breach: threshold.crit_below != null && value < threshold.crit_below
			},
			{
				level: "warning",
				breach: threshold.warn_above != null && value > threshold.warn_above
			},
			{
				level: "critical",
				breach: threshold.crit_above != null && value > threshold.crit_above
			}
		];

		for (const check of checks) {
			if (!check.breach) continue;

			// Suppress duplicate — skip if same unresolved alert fired in last hour
			const existing = (await sql`
        SELECT id FROM kpi_alerts
        WHERE company_id  = ${companyId}
          AND alert_type  = ${threshold.metric_key}
          AND severity    = ${check.level}
          AND is_resolved = FALSE
          AND created_at  > NOW() - INTERVAL '1 hour'
        LIMIT 1
      `) as any[];

			if (existing[0]) continue;

			const thresholdValue =
				threshold.warn_below ??
				threshold.crit_below ??
				threshold.warn_above ??
				threshold.crit_above;

			await sql`
        INSERT INTO kpi_alerts (
          company_id, alert_type, severity,
          title, message,
          metric_value, threshold,
          is_read, is_resolved,
          created_at
        ) VALUES (
          ${companyId},
          ${threshold.metric_key},
          ${check.level},
          ${`KPI Alert: ${threshold.metric_key.replace(/_/g, " ")}`},
          ${`${threshold.metric_key.replace(/_/g, " ")} is ${value} — ${check.level} threshold breached.`},
          ${value},
          ${thresholdValue},
          FALSE, FALSE,
          NOW()
        )
      `;
			fired++;
		}
	}

	return { evaluated: thresholds.length, fired };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function kpiRoutes(fastify: FastifyInstance) {
	fastify.get(
		"/kpi/thresholds",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });
			const sql = getSql();
			const rows = (await sql`
      SELECT * FROM kpi_thresholds
      WHERE company_id = ${companyId}
      ORDER BY metric_key
    `) as any[];
			// Cast numeric fields
			const thresholds = rows.map((row) => ({
				...row,
				warn_below: row.warn_below != null ? parseFloat(row.warn_below) : null,
				crit_below: row.crit_below != null ? parseFloat(row.crit_below) : null,
				warn_above: row.warn_above != null ? parseFloat(row.warn_above) : null,
				crit_above: row.crit_above != null ? parseFloat(row.crit_above) : null
			}));
			return { thresholds };
		}
	);

	fastify.post(
		"/kpi/thresholds",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });

			const parsed = createThresholdSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply
					.code(400)
					.send({
						error: "Invalid request body",
						details: parsed.error.flatten().fieldErrors
					});
			}

			const body = parsed.data;
			const sql = getSql();

			const [row] = (await sql`
      INSERT INTO kpi_thresholds (
        company_id, metric_key,
        warn_below, crit_below,
        warn_above, crit_above,
        updated_at
      ) VALUES (
        ${companyId}, ${body.metricKey},
        ${body.warnBelow ?? null}, ${body.critBelow ?? null},
        ${body.warnAbove ?? null}, ${body.critAbove ?? null},
        NOW()
      )
      ON CONFLICT (company_id, metric_key)
      DO UPDATE SET
        warn_below = EXCLUDED.warn_below,
        crit_below = EXCLUDED.crit_below,
        warn_above = EXCLUDED.warn_above,
        crit_above = EXCLUDED.crit_above,
        updated_at = NOW()
      RETURNING *
    `) as any[];

			return reply.code(201).send({
				threshold: {
					...row,
					warn_below:
						row.warn_below != null ? parseFloat(row.warn_below) : null,
					crit_below:
						row.crit_below != null ? parseFloat(row.crit_below) : null,
					warn_above:
						row.warn_above != null ? parseFloat(row.warn_above) : null,
					crit_above: row.crit_above != null ? parseFloat(row.crit_above) : null
				}
			});
		}
	);

	fastify.patch(
		"/kpi/thresholds/:id",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const { id } = request.params as { id: string };

			const parsed = updateThresholdSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply
					.code(400)
					.send({
						error: "Invalid request body",
						details: parsed.error.flatten().fieldErrors
					});
			}

			const body = parsed.data;
			const sql = getSql();

			const [row] = (await sql`
      UPDATE kpi_thresholds SET
        warn_below = COALESCE(${body.warnBelow ?? null}, warn_below),
        crit_below = COALESCE(${body.critBelow ?? null}, crit_below),
        warn_above = COALESCE(${body.warnAbove ?? null}, warn_above),
        crit_above = COALESCE(${body.critAbove ?? null}, crit_above),
        updated_at = NOW()
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING *
    `) as any[];

			if (!row) return reply.code(404).send({ error: "Threshold not found" });

			return reply.send({
				threshold: {
					...row,
					warn_below:
						row.warn_below != null ? parseFloat(row.warn_below) : null,
					crit_below:
						row.crit_below != null ? parseFloat(row.crit_below) : null,
					warn_above:
						row.warn_above != null ? parseFloat(row.warn_above) : null,
					crit_above: row.crit_above != null ? parseFloat(row.crit_above) : null
				}
			});
		}
	);

	fastify.delete(
		"/kpi/thresholds/:id",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const { id } = request.params as { id: string };
			const sql = getSql();

			const [row] = (await sql`
      DELETE FROM kpi_thresholds
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING id
    `) as any[];

			if (!row) return reply.code(404).send({ error: "Threshold not found" });
			return { deleted: true, id: row.id };
		}
	);

	fastify.get(
		"/kpi/alerts",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });

			const query = request.query as any;
			const unreadOnly = query.unreadOnly === "true";
			const limit = Math.min(parseInt(query.limit ?? "50", 10), 200);
			const sql = getSql();

			const rows = (await sql`
      SELECT * FROM kpi_alerts
      WHERE company_id = ${companyId}
        AND (${!unreadOnly} OR is_read = FALSE)
      ORDER BY is_read ASC, created_at DESC
      LIMIT ${limit}
    `) as any[];

			const [countRow] = (await sql`
      SELECT COUNT(*) AS count FROM kpi_alerts
      WHERE company_id = ${companyId}
        AND is_read = FALSE AND is_resolved = FALSE
    `) as any[];

			return {
				alerts: rows,
				unreadCount: parseInt(countRow?.count ?? "0")
			};
		}
	);

	fastify.patch(
		"/kpi/alerts/:id/read",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const { id } = request.params as { id: string };
			const sql = getSql();

			const [row] = (await sql`
      UPDATE kpi_alerts SET is_read = TRUE
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING id
    `) as any[];

			if (!row) return reply.code(404).send({ error: "Alert not found" });
			return { updated: true };
		}
	);

	fastify.patch(
		"/kpi/alerts/:id/resolve",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const { id } = request.params as { id: string };
			const sql = getSql();

			const [row] = (await sql`
      UPDATE kpi_alerts SET
        is_read = TRUE,
        is_resolved = TRUE,
        resolved_at = NOW()
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING id
    `) as any[];

			if (!row) return reply.code(404).send({ error: "Alert not found" });
			return { resolved: true };
		}
	);

	fastify.post(
		"/kpi/check",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			if (!companyId && !isDev(user))
				return reply.code(403).send({ error: "Forbidden" });

			const result = await evaluateKpiThresholds(companyId!);
			return { ok: true, ...result };
		}
	);
}
