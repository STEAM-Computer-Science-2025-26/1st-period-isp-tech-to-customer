import { getSql } from "@/db/connection";
import { z } from "zod";
import { enforceRateLimit } from "@/services/rateLimit";
import {
	createMagicToken,
	hashMagicToken,
	createVerificationSessionToken,
	hashVerificationSessionToken,
	encryptVerificationCode
} from "@/services/verifyCrypto";
import { randomInt } from "node:crypto";

export const runtime = "nodejs";

const bodySchema = z.object({
	email: z.string().trim().email().max(255),
	mode: z.enum(["link", "code"]).optional()
});

function generateCode(): string {
	return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function getClientIp(request: Request): string {
	const xff = request.headers.get("x-forwarded-for");
	if (xff) return xff.split(",")[0]?.trim() || "unknown";
	const xri = request.headers.get("x-real-ip");
	if (xri) return xri.trim();
	return "unknown";
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
	const email = (parsed.data as Body).email;
	const mode: "link" | "code" = (parsed.data as Body).mode ?? "link";
	const sql = getSql();
	const ip = getClientIp(request);

	const ipLimit = await enforceRateLimit(
		sql,
		`verify:send:ip:${ip}`,
		10,
		60 * 30
	);
	if (!ipLimit.allowed) {
		return Response.json(
			{ message: "Too many requests. Please wait and try again." },
			{
				status: 429,
				headers: { "Retry-After": String(ipLimit.retryAfterSeconds) }
			}
		);
	}

	const emailLimit = await enforceRateLimit(
		sql,
		`verify:send:email:${email.toLowerCase()}`,
		3,
		60 * 30
	);
	if (!emailLimit.allowed) {
		return Response.json(
			{
				message:
					"Too many verification emails sent recently. Please wait a bit and try again."
			},
			{
				status: 429,
				headers: { "Retry-After": String(emailLimit.retryAfterSeconds) }
			}
		);
	}

	const expiresAt = new Date(Date.now() + 30 * 60_000);
	const shouldUseCode = mode === "code";
	const code = shouldUseCode ? generateCode() : null;
	const codeEncrypted = code ? encryptVerificationCode(code) : null;
	const codeExpiresAt = shouldUseCode
		? new Date(Date.now() + 10 * 60_000)
		: null;

	// Extremely low collision chance, but keep it safe.
	let token = createMagicToken();
	let tokenHash = hashMagicToken(token);
	const sessionToken = createVerificationSessionToken();
	const sessionHash = hashVerificationSessionToken(sessionToken);
	let verificationId: string | undefined;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			const inserted = await sql`
				INSERT INTO email_verifications (
					email,
					token_hash,
					session_hash,
					code_encrypted,
					code_expires_at,
					expires_at,
					verified,
					use_code,
					code_attempts
				)
				VALUES (
					${email},
					${tokenHash},
					${sessionHash},
					${codeEncrypted},
					${codeExpiresAt ? codeExpiresAt.toISOString() : null},
					${expiresAt.toISOString()},
					FALSE,
					${shouldUseCode},
					0
				)
				RETURNING id
			`;
			verificationId = inserted[0]?.id as string | undefined;
			break;
		} catch (err) {
			if (attempt === 2) throw err;
			token = createMagicToken();
			tokenHash = hashMagicToken(token);
		}
	}

	// Never return the secret token to the browser.
	// In production, this token should only be delivered via email.
	const origin = new URL(request.url).origin;
	const magicLink = `${origin}/verify?token=${token}`;
	const cookie = [
		`vr=${sessionToken}`,
		"Path=/",
		"Max-Age=1800",
		"HttpOnly",
		"SameSite=Lax",
		process.env.NODE_ENV === "production" ? "Secure" : ""
	]
		.filter(Boolean)
		.join("; ");

	return Response.json(
		{
			verificationId,
			expiresAt: expiresAt.toISOString(),
			...(process.env.NODE_ENV !== "production" ? { magicLink } : {})
		},
		{ headers: { "Set-Cookie": cookie } }
	);
}
