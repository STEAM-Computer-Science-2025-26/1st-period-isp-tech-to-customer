import type { JWTPayload } from "../middleware/auth";

export function buildSetClause(
	fields: [string, unknown][],
	startIdx = 1
): { clause: string; values: unknown[]; nextIdx: number } {
	const parts: string[] = [];
	const values: unknown[] = [];
	let idx = startIdx;

	for (const [col, val] of fields) {
		if (val !== undefined) {
			parts.push(`${col} = $${idx++}`);
			values.push(val ?? null);
		}
	}

	return { clause: parts.join(", "), values, nextIdx: idx };
}

export function getUser(request: any): JWTPayload {
	return request.user as JWTPayload;
}

export function isDev(user: JWTPayload): boolean {
	return user.role === "dev";
}

export function resolveCompanyId(
	user: JWTPayload,
	bodyCompanyId?: string
): string | null {
	if (isDev(user)) return bodyCompanyId ?? user.companyId ?? null;
	return user.companyId ?? null;
}
