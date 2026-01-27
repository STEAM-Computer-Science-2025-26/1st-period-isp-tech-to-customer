import { getSql } from "@/db/connection";
import { randomBytes } from "node:crypto";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
	email: z.string().trim().email().max(255)
});

function createToken(): string {
	return randomBytes(32).toString("hex");
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

	const email = parsed.data.email;
	const sql = getSql();

	// Rate limit: max 3 sends per 30 minutes per email address
	const rl = await sql`
		SELECT COUNT(*)::int AS count
		FROM email_verifications
		WHERE email = ${email}
			AND created_at > NOW() - INTERVAL '30 minutes'
	`;

	if ((rl[0]?.count ?? 0) >= 3) {
		return Response.json(
			{
				message:
					"Too many verification emails sent recently. Please wait a bit and try again."
			},
			{ status: 429 }
		);
	}

	const expiresAt = new Date(Date.now() + 30 * 60_000);

	// Extremely low collision chance, but keep it safe.
	let token = createToken();
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			await sql`
				INSERT INTO email_verifications (email, token, expires_at, verified, use_code)
				VALUES (${email}, ${token}, ${expiresAt.toISOString()}, FALSE, FALSE)
			`;
			break;
		} catch (err) {
			if (attempt === 2) throw err;
			token = createToken();
		}
	}

	const origin = new URL(request.url).origin;
	const magicLink = `${origin}/verify?token=${token}`;
	console.log("[verify/send] magic link:", magicLink);

	return Response.json({ token, expiresAt: expiresAt.toISOString() });
}
