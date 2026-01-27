import { getSql } from "@/db/connection";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { enforceRateLimit } from "@/services/rateLimit";
import {
	decryptVerificationCode,
	hashVerificationSessionToken
} from "@/services/verifyCrypto";

export const runtime = "nodejs";

const bodySchema = z.object({
	verificationId: z.string().uuid(),
	code: z
		.string()
		.trim()
		.regex(/^\d{6}$/)
});

const MAX_CODE_ATTEMPTS = 5;

function getClientIp(request: Request): string {
	const xff = request.headers.get("x-forwarded-for");
	if (xff) return xff.split(",")[0]?.trim() || "unknown";
	const xri = request.headers.get("x-real-ip");
	if (xri) return xri.trim();
	return "unknown";
}

function getCookie(request: Request, name: string): string | undefined {
	const raw = request.headers.get("cookie") ?? "";
	for (const part of raw.split(";")) {
		const [k, ...rest] = part.trim().split("=");
		if (k === name) return rest.join("=");
	}
	return undefined;
}

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ message: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ message: "Invalid request", issues: parsed.error.issues },
			{ status: 400 }
		);
	}

	type Body = z.infer<typeof bodySchema>;
	const { verificationId, code } = parsed.data as Body;
	const sql = getSql();
	const ip = getClientIp(request);

	const sessionToken = getCookie(request, "vr");
	if (!sessionToken) {
		return Response.json(
			{ message: "Missing verification session" },
			{ status: 403 }
		);
	}
	const sessionHash = hashVerificationSessionToken(sessionToken);

	const rl = await enforceRateLimit(sql, `verify:code:ip:${ip}`, 120, 60);
	if (!rl.allowed) {
		return Response.json(
			{ message: "Too many requests" },
			{ status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
		);
	}

	const rlPerVerification = await enforceRateLimit(
		sql,
		`verify:code:vid:${verificationId}`,
		30,
		60
	);
	if (!rlPerVerification.allowed) {
		return Response.json(
			{ message: "Too many requests" },
			{
				status: 429,
				headers: {
					"Retry-After": String(rlPerVerification.retryAfterSeconds)
				}
			}
		);
	}

	const rows = await sql`
		SELECT
			id,
			email,
			code_encrypted,
			code_expires_at,
			use_code,
			verified,
			expires_at,
			code_attempts,
			session_hash
		FROM email_verifications
		WHERE id = ${verificationId}
		LIMIT 1
	`;

	const row = rows[0];
	if (!row) {
		return Response.json({ message: "Invalid token" }, { status: 404 });
	}

	if (!row.session_hash || row.session_hash !== sessionHash) {
		return Response.json(
			{ message: "Invalid verification session" },
			{ status: 403 }
		);
	}

	if (row.verified) {
		return Response.json({ message: "Already verified" }, { status: 409 });
	}

	if (new Date(row.expires_at) <= new Date()) {
		return Response.json({ message: "Token expired" }, { status: 410 });
	}

	if (!row.use_code) {
		return Response.json(
			{ message: "This verification is not in code mode" },
			{ status: 409 }
		);
	}

	if (row.code_expires_at && new Date(row.code_expires_at) <= new Date()) {
		return Response.json(
			{ message: "Code expired. Request a new code." },
			{ status: 410 }
		);
	}

	if ((row.code_attempts ?? 0) >= MAX_CODE_ATTEMPTS) {
		return Response.json(
			{ message: "Too many incorrect attempts" },
			{ status: 429 }
		);
	}

	let storedCode: string | null = null;
	try {
		storedCode = row.code_encrypted
			? decryptVerificationCode(row.code_encrypted)
			: null;
	} catch {
		storedCode = null;
	}

	const isMatch =
		storedCode &&
		storedCode.length === code.length &&
		timingSafeEqual(Buffer.from(storedCode), Buffer.from(code));

	if (!isMatch) {
		await sql`
			UPDATE email_verifications
			SET code_attempts = code_attempts + 1
			WHERE id = ${verificationId}
		`;

		const remaining = Math.max(
			0,
			MAX_CODE_ATTEMPTS - ((row.code_attempts ?? 0) + 1)
		);

		return Response.json(
			{ message: "Incorrect code", remainingAttempts: remaining },
			{ status: 400 }
		);
	}

	await sql`
		UPDATE email_verifications
		SET verified = TRUE,
			verified_at = NOW(),
			used_at = NOW(),
			code_encrypted = NULL,
			code_expires_at = NULL,
			use_code = FALSE,
			expires_at = NOW()
		WHERE id = ${verificationId}
	`;
	return Response.json({ ok: true });
}
