// services/routes/regionRoutes.ts
// Multi-region branch management — group branches by region, route jobs regionally
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const createRegionSchema = z.object({
	name: z.string().min(1).max(120),
	timezone: z.string().min(1).default("America/Chicago"),
	states: z.array(z.string().length(2)).min(1), // e.g. ["TX", "OK"]
	zipPrefixes: z.array(z.string().min(3)).optional(), // e.g. ["750", "751"]
	managerUserId: z.string().uuid().optional(),
	notes: z.string().optional()
});
const updateRegionSchema = z
	.object({
		name: z.string().min(1).max(120).optional(),
		timezone: z.string().optional(),
		states: z.array(z.string().length(2)).min(1).optional(),
		zipPrefixes: z.array(z.string().min(3)).optional(),
		managerUserId: z.string().uuid().nullable().optional(),
		notes: z.string().optional(),
		isActive: z.boolean().optional()
	})
	.refine((d) => Object.keys(d).length > 0, {
		message: "At least one field required"
	});
const assignBranchSchema = z.object({
	branchId: z.string().uuid()
});
const listRegionsSchema = z.object({
	companyId: z.string().uuid().optional(),
	isActive: z.coerce.boolean().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});
// ============================================================
// Route handlers
// ============================================================
export function listRegions(fastify) {
	fastify.get("/regions", async (request, reply) => {
		const user = request.user;
		const isDev = user.role === "dev";
		const parsed = listRegionsSchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid query",
				details: z.treeifyError(parsed.error)
			});
		}
		const { isActive, limit, offset } = parsed.data;
		const effectiveCompanyId = isDev
			? (parsed.data.companyId ?? null)
			: (user.companyId ?? null);
		const sql = getSql();
		const regions = await sql`
			SELECT
				r.id,
				r.company_id        AS "companyId",
				r.name,
				r.timezone,
				r.states,
				r.zip_prefixes      AS "zipPrefixes",
				r.manager_user_id   AS "managerUserId",
				r.notes,
				r.is_active         AS "isActive",
				r.created_at        AS "createdAt",
				r.updated_at        AS "updatedAt",
				COUNT(b.id)::int    AS "branchCount"
			FROM regions r
			LEFT JOIN branches b ON b.region_id = r.id AND b.is_active = TRUE
			WHERE TRUE
			  AND (${effectiveCompanyId}::uuid IS NULL OR r.company_id = ${effectiveCompanyId})
			  AND (${isActive ?? null}::boolean IS NULL OR r.is_active = ${isActive ?? null})
			GROUP BY r.id
			ORDER BY r.name
			LIMIT ${limit} OFFSET ${offset}
		`;
		return { regions };
	});
}
export function getRegion(fastify) {
	fastify.get("/regions/:regionId", async (request, reply) => {
		const user = request.user;
		const isDev = user.role === "dev";
		const { regionId } = request.params;
		const sql = getSql();
		const [region] = await sql`
			SELECT
				r.id, r.company_id AS "companyId", r.name, r.timezone,
				r.states, r.zip_prefixes AS "zipPrefixes",
				r.manager_user_id AS "managerUserId", r.notes,
				r.is_active AS "isActive", r.created_at AS "createdAt"
			FROM regions r
			WHERE r.id = ${regionId}
			  AND (${isDev} OR r.company_id = ${user.companyId ?? ""})
		`;
		if (!region) return reply.code(404).send({ error: "Region not found" });
		// Attach branches
		const branches = await sql`
			SELECT id, name, address, city, state, zip, is_active AS "isActive"
			FROM branches
			WHERE region_id = ${regionId}
			ORDER BY name
		`;
		return { region: { ...region, branches } };
	});
}
export function createRegion(fastify) {
	fastify.post("/regions", async (request, reply) => {
		const user = request.user;
		if (user.role !== "admin" && user.role !== "dev") {
			return reply
				.code(403)
				.send({ error: "Forbidden - Admin access required" });
		}
		const parsed = createRegionSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply
				.code(400)
				.send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
		}
		const { name, timezone, states, zipPrefixes, managerUserId, notes } =
			parsed.data;
		const companyId = user.companyId;
		if (!companyId)
			return reply.code(403).send({ error: "No company on token" });
		const sql = getSql();
		const [region] = await sql`
			INSERT INTO regions (
				company_id, name, timezone, states, zip_prefixes, manager_user_id, notes
			) VALUES (
				${companyId}, ${name}, ${timezone},
				${JSON.stringify(states)}, ${zipPrefixes ? JSON.stringify(zipPrefixes) : null},
				${managerUserId ?? null}, ${notes ?? null}
			)
			RETURNING id, name, timezone, states, zip_prefixes AS "zipPrefixes",
			          is_active AS "isActive", created_at AS "createdAt"
		`;
		return reply.code(201).send({ region });
	});
}
export function updateRegion(fastify) {
	fastify.patch("/regions/:regionId", async (request, reply) => {
		const user = request.user;
		if (user.role !== "admin" && user.role !== "dev") {
			return reply
				.code(403)
				.send({ error: "Forbidden - Admin access required" });
		}
		const { regionId } = request.params;
		const parsed = updateRegionSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply
				.code(400)
				.send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
		}
		const d = parsed.data;
		const sql = getSql();
		const [region] = await sql`
			UPDATE regions SET
				name             = COALESCE(${d.name ?? null}, name),
				timezone         = COALESCE(${d.timezone ?? null}, timezone),
				states           = COALESCE(${d.states ? JSON.stringify(d.states) : null}::jsonb, states),
				zip_prefixes     = COALESCE(${d.zipPrefixes ? JSON.stringify(d.zipPrefixes) : null}::jsonb, zip_prefixes),
				manager_user_id  = COALESCE(${d.managerUserId ?? null}, manager_user_id),
				notes            = COALESCE(${d.notes ?? null}, notes),
				is_active        = COALESCE(${d.isActive ?? null}, is_active),
				updated_at       = NOW()
			WHERE id = ${regionId}
			  AND (${user.role === "dev"} OR company_id = ${user.companyId ?? ""})
			RETURNING id, name, is_active AS "isActive", updated_at AS "updatedAt"
		`;
		if (!region) return reply.code(404).send({ error: "Region not found" });
		return { region };
	});
}
export function assignBranchToRegion(fastify) {
	fastify.post("/regions/:regionId/branches", async (request, reply) => {
		const user = request.user;
		if (user.role !== "admin" && user.role !== "dev") {
			return reply
				.code(403)
				.send({ error: "Forbidden - Admin access required" });
		}
		const { regionId } = request.params;
		const parsed = assignBranchSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply
				.code(400)
				.send({ error: "Invalid body", details: z.treeifyError(parsed.error) });
		}
		const { branchId } = parsed.data;
		const sql = getSql();
		const [branch] = await sql`
			UPDATE branches
			SET region_id = ${regionId}, updated_at = NOW()
			WHERE id = ${branchId}
			  AND (${user.role === "dev"} OR company_id = ${user.companyId ?? ""})
			RETURNING id, name, region_id AS "regionId"
		`;
		if (!branch) return reply.code(404).send({ error: "Branch not found" });
		return { branch };
	});
}
export function removeBranchFromRegion(fastify) {
	fastify.delete(
		"/regions/:regionId/branches/:branchId",
		async (request, reply) => {
			const user = request.user;
			if (user.role !== "admin" && user.role !== "dev") {
				return reply
					.code(403)
					.send({ error: "Forbidden - Admin access required" });
			}
			const { branchId } = request.params;
			const sql = getSql();
			const [branch] = await sql`
			UPDATE branches
			SET region_id = NULL, updated_at = NOW()
			WHERE id = ${branchId}
			  AND (${user.role === "dev"} OR company_id = ${user.companyId ?? ""})
			RETURNING id, name
		`;
			if (!branch) return reply.code(404).send({ error: "Branch not found" });
			return { branch };
		}
	);
}
export async function regionRoutes(fastify) {
	fastify.register(async (authed) => {
		authed.addHook("onRequest", authenticate);
		listRegions(authed);
		getRegion(authed);
		createRegion(authed);
		updateRegion(authed);
		assignBranchToRegion(authed);
		removeBranchFromRegion(authed);
	});
}
