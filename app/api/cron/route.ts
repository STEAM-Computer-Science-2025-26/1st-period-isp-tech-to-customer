// app/api/cron/run/route.ts
// POST /api/cron/run
// Protected by CRON_SECRET env var.
// Call this from Vercel Cron Jobs, GitHub Actions, or any external scheduler.
//
// Vercel cron config (vercel.json):
// {
//   "crons": [{ "path": "/api/cron/run", "schedule": "0 * * * *" }]
// }

import { NextRequest, NextResponse } from "next/server";
import { runAllCronJobs } from "@/services/cron/cronRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds

export async function POST(request: NextRequest) {
	// Verify cron secret
	const authHeader = request.headers.get("authorization");
	const secret = process.env.CRON_SECRET;

	if (!secret) {
		console.error("[cron] CRON_SECRET not set — refusing to run");
		return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
	}

	if (authHeader !== `Bearer ${secret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const startTime = Date.now();
		const results = await runAllCronJobs();
		const durationMs = Date.now() - startTime;

		return NextResponse.json({
			ok: true,
			durationMs,
			results,
			ranAt: new Date().toISOString()
		});
	} catch (err: any) {
		console.error("[cron] Cron run failed:", err);
		return NextResponse.json(
			{ error: "Cron run failed", detail: err?.message },
			{ status: 500 }
		);
	}
}

// Also support GET for Vercel Cron (it sends GET by default)
export async function GET(request: NextRequest) {
	return POST(request);
}