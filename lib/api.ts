// lib/api.ts
// Central fetch client — automatically attaches auth headers and the Fastify base URL.
// All query hooks should use apiFetch instead of calling fetch() directly.

import { authHeaders } from "@/lib/auth";

// Typed error so callers can check `error instanceof ApiError && error.status === 401`
export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = "ApiError";
	}
}

export async function apiFetch<T>(
	path: string,
	options?: RequestInit
): Promise<T> {
	// All requests go through the Next.js /api/ proxy rewrite (next.config.ts),
	// which forwards them to Fastify. This works in both local dev and on Vercel.
	const normalized = path.startsWith("/") ? path : `/${path}`;
	const url = normalized.startsWith("/api/") ? normalized : `/api${normalized}`;

	const res = await fetch(url, {
		...options,
		headers: {
			...authHeaders(),
			...options?.headers
		}
	});

	if (!res.ok) {
		throw new ApiError(res.status, `Request failed (${res.status}) — ${path}`);
	}

	return res.json() as Promise<T>;
}
