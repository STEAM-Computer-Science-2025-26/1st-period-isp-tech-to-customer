import { getSql } from "@/db/connection";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
	token: z.string().trim().min(16).max(128)
});

function generateCode(): string {
	return String(Math.floor(100000 + Math.random() * 900000));
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

	const { token } = parsed.data;
	const sql = getSql();

	const rows = await sql`
		SELECT id, email, expires_at, verified
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

	const code = generateCode();
	await sql`
		UPDATE email_verifications
		SET code = ${code}, use_code = TRUE, code_attempts = 0
		WHERE token = ${token}
	`;

	// For now, just log. The /verify page shows the code on the device that opened the magic link.
	console.log("[verify/request-code] code for", row.email, ":", code);

	return Response.json({ ok: true });
}
