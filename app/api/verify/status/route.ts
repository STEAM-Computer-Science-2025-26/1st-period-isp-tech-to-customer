import { getSql } from "@/db/connection";
import { z } from "zod";
import { enforceRateLimit } from "@/services/rateLimit";
import { hashVerificationSessionToken } from "@/services/verifyCrypto";

export const runtime = "nodejs";

const bodySchema = z.object({
	verificationId: z.string().uuid()
});

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
	const { verificationId } = parsed.data as Body;
	const sql = getSql();
	const ip = getClientIp(request);

	const rl = await enforceRateLimit(sql, `verify:status:ip:${ip}`, 120, 60);
	if (!rl.allowed) {
		return Response.json(
			{ message: "Too many requests" },
			{ status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
		);
	}

	const sessionToken = getCookie(request, "vr");
	if (!sessionToken) {
		return Response.json(
			{ message: "Missing verification session" },
			{ status: 403 }
		);
	}
	const sessionHash = hashVerificationSessionToken(sessionToken);

	const rows = await sql`
		SELECT id, verified, use_code, expires_at, session_hash
		FROM email_verifications
		WHERE id = ${verificationId}
		LIMIT 1
	`;

	const row = rows[0];
	if (!row) {
		return Response.json({ message: "Invalid verification" }, { status: 404 });
	}

	if (!row.session_hash || row.session_hash !== sessionHash) {
		return Response.json(
			{ message: "Invalid verification session" },
			{ status: 403 }
		);
	}

	const expired = new Date(row.expires_at) <= new Date();
	if (expired && !row.verified) {
		return Response.json({ message: "Verification expired" }, { status: 410 });
	}

	return Response.json({
		verified: Boolean(row.verified),
		useCode: Boolean(row.use_code),
		expiresAt: new Date(row.expires_at).toISOString()
	});
}
