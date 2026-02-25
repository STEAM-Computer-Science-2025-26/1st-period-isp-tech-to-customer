import { query } from "../../db";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const createCompanySchema = z.object({
    name: z.string().min(1)
});
const updateCompanySchema = z
    .object({
    name: z.string().min(1).optional(),
    dispatchSettings: z
        .object({
        emergencyOnlyAfterTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
            .nullable()
            .optional()
    })
        .optional()
})
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided"
});
// ============================================================
// Route handlers
// ============================================================
export function getCompany(fastify) {
    fastify.get("/company/:companyId", async (request, reply) => {
        const authUser = request.user;
        const isDev = authUser?.role === "dev";
        const { companyId } = request.params;
        if (!isDev && authUser?.companyId !== companyId) {
            return reply
                .code(403)
                .send({ error: "Forbidden - Cannot access other company's data" });
        }
        const result = (await query(`SELECT
				id, name,
				dispatch_settings AS "dispatchSettings",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM companies
			WHERE id = $1`, [companyId]));
        if (!result[0]) {
            return reply.code(404).send({ error: "Company not found" });
        }
        return { company: result[0] };
    });
}
export function createCompany(fastify) {
    fastify.post("/company", async (request, reply) => {
        const authUser = request.user;
        if (authUser?.role !== "dev") {
            return reply.code(403).send({ error: "Forbidden - Dev access required" });
        }
        const parsed = createCompanySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const result = (await query(`INSERT INTO companies (name) VALUES ($1) RETURNING id`, [parsed.data.name]));
        return { companyId: result[0].id };
    });
}
export function updateCompany(fastify) {
    fastify.put("/company/:companyId", async (request, reply) => {
        const authUser = request.user;
        const isDev = authUser?.role === "dev";
        const isCompanyAdmin = authUser?.role === "admin";
        const { companyId } = request.params;
        if (!isDev && (!isCompanyAdmin || authUser?.companyId !== companyId)) {
            return reply
                .code(403)
                .send({ error: "Forbidden - Company admin access required" });
        }
        const parsed = updateCompanySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const updates = [];
        const values = [];
        if (body.name) {
            values.push(body.name);
            updates.push(`name = $${values.length}`);
        }
        if (body.dispatchSettings) {
            values.push(JSON.stringify(body.dispatchSettings));
            updates.push(`dispatch_settings = $${values.length}`);
        }
        // refine() guarantees at least one field but guard anyway
        if (updates.length === 0) {
            return reply.code(400).send({ error: "No fields to update" });
        }
        values.push(companyId);
        await query(`UPDATE companies
			SET ${updates.join(", ")}, updated_at = NOW()
			WHERE id = $${values.length}`, values);
        return { message: "Company updated successfully", companyId };
    });
}
export function deleteCompany(fastify) {
    fastify.delete("/company/:companyId", async (request, reply) => {
        const authUser = request.user;
        if (authUser?.role !== "dev") {
            return reply.code(403).send({ error: "Forbidden - Dev access required" });
        }
        const { companyId } = request.params;
        await query(`DELETE FROM companies WHERE id = $1`, [companyId]);
        return { message: `Company ${companyId} deleted` };
    });
}
export async function companyRoutes(fastify) {
    fastify.register(async (authenticatedRoutes) => {
        authenticatedRoutes.addHook("onRequest", authenticate);
        getCompany(authenticatedRoutes);
        createCompany(authenticatedRoutes);
        updateCompany(authenticatedRoutes);
        deleteCompany(authenticatedRoutes);
    });
}
