// app/api/[...path]/route.ts
//
// Catch-all API handler: forwards every /api/* request to the Fastify app
// via fastify.inject(), so all backend routes work on Vercel serverless
// without needing a separately-deployed Fastify server.

import { type NextRequest, NextResponse } from "next/server";
import { getApp } from "../../../services/app";

const SKIP_HEADERS = new Set([
	"content-length",
	"transfer-encoding",
	"connection"
]);

async function handle(
	request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
	const { path } = await params;

	let app: Awaited<ReturnType<typeof getApp>>;
	try {
		app = await getApp();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const stack = err instanceof Error ? err.stack : undefined;
		console.error("[catch-all] getApp() failed:", err);
		return NextResponse.json(
			{ error: "Backend initialization failed", detail: message, stack },
			{ status: 500 }
		);
	}

	const url = new URL(request.url);
	const injectUrl = "/" + path.join("/") + url.search;

	const headers: Record<string, string> = {};
	request.headers.forEach((value, key) => {
		headers[key] = value;
	});

	let payload: Buffer | undefined;
	if (request.method !== "GET" && request.method !== "HEAD") {
		const buf = await request.arrayBuffer();
		if (buf.byteLength > 0) payload = Buffer.from(buf);
	}

	const injected = await app.inject({
		method: request.method as
			| "GET"
			| "POST"
			| "PUT"
			| "PATCH"
			| "DELETE"
			| "HEAD"
			| "OPTIONS",
		url: injectUrl,
		headers,
		payload
	});

	const resHeaders = new Headers();
	for (const [key, value] of Object.entries(injected.headers)) {
		if (!SKIP_HEADERS.has(key.toLowerCase()) && value !== undefined) {
			resHeaders.set(key, String(value));
		}
	}

	return new NextResponse(injected.rawPayload, {
		status: injected.statusCode,
		headers: resHeaders
	});
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
