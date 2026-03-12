// services/routes/verifyRoutes.ts
//
// Email verification endpoints — ported from Next.js app/api/verify/*
// Registered at /verify/* on the Fastify server.
//
// Frontend calls these via relative /api/verify/* paths which Next.js
// proxies here (next.config.ts rewrites strip the /api prefix).

import { randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getSql } from "../../db/connection";
import { enforceRateLimit } from "../rateLimit";
import {
	createMagicToken,
	hashMagicToken,
	createVerificationSessionToken,
	hashVerificationSessionToken,
	encryptVerificationCode,
	decryptVerificationCode
} from "../verifyCrypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
	return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function getClientIp(request: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
	const xff = request.headers["x-forwarded-for"];
	if (xff) {
		const first = Array.isArray(xff) ? xff[0] : xff.split(",")[0];
		return first?.trim() || "unknown";
	}
	const xri = request.headers["x-real-ip"];
	if (xri) return (Array.isArray(xri) ? xri[0] : xri).trim();
	return request.ip || "unknown";
}

function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
	if (!cookieHeader) return undefined;
	for (const part of cookieHeader.split(";")) {
		const [k, ...rest] = part.trim().split("=");
		if (k === name) return rest.join("=");
	}
	return undefined;
}

function sessionCookie(sessionToken: string): string {
	return [
		`vr=${sessionToken}`,
		"Path=/",
		"Max-Age=1800",
		"HttpOnly",
		"SameSite=Lax",
		process.env.NODE_ENV === "production" ? "Secure" : ""
	]
		.filter(Boolean)
		.join("; ");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function verifyRoutes(fastify: FastifyInstance): Promise<void> {
	// POST /verify/send
	// Initiates email verification — creates a DB record, returns verificationId.
	// Sets an HttpOnly session cookie (vr) used to authenticate follow-up calls.
	fastify.post("/verify/send", async (request, reply) => {
		const { email: rawEmail, mode: rawMode } = request.body as {
			email?: unknown;
			mode?: unknown;
		};

		const email =
			typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : null;
		if (!email || !email.includes("@") || email.length > 255) {
			return reply.code(400).send({ message: "Invalid email" });
		}
		const mode: "link" | "code" =
			rawMode === "code" || rawMode === "link" ? rawMode : "link";

		const sql = getSql();
		const ip = getClientIp(request as any);

		const ipLimit = await enforceRateLimit(sql, `verify:send:ip:${ip}`, 10, 60 * 30);
		if (!ipLimit.allowed) {
			reply.header("Retry-After", String(ipLimit.retryAfterSeconds));
			return reply.code(429).send({ message: "Too many requests. Please wait and try again." });
		}

		const emailLimit = await enforceRateLimit(
			sql,
			`verify:send:email:${email}`,
			3,
			60 * 30
		);
		if (!emailLimit.allowed) {
			reply.header("Retry-After", String(emailLimit.retryAfterSeconds));
			return reply.code(429).send({
				message: "Too many verification emails sent recently. Please wait a bit and try again."
			});
		}

		const expiresAt = new Date(Date.now() + 30 * 60_000);
		const shouldUseCode = mode === "code";
		const code = shouldUseCode ? generateCode() : null;
		const codeEncrypted = code ? encryptVerificationCode(code) : null;
		const codeExpiresAt = shouldUseCode ? new Date(Date.now() + 10 * 60_000) : null;

		let token = createMagicToken();
		let tokenHash = hashMagicToken(token);
		const sessionToken = createVerificationSessionToken();
		const sessionHash = hashVerificationSessionToken(sessionToken);
		let verificationId: string | undefined;

		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const inserted = await sql`
					INSERT INTO email_verifications (
						email, token_hash, session_hash, code_encrypted,
						code_expires_at, expires_at, verified, use_code, code_attempts
					) VALUES (
						${email}, ${tokenHash}, ${sessionHash}, ${codeEncrypted},
						${codeExpiresAt ? codeExpiresAt.toISOString() : null},
						${expiresAt.toISOString()}, FALSE, ${shouldUseCode}, 0
					) RETURNING id
				`;
				verificationId = (inserted[0] as any)?.id as string | undefined;
				break;
			} catch {
				if (attempt === 2) throw new Error("Failed to create verification record");
				token = createMagicToken();
				tokenHash = hashMagicToken(token);
			}
		}

		const origin = `${request.protocol}://${request.hostname}`;
		const magicLink = `${origin}/verify?token=${token}`;

		reply.header("set-cookie", sessionCookie(sessionToken));
		return reply.send({
			verificationId,
			expiresAt: expiresAt.toISOString(),
			...(process.env.NODE_ENV !== "production" ? { magicLink } : {})
		});
	});

	// POST /verify/code
	// Validates a 6-digit code submitted by the user.
	fastify.post("/verify/code", async (request, reply) => {
		const body = request.body as { verificationId?: unknown; code?: unknown };
		const verificationId =
			typeof body.verificationId === "string" ? body.verificationId : null;
		const code =
			typeof body.code === "string" ? body.code.trim() : null;

		if (!verificationId || !/^[0-9a-f-]{36}$/.test(verificationId)) {
			return reply.code(400).send({ message: "Invalid verificationId" });
		}
		if (!code || !/^\d{6}$/.test(code)) {
			return reply.code(400).send({ message: "Invalid code format" });
		}

		const sql = getSql();
		const ip = getClientIp(request as any);

		const sessionToken = getCookie(request.headers.cookie, "vr");
		if (!sessionToken) {
			return reply.code(403).send({ message: "Missing verification session" });
		}
		const sessionHash = hashVerificationSessionToken(sessionToken);

		const rl = await enforceRateLimit(sql, `verify:code:ip:${ip}`, 120, 60);
		if (!rl.allowed) {
			reply.header("Retry-After", String(rl.retryAfterSeconds));
			return reply.code(429).send({ message: "Too many requests" });
		}

		const rlPer = await enforceRateLimit(sql, `verify:code:vid:${verificationId}`, 30, 60);
		if (!rlPer.allowed) {
			reply.header("Retry-After", String(rlPer.retryAfterSeconds));
			return reply.code(429).send({ message: "Too many requests" });
		}

		const rows = await sql`
			SELECT id, email, code_encrypted, code_expires_at, use_code,
				verified, expires_at, code_attempts, session_hash
			FROM email_verifications
			WHERE id = ${verificationId}
			LIMIT 1
		`;
		const row = rows[0] as any;
		if (!row) return reply.code(404).send({ message: "Invalid token" });

		if (!row.session_hash || row.session_hash !== sessionHash) {
			return reply.code(403).send({ message: "Invalid verification session" });
		}
		if (row.verified) return reply.code(409).send({ message: "Already verified" });
		if (new Date(row.expires_at) <= new Date()) {
			return reply.code(410).send({ message: "Token expired" });
		}
		if (!row.use_code) {
			return reply.code(409).send({ message: "This verification is not in code mode" });
		}
		if (row.code_expires_at && new Date(row.code_expires_at) <= new Date()) {
			return reply.code(410).send({ message: "Code expired. Request a new code." });
		}

		const MAX_ATTEMPTS = 5;
		if ((row.code_attempts ?? 0) >= MAX_ATTEMPTS) {
			return reply.code(429).send({ message: "Too many incorrect attempts" });
		}

		let storedCode: string | null = null;
		try {
			storedCode = row.code_encrypted ? decryptVerificationCode(row.code_encrypted) : null;
		} catch {
			storedCode = null;
		}

		const isMatch =
			storedCode &&
			storedCode.length === code.length &&
			timingSafeEqual(Buffer.from(storedCode), Buffer.from(code));

		if (!isMatch) {
			await sql`
				UPDATE email_verifications SET code_attempts = code_attempts + 1
				WHERE id = ${verificationId}
			`;
			const remaining = Math.max(0, MAX_ATTEMPTS - ((row.code_attempts ?? 0) + 1));
			return reply.code(400).send({ message: "Incorrect code", remainingAttempts: remaining });
		}

		await sql`
			UPDATE email_verifications
			SET verified = TRUE, verified_at = NOW(), used_at = NOW(),
				code_encrypted = NULL, code_expires_at = NULL,
				use_code = FALSE, expires_at = NOW()
			WHERE id = ${verificationId}
		`;
		return reply.send({ ok: true });
	});

	// POST /verify/request-code
	// Requests a fresh 6-digit code for an existing verification session.
	fastify.post("/verify/request-code", async (request, reply) => {
		const body = request.body as { verificationId?: unknown };
		const verificationId =
			typeof body.verificationId === "string" ? body.verificationId : null;
		if (!verificationId || !/^[0-9a-f-]{36}$/.test(verificationId)) {
			return reply.code(400).send({ message: "Invalid verificationId" });
		}

		const sql = getSql();
		const ip = getClientIp(request as any);

		const sessionToken = getCookie(request.headers.cookie, "vr");
		if (!sessionToken) {
			return reply.code(403).send({ message: "Missing verification session" });
		}
		const sessionHash = hashVerificationSessionToken(sessionToken);

		const rl = await enforceRateLimit(sql, `verify:request-code:ip:${ip}`, 60, 60);
		if (!rl.allowed) {
			reply.header("Retry-After", String(rl.retryAfterSeconds));
			return reply.code(429).send({ message: "Too many requests" });
		}
		const rlPer = await enforceRateLimit(sql, `verify:request-code:vid:${verificationId}`, 3, 60 * 10);
		if (!rlPer.allowed) {
			reply.header("Retry-After", String(rlPer.retryAfterSeconds));
			return reply.code(429).send({ message: "Too many code requests. Please wait and try again." });
		}

		const rows = await sql`
			SELECT id, email, expires_at, verified, session_hash
			FROM email_verifications WHERE id = ${verificationId} LIMIT 1
		`;
		const row = rows[0] as any;
		if (!row) return reply.code(404).send({ message: "Invalid token" });
		if (!row.session_hash || row.session_hash !== sessionHash) {
			return reply.code(403).send({ message: "Invalid verification session" });
		}
		if (row.verified) return reply.code(409).send({ message: "Already verified" });
		if (new Date(row.expires_at) <= new Date()) {
			return reply.code(410).send({ message: "Token expired" });
		}

		const code = generateCode();
		const codeEncrypted = encryptVerificationCode(code);
		await sql`
			UPDATE email_verifications
			SET code_encrypted = ${codeEncrypted}, use_code = TRUE, code_attempts = 0,
				code_expires_at = NOW() + INTERVAL '10 minutes',
				expires_at = LEAST(expires_at, NOW() + INTERVAL '10 minutes')
			WHERE id = ${verificationId}
		`;
		return reply.send({ ok: true });
	});

	// POST /verify/status
	// Checks whether a verification session has been verified.
	fastify.post("/verify/status", async (request, reply) => {
		const body = request.body as { verificationId?: unknown };
		const verificationId =
			typeof body.verificationId === "string" ? body.verificationId : null;
		if (!verificationId || !/^[0-9a-f-]{36}$/.test(verificationId)) {
			return reply.code(400).send({ message: "Invalid verificationId" });
		}

		const sql = getSql();
		const ip = getClientIp(request as any);

		const rl = await enforceRateLimit(sql, `verify:status:ip:${ip}`, 120, 60);
		if (!rl.allowed) {
			reply.header("Retry-After", String(rl.retryAfterSeconds));
			return reply.code(429).send({ message: "Too many requests" });
		}

		const sessionToken = getCookie(request.headers.cookie, "vr");
		if (!sessionToken) {
			return reply.code(403).send({ message: "Missing verification session" });
		}
		const sessionHash = hashVerificationSessionToken(sessionToken);

		const rows = await sql`
			SELECT id, verified, use_code, expires_at, session_hash
			FROM email_verifications WHERE id = ${verificationId} LIMIT 1
		`;
		const row = rows[0] as any;
		if (!row) return reply.code(404).send({ message: "Invalid verification" });

		if (!row.session_hash || row.session_hash !== sessionHash) {
			return reply.code(403).send({ message: "Invalid verification session" });
		}

		if (new Date(row.expires_at) <= new Date() && !row.verified) {
			return reply.code(410).send({ message: "Verification expired" });
		}

		return reply.send({
			verified: Boolean(row.verified),
			useCode: Boolean(row.use_code),
			expiresAt: new Date(row.expires_at).toISOString()
		});
	});
}
