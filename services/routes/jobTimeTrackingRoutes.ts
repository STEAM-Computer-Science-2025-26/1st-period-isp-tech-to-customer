// services/routes/jobTimeTrackingRoutes.ts
// Drive time vs wrench time logging.
// Techs (or the mobile app) hit these endpoints as events happen.
//
// Endpoints:
//   POST  /jobs/:jobId/time-tracking          — initialize tracking record at dispatch
//   PATCH /jobs/:jobId/time-tracking/departed — tech left for job
//   PATCH /jobs/:jobId/time-tracking/arrived  — tech on site
//   PATCH /jobs/:jobId/time-tracking/work-started — wrench time begins
//   PATCH /jobs/:jobId/time-tracking/work-ended   — wrench time ends
//   PATCH /jobs/:jobId/time-tracking/departed-job — tech left site
//   GET   /jobs/:jobId/time-tracking          — get current tracking state

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { authenticate, JWTPayload } from "../middleware/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getUser(request: any): JWTPayload {
	return request.user as JWTPayload;
}

function resolveCompanyId(user: JWTPayload): string | null {
	return user.companyId ?? null;
}

function isDev(user: JWTPayload): boolean {
	return user.role === "dev";
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

export async function jobTimeTrackingRoutes(fastify: FastifyInstance) {

	// -------------------------------------------------------------------------
	// POST /jobs/:jobId/time-tracking
	// Initialize tracking record. Called at dispatch time.
	// Copies estimated_duration_minutes from the job as a snapshot.
	// -------------------------------------------------------------------------
	fastify.post(
		"/jobs/:jobId/time-tracking",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const user = getUser(request);
			const { jobId } = request.params as { jobId: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [job] = (await sql`
				SELECT id, company_id, assigned_tech_id, estimated_duration_minutes
				FROM jobs
				WHERE id = ${jobId}
				  AND (${isDev(user)} OR company_id = ${companyId})
			`) as any[];

			if (!job) return reply.code(404).send({ error: "Job not found" });
			if (!job.assigned_tech_id) {
				return reply.code(400).send({ error: "Job has no assigned tech" });
			}

			// Upsert — safe to call multiple times
			const [tracking] = (await sql`
				INSERT INTO job_time_tracking (
					job_id, tech_id, company_id,
					estimated_duration_minutes,
					dispatched_at
				) VALUES (
					${jobId},
					${job.assigned_tech_id},
					${job.company_id},
					${job.estimated_duration_minutes ?? null},
					NOW()
				)
				ON CONFLICT (job_id) DO UPDATE SET
					dispatched_at = COALESCE(job_time_tracking.dispatched_at, NOW()),
					updated_at = NOW()
				RETURNING *
			`) as any[];

			return reply.code(201).send({ tracking });
		}
	);

	// -------------------------------------------------------------------------
	// PATCH /jobs/:jobId/time-tracking/departed
	// Tech left their previous location heading to this job.
	// -------------------------------------------------------------------------
	fastify.patch(
		"/jobs/:jobId/time-tracking/departed",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const { jobId } = request.params as { jobId: string };
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [row] = (await sql`
				UPDATE job_time_tracking SET
					departed_at = NOW(),
					updated_at = NOW()
				WHERE job_id = ${jobId}
				  AND (${isDev(user)} OR company_id = ${companyId})
				RETURNING *
			`) as any[];

			if (!row) return reply.code(404).send({ error: "Time tracking record not found" });
			return { tracking: row };
		}
	);

	// -------------------------------------------------------------------------
	// PATCH /jobs/:jobId/time-tracking/arrived
	// Tech arrived on site.
	// -------------------------------------------------------------------------
	fastify.patch(
		"/jobs/:jobId/time-tracking/arrived",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const { jobId } = request.params as { jobId: string };
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [row] = (await sql`
				UPDATE job_time_tracking SET
					arrived_at = NOW(),
					updated_at = NOW()
				WHERE job_id = ${jobId}
				  AND (${isDev(user)} OR company_id = ${companyId})
				RETURNING *
			`) as any[];

			if (!row) return reply.code(404).send({ error: "Time tracking record not found" });
			return { tracking: row };
		}
	);

	// -------------------------------------------------------------------------
	// PATCH /jobs/:jobId/time-tracking/work-started
	// Wrench time begins.
	// -------------------------------------------------------------------------
	fastify.patch(
		"/jobs/:jobId/time-tracking/work-started",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const { jobId } = request.params as { jobId: string };
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [row] = (await sql`
				UPDATE job_time_tracking SET
					work_started_at = NOW(),
					updated_at = NOW()
				WHERE job_id = ${jobId}
				  AND (${isDev(user)} OR company_id = ${companyId})
				RETURNING *
			`) as any[];

			if (!row) return reply.code(404).send({ error: "Time tracking record not found" });
			return { tracking: row };
		}
	);

	// -------------------------------------------------------------------------
	// PATCH /jobs/:jobId/time-tracking/work-ended
	// Wrench time ends.
	// -------------------------------------------------------------------------
	fastify.patch(
		"/jobs/:jobId/time-tracking/work-ended",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const { jobId } = request.params as { jobId: string };
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [row] = (await sql`
				UPDATE job_time_tracking SET
					work_ended_at = NOW(),
					updated_at = NOW()
				WHERE job_id = ${jobId}
				  AND (${isDev(user)} OR company_id = ${companyId})
				RETURNING *
			`) as any[];

			if (!row) return reply.code(404).send({ error: "Time tracking record not found" });
			return { tracking: row };
		}
	);

	// -------------------------------------------------------------------------
	// PATCH /jobs/:jobId/time-tracking/departed-job
	// Tech left the job site. This closes the on-site window.
	// Also writes computed drive/wrench minutes back to job_completions if present.
	// -------------------------------------------------------------------------
	fastify.patch(
		"/jobs/:jobId/time-tracking/departed-job",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const { jobId } = request.params as { jobId: string };
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [row] = (await sql`
				UPDATE job_time_tracking SET
					departed_job_at = NOW(),
					updated_at = NOW()
				WHERE job_id = ${jobId}
				  AND (${isDev(user)} OR company_id = ${companyId})
				RETURNING *
			`) as any[];

			if (!row) return reply.code(404).send({ error: "Time tracking record not found" });

			// Compute drive and wrench minutes and sync to job_completions if it exists
			const driveMinutes =
				row.departed_at && row.arrived_at
					? Math.round(
						(new Date(row.arrived_at).getTime() -
							new Date(row.departed_at).getTime()) /
						60000
					)
					: null;

			const wrenchMinutes =
				row.work_started_at && row.work_ended_at
					? Math.round(
						(new Date(row.work_ended_at).getTime() -
							new Date(row.work_started_at).getTime()) /
						60000
					)
					: null;

			const actualMinutes =
				row.arrived_at && row.departed_job_at
					? Math.round(
						(new Date(row.departed_job_at).getTime() -
							new Date(row.arrived_at).getTime()) /
						60000
					)
					: null;

			// Sync to job_completions if the record exists
			if (driveMinutes !== null || wrenchMinutes !== null) {
				await sql`
					UPDATE job_completions SET
						drive_time_minutes  = COALESCE(${driveMinutes}, drive_time_minutes),
						wrench_time_minutes = COALESCE(${wrenchMinutes}, wrench_time_minutes),
						duration_minutes    = COALESCE(${actualMinutes}, duration_minutes)
					WHERE job_id = ${jobId}
				`;
			}

			return {
				tracking: row,
				computed: { driveMinutes, wrenchMinutes, actualMinutes }
			};
		}
	);

	// -------------------------------------------------------------------------
	// GET /jobs/:jobId/time-tracking
	// Returns current tracking state + computed minutes.
	// -------------------------------------------------------------------------
	fastify.get(
		"/jobs/:jobId/time-tracking",
		{ preHandler: [authenticate] },
		async (request, reply) => {
			const { jobId } = request.params as { jobId: string };
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [row] = (await sql`
				SELECT
					jtt.*,
					-- Compute drive minutes inline
					CASE
						WHEN jtt.departed_at IS NOT NULL AND jtt.arrived_at IS NOT NULL
						THEN EXTRACT(EPOCH FROM (jtt.arrived_at - jtt.departed_at))::INTEGER / 60
					END AS drive_minutes,
					-- Compute wrench minutes inline
					CASE
						WHEN jtt.work_started_at IS NOT NULL AND jtt.work_ended_at IS NOT NULL
						THEN EXTRACT(EPOCH FROM (jtt.work_ended_at - jtt.work_started_at))::INTEGER / 60
					END AS wrench_minutes,
					-- Compute actual on-site duration inline
					CASE
						WHEN jtt.arrived_at IS NOT NULL AND jtt.departed_job_at IS NOT NULL
						THEN EXTRACT(EPOCH FROM (jtt.departed_job_at - jtt.arrived_at))::INTEGER / 60
					END AS actual_duration_minutes
				FROM job_time_tracking jtt
				WHERE jtt.job_id = ${jobId}
				  AND (${isDev(user)} OR jtt.company_id = ${companyId})
			`) as any[];

			if (!row) return reply.code(404).send({ error: "No time tracking found for this job" });
			return { tracking: row };
		}
	);
}