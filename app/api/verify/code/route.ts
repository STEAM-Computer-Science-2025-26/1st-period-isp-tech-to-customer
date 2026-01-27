import { getSql } from "@/db/connection";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
	token: z.string().trim().min(16).max(128),
	code: z
		.string()
		.trim()
		.regex(/^\d{6}$/)
});

const MAX_CODE_ATTEMPTS = 5;

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

	const { token, code } = parsed.data;
	const sql = getSql();

	const rows = await sql`
		SELECT id, email, code AS stored_code, use_code, verified, expires_at, code_attempts
		FROM email_verifications
		WHERE token = ${token}
		LIMIT 1
	`;

	const row = rows[0];
	if (!row) {
		return Response.json({ message: "Invalid token" }, { status: 404 });
	}

	if (row.verified) {
		return Response.json({ message: "Already verified" }, { status: 409 });
	}

	if (new Date(row.expires_at) <= new Date()) {
		return Response.json({ message: "Token expired" }, { status: 410 });
	}

	if (!row.use_code) {
		return Response.json(
			{ message: "This token is not in code mode" },
			{ status: 409 }
		);
	}

	if ((row.code_attempts ?? 0) >= MAX_CODE_ATTEMPTS) {
		return Response.json(
			{ message: "Too many incorrect attempts" },
			{ status: 429 }
		);
	}

	if (!row.stored_code || row.stored_code !== code) {
		await sql`
			UPDATE email_verifications
			SET code_attempts = code_attempts + 1
			WHERE token = ${token}
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
		SET verified = TRUE
		WHERE token = ${token}
	`;

	console.log("[verify/code] verified:", row.email);
	return Response.json({ ok: true });
}
