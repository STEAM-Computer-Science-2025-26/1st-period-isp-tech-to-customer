type RateLimitResult =
	| { allowed: true }
	| { allowed: false; retryAfterSeconds: number };

export type SqlTag = (
	strings: TemplateStringsArray,
	...values: unknown[]
) => Promise<Array<Record<string, unknown>>>;

export async function enforceRateLimit(
	sql: SqlTag,
	key: string,
	limit: number,
	windowSeconds: number
): Promise<RateLimitResult> {
	const rows = (await sql`
		INSERT INTO api_rate_limits (key, hits, reset_at)
		VALUES (${key}, 1, NOW() + make_interval(secs => ${windowSeconds}))
		ON CONFLICT (key) DO UPDATE
		SET hits = CASE
				WHEN api_rate_limits.reset_at <= NOW() THEN 1
				ELSE api_rate_limits.hits + 1
			END,
			reset_at = CASE
				WHEN api_rate_limits.reset_at <= NOW() THEN NOW() + make_interval(secs => ${windowSeconds})
				ELSE api_rate_limits.reset_at
			END
		RETURNING hits::int AS hits, reset_at
	`) as Array<{ hits?: number; reset_at?: string }>;

	const row = rows[0];
	const hits = row?.hits ?? 1;
	if (hits <= limit) return { allowed: true };

	const resetAt = row?.reset_at ? new Date(row.reset_at) : new Date();
	const retryAfterSeconds = Math.max(
		1,
		Math.ceil((resetAt.getTime() - Date.now()) / 1000)
	);
	return { allowed: false, retryAfterSeconds };
}
