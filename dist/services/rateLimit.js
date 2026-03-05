// services/rateLimit.ts
// Full rate limiting system — extends the existing enforceRateLimit core
// Adds: presets, per-company limits, Fastify plugin hooks, admin visibility, cleanup worker
import { getSql } from "../db";
// ============================================================
// Core function — backward compatible with existing calls
// ============================================================
export async function enforceRateLimit(sql, key, limit, windowSeconds) {
	const rows = await sql`
		INSERT INTO api_rate_limits (key, hits, reset_at)
		VALUES (${key}, 1, NOW() + make_interval(secs => ${windowSeconds}))
		ON CONFLICT (key) DO UPDATE
		SET hits = CASE
				WHEN api_rate_limits.reset_at <= NOW() THEN 1
				ELSE api_rate_limits.hits + 1
			END,
			reset_at = CASE
				WHEN api_rate_limits.reset_at <= NOW()
					THEN NOW() + make_interval(secs => ${windowSeconds})
				ELSE api_rate_limits.reset_at
			END
		RETURNING hits::int AS hits, reset_at
	`;
	const row = rows[0];
	const hits = row?.hits ?? 1;
	if (hits <= limit) {
		return { allowed: true, remaining: limit - hits };
	}
	const resetAt = row?.reset_at ? new Date(row.reset_at) : new Date();
	const retryAfterSeconds = Math.max(
		1,
		Math.ceil((resetAt.getTime() - Date.now()) / 1000)
	);
	return { allowed: false, retryAfterSeconds, remaining: 0 };
}
// ============================================================
// Presets — one source of truth for all rate limits in the app
// ============================================================
export const RATE_LIMITS = {
	// ── Auth ────────────────────────────────────────────────
	"auth:login": { limit: 10, windowSeconds: 900 }, // 10/15min per IP
	"auth:register": { limit: 5, windowSeconds: 900 }, // 5/15min per IP
	"auth:password-reset": { limit: 3, windowSeconds: 3600 }, // 3/hr per IP
	"auth:verify-send": { limit: 3, windowSeconds: 1800 }, // 3/30min per email
	"auth:verify-code": { limit: 5, windowSeconds: 600 }, // 5/10min per verificationId
	// ── SMS — costs money, protect hard ────────────────────
	"sms:send": { limit: 50, windowSeconds: 3600 }, // 50/hr per company
	"sms:inbound-webhook": { limit: 300, windowSeconds: 60 }, // 300/min global
	// ── General API ─────────────────────────────────────────
	"api:read": { limit: 500, windowSeconds: 60 }, // 500/min per company
	"api:write": { limit: 100, windowSeconds: 60 }, // 100/min per company
	"api:dev": { limit: 2000, windowSeconds: 60 }, // dev role gets more headroom
	// ── Webhooks ────────────────────────────────────────────
	"webhook:stripe": { limit: 500, windowSeconds: 60 },
	"webhook:twilio": { limit: 300, windowSeconds: 60 },
	"webhook:quickbooks": { limit: 100, windowSeconds: 60 },
	// ── Customer portal (unauthenticated) ───────────────────
	"portal:token-lookup": { limit: 30, windowSeconds: 60 },
	"portal:eta-lookup": { limit: 60, windowSeconds: 60 },
	// ── Review requests ─────────────────────────────────────
	"review:request": { limit: 20, windowSeconds: 3600 }, // 20 review sends/hr per company
	// ── Expensive endpoints ─────────────────────────────────
	"analytics:query": { limit: 30, windowSeconds: 60 },
	"export:jobs": { limit: 5, windowSeconds: 300 } // 5 exports/5min
};
/**
 * Enforce a named preset.
 * identifier = whatever makes the key unique: IP, companyId, userId, etc.
 */
export async function enforcePreset(sql, preset, identifier) {
	const { limit, windowSeconds } = RATE_LIMITS[preset];
	return enforceRateLimit(sql, `${preset}:${identifier}`, limit, windowSeconds);
}
// ============================================================
// Fastify middleware helpers
// ============================================================
function getClientIp(request) {
	// Respect proxy headers in production
	const xff = request.headers["x-forwarded-for"];
	if (xff) {
		const first = Array.isArray(xff) ? xff[0] : xff.split(",")[0];
		return first?.trim() ?? "unknown";
	}
	return request.ip ?? "unknown";
}
/**
 * Returns a Fastify preHandler that enforces a rate limit preset.
 *
 * Usage:
 *   fastify.post("/login", { preHandler: rateLimitMiddleware({ preset: "auth:login" }) }, handler)
 */
export function rateLimitMiddleware(opts) {
	return async (request, reply) => {
		const sql = getSql();
		const identifier = opts.keyFn ? opts.keyFn(request) : getClientIp(request);
		const result = await enforcePreset(sql, opts.preset, identifier);
		// Always attach remaining count header
		if (result.allowed) {
			reply.header("X-RateLimit-Remaining", String(result.remaining));
		} else {
			reply.header("Retry-After", String(result.retryAfterSeconds));
			reply.header("X-RateLimit-Remaining", "0");
			return reply.code(429).send({
				error:
					opts.errorMessage ?? "Too many requests. Please try again later.",
				retryAfterSeconds: result.retryAfterSeconds
			});
		}
	};
}
/**
 * Company-scoped rate limiter — uses companyId from JWT as the identifier.
 * Falls back to IP if no token present.
 */
