// services/routes/customerRoutes.ts
// Uses getSql() + Neon tagged templates exclusively — matches db/index.ts
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, resolveUserId } from "../middleware/auth";
// ============================================================
// Schemas
// ============================================================
const createCustomerSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    companyName: z.string().optional(),
    customerType: z.enum(["residential", "commercial"]).default("residential"),
    email: z.string().email("Invalid email").optional(),
    phone: z.string().min(1, "Phone is required"),
    altPhone: z.string().optional(),
    address: z.string().min(1, "Address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(2).max(2),
    zip: z.string().min(5),
    notes: z.string().optional(),
    branchId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional() // dev only
});
const updateCustomerSchema = z
    .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    companyName: z.string().optional(),
    customerType: z.enum(["residential", "commercial"]).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    altPhone: z.string().optional(),
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(2).max(2).optional(),
    zip: z.string().min(5).optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
    branchId: z.string().uuid().optional()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided"
});
const listCustomersSchema = z.object({
    companyId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    customerType: z.enum(["residential", "commercial"]).optional(),
    zip: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});
const createLocationSchema = z.object({
    label: z.string().min(1).optional(),
    address: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(2).max(2),
    zip: z.string().min(5),
    accessNotes: z.string().optional(),
    gateCode: z.string().optional(),
    hasPets: z.boolean().default(false),
    isPrimary: z.boolean().default(false)
});
const updateLocationSchema = z
    .object({
    label: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(2).max(2).optional(),
    zip: z.string().min(5).optional(),
    accessNotes: z.string().optional(),
    gateCode: z.string().optional(),
    hasPets: z.boolean().optional(),
    isPrimary: z.boolean().optional(),
    isActive: z.boolean().optional()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided"
});
const createEquipmentSchema = z.object({
    locationId: z.string().uuid().optional(),
    equipmentType: z.enum([
        "furnace",
        "ac",
        "heat_pump",
        "air_handler",
        "thermostat",
        "water_heater",
        "boiler",
        "mini_split",
        "package_unit",
        "hvac_unit",
        "other"
    ]),
    manufacturer: z.string().optional(),
    brand: z.string().optional(),
    modelNumber: z.string().optional(),
    model: z.string().optional(),
    serialNumber: z.string().optional(),
    installDate: z.string().optional(),
    warrantyExpiry: z.string().optional(),
    lastServiceDate: z.string().optional(),
    condition: z
        .enum(["excellent", "good", "fair", "poor", "unknown"])
        .default("unknown"),
    refrigerantType: z.string().optional(),
    notes: z.string().optional()
});
const updateEquipmentSchema = z
    .object({
    locationId: z.string().uuid().optional(),
    equipmentType: z
        .enum([
        "furnace",
        "ac",
        "heat_pump",
        "air_handler",
        "thermostat",
        "water_heater",
        "boiler",
        "mini_split",
        "package_unit",
        "other"
    ])
        .optional(),
    manufacturer: z.string().optional(),
    modelNumber: z.string().optional(),
    serialNumber: z.string().optional(),
    installDate: z.string().optional(),
    warrantyExpiry: z.string().optional(),
    lastServiceDate: z.string().optional(),
    condition: z
        .enum(["excellent", "good", "fair", "poor", "unknown"])
        .optional(),
    refrigerantType: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional()
})
    .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided"
});
const createCommunicationSchema = z.object({
    jobId: z.string().uuid().optional(),
    direction: z.enum(["inbound", "outbound"]),
    channel: z.enum(["phone", "sms", "email", "in_person"]).optional(),
    type: z.string().optional(),
    summary: z.string().min(1).optional(),
    subject: z.string().optional(),
    notes: z.string().optional()
});
const createNoShowSchema = z.object({
    jobId: z.string().uuid(),
    notes: z.string().optional()
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
// Safely unwrap a Neon .unsafe() or sql-as-function result into a plain array
function toRows(raw) {
    if (Array.isArray(raw))
        return raw;
    if (raw && typeof raw === "object" && Array.isArray(raw.rows))
        return raw.rows;
    return [];
}
// ============================================================
// Route Registration
// ============================================================
export async function customerRoutes(fastify) {
    // ----------------------------------------------------------
    // POST /customers
    // ----------------------------------------------------------
    fastify.post("/customers", { preHandler: [authenticate] }, async (request, reply) => {
        const parsed = createCustomerSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const user = getUser(request);
        const companyId = resolveCompanyId(user, body.companyId);
        if (!companyId)
            return reply.code(403).send({ error: "Forbidden - Missing company" });
        const userId = resolveUserId(user) ?? null;
        const sql = getSql();
        const result = (await sql `
				INSERT INTO customers (
					company_id, branch_id, first_name, last_name, company_name,
					customer_type, email, phone, alt_phone,
					address, city, state, zip,
					notes, created_by_user_id, geocoding_status
				) VALUES (
					${companyId},
					${body.branchId ?? null},
					${body.firstName},
					${body.lastName},
					${body.companyName ?? null},
					${body.customerType},
					${body.email ?? null},
					${body.phone},
					${body.altPhone ?? null},
					${body.address},
					${body.city},
					${body.state},
					${body.zip},
					${body.notes ?? null},
					${userId ?? null},
					'pending'
				)
				RETURNING id
			`);
        console.log(`📍 Customer ${result[0].id} queued for geocoding`);
        return reply.code(201).send({ customer: result[0] });
    });
    // ----------------------------------------------------------
    // GET /customers
    // ----------------------------------------------------------
    fastify.get("/customers", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const parsed = listCustomersSchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid query params",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const q = parsed.data;
        const companyId = resolveCompanyId(user, q.companyId);
        if (!companyId)
            return reply.code(403).send({ error: "Forbidden - Missing company" });
        const sql = getSql();
        const conditions = ["c.company_id = $1"];
        const values = [companyId];
        if (q.branchId) {
            conditions.push(`c.branch_id = $${values.length + 1}`);
            values.push(q.branchId);
        }
        if (q.customerType) {
            conditions.push(`c.customer_type = $${values.length + 1}`);
            values.push(q.customerType);
        }
        if (q.zip) {
            conditions.push(`c.zip = $${values.length + 1}`);
            values.push(q.zip);
        }
        if (q.isActive !== undefined) {
            conditions.push(`c.is_active = $${values.length + 1}`);
            values.push(q.isActive);
        }
        if (q.search) {
            const p = `$${values.length + 1}`;
            conditions.push(`(
					c.first_name   ILIKE ${p} OR
					c.last_name    ILIKE ${p} OR
					c.company_name ILIKE ${p} OR
					c.phone        ILIKE ${p} OR
					c.alt_phone    ILIKE ${p} OR
					c.email        ILIKE ${p}
				)`);
            values.push(`%${q.search}%`);
        }
        const where = conditions.join(" AND ");
        const countRaw = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM customers c WHERE ${where}`, ...values);
        const countRows = toRows(countRaw);
        const total = countRows[0]?.count ?? 0;
        const limitIdx = values.length + 1;
        const offIdx = values.length + 2;
        values.push(q.limit, q.offset);
        const customersRaw = await sql.unsafe(`SELECT
					id,
					company_id       AS "companyId",
					branch_id        AS "branchId",
					first_name       AS "firstName",
					last_name        AS "lastName",
					company_name     AS "companyName",
					customer_type    AS "customerType",
					email,
					phone,
					alt_phone        AS "altPhone",
					address, city, state, zip,
					latitude, longitude,
					geocoding_status AS "geocodingStatus",
					notes,
					is_active        AS "isActive",
					no_show_count    AS "noShowCount",
					created_at       AS "createdAt",
					updated_at       AS "updatedAt"
				FROM customers c
				WHERE ${where}
				ORDER BY c.created_at DESC
				LIMIT $${limitIdx} OFFSET $${offIdx}`, ...values);
        const customers = toRows(customersRaw);
        return reply.send({ customers, total, limit: q.limit, offset: q.offset });
    });
    // ----------------------------------------------------------
    // GET /customers/:customerId
    // ----------------------------------------------------------
    fastify.get("/customers/:customerId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const customerResult = isDev(user)
            ? (await sql `
					SELECT
						id,
						company_id       AS "companyId",
						branch_id        AS "branchId",
						first_name       AS "firstName",
						last_name        AS "lastName",
						company_name     AS "companyName",
						customer_type    AS "customerType",
						email, phone,
						alt_phone        AS "altPhone",
						address, city, state, zip,
						latitude, longitude,
						geocoding_status AS "geocodingStatus",
						notes,
						is_active        AS "isActive",
						no_show_count    AS "noShowCount",
						created_at       AS "createdAt",
						updated_at       AS "updatedAt"
					FROM customers c
					WHERE c.id = ${customerId}
				`)
            : (await sql `
					SELECT
						id,
						company_id       AS "companyId",
						branch_id        AS "branchId",
						first_name       AS "firstName",
						last_name        AS "lastName",
						company_name     AS "companyName",
						customer_type    AS "customerType",
						email, phone,
						alt_phone        AS "altPhone",
						address, city, state, zip,
						latitude, longitude,
						geocoding_status AS "geocodingStatus",
						notes,
						is_active        AS "isActive",
						no_show_count    AS "noShowCount",
						created_at       AS "createdAt",
						updated_at       AS "updatedAt"
					FROM customers c
					WHERE c.id = ${customerId} AND c.company_id = ${companyId}
				`);
        if (!customerResult[0]) {
            return reply.code(404).send({ error: "Customer not found" });
        }
        const locations = (await sql `
				SELECT
					id, label, address, city, state, zip,
					latitude, longitude,
					geocoding_status AS "geocodingStatus",
					access_notes     AS "accessNotes",
					gate_code        AS "gateCode",
					has_pets         AS "hasPets",
					is_primary       AS "isPrimary",
					is_active        AS "isActive",
					created_at       AS "createdAt"
				FROM customer_locations
				WHERE customer_id = ${customerId} AND is_active = true
				ORDER BY is_primary DESC, created_at ASC
			`);
        const equipment = (await sql `
				SELECT
					id,
					location_id       AS "locationId",
					equipment_type    AS "equipmentType",
					manufacturer,
					model_number      AS "modelNumber",
					serial_number     AS "serialNumber",
					install_date      AS "installDate",
					warranty_expiry   AS "warrantyExpiry",
					last_service_date AS "lastServiceDate",
					condition,
					refrigerant_type  AS "refrigerantType",
					notes,
					is_active         AS "isActive",
					created_at        AS "createdAt",
					EXTRACT(YEAR FROM AGE(NOW(), install_date))::int AS "ageYears"
				FROM equipment
				WHERE customer_id = ${customerId} AND is_active = true
				ORDER BY install_date ASC NULLS LAST
			`);
        const jobs = (await sql `
				SELECT
					id, status, priority,
					job_type         AS "jobType",
					address,
					scheduled_time   AS "scheduledTime",
					assigned_tech_id AS "assignedTechId",
					created_at       AS "createdAt",
					completed_at     AS "completedAt"
				FROM jobs
				WHERE customer_id = ${customerId}
				ORDER BY created_at DESC
				LIMIT 10
			`);
        const communications = (await sql `
				SELECT
					id, direction, channel, summary,
					job_id       AS "jobId",
					performed_by AS "performedBy",
					created_at   AS "createdAt"
				FROM customer_communications
				WHERE customer_id = ${customerId}
				ORDER BY created_at DESC
				LIMIT 10
			`);
        return reply.send({
            customer: customerResult[0],
            locations,
            equipment,
            jobs,
            communications
        });
    });
    // ----------------------------------------------------------
    // PATCH /customers/:customerId
    // ----------------------------------------------------------
    fastify.patch("/customers/:customerId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const parsed = updateCustomerSchema.safeParse(request.body);
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
            ["first_name", body.firstName],
            ["last_name", body.lastName],
            ["company_name", body.companyName],
            ["customer_type", body.customerType],
            ["email", body.email],
            ["phone", body.phone],
            ["alt_phone", body.altPhone],
            ["address", body.address],
            ["city", body.city],
            ["state", body.state],
            ["zip", body.zip],
            ["notes", body.notes],
            ["is_active", body.isActive],
            ["branch_id", body.branchId]
        ]);
        const extraSets = ["updated_at = NOW()"];
        if (body.address || body.city || body.state || body.zip) {
            extraSets.push(`geocoding_status = 'pending'`, `latitude = NULL`, `longitude = NULL`);
        }
        const fullClause = [clause, ...extraSets].join(", ");
        let idx = nextIdx;
        const whereValues = [...values];
        whereValues.push(customerId);
        let where = `WHERE id = $${idx++}`;
        if (!isDev(user)) {
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            whereValues.push(companyId);
            where += ` AND company_id = $${idx++}`;
        }
        const raw = await sql.unsafe(`UPDATE customers SET ${fullClause} ${where} RETURNING id`, whereValues);
        const result = Array.isArray(raw) ? raw : (raw?.rows ?? []);
        if (!result[0])
            return reply.code(404).send({ error: "Customer not found" });
        return reply.send({
            message: "Customer updated",
            customerId: result[0].id
        });
    });
    // ----------------------------------------------------------
    // DELETE /customers/:customerId
    // ----------------------------------------------------------
    fastify.delete("/customers/:customerId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        if (!isDev(user) && !companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const result = isDev(user)
            ? (await sql `
					UPDATE customers
					SET is_active = false, updated_at = NOW()
					WHERE id = ${customerId}
					RETURNING id
				`)
            : (await sql `
					UPDATE customers
					SET is_active = false, updated_at = NOW()
					WHERE id = ${customerId} AND company_id = ${companyId}
					RETURNING id
				`);
        if (!result[0])
            return reply.code(404).send({ error: "Customer not found" });
        return reply.send({
            message: "Customer deactivated",
            customerId: result[0].id
        });
    });
    // ----------------------------------------------------------
    // POST /customers/:customerId/locations
    // ----------------------------------------------------------
    fastify.post("/customers/:customerId/locations", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const parsed = createLocationSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const existing = (await sql `
				SELECT company_id FROM customers
				WHERE id = ${customerId} AND is_active = true
			`);
        if (!existing[0])
            return reply.code(404).send({ error: "Customer not found" });
        if (!isDev(user) && existing[0].company_id !== companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        if (body.isPrimary) {
            await sql `
					UPDATE customer_locations
					SET is_primary = false
					WHERE customer_id = ${customerId}
				`;
        }
        const [location] = (await sql `
				INSERT INTO customer_locations (
					customer_id, company_id, label, address, city, state, zip,
					access_notes, gate_code, has_pets, is_primary, geocoding_status
				) VALUES (
					${customerId},
					${existing[0].company_id},
					${body.label ?? "primary"},
					${body.address},
					${body.city},
					${body.state},
					${body.zip},
					${body.accessNotes ?? null},
					${body.gateCode ?? null},
					${body.hasPets ?? false},
					${body.isPrimary ?? false},
					'pending'
				)
				RETURNING id, address, city, state, zip, is_primary AS "isPrimary", created_at AS "createdAt"
			`);
        return reply.code(201).send({ location });
    });
    // ----------------------------------------------------------
    // GET /customers/:customerId/locations
    // ----------------------------------------------------------
    fastify.get("/customers/:customerId/locations", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const locations = isDev(user)
            ? (await sql `
					SELECT
						cl.id, cl.label, cl.address, cl.city, cl.state, cl.zip,
						cl.latitude, cl.longitude,
						cl.geocoding_status AS "geocodingStatus",
						cl.access_notes     AS "accessNotes",
						cl.gate_code        AS "gateCode",
						cl.has_pets         AS "hasPets",
						cl.is_primary       AS "isPrimary",
						cl.is_active        AS "isActive",
						cl.created_at       AS "createdAt"
					FROM customer_locations cl
					WHERE cl.customer_id = ${customerId} AND cl.is_active = true
					ORDER BY cl.is_primary DESC, cl.created_at ASC
				`)
            : (await sql `
					SELECT
						cl.id, cl.label, cl.address, cl.city, cl.state, cl.zip,
						cl.latitude, cl.longitude,
						cl.geocoding_status AS "geocodingStatus",
						cl.access_notes     AS "accessNotes",
						cl.gate_code        AS "gateCode",
						cl.has_pets         AS "hasPets",
						cl.is_primary       AS "isPrimary",
						cl.is_active        AS "isActive",
						cl.created_at       AS "createdAt"
					FROM customer_locations cl
					JOIN customers c ON c.id = cl.customer_id
					WHERE cl.customer_id = ${customerId}
					  AND cl.is_active = true
					  AND c.company_id = ${companyId}
					ORDER BY cl.is_primary DESC, cl.created_at ASC
				`);
        return reply.send({ locations });
    });
    // ----------------------------------------------------------
    // PATCH /customers/:customerId/locations/:locationId
    // ----------------------------------------------------------
    fastify.patch("/customers/:customerId/locations/:locationId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId, locationId } = request.params;
        const parsed = updateLocationSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        if (!isDev(user) && !companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const { clause, values, nextIdx } = buildSetClause([
            ["label", body.label],
            ["address", body.address],
            ["city", body.city],
            ["state", body.state],
            ["zip", body.zip],
            ["access_notes", body.accessNotes],
            ["gate_code", body.gateCode],
            ["has_pets", body.hasPets],
            ["is_primary", body.isPrimary],
            ["is_active", body.isActive]
        ]);
        const extraSets = ["updated_at = NOW()"];
        if (body.address || body.city || body.state || body.zip) {
            extraSets.push(`geocoding_status = 'pending'`, `latitude = NULL`, `longitude = NULL`);
        }
        const fullClause = [clause, ...extraSets].join(", ");
        let idx = nextIdx;
        const whereValues = [...values];
        const whereParts = [
            `id = $${idx++}`,
            `customer_id = $${idx++}`
        ];
        whereValues.push(locationId, customerId);
        if (!isDev(user)) {
            whereParts.push(`company_id = $${idx++}`);
            whereValues.push(companyId);
        }
        if (body.isPrimary) {
            await sql `
					UPDATE customer_locations SET is_primary = false
					WHERE customer_id = ${customerId} AND id != ${locationId}
				`;
        }
        const resultRaw = await sql.unsafe(`UPDATE customer_locations
				 SET ${fullClause}
				 WHERE ${whereParts.join(" AND ")}
				 RETURNING id`, whereValues);
        const result = toRows(resultRaw);
        if (!result[0])
            return reply.code(404).send({ error: "Location not found" });
        return reply.send({
            message: "Location updated",
            locationId: result[0].id
        });
    });
    // ----------------------------------------------------------
    // DELETE /customers/:customerId/locations/:locationId
    // ----------------------------------------------------------
    fastify.delete("/customers/:customerId/locations/:locationId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId, locationId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        if (!isDev(user) && !companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const result = isDev(user)
            ? (await sql `
					UPDATE customer_locations
					SET is_active = false, updated_at = NOW()
					WHERE id = ${locationId} AND customer_id = ${customerId}
					RETURNING id
				`)
            : (await sql `
					UPDATE customer_locations
					SET is_active = false, updated_at = NOW()
					WHERE id = ${locationId}
					  AND customer_id = ${customerId}
					  AND company_id = ${companyId}
					RETURNING id
				`);
        if (!result[0])
            return reply.code(404).send({ error: "Location not found" });
        return reply.send({
            message: "Location deactivated",
            locationId: result[0].id
        });
    });
    // ----------------------------------------------------------
    // POST /customers/:customerId/equipment
    // ----------------------------------------------------------
    fastify.post("/customers/:customerId/equipment", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const parsed = createEquipmentSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const existing = (await sql `
				SELECT company_id FROM customers
				WHERE id = ${customerId} AND is_active = true
			`);
        if (!existing[0])
            return reply.code(404).send({ error: "Customer not found" });
        if (!isDev(user) && existing[0].company_id !== companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const result = (await sql `
				INSERT INTO equipment (
					customer_id, location_id, company_id, equipment_type,
					manufacturer, model_number, serial_number,
					install_date, warranty_expiry, last_service_date,
					condition, refrigerant_type, notes
				) VALUES (
					${customerId},
					${body.locationId ?? null},
					${existing[0].company_id},
					${body.equipmentType},
					${body.manufacturer ?? body.brand ?? null},
					${body.modelNumber ?? body.model ?? null},
					${body.serialNumber ?? null},
					${body.installDate ?? null},
					${body.warrantyExpiry ?? null},
					${body.lastServiceDate ?? null},
					${body.condition},
					${body.refrigerantType ?? null},
					${body.notes ?? null}
				)
				RETURNING id, equipment_type AS "equipmentType", manufacturer, model_number AS "modelNumber", created_at AS "createdAt"
			`);
        return reply.code(201).send({ equipment: result[0] });
    });
    // ----------------------------------------------------------
    // GET /customers/:customerId/equipment
    // ----------------------------------------------------------
    fastify.get("/customers/:customerId/equipment", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const companyId = resolveCompanyId(user);
        const { locationId } = request.query;
        const sql = getSql();
        if (!isDev(user) && !companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const conditions = ["e.customer_id = $1", "e.is_active = true"];
        const values = [customerId];
        if (!isDev(user)) {
            conditions.push(`e.company_id = $${values.length + 1}`);
            values.push(companyId);
        }
        if (locationId) {
            conditions.push(`e.location_id = $${values.length + 1}`);
            values.push(locationId);
        }
        const raw = await sql.unsafe(`SELECT
					e.id,
					e.location_id       AS "locationId",
					e.equipment_type    AS "equipmentType",
					e.manufacturer,
					e.model_number      AS "modelNumber",
					e.serial_number     AS "serialNumber",
					e.install_date      AS "installDate",
					e.warranty_expiry   AS "warrantyExpiry",
					e.last_service_date AS "lastServiceDate",
					e.condition,
					e.refrigerant_type  AS "refrigerantType",
					e.notes,
					e.created_at        AS "createdAt",
					EXTRACT(YEAR FROM AGE(NOW(), e.install_date))::int AS "ageYears"
				FROM equipment e
				WHERE ${conditions.join(" AND ")}
				ORDER BY e.install_date ASC NULLS LAST`, ...values);
        const equipment = toRows(raw);
        return reply.send({ equipment });
    });
    // ----------------------------------------------------------
    // PATCH /customers/:customerId/equipment/:equipmentId
    // ----------------------------------------------------------
    fastify.patch("/customers/:customerId/equipment/:equipmentId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId, equipmentId } = request.params;
        const parsed = updateEquipmentSchema.safeParse(request.body);
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
            ["location_id", body.locationId],
            ["equipment_type", body.equipmentType],
            ["manufacturer", body.manufacturer],
            ["model_number", body.modelNumber],
            ["serial_number", body.serialNumber],
            ["install_date", body.installDate],
            ["warranty_expiry", body.warrantyExpiry],
            ["last_service_date", body.lastServiceDate],
            ["condition", body.condition],
            ["refrigerant_type", body.refrigerantType],
            ["notes", body.notes],
            ["is_active", body.isActive]
        ]);
        const fullClause = [clause, "updated_at = NOW()"].join(", ");
        let idx = nextIdx;
        const whereValues = [...values];
        const whereParts = [
            `id = $${idx++}`,
            `customer_id = $${idx++}`
        ];
        whereValues.push(equipmentId, customerId);
        if (!isDev(user)) {
            if (!companyId)
                return reply.code(403).send({ error: "Forbidden" });
            whereParts.push(`company_id = $${idx++}`);
            whereValues.push(companyId);
        }
        const resultRaw = await sql.unsafe(`UPDATE equipment SET ${fullClause} WHERE ${whereParts.join(" AND ")} RETURNING id`, ...whereValues);
        const result = toRows(resultRaw);
        if (!result[0])
            return reply.code(404).send({ error: "Equipment not found" });
        return reply.send({
            message: "Equipment updated",
            equipmentId: result[0].id
        });
    });
    // ----------------------------------------------------------
    // DELETE /customers/:customerId/equipment/:equipmentId
    // ----------------------------------------------------------
    fastify.delete("/customers/:customerId/equipment/:equipmentId", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId, equipmentId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        if (!isDev(user) && !companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        const result = isDev(user)
            ? (await sql `
					UPDATE equipment SET is_active = false, updated_at = NOW()
					WHERE id = ${equipmentId} AND customer_id = ${customerId}
					RETURNING id
				`)
            : (await sql `
					UPDATE equipment SET is_active = false, updated_at = NOW()
					WHERE id = ${equipmentId}
					  AND customer_id = ${customerId}
					  AND company_id = ${companyId}
					RETURNING id
				`);
        if (!result[0])
            return reply.code(404).send({ error: "Equipment not found" });
        return reply.send({ message: "Equipment deactivated" });
    });
    // ----------------------------------------------------------
    // POST /customers/:customerId/communications
    // ----------------------------------------------------------
    fastify.post("/customers/:customerId/communications", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const parsed = createCommunicationSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const companyId = resolveCompanyId(user);
        const userId = resolveUserId(user) ?? null;
        const sql = getSql();
        const existing = (await sql `
				SELECT company_id FROM customers
				WHERE id = ${customerId} AND is_active = true
			`);
        if (!existing[0])
            return reply.code(404).send({ error: "Customer not found" });
        if (!isDev(user) && existing[0].company_id !== companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        await sql `
				INSERT INTO customer_communications (
					customer_id, company_id, job_id,
					direction, channel, summary, performed_by
				) VALUES (
					${customerId},
					${existing[0].company_id},
					${body.jobId ?? null},
					${body.direction},
					${body.channel ?? body.type ?? "phone"},
					${body.summary ?? body.subject ?? body.notes ?? ""},
					${userId ?? null}
				)
			`;
        return reply.code(201).send({ message: "Communication logged" });
    });
    // ----------------------------------------------------------
    // GET /customers/:customerId/communications
    // ----------------------------------------------------------
    fastify.get("/customers/:customerId/communications", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const { limit = "50", offset = "0" } = request.query;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const limitN = Math.min(parseInt(limit, 10) || 50, 100);
        const offsetN = Math.max(parseInt(offset, 10) || 0, 0);
        const communications = isDev(user)
            ? (await sql `
					SELECT
						cc.id, cc.direction, cc.channel, cc.summary,
						cc.job_id       AS "jobId",
						cc.performed_by AS "performedBy",
						u.name          AS "performedByName",
						cc.created_at   AS "createdAt"
					FROM customer_communications cc
					LEFT JOIN users u ON u.id = cc.performed_by
					WHERE cc.customer_id = ${customerId}
					ORDER BY cc.created_at DESC
					LIMIT ${limitN} OFFSET ${offsetN}
				`)
            : (await sql `
					SELECT
						cc.id, cc.direction, cc.channel, cc.summary,
						cc.job_id       AS "jobId",
						cc.performed_by AS "performedBy",
						u.name          AS "performedByName",
						cc.created_at   AS "createdAt"
					FROM customer_communications cc
					LEFT JOIN users u ON u.id = cc.performed_by
					JOIN customers c ON c.id = cc.customer_id
					WHERE cc.customer_id = ${customerId}
					  AND c.company_id = ${companyId}
					ORDER BY cc.created_at DESC
					LIMIT ${limitN} OFFSET ${offsetN}
				`);
        return reply.send({ communications });
    });
    // ----------------------------------------------------------
    // POST /customers/:customerId/no-shows
    // ----------------------------------------------------------
    fastify.post("/customers/:customerId/no-shows", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const parsed = createNoShowSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: "Invalid request body",
                details: parsed.error.flatten().fieldErrors
            });
        }
        const body = parsed.data;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const existing = (await sql `
				SELECT company_id FROM customers WHERE id = ${customerId}
			`);
        if (!existing[0])
            return reply.code(404).send({ error: "Customer not found" });
        if (!isDev(user) && existing[0].company_id !== companyId) {
            return reply.code(403).send({ error: "Forbidden" });
        }
        await sql `
				INSERT INTO customer_no_shows (customer_id, job_id, company_id, notes)
				VALUES (${customerId}, ${body.jobId}, ${existing[0].company_id}, ${body.notes ?? null})
			`;
        await sql `
				UPDATE customers
				SET no_show_count = no_show_count + 1, updated_at = NOW()
				WHERE id = ${customerId}
			`;
        return reply.code(201).send({ message: "No-show logged" });
    });
    // ----------------------------------------------------------
    // GET /customers/:customerId/no-shows
    // ----------------------------------------------------------
    fastify.get("/customers/:customerId/no-shows", { preHandler: [authenticate] }, async (request, reply) => {
        const user = getUser(request);
        const { customerId } = request.params;
        const companyId = resolveCompanyId(user);
        const sql = getSql();
        const noShows = isDev(user)
            ? (await sql `
					SELECT id, job_id AS "jobId", notes, created_at AS "createdAt"
					FROM customer_no_shows
					WHERE customer_id = ${customerId}
					ORDER BY created_at DESC
				`)
            : (await sql `
					SELECT ns.id, ns.job_id AS "jobId", ns.notes, ns.created_at AS "createdAt"
					FROM customer_no_shows ns
					JOIN customers c ON c.id = ns.customer_id
					WHERE ns.customer_id = ${customerId}
					  AND c.company_id = ${companyId}
					ORDER BY ns.created_at DESC
				`);
        return reply.send({ noShows });
    });
}
