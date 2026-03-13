// services/routes/leadsRoutes.ts
//
// POST /public/leads — public endpoint for capturing resource hub leads.
// No auth required. Upserts into resource_leads on conflict (email).

import type { FastifyInstance } from "fastify";
import { getSql } from "../../db/connection";

export async function leadsRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.post("/leads", async (request, reply) => {
		const body = request.body as {
			email?: unknown;
			firstName?: unknown;
			lastName?: unknown;
			businessName?: unknown;
			phone?: unknown;
			techCount?: unknown;
			source?: unknown;
			toolsUsed?: unknown;
		};

		const email =
			typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

		if (!email || !email.includes("@") || email.length > 254) {
			return reply.code(400).send({ error: "Valid email required" });
		}

		const firstName =
			typeof body.firstName === "string"
				? body.firstName.trim().slice(0, 80)
				: null;
		const lastName =
			typeof body.lastName === "string"
				? body.lastName.trim().slice(0, 80)
				: null;
		const businessName =
			typeof body.businessName === "string"
				? body.businessName.trim().slice(0, 120)
				: null;
		const phone =
			typeof body.phone === "string" ? body.phone.trim().slice(0, 30) : null;

		const rawTechCount = body.techCount;
		const techCount =
			rawTechCount != null ? parseInt(String(rawTechCount), 10) : null;

		if (
			techCount !== null &&
			(isNaN(techCount) || techCount < 0 || techCount > 9999)
		) {
			return reply.code(400).send({ error: "Invalid tech count" });
		}

		const source =
			typeof body.source === "string" ? body.source : "resource_hub";
		const toolsUsed = Array.isArray(body.toolsUsed) ? body.toolsUsed : [];

		const sql = getSql();
		const rows = await sql`
			INSERT INTO resource_leads (
				email, first_name, last_name, business_name,
				phone, tech_count, source, tools_used
			) VALUES (
				${email}, ${firstName}, ${lastName}, ${businessName},
				${phone}, ${techCount}, ${source}, ${toolsUsed}
			)
			ON CONFLICT (email) DO UPDATE SET
				first_name    = COALESCE(EXCLUDED.first_name,    resource_leads.first_name),
				last_name     = COALESCE(EXCLUDED.last_name,     resource_leads.last_name),
				business_name = COALESCE(EXCLUDED.business_name, resource_leads.business_name),
				phone         = COALESCE(EXCLUDED.phone,         resource_leads.phone),
				tech_count    = COALESCE(EXCLUDED.tech_count,    resource_leads.tech_count),
				tools_used    = ARRAY(
					SELECT DISTINCT unnest(resource_leads.tools_used || EXCLUDED.tools_used)
				),
				created_at    = NOW()
			RETURNING
				id, email, first_name, last_name, business_name,
				phone, tech_count, source, tools_used, created_at
		`;

		return reply.send({ ok: true, lead: rows[0] ?? null });
	});
}
