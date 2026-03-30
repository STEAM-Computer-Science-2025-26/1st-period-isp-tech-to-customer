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
	// All paths should start with /api/ so they go through the Next.js proxy
	// rewrite (next.config.ts), which forwards to Fastify.
	const url = path;

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
