// services/routes/branchRoutes.ts
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const createBranchSchema = z.object({
    name: z.string().min(1, "Name is required"),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().min(2).max(2).optional(),
    zip: z.string().min(5).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    companyId: z.string().uuid().optional() // dev only
});
const updateBranchSchema = z
    .object({
    name: z.string().min(1).optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().min(2).max(2).optional(),
    zip: z.string().min(5).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    isActive: z.boolean().optional()
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
export async function branchRoutes(fastify) {
    // ----------------------------------------------------------
    // POST /branches
    // Creates a branch under the caller's company.
    // Branches are physical locations — service areas, offices.
    // Employees and customers are tied to branches.
    // ----------------------------------------------------------
    fastify.post("/branches", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const parsed = createBranchSchema.safeParse(request.body);
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
        const result = (await sql `
			INSERT INTO branches (company_id, name, address, city, state, zip, phone, email)
			VALUES (
				${companyId},
				${body.name},
				${body.address ?? null},
				${body.city ?? null},
				${body.state ?? null},
				${body.zip ?? null},
				${body.phone ?? null},
				${body.email ?? null}
			)
			RETURNING id, name, address, city, state, zip, phone, email, is_active AS "isActive", created_at AS "createdAt"
		`);
        return reply.code(201).send({ branch: result[0] });
    });
    // ----------------------------------------------------------
    // GET /branches
    // Lists all active branches for the caller's company.
    // Includes employee count per branch — useful for dispatch UI.
    // ----------------------------------------------------------
    fastify.get("/branches", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const companyId = resolveCompanyId(user);
        if (!companyId && !isDev(user)) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const sql = getSql();
        const branches = isDev(user) && !companyId
            ? await sql `
				SELECT
					b.id, b.name, b.address, b.city, b.state, b.zip,
					b.phone, b.email,
					b.is_active  AS "isActive",
					b.created_at AS "createdAt",
					COUNT(e.id)::int AS "employeeCount"
				FROM branches b
				LEFT JOIN employees e ON e.branch_id = b.id AND e.is_available = true
				WHERE b.is_active = true
				GROUP BY b.id
				ORDER BY b.name ASC
			`
            : await sql `
				SELECT
					b.id, b.name, b.address, b.city, b.state, b.zip,
					b.phone, b.email,
					b.is_active  AS "isActive",
					b.created_at AS "createdAt",
					COUNT(e.id)::int AS "employeeCount"
				FROM branches b
				LEFT JOIN employees e ON e.branch_id = b.id AND e.is_available = true
				WHERE b.company_id = ${companyId} AND b.is_active = true
				GROUP BY b.id
				ORDER BY b.name ASC
			`;
        return reply.send({ branches });
    });
    // ----------------------------------------------------------
    // GET /branches/:branchId
    // Single branch with employee list.
    // ----------------------------------------------------------
    fastify.get("/branches/:branchId", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const { branchId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const branchResult = isDev(user)
            ? await sql `
				SELECT
					id, name, address, city, state, zip, phone, email,
					is_active  AS "isActive",
					created_at AS "createdAt",
					updated_at AS "updatedAt"
				FROM branches
				WHERE id = ${branchId}
			`
            : await sql `
				SELECT
					id, name, address, city, state, zip, phone, email,
					is_active  AS "isActive",
					created_at AS "createdAt",
					updated_at AS "updatedAt"
				FROM branches
				WHERE id = ${branchId} AND company_id = ${companyId}
			`;
        if (!branchResult[0]) {
            return reply.code(404).send({ error: "Branch not found" });
        }
        // Employees at this branch
        const employees = await sql `
			SELECT
				id, name, email, phone, role, skills,
				is_available  AS "isAvailable",
				rating,
				created_at    AS "createdAt"
			FROM employees
			WHERE branch_id = ${branchId}
			ORDER BY name ASC
		`;
        return reply.send({ branch: branchResult[0], employees });
    });
    // ----------------------------------------------------------
    // PATCH /branches/:branchId
    // Partial update on a branch.
    // ----------------------------------------------------------
    fastify.patch("/branches/:branchId", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const { branchId } = request.params;
        const parsed = updateBranchSchema.safeParse(request.body);
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
            ["name", body.name],
            ["address", body.address],
            ["city", body.city],
            ["state", body.state],
            ["zip", body.zip],
            ["phone", body.phone],
            ["email", body.email],
            ["is_active", body.isActive]
        ]);
        const fullClause = [clause, "updated_at = NOW()"].join(", ");
        let idx = nextIdx;
        const whereValues = [...values, branchId];
        let where = `WHERE id = $${idx++}`;
        if (!isDev(user)) {
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            whereValues.push(companyId);
            where += ` AND company_id = $${idx++}`;
        }
        const raw = await sql.unsafe(`UPDATE branches SET ${fullClause} ${where} RETURNING id`, whereValues);
        const result = Array.isArray(raw) ? raw : (raw?.rows ?? []);
        if (!result[0])
            return reply.code(404).send({ error: "Branch not found" });
        return reply.send({ message: "Branch updated", branchId: result[0].id });
    });
    // ----------------------------------------------------------
    // DELETE /branches/:branchId
    // Soft delete. Employees assigned to this branch keep their
    // branch_id — they just need to be reassigned before dispatch.
    // ----------------------------------------------------------
    fastify.delete("/branches/:branchId", {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const user = getUser(request);
        const { branchId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        if (!isDev(user) && !companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const result = isDev(user)
            ? (await sql `
				UPDATE branches SET is_active = false, updated_at = NOW()
				WHERE id = ${branchId}
				RETURNING id
			`)
            : (await sql `
				UPDATE branches SET is_active = false, updated_at = NOW()
				WHERE id = ${branchId} AND company_id = ${companyId}
				RETURNING id
			`);
        if (!result[0])
            return reply.code(404).send({ error: "Branch not found" });
        return reply.send({
            message: "Branch deactivated",
            branchId: result[0].id
        });
    });
}
