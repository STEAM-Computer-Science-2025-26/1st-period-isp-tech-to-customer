import { getSql } from "@/db/connection";
import Link from "next/link";
import { CopyCode } from "./CopyCode";

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
	const rows = await sql`
		SELECT email, code, use_code, verified, expires_at
		FROM email_verifications
		WHERE token = ${token}
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
						{row.code ? (
							<CopyCode code={row.code} />
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

	if (!row.verified) {
		await sql`
			UPDATE email_verifications
			SET verified = TRUE
			WHERE token = ${token}
		`;
	}

	return (
		<div className="min-h-screen flex items-center justify-center p-6">
			<div className="w-full max-w-lg bg-background-primary rounded-2xl shadow-lg p-8 text-center">
				<h1 className="text-2xl font-semibold text-accent-text">
					Email verified
				</h1>
				<p className="mt-2 text-text-secondary">
					You can return to your computer to continue setting your password.
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
