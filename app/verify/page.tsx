import { getSql } from "@/db/connection";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CopyCode } from "./CopyCode";
import {
	decryptVerificationCode,
	hashMagicToken
} from "@/services/verifyCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function VerifyPage({
	searchParams
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const sp = await searchParams;
	const token = typeof sp.token === "string" ? sp.token : undefined;

	if (!token) {
		return (
			<div className="min-h-screen flex items-center justify-center p-6">
				<div className="w-full max-w-lg bg-background-primary rounded-2xl shadow-lg p-8 text-center">
					<h1 className="text-2xl font-semibold text-accent-text">
						Missing token
					</h1>
					<p className="mt-2 text-text-secondary">
						This verification link is missing a token.
					</p>
					<Link
						href="/login"
						className="inline-block mt-6 text-accent-text hover:text-info-text"
					>
						Back to login
					</Link>
				</div>
			</div>
		);
	}

	const sql = getSql();
	const tokenHash = hashMagicToken(token);
	const rows = await sql`
		SELECT email, code_encrypted, code_expires_at, use_code, verified, expires_at
		FROM email_verifications
		WHERE token_hash = ${tokenHash}
		LIMIT 1
	`;

	const row = rows[0];
	if (!row) {
		return (
			<div className="min-h-screen flex items-center justify-center p-6">
				<div className="w-full max-w-lg bg-background-primary rounded-2xl shadow-lg p-8 text-center">
					<h1 className="text-2xl font-semibold text-accent-text">
						Invalid link
					</h1>
					<p className="mt-2 text-text-secondary">
						This verification token is not valid.
					</p>
					<Link
						href="/login"
						className="inline-block mt-6 text-accent-text hover:text-info-text"
					>
						Back to login
					</Link>
				</div>
			</div>
		);
	}

	if (row.verified && !row.use_code) {
		redirect(
			`/login?register=1&stage=3&email=${encodeURIComponent(row.email)}`
		);
	}

	const expired = new Date(row.expires_at) <= new Date();
	if (expired) {
		return (
			<div className="min-h-screen flex items-center justify-center p-6">
				<div className="w-full max-w-lg bg-background-primary rounded-2xl shadow-lg p-8 text-center">
					<h1 className="text-2xl font-semibold text-accent-text">
						Link expired
					</h1>
					<p className="mt-2 text-text-secondary">
						This verification link has expired. Please request a new one.
					</p>
					<Link
						href="/login"
						className="inline-block mt-6 text-accent-text hover:text-info-text"
					>
						Back to login
					</Link>
				</div>
			</div>
		);
	}

	if (row.use_code) {
		let decryptedCode: string | null = null;
		const codeExpired =
			row.code_expires_at && new Date(row.code_expires_at) <= new Date();
		if (!codeExpired && row.code_encrypted) {
			try {
				decryptedCode = decryptVerificationCode(row.code_encrypted);
			} catch {
				decryptedCode = null;
			}
		}

		return (
			<div className="min-h-screen flex items-center justify-center p-6">
				<div className="w-full max-w-lg bg-background-primary rounded-2xl shadow-lg p-8 text-center">
					<h1 className="text-2xl font-semibold text-accent-text">
						Your verification code
					</h1>
					<p className="mt-2 text-text-secondary">
						On your computer, choose “Use a verification code instead”, then
						enter this code.
					</p>
					<div className="mt-6">
						{codeExpired ? (
							<p className="text-text-secondary">
								This code has expired. Go back to your computer and request a
								new code.
							</p>
						) : decryptedCode ? (
							<CopyCode code={decryptedCode} />
						) : (
							<p className="text-text-secondary">
								A code hasn&apos;t been generated yet. Go back to your computer
								and click “Use a verification code instead”.
							</p>
						)}
					</div>
					<p className="mt-6 text-text-tertiary text-sm">
						Sent to: <strong>{row.email}</strong>
					</p>
				</div>
			</div>
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
		WHERE token_hash = ${tokenHash}
	`;

	redirect(`/login?register=1&stage=3&email=${encodeURIComponent(row.email)}`);
}