export function companyRateLimitMiddleware(preset, fallbackToIp = true) {
	return rateLimitMiddleware({
		preset,
		keyFn: (request) => {
			const user = request.user;
			if (user?.companyId) return user.companyId;
			if (fallbackToIp) return getClientIp(request);
			return "anonymous";
		}
	});
}
// ============================================================
// Global Fastify plugin — applies baseline limits to all routes
// ============================================================
/**
 * Register this plugin once in your main server file.
 * It applies a per-company baseline limit to all authenticated routes
 * and a per-IP limit to all unauthenticated routes.
 *
 * Usage:
 *   fastify.register(rateLimitPlugin)
 */
export async function rateLimitPlugin(fastify) {
	fastify.addHook("onRequest", async (request, reply) => {
		const sql = getSql();
		const ip = getClientIp(request);
		const user = request.user;
		// Skip rate limiting for dev tools routes
		if (request.url.startsWith("/api/dev/")) return;
		// Skip OPTIONS (CORS preflight)
		if (request.method === "OPTIONS") return;
		let result;
		if (user?.companyId) {
			// Authenticated: rate limit per company
			const preset =
				user.role === "dev"
					? "api:dev"
					: isWriteMethod(request.method)
						? "api:write"
						: "api:read";
			result = await enforcePreset(sql, preset, user.companyId);
		} else {
			// Unauthenticated: rate limit per IP (generous limit)
			result = await enforceRateLimit(sql, `ip:global:${ip}`, 200, 60);
		}
		if (result.allowed) {
			reply.header("X-RateLimit-Remaining", String(result.remaining));
		} else {
			reply.header("Retry-After", String(result.retryAfterSeconds));
			reply.header("X-RateLimit-Remaining", "0");
			return reply.code(429).send({
				error: "Too many requests. Please try again later.",
				retryAfterSeconds: result.retryAfterSeconds
			});
		}
	});
}
function isWriteMethod(method) {
	return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}
// ============================================================
// Admin routes — view / reset rate limit state
// ============================================================
export function rateLimitAdminRoutes(fastify) {
	// List all active rate limit buckets
	fastify.get("/admin/rate-limits", async (request, reply) => {
		const user = request.user;
		if (user?.role !== "dev" && user?.role !== "admin") {
			return reply.code(403).send({ error: "Forbidden" });
		}
		const sql = getSql();
		const { prefix, limit: qLimit } = request.query;
		const limitNum = Math.min(parseInt(qLimit ?? "100", 10) || 100, 500);
		const rows = await sql`
			SELECT
				key,
				hits,
				reset_at AS "resetAt",
				(reset_at > NOW()) AS active
			FROM api_rate_limits
			WHERE (${prefix ?? null}::text IS NULL OR key LIKE ${(prefix ?? "") + "%"})
			ORDER BY hits DESC
			LIMIT ${limitNum}
		`;
		return { buckets: rows };
	});
	// Reset a specific rate limit bucket
	fastify.delete("/admin/rate-limits/:key", async (request, reply) => {
		const user = request.user;
		if (user?.role !== "dev") {
			return reply.code(403).send({ error: "Dev access required" });
		}
		const { key } = request.params;
		const sql = getSql();
		await sql`DELETE FROM api_rate_limits WHERE key = ${key}`;
		return { ok: true, deleted: key };
	});
	// Reset all buckets matching a prefix
	fastify.delete("/admin/rate-limits", async (request, reply) => {
		const user = request.user;
		if (user?.role !== "dev") {
			return reply.code(403).send({ error: "Dev access required" });
		}
		const { prefix } = request.query;
		if (!prefix) {
			return reply.code(400).send({ error: "prefix query param required" });
		}
		const sql = getSql();
		const result = await sql`
			DELETE FROM api_rate_limits
			WHERE key LIKE ${prefix + "%"}
			RETURNING key
		`;
		return { ok: true, deleted: result.length };
	});
	// Summary — how many buckets are currently throttled
	fastify.get("/admin/rate-limits/summary", async (request, reply) => {
		const user = request.user;
		if (user?.role !== "dev" && user?.role !== "admin") {
			return reply.code(403).send({ error: "Forbidden" });
		}
		const sql = getSql();
		const [summary] = await sql`
			SELECT
				COUNT(*)::int                                        AS "totalBuckets",
				COUNT(*) FILTER (WHERE reset_at > NOW())::int        AS "activeBuckets",
				COUNT(*) FILTER (WHERE reset_at <= NOW())::int       AS "expiredBuckets",
				COUNT(*) FILTER (WHERE hits > 50 AND reset_at > NOW())::int AS "hotBuckets"
			FROM api_rate_limits
		`;
		return { summary };
	});
}
// ============================================================
// Cleanup worker — prune expired buckets
// Neon serverless doesn't support pg_cron, so call this on a schedule
// ============================================================
export async function cleanupExpiredRateLimits() {
	const sql = getSql();
	const result = await sql`
		DELETE FROM api_rate_limits
		WHERE reset_at <= NOW() - INTERVAL '5 minutes'
		RETURNING key
	`;
	const deleted = Array.isArray(result) ? result.length : 0;
	if (deleted > 0) {
		console.log(`🧹 Rate limit cleanup: removed ${deleted} expired buckets`);
	}
	return { deleted };
}
/**
 * Start the cleanup worker — runs every 10 minutes.
 * Call this once in your server startup.
 *
 * Usage:
 *   startRateLimitCleanup();
 */
export function startRateLimitCleanup(intervalMs = 10 * 60 * 1000) {
	// Run once immediately on startup
	cleanupExpiredRateLimits().catch(console.error);
	return setInterval(() => {
		cleanupExpiredRateLimits().catch(console.error);
	}, intervalMs);
}
