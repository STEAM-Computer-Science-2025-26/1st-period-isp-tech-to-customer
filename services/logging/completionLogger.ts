import { getSql, toCamelCase } from "../../db/connection";
import { DateTime } from "luxon";
import fs from "node:fs/promises";
import path from "node:path";
import type {
    LogCompletionInput,
    PartsUsedEntry,
    UpdatePerformanceSnapshotInput,
} from "../types/loggingTypes";

function calculateDuration(start: string, end: string): number {
	const startTime = new Date(start).getTime();
	const endTime = new Date(end).getTime();
	return Math.round((endTime - startTime) / 60000); // minutes
}

// Exported for unit testing
export { calculateDuration, getTimeOfDayCategory };

function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

import { computePerformanceScore } from './performanceUtils';

// Backwards-compatible wrapper (older tests and callers may import this name)
export function computeRecentPerformanceScore(
	avgCustomerRating: number | null | undefined,
	firstTimeFixRate: number | null | undefined,
	avgJobDuration: number | null | undefined
): number {
	return computePerformanceScore({
		avgCustomerRating: avgCustomerRating ?? null,
		firstTimeFixRate: firstTimeFixRate ?? null,
		avgJobDuration: avgJobDuration ?? null,
	});
}

function getTimeOfDayCategory(time: string, tz = "UTC"): string {
	const dt = DateTime.fromISO(time, { zone: "utc" }).setZone(tz);
	const hour = dt.hour;
	if (hour < 6) return "overnight";
	if (hour < 12) return "morning";
	if (hour < 17) return "afternoon";
	if (hour < 21) return "evening";
	return "night";
}

// --- Helper: insert job completion ---
async function insertJobCompletion(input: LogCompletionInput): Promise<string> {
	const sql = getSql();
	const actualDuration = calculateDuration(
		input.actualStartTime,
		input.actualCompletionTime
	);
	const timeCategory = getTimeOfDayCategory(input.actualCompletionTime, "UTC");

	// Perform an atomic INSERT into job_completion_logs and aggregate + UPSERT into tech_performance_snapshots
	// Use CTEs so the aggregation sees the newly inserted row in the same statement.
	const res = await sql`
		WITH ins AS (
			INSERT INTO job_completion_logs (
				job_id, tech_id, company_id, actual_start_time, actual_completion_time,
				estimated_duration_minutes, actual_duration_minutes, first_time_fix, callback_required,
				customer_rating, distance_driven_km, travel_time_minutes, total_miles_driven_today,
				parts_used, stock_availability_notes, reorders_required, tech_stress_level,
				dispatcher_notes, bottlenecks_observed, complications, software_used,
				system_failures, improvement_suggestions, repeat_customer, time_of_day_category,
				post_job_training_notes
			) VALUES (
				${input.jobId}, ${input.techId}, ${input.companyId}, ${input.actualStartTime}, ${input.actualCompletionTime},
				${input.estimatedDurationMinutes}, ${actualDuration}, ${input.firstTimeFix}, ${input.callbackRequired},
				${input.customerRating}, ${input.distanceDrivenKm}, ${input.travelTimeMinutes}, ${null},
				${input.partsUsed}, ${input.stockAvailabilityNotes}, ${input.reordersRequired}, ${input.techStressLevel},
				${input.dispatcherNotes}, ${input.bottlenecksObserved}, ${input.complications}, ${input.softwareUsed},
				${input.systemFailures}, ${input.improvementSuggestions}, ${input.repeatCustomer}, ${timeCategory},
				${input.postJobTrainingNotes}
			) RETURNING id, tech_id, company_id, actual_completion_time
		), agg AS (
			SELECT
				COUNT(*) AS jobs_completed,
				COALESCE(SUM(actual_duration_minutes),0) AS total_minutes_worked,
				COALESCE(SUM(distance_driven_km),0) AS total_distance_driven,
				AVG(actual_duration_minutes) AS avg_job_duration,
				AVG(customer_rating) AS avg_customer_rating,
				AVG(CASE WHEN first_time_fix THEN 1 ELSE 0 END) AS first_time_fix_rate,
				json_agg(
					json_build_object(
						'jobId', job_completion_logs.job_id,
						'completedAt', job_completion_logs.actual_completion_time,
						'duration', job_completion_logs.actual_duration_minutes,
						'firstTimeFix', job_completion_logs.first_time_fix,
						'customerRating', job_completion_logs.customer_rating
					) ORDER BY job_completion_logs.actual_completion_time DESC
				) AS recent_jobs_data,
				DATE(ins.actual_completion_time) AS snapshot_date,
				ins.tech_id, ins.company_id
			FROM job_completion_logs
			JOIN ins ON job_completion_logs.tech_id = ins.tech_id AND job_completion_logs.company_id = ins.company_id
				AND DATE(job_completion_logs.actual_completion_time) = DATE(ins.actual_completion_time)
			GROUP BY ins.tech_id, ins.company_id, DATE(ins.actual_completion_time)
		), upsert AS (
			INSERT INTO tech_performance_snapshots (
				tech_id, company_id, snapshot_date, jobs_completed_count, total_drive_time_minutes,
				total_distance_km, average_customer_rating, average_job_duration_minutes, first_time_fix_rate,
				recent_performance_score, recent_jobs_data
			)
			SELECT
				agg.tech_id, agg.company_id, agg.snapshot_date, agg.jobs_completed, agg.total_minutes_worked,
				agg.total_distance_driven, agg.avg_customer_rating, agg.avg_job_duration, agg.first_time_fix_rate,
				NULL::numeric, agg.recent_jobs_data
			FROM agg
			ON CONFLICT (tech_id, snapshot_date) DO UPDATE SET
				jobs_completed_count = EXCLUDED.jobs_completed_count,
				total_drive_time_minutes = EXCLUDED.total_drive_time_minutes,
				total_distance_km = EXCLUDED.total_distance_km,
				average_customer_rating = EXCLUDED.average_customer_rating,
				average_job_duration_minutes = EXCLUDED.average_job_duration_minutes,
				first_time_fix_rate = EXCLUDED.first_time_fix_rate,
				recent_performance_score = EXCLUDED.recent_performance_score,
				recent_jobs_data = EXCLUDED.recent_jobs_data
			RETURNING *
		)
		SELECT ins.id AS id FROM ins
	`;

	// The first result row contains the inserted id
	return res[0].id as string;
}

// --- Helper: resilient failure recorder ---
const FAILURE_LOG_PATH = path.resolve(process.cwd(), "tmp", "perf_snapshot_failures.log");

async function recordSnapshotFailureResilient(opts: {
	techId: string;
	companyId: string;
	date: string;
	jobId?: string | null;
	errorMessage: string;
}) {
	const { techId, companyId, date, jobId, errorMessage } = opts;
	const sql = getSql();
	try {
		await sql`
			INSERT INTO performance_snapshot_update_failures (
				tech_id, company_id, snapshot_date, job_id, error_message, created_at
			) VALUES (
				${techId}, ${companyId}, ${date}, ${jobId || null}, ${errorMessage}, NOW()
			)`;
		return;
	} catch (dbErr) {
		// If inserting into DB fails, persist to a local file as a fallback.
		try {
			await fs.mkdir(path.dirname(FAILURE_LOG_PATH), { recursive: true });
			const payload = {
				ts: new Date().toISOString(),
				techId,
				companyId,
				date,
				jobId,
				errorMessage: String(errorMessage),
				dbError: String(dbErr),
			};
			await fs.appendFile(FAILURE_LOG_PATH, JSON.stringify(payload) + "\n");
			console.warn("Persisted snapshot failure to local file", FAILURE_LOG_PATH);
			return;
		} catch (fileErr) {
			console.error("Failed to persist snapshot failure to DB and file", {
				dbErr: String(dbErr),
				fileErr: String(fileErr),
				payload: { techId, companyId, date, jobId, errorMessage }
			});
		}
	}
}

// --- Background runner that updates snapshot and records failure if final ---
async function runSnapshotUpdateAndRecord(
	techId: string,
	companyId: string,
	date: string,
	jobId?: string
) {
	try {
		await safeUpdatePerformanceSnapshotWithRetries({ techId, companyId, date }, 3);
	} catch (err) {
		await recordSnapshotFailureResilient({
			techId,
			companyId,
			date,
			jobId,
			errorMessage: String(err),
		});
		console.error("Final failure updating performance snapshot after retries", {
			err: String(err),
			techId,
			companyId,
			date,
			jobId,
		});
	}
}

// --- DB-backed snapshot queue (multi-instance safe) ---
// Queue table: snapshot_update_queue
// Columns: id, tech_id, company_id, snapshot_date, scheduled_at, attempts, locked_at, locked_by, job_id, created_at
const SNAPSHOT_DEBOUNCE_MS = Number(process.env.SNAPSHOT_DEBOUNCE_MS) || 5000;
const SNAPSHOT_POLL_INTERVAL_MS = Number(process.env.SNAPSHOT_POLL_INTERVAL_MS) || 2000;
const SNAPSHOT_QUEUE_PROCESS_LIMIT = Number(process.env.SNAPSHOT_QUEUE_PROCESS_LIMIT) || 10;
const SNAPSHOT_MAX_ATTEMPTS = Number(process.env.SNAPSHOT_MAX_ATTEMPTS) || 5;

function makeDebounceScheduledAt() {
	return new Date(Date.now() + SNAPSHOT_DEBOUNCE_MS).toISOString();
}

async function enqueueSnapshotUpdate(techId: string, companyId: string, date: string, jobId?: string) {
	const sql = getSql();
	// Bounded deferral parameters (seconds)
	const maxDeferralSec = Number(process.env.SNAPSHOT_MAX_DEFERRAL_SEC) || 30;
	// scheduledAt is now + debounce window
	const scheduledAt = makeDebounceScheduledAt();

	// Insert or update the queue row and return its id. Do NOT create schema at runtime — migrations are the SOFT of truth.
	// When a row already exists, we update scheduled_at but cap deferral to first_enqueued_at + maxDeferralSec.
	const row = await sql`
		INSERT INTO snapshot_update_queue (tech_id, company_id, snapshot_date, scheduled_at, first_enqueued_at, attempts, job_id, created_at)
		VALUES (${techId}, ${companyId}, ${date}, ${scheduledAt}, NOW(), 0, ${jobId || null}, NOW())
		ON CONFLICT (tech_id, company_id, snapshot_date) DO UPDATE
		SET scheduled_at = LEAST(${scheduledAt}, snapshot_update_queue.first_enqueued_at + (${maxDeferralSec} || ' seconds')::interval),
			job_id = COALESCE(${jobId}, snapshot_update_queue.job_id)
		RETURNING id
	`;

	const queueId = row[0]?.id;
	if (!queueId) {
		// Defensive: if we didn't get an id, throw so callers can observe and take action.
		throw new Error('Failed to enqueue snapshot update (no queue id returned)');
	}

	// Record the causal event (job) for provenance and replayability.
	if (jobId) {
		await sql`
			INSERT INTO snapshot_update_events (queue_id, job_id, payload, created_at)
			VALUES (${queueId}, ${jobId}, ${null}, NOW())
		`;
	}
}

export async function processSnapshotQueueOnce(limit = SNAPSHOT_QUEUE_PROCESS_LIMIT) {
	const sql = getSql();
	const pid = `${process.pid}-${crypto.randomUUID()}`;

	// Lease duration (seconds) for a locked batch
	const leaseSeconds = Number(process.env.SNAPSHOT_LOCK_LEASE_SEC) || 60;

	// Acquire a batch of due, unlocked rows and set a lease (locked_until)
	const rows = await sql`
		WITH due AS (
			SELECT id
			FROM snapshot_update_queue
			WHERE (locked_until IS NULL OR locked_until < NOW())
			  AND scheduled_at <= NOW()
			ORDER BY scheduled_at ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		)
		UPDATE snapshot_update_queue q
		SET locked_at = NOW(), locked_until = NOW() + (${leaseSeconds} || ' seconds')::interval, locked_by = ${pid}
		FROM due
		WHERE q.id = due.id
		RETURNING q.*
	`;

	for (const r of rows) {
		const queueId = r.id;
		try {
			await safeUpdatePerformanceSnapshotWithRetries({ techId: r.tech_id, companyId: r.company_id, date: r.snapshot_date }, 3);
			// On success, delete queue row and its events (cascade should handle events if FK with ON DELETE CASCADE)
			await sql`DELETE FROM snapshot_update_queue WHERE id = ${queueId}`;
		} catch (err) {
			// On failure, increment attempts and reschedule with bounded backoff + jitter or move to dead-letter
			const attempts = (Number(r.attempts) || 0) + 1;
			const maxAttempts = Number(process.env.SNAPSHOT_MAX_ATTEMPTS) || SNAPSHOT_MAX_ATTEMPTS;
			if (attempts >= maxAttempts) {
				// Build a payload from events for dead-letter
				const events = await sql`SELECT json_agg(job_id) AS job_ids, json_agg(payload) AS payloads FROM snapshot_update_events WHERE queue_id = ${queueId}`;
				const payload = events[0] || null;
				await sql`
					INSERT INTO snapshot_update_deadletter (tech_id, company_id, snapshot_date, payload, attempts, last_error, failed_at, created_at)
					VALUES (${r.tech_id}, ${r.company_id}, ${r.snapshot_date}, ${payload}, ${attempts}, ${String(err)}, NOW(), NOW())
				`;
				await sql`DELETE FROM snapshot_update_queue WHERE id = ${queueId}`;
			} else {
				// bounded backoff with jitter
				const baseMs = Math.min(60000, Math.pow(2, attempts) * 1000); // cap base backoff at 60s
				const jitter = Math.floor(Math.random() * 1000); // up to 1s jitter
				const backoffMs = baseMs + jitter;
				const newScheduled = new Date(Date.now() + backoffMs).toISOString();
				await sql`
					UPDATE snapshot_update_queue
					SET attempts = ${attempts}, scheduled_at = ${newScheduled}, locked_until = NULL, locked_at = NULL, locked_by = NULL
					WHERE id = ${queueId}
				`;
			}
		}
	}
}

// Start a background poller in long-running processes to process the queue.
let _snapshotPoller: NodeJS.Timeout | null = null;
export function startSnapshotQueuePoller() {
	if (_snapshotPoller) return;
	_snapshotPoller = setInterval(() => {
		void processSnapshotQueueOnce().catch((err) => console.error('Error processing snapshot queue', String(err)));
	}, SNAPSHOT_POLL_INTERVAL_MS);
}

// Allow graceful shutdown helper
export async function stopSnapshotQueuePoller() {
	if (_snapshotPoller) {
		clearInterval(_snapshotPoller);
		_snapshotPoller = null;
	}
}

export async function logJobCompletion(
	input: LogCompletionInput
): Promise<string> {
	// 1) Insert job completion (sync from caller)
	const id = await insertJobCompletion(input);

	// 2) Schedule background snapshot update (decoupled but resilient)
	const today = new Date(input.actualCompletionTime).toISOString().split("T")[0];
	// Enqueue snapshot update in DB-backed queue (multi-instance safe)
	void enqueueSnapshotUpdate(input.techId, input.companyId, today, id);

	// 3) Return the inserted id to caller
	return id;
}

async function updatePerformanceSnapshot({
	techId,
	companyId,
	date
}: UpdatePerformanceSnapshotInput) {
	const sql = getSql();
	const stats = await sql`
        SELECT
            COUNT(*) AS jobs_completed,
            COALESCE(SUM(actual_duration_minutes), 0) AS total_minutes_worked,
            COALESCE(SUM(distance_driven_km), 0) AS total_distance_driven,
            AVG(actual_duration_minutes) AS avg_job_duration,
            AVG(customer_rating) AS avg_customer_rating,
            AVG(CASE WHEN first_time_fix THEN 1 ELSE 0 END) AS first_time_fix_rate,
            json_agg(
                json_build_object(
                    'jobId', job_id,
                    'completedAt', actual_completion_time,
                    'duration', actual_duration_minutes,
                    'firstTimeFix', first_time_fix,
                    'customerRating', customer_rating
                ) ORDER BY actual_completion_time DESC
            ) AS recent_jobs_data
        FROM job_completion_logs
        WHERE tech_id = ${techId}
          AND company_id = ${companyId}
          AND DATE(actual_completion_time) = ${date}
    `;

	const {
		jobs_completed,
		total_minutes_worked,
		total_distance_driven,
		avg_job_duration,
		avg_customer_rating,
		first_time_fix_rate,
		recent_jobs_data
	} = stats[0];

	// Normalize/convert DB-returned numeric strings into JS numbers and proper integer types
	const jobsCompleted = Number(jobs_completed) || 0;
	const totalMinutesWorked = Math.round(Number(total_minutes_worked) || 0);
	const totalDistanceDrivenRaw = Number(total_distance_driven) || 0;
	// round to 2 decimals for distance to avoid precision mismatches
	const totalDistanceDriven = Number(totalDistanceDrivenRaw.toFixed(2));
	const avgJobDuration = avg_job_duration !== null ? Math.round(Number(avg_job_duration)) : null;
	const avgCustomerRating = avg_customer_rating !== null ? Number(avg_customer_rating) : null;
	const firstTimeFixRate = first_time_fix_rate !== null ? Number(first_time_fix_rate) : null;
	const recentJobsData = recent_jobs_data || null;
	const recentJobsDataJson = recentJobsData ? JSON.stringify(recentJobsData) : null;

	const recentPerformanceScore = computePerformanceScore({
		avgCustomerRating,
		firstTimeFixRate,
		avgJobDuration,
	});

	await sql`
        INSERT INTO tech_performance_snapshots (
            tech_id,
            company_id,
            snapshot_date,
            jobs_completed_count,
            total_drive_time_minutes,
            total_distance_km,
            average_customer_rating,
            average_job_duration_minutes,
            first_time_fix_rate,
            recent_performance_score,
            recent_jobs_data
        ) VALUES (
            ${techId},
            ${companyId},
            ${date},
            ${jobsCompleted},
            ${totalMinutesWorked},
            ${totalDistanceDriven},
            ${avgCustomerRating},
            ${avgJobDuration},
            ${firstTimeFixRate},
            ${recentPerformanceScore},
            ${recentJobsDataJson}
        )
        ON CONFLICT (tech_id, snapshot_date)
        DO UPDATE SET
            jobs_completed_count = EXCLUDED.jobs_completed_count,
            total_drive_time_minutes = EXCLUDED.total_drive_time_minutes,
            total_distance_km = EXCLUDED.total_distance_km,
            average_customer_rating = EXCLUDED.average_customer_rating,
            average_job_duration_minutes = EXCLUDED.average_job_duration_minutes,
            first_time_fix_rate = EXCLUDED.first_time_fix_rate,
            recent_performance_score = EXCLUDED.recent_performance_score,
            recent_jobs_data = EXCLUDED.recent_jobs_data
    `;
}

export async function safeUpdatePerformanceSnapshotWithRetries(
	input: UpdatePerformanceSnapshotInput,
	maxAttempts = 3
) {
	let attempt = 0;
	let lastError: unknown = null;
	while (attempt < maxAttempts) {
		try {
			await updatePerformanceSnapshot(input);
			return;
		} catch (err) {
			attempt += 1;
			lastError = err;
			const backoffMs = Math.pow(2, attempt) * 250;
			console.warn(
				`updatePerformanceSnapshot failed (attempt ${attempt}/${maxAttempts}), retrying in ${backoffMs}ms`,
				{ err: String(err), ...input }
			);
			await sleep(backoffMs);
		}
	}
	throw lastError;
}
