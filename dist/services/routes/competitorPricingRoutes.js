// services/routes/competitorPricingRoutes.ts
// Competitor pricing intelligence.
//
// Endpoints:
//   POST   /competitor-pricing              — log a competitor price observation
//   GET    /competitor-pricing              — list observations (filterable)
//   GET    /competitor-pricing/summary      — aggregated benchmarks vs your pricebook
//   PUT    /competitor-pricing/:id          — update an observation
//   DELETE /competitor-pricing/:id          — remove an observation
//
// Design intent:
//   There is no public HVAC pricing API, so this is a manual-entry + analysis
//   system. Techs and admins log prices they learn about (from customer mentions,
//   flyers, online reviews, etc.). The summary endpoint compares those prices
//   against the company's own pricebook to surface where you're over/under.
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ─── Schemas ──────────────────────────────────────────────────────────────────
const createObservationSchema = z.object({
    competitorName: z.string().min(1).max(120),
    serviceType: z.string().min(1).max(120), // e.g. "AC tune-up", "refrigerant recharge"
    pricebookItemId: z.string().uuid().optional(), // link to your own item for comparison
    competitorPrice: z.number().positive(),
    unit: z.enum(["flat", "per_lb", "per_hour", "per_unit"]).default("flat"),
    source: z.enum([
        "customer_mention",
        "website",
        "flyer",
        "phone_quote",
        "review_site",
        "other"
    ]),
    zip: z.string().min(5).max(10).optional(),
    notes: z.string().max(1000).optional(),
    observedOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(), // YYYY-MM-DD
    companyId: z.string().uuid().optional() // dev only
});
const updateObservationSchema = z
    .object({
    competitorName: z.string().min(1).max(120).optional(),
    serviceType: z.string().min(1).max(120).optional(),
    pricebookItemId: z.string().uuid().optional().nullable(),
    competitorPrice: z.number().positive().optional(),
    unit: z.enum(["flat", "per_lb", "per_hour", "per_unit"]).optional(),
    source: z
        .enum([
        "customer_mention",
        "website",
        "flyer",
        "phone_quote",
        "review_site",
        "other"
    ])
        .optional(),
    zip: z.string().min(5).max(10).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    observedOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field required"
});
const listSchema = z.object({
    companyId: z.string().uuid().optional(),
    competitorName: z.string().optional(),
    serviceType: z.string().optional(),
    source: z
        .enum([
        "customer_mention",
        "website",
        "flyer",
        "phone_quote",
        "review_site",
        "other"
    ])
        .optional(),
    zip: z.string().optional(),
    since: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
const summarySchema = z.object({
    companyId: z.string().uuid().optional(),
    since: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    serviceType: z.string().optional()
});
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getUser(req) {
    return req.user;
}
function resolveCompanyId(user, body) {
    if (user.role === "dev")
        return body ?? user.companyId ?? null;
    return user.companyId ?? null;
}
// ─── Routes ──────────────────────────────────────────────────────────────────
export async function competitorPricingRoutes(fastify) {
    fastify.register(async (r) => {
        r.addHook("onRequest", authenticate);
        // ── POST /competitor-pricing ──────────────────────────────────────────
        r.post("/competitor-pricing", async (request, reply) => {
            const user = getUser(request);
            const parsed = createObservationSchema.safeParse(request.body);
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
            // If pricebookItemId provided, validate it belongs to this company
            if (body.pricebookItemId) {
                const [item] = (await sql `
					SELECT id FROM pricebook_items
					WHERE id = ${body.pricebookItemId} AND company_id = ${companyId}
				`);
                if (!item)
                    return reply
                        .code(400)
                        .send({ error: "Pricebook item not found or not in your company" });
            }
            const [row] = (await sql `
				INSERT INTO competitor_pricing_observations (
					company_id,
					competitor_name,
					service_type,
					pricebook_item_id,
					competitor_price,
					unit,
					source,
					zip,
					notes,
					observed_on,
					recorded_by_user_id
				) VALUES (
					${companyId},
					${body.competitorName},
					${body.serviceType},
					${body.pricebookItemId ?? null},
					${body.competitorPrice},
					${body.unit},
					${body.source},
					${body.zip ?? null},
					${body.notes ?? null},
					${body.observedOn ?? new Date().toISOString().split("T")[0]},
					${user.userId ?? user.id ?? null}
				)
				RETURNING
					id,
					company_id          AS "companyId",
					competitor_name     AS "competitorName",
					service_type        AS "serviceType",
					pricebook_item_id   AS "pricebookItemId",
					competitor_price    AS "competitorPrice",
					unit,
					source,
					zip,
					notes,
					observed_on         AS "observedOn",
					created_at          AS "createdAt"
			`);
            return reply.code(201).send({ observation: row });
        });
        // ── GET /competitor-pricing ───────────────────────────────────────────
        r.get("/competitor-pricing", async (request, reply) => {
            const user = getUser(request);
            const parsed = listSchema.safeParse(request.query);
            if (!parsed.success) {
                return reply
                    .code(400)
                    .send({
                    error: "Invalid query",
                    details: parsed.error.flatten().fieldErrors
                });
            }
            const { competitorName, serviceType, source, zip, since, limit, offset } = parsed.data;
            const companyId = resolveCompanyId(user, parsed.data.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const rows = (await sql `
				SELECT
					o.id,
					o.competitor_name     AS "competitorName",
					o.service_type        AS "serviceType",
					o.pricebook_item_id   AS "pricebookItemId",
					p.name                AS "pricebookItemName",
					p.price               AS "yourPrice",
					o.competitor_price    AS "competitorPrice",
					CASE
						WHEN p.price IS NOT NULL THEN
							ROUND(((o.competitor_price - p.price) / p.price * 100)::numeric, 1)
						ELSE NULL
					END                   AS "priceDeltaPct",
					o.unit,
					o.source,
					o.zip,
					o.notes,
					o.observed_on         AS "observedOn",
					o.created_at          AS "createdAt"
				FROM competitor_pricing_observations o
				LEFT JOIN pricebook_items p ON p.id = o.pricebook_item_id
				WHERE (${companyId}::uuid IS NULL OR o.company_id = ${companyId})
				  AND (${competitorName ?? null}::text IS NULL OR LOWER(o.competitor_name) LIKE '%' || LOWER(${competitorName ?? ""}) || '%')
				  AND (${serviceType ?? null}::text IS NULL OR LOWER(o.service_type) LIKE '%' || LOWER(${serviceType ?? ""}) || '%')
				  AND (${source ?? null}::text IS NULL OR o.source = ${source ?? null})
				  AND (${zip ?? null}::text IS NULL OR o.zip = ${zip ?? null})
				  AND (${since ?? null}::text IS NULL OR o.observed_on >= ${since ?? null}::date)
				ORDER BY o.observed_on DESC, o.created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`);
            const [{ total }] = (await sql `
				SELECT COUNT(*)::int AS total
				FROM competitor_pricing_observations o
				WHERE (${companyId}::uuid IS NULL OR o.company_id = ${companyId})
				  AND (${competitorName ?? null}::text IS NULL OR LOWER(o.competitor_name) LIKE '%' || LOWER(${competitorName ?? ""}) || '%')
				  AND (${serviceType ?? null}::text IS NULL OR LOWER(o.service_type) LIKE '%' || LOWER(${serviceType ?? ""}) || '%')
				  AND (${source ?? null}::text IS NULL OR o.source = ${source ?? null})
				  AND (${zip ?? null}::text IS NULL OR o.zip = ${zip ?? null})
				  AND (${since ?? null}::text IS NULL OR o.observed_on >= ${since ?? null}::date)
			`);
            return { observations: rows, total, limit, offset };
        });
        // ── GET /competitor-pricing/summary ───────────────────────────────────
        // Benchmarks your pricebook against logged competitor prices.
        r.get("/competitor-pricing/summary", async (request, reply) => {
            const user = getUser(request);
            const parsed = summarySchema.safeParse(request.query);
            if (!parsed.success) {
                return reply.code(400).send({ error: "Invalid query" });
            }
            const { since, serviceType } = parsed.data;
            const companyId = resolveCompanyId(user, parsed.data.companyId);
            if (!companyId && user.role !== "dev")
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            // Per-service-type aggregation with competitor min/avg/max vs your price
            const benchmarks = (await sql `
				SELECT
					o.service_type              AS "serviceType",
					COUNT(*)::int               AS "observationCount",
					COUNT(DISTINCT o.competitor_name)::int AS "competitorCount",
					MIN(o.competitor_price)     AS "competitorMin",
					ROUND(AVG(o.competitor_price)::numeric, 2) AS "competitorAvg",
					MAX(o.competitor_price)     AS "competitorMax",
					-- Most recently linked pricebook price (if any)
					MAX(p.price)                AS "yourPrice",
					-- Positive = you're more expensive; negative = you're cheaper
					ROUND(
						(MAX(p.price) - AVG(o.competitor_price))::numeric / NULLIF(AVG(o.competitor_price), 0) * 100,
						1
					)                           AS "positionVsAvgPct"
				FROM competitor_pricing_observations o
				LEFT JOIN pricebook_items p ON p.id = o.pricebook_item_id
				WHERE o.company_id = ${companyId}
				  AND (${since ?? null}::text IS NULL OR o.observed_on >= ${since ?? null}::date)
				  AND (${serviceType ?? null}::text IS NULL OR LOWER(o.service_type) LIKE '%' || LOWER(${serviceType ?? ""}) || '%')
				GROUP BY o.service_type
				ORDER BY "observationCount" DESC
			`);
            // Top competitors by mention count
            const topCompetitors = (await sql `
				SELECT
					competitor_name   AS "competitorName",
					COUNT(*)::int     AS "mentions",
					ROUND(AVG(competitor_price)::numeric, 2) AS "avgPrice",
					MIN(observed_on)  AS "firstSeen",
					MAX(observed_on)  AS "lastSeen"
				FROM competitor_pricing_observations
				WHERE company_id = ${companyId}
				  AND (${since ?? null}::text IS NULL OR observed_on >= ${since ?? null}::date)
				GROUP BY competitor_name
				ORDER BY mentions DESC
				LIMIT 10
			`);
            // Overall position summary
            const [overall] = (await sql `
				SELECT
					COUNT(*)::int AS "totalObservations",
					COUNT(DISTINCT competitor_name)::int AS "uniqueCompetitors",
					COUNT(DISTINCT service_type)::int    AS "trackedServices",
					SUM(CASE WHEN p.price < o.competitor_price THEN 1 ELSE 0 END)::int AS "servicesWhereCheaper",
					SUM(CASE WHEN p.price > o.competitor_price THEN 1 ELSE 0 END)::int AS "servicesWhereExpensive",
					SUM(CASE WHEN p.price IS NULL THEN 1 ELSE 0 END)::int              AS "servicesUnlinked"
				FROM competitor_pricing_observations o
				LEFT JOIN pricebook_items p ON p.id = o.pricebook_item_id
				WHERE o.company_id = ${companyId}
				  AND (${since ?? null}::text IS NULL OR o.observed_on >= ${since ?? null}::date)
			`);
            return {
                summary: overall,
                benchmarks,
                topCompetitors
            };
        });
        // ── PUT /competitor-pricing/:id ───────────────────────────────────────
        r.put("/competitor-pricing/:id", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const parsed = updateObservationSchema.safeParse(request.body);
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
				SELECT id FROM competitor_pricing_observations WHERE id = ${id} AND company_id = ${companyId}
			`);
            if (!existing)
                return reply.code(404).send({ error: "Observation not found" });
            const b = parsed.data;
            const [updated] = (await sql `
				UPDATE competitor_pricing_observations SET
					competitor_name   = COALESCE(${b.competitorName ?? null}, competitor_name),
					service_type      = COALESCE(${b.serviceType ?? null}, service_type),
					pricebook_item_id = CASE WHEN ${b.pricebookItemId !== undefined ? "true" : "false"} = 'true' THEN ${b.pricebookItemId ?? null} ELSE pricebook_item_id END,
					competitor_price  = COALESCE(${b.competitorPrice ?? null}, competitor_price),
					unit              = COALESCE(${b.unit ?? null}, unit),
					source            = COALESCE(${b.source ?? null}, source),
					zip               = CASE WHEN ${b.zip !== undefined ? "true" : "false"} = 'true' THEN ${b.zip ?? null} ELSE zip END,
					notes             = CASE WHEN ${b.notes !== undefined ? "true" : "false"} = 'true' THEN ${b.notes ?? null} ELSE notes END,
					observed_on       = COALESCE(${b.observedOn ?? null}::date, observed_on),
					updated_at        = NOW()
				WHERE id = ${id}
				RETURNING
					id,
					competitor_name   AS "competitorName",
					service_type      AS "serviceType",
					pricebook_item_id AS "pricebookItemId",
					competitor_price  AS "competitorPrice",
					unit, source, zip, notes,
					observed_on       AS "observedOn",
					updated_at        AS "updatedAt"
			`);
            return { observation: updated };
        });
        // ── DELETE /competitor-pricing/:id ────────────────────────────────────
        r.delete("/competitor-pricing/:id", async (request, reply) => {
            const user = getUser(request);
            const { id } = request.params;
            const companyId = resolveCompanyId(user);
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            const sql = getSql();
            const [deleted] = (await sql `
				DELETE FROM competitor_pricing_observations
				WHERE id = ${id} AND company_id = ${companyId}
				RETURNING id
			`);
            if (!deleted)
                return reply.code(404).send({ error: "Observation not found" });
            return { deleted: true, id };
        });
    });
}
