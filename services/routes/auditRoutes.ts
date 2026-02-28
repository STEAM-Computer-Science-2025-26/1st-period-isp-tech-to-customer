// services/routes/auditRoutes.ts
// Append-only audit log — every mutation that matters gets recorded here

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import { authenticate, JWTPayload } from "../middleware/auth";

// ============================================================
// Schemas
// ============================================================

const listAuditSchema = z.object({
	companyId: z.string().uuid().optional(),
	actorUserId: z.string().uuid().optional(),
	entityType: z.string().optional(),
	entityId: z.string().uuid().optional(),
	action: z.string().optional(),
	fromDate: z.string().datetime().optional(),
	toDate: z.string().datetime().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

// ============================================================
// Core helper — call this from any route to record an audit event
// ============================================================

export interface AuditEntry {
	companyId: string;
	actorUserId?: string | null;
	actorRole?: string | null;
	action: string;          // e.g. "job.status_changed", "invoice.created"
	entityType: string;      // e.g. "job", "invoice", "customer"
	entityId?: string | null;
	before?: Record<string, unknown> | null;
	after?: Record<string, unknown> | null;
	meta?: Record<string, unknown> | null;
	ipAddress?: string | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
	const sql = getSql();
	await sql`
		INSERT INTO audit_logs (
			company_id, actor_user_id, actor_role, action,
			entity_type, entity_id, before_state, after_state,
			meta, ip_address
		) VALUES (
			${entry.companyId},
			${entry.actorUserId ?? null},
			${entry.actorRole ?? null},
			${entry.action},
			${entry.entityType},
			${entry.entityId ?? null},
			${entry.before ? JSON.stringify(entry.before) : null},
			${entry.after ? JSON.stringify(entry.after) : null},
			${entry.meta ? JSON.stringify(entry.meta) : null},
			${entry.ipAddress ?? null}
		)
	`;
}

// ============================================================
// Route handlers
// ============================================================

export function listAuditLogs(fastify: FastifyInstance) {
	fastify.get("/audit", async (request, reply) => {
		const user = request.user as JWTPayload;
		const isDev = user.role === "dev";

		// Only admins and devs can read audit logs
		if (!isDev && user.role !== "admin") {
			return reply.code(403).send({ error: "Forbidden - Admin access required" });
		}

		const parsed = listAuditSchema.safeParse(request.query);
		if (!parsed.success) {
			return reply.code(400).send({ error: "Invalid query", details: z.treeifyError(parsed.error) });
		}

		const { actorUserId, entityType, entityId, action, fromDate, toDate, limit, offset } = parsed.data;
		const effectiveCompanyId = isDev ? (parsed.data.companyId ?? null) : (user.companyId ?? null);

		const sql = getSql();

		const logs = await sql`
			SELECT
				id,
				company_id       AS "companyId",
				actor_user_id    AS "actorUserId",
				actor_role       AS "actorRole",
				action,
				entity_type      AS "entityType",
				entity_id        AS "entityId",
				before_state     AS "before",
				after_state      AS "after",
				meta,
				ip_address       AS "ipAddress",
				created_at       AS "createdAt"
			FROM audit_logs
			WHERE TRUE
			  AND (${effectiveCompanyId}::uuid IS NULL OR company_id = ${effectiveCompanyId})
			  AND (${actorUserId ?? null}::uuid IS NULL OR actor_user_id = ${actorUserId ?? null})
			  AND (${entityType ?? null}::text IS NULL OR entity_type = ${entityType ?? null})
			  AND (${entityId ?? null}::uuid IS NULL OR entity_id = ${entityId ?? null})
			  AND (${action ?? null}::text IS NULL OR action = ${action ?? null})
			  AND (${fromDate ?? null}::timestamptz IS NULL OR created_at >= ${fromDate ?? null})
			  AND (${toDate ?? null}::timestamptz IS NULL OR created_at <= ${toDate ?? null})
			ORDER BY created_at DESC
			LIMIT ${limit} OFFSET ${offset}
		`;

		return { logs };
	});
}

export function getAuditLog(fastify: FastifyInstance) {
	fastify.get("/audit/:logId", async (request, reply) => {
		const user = request.user as JWTPayload;
		const isDev = user.role === "dev";
		if (!isDev && user.role !== "admin") {
			return reply.code(403).send({ error: "Forbidden - Admin access required" });
		}

		const { logId } = request.params as { logId: string };
		const sql = getSql();

		const [log] = (await sql`
			SELECT
				id, company_id AS "companyId", actor_user_id AS "actorUserId",
				actor_role AS "actorRole", action, entity_type AS "entityType",
				entity_id AS "entityId", before_state AS "before", after_state AS "after",
				meta, ip_address AS "ipAddress", created_at AS "createdAt"
			FROM audit_logs
			WHERE id = ${logId}
			  AND (${isDev} OR company_id = ${user.companyId ?? ""})
		`) as any[];

		if (!log) return reply.code(404).send({ error: "Audit log not found" });
		return { log };
	});
}

export async function auditRoutes(fastify: FastifyInstance) {
	fastify.register(async (authed) => {
		authed.addHook("onRequest", authenticate);
		listAuditLogs(authed);
		getAuditLog(authed);
	});
}