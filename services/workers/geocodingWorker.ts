// services/workers/geocodingWorker.ts
// Background worker that processes pending geocoding jobs

import { query } from "../../db";
import { tryGeocodeJob } from "../routes/geocoding";

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 30000; // 30 seconds
const MAX_RETRIES = 3;

interface PendingJob {
	id: string;
	address: string;
	geocoding_retries: number;
}

interface ExistsRow {
	exists: boolean;
}

interface DBInfoRow {
	database: string;
	schema: string;
}

interface ColumnRow {
	column_name: string;
}

interface GeocodeResult {
	latitude: number | null;
	longitude: number | null;
	geocodingStatus: "complete" | "failed" | string;
}

export class GeocodingWorker {
	private isRunning: boolean = false;
	private intervalId: NodeJS.Timeout | null = null;
	private hasRetriesColumn: boolean | null = null;

	async start(): Promise<void> {
		if (this.isRunning) {
			console.log("⚠️  Geocoding worker already running");
			return;
		}

		this.isRunning = true;
		console.log("✅ Geocoding worker started");

		await this.ensureRetriesColumn();
		await this.logJobsSchemaInfo();

		// Process immediately on start
		await this.processJobs();

		// Then poll at intervals
		this.intervalId = setInterval(async () => {
			await this.processJobs();
		}, POLL_INTERVAL_MS);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.isRunning = false;
		console.log("🛑 Geocoding worker stopped");
	}

	private async processJobs(): Promise<void> {
		try {
			const pendingJobs: PendingJob[] = (await this.fetchPendingJobs()) || [];

			if (pendingJobs.length === 0) {
				return;
			}

			console.log(`🔄 Processing ${pendingJobs.length} geocoding jobs...`);

			for (const job of pendingJobs) {
				await this.geocodeJob(job.id, job.address, job.geocoding_retries);

				// Small delay between requests to avoid rate limiting
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			console.log(`✅ Processed ${pendingJobs.length} geocoding jobs`);
		} catch (error) {
			console.error("❌ Error processing geocoding jobs:", error);
		}
	}

	private async ensureRetriesColumn(): Promise<void> {
		try {
			const result = (await query(
				"SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'geocoding_retries') AS exists",
				[]
			)) as unknown as ExistsRow[];
			this.hasRetriesColumn = result[0]?.exists ?? false;

			if (!this.hasRetriesColumn) {
				await query(
					"ALTER TABLE jobs ADD COLUMN IF NOT EXISTS geocoding_retries integer DEFAULT 0",
					[]
				);
				this.hasRetriesColumn = true;
			}
		} catch (error) {
			this.hasRetriesColumn = false;
			console.error("❌ Failed to ensure geocoding_retries column:", error);
		}
	}

	private async fetchPendingJobs(): Promise<PendingJob[]> {
		try {
			let raw: unknown;

			if (this.hasRetriesColumn) {
				raw = await query(
					`SELECT id, address, COALESCE(geocoding_retries, 0) AS geocoding_retries
FROM jobs
WHERE geocoding_status = 'pending'
	OR (geocoding_status = 'failed'
		AND COALESCE(geocoding_retries, 0) < $1)
ORDER BY created_at ASC
LIMIT $2`,
					[MAX_RETRIES, BATCH_SIZE]
				);
			} else {
				raw = await query(
					`SELECT id, address, 0 AS geocoding_retries
FROM jobs
WHERE geocoding_status = 'pending'
	OR geocoding_status = 'failed'
ORDER BY created_at ASC
LIMIT $1`,
					[BATCH_SIZE]
				);
			}

			// Neon can return a result object instead of a plain array depending
			// on the driver version. Normalize it here so iteration never throws.
			if (Array.isArray(raw)) {
				return raw as PendingJob[];
			}

			// pg-style result object: { rows: [...] }
			const asObj = raw as { rows?: unknown[] };
			if (asObj && Array.isArray(asObj.rows)) {
				return asObj.rows as PendingJob[];
			}

			console.warn("⚠️  fetchPendingJobs: unexpected query result shape", raw);
			return [];
		} catch (error) {
			console.error("❌ fetchPendingJobs failed:", error);
			return [];
		}
	}

	private async logJobsSchemaInfo(): Promise<void> {
		try {
			const rawColumns = await query(
				"SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'jobs' ORDER BY ordinal_position",
				[]
			);
			const columns: ColumnRow[] = Array.isArray(rawColumns)
				? (rawColumns as unknown as ColumnRow[])
				: [];

			const rawDbInfo = await query(
				"SELECT current_database() AS database, current_schema() AS schema",
				[]
			);
			const dbInfoRows: DBInfoRow[] = Array.isArray(rawDbInfo)
				? (rawDbInfo as unknown as DBInfoRow[])
				: [];

			const database = dbInfoRows[0]?.database ?? "unknown";
			const schema = dbInfoRows[0]?.schema ?? "unknown";
			const columnList = columns.map((col) => col.column_name).join(", ");

			console.log(
				`🧭 DB context: database=${database}, schema=${schema}, jobs columns=[${columnList}]`
			);
		} catch (error) {
			console.error("❌ Failed to log jobs schema info:", error);
		}
	}

	private async geocodeJob(
		jobId: string,
		address: string,
		currentRetries: number
	): Promise<void> {
		try {
			const geo: GeocodeResult = await tryGeocodeJob(address);

			if (this.hasRetriesColumn) {
				await query(
					`UPDATE jobs
SET latitude = $1,
	longitude = $2,
	geocoding_status = $3,
	geocoding_retries = $4,
	updated_at = NOW()
WHERE id = $5`,
					[
						geo.latitude,
						geo.longitude,
						geo.geocodingStatus,
						currentRetries + 1,
						jobId
					]
				);
			} else {
				await query(
					`UPDATE jobs
SET latitude = $1,
	longitude = $2,
	geocoding_status = $3,
	updated_at = NOW()
WHERE id = $4`,
					[geo.latitude, geo.longitude, geo.geocodingStatus, jobId]
				);
			}

			if (geo.geocodingStatus === "complete") {
				console.log(`✅ Geocoded job ${jobId}: ${address}`);
			} else {
				console.log(`⚠️  Geocoding failed for job ${jobId}: ${address}`);
			}
		} catch (error) {
			console.error(`❌ Error geocoding job ${jobId}:`, error);

			// Mark as failed with retry count
			if (this.hasRetriesColumn) {
				try {
					await query(
						`UPDATE jobs
SET geocoding_status = 'failed',
	geocoding_retries = $1,
	updated_at = NOW()
WHERE id = $2`,
						[currentRetries + 1, jobId]
					);
				} catch (err: unknown) {
					console.error("Failed to update geocoding status:", err);
				}
			} else {
				try {
					await query(
						`UPDATE jobs
SET geocoding_status = 'failed',
	updated_at = NOW()
WHERE id = $1`,
						[jobId]
					);
				} catch (err: unknown) {
					console.error("Failed to update geocoding status:", err);
				}
			}
		}
	}
}

// Singleton instance
let workerInstance: GeocodingWorker | null = null;

export function getGeocodingWorker(): GeocodingWorker {
	if (!workerInstance) {
		workerInstance = new GeocodingWorker();
	}
	return workerInstance;
}
