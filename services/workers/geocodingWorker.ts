// services/workers/geocodingWorker.ts
// Background worker that processes pending geocoding jobs

import { query } from "../../db";
import { tryGeocodeJob } from "../routes/geocoding";

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 30000; // 30 seconds
const MAX_RETRIES = 3;

export class GeocodingWorker {
	private isRunning = false;
	private intervalId: NodeJS.Timeout | null = null;

	async start() {
		if (this.isRunning) {
			console.log("⚠️  Geocoding worker already running");
			return;
		}

		this.isRunning = true;
		console.log("✅ Geocoding worker started");

		// Process immediately on start
		await this.processJobs();

		// Then poll at intervals
		this.intervalId = setInterval(async () => {
			await this.processJobs();
		}, POLL_INTERVAL_MS);
	}

	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.isRunning = false;
		console.log("🛑 Geocoding worker stopped");
	}

	private async processJobs() {
		try {
			// Get pending jobs (never attempted or failed with retries left)
			const pendingJobs = await query<{
				id: string;
				address: string;
				geocoding_retries: number;
			}>(
				`SELECT id, address, 
					COALESCE(geocoding_retries, 0) AS geocoding_retries
				FROM jobs
				WHERE geocoding_status = 'pending' 
					OR (geocoding_status = 'failed' 
						AND COALESCE(geocoding_retries, 0) < $1)
				ORDER BY created_at ASC
				LIMIT $2`,
				[MAX_RETRIES, BATCH_SIZE]
			);

			if (pendingJobs.length === 0) {
				return;
			}

			console.log(`🔄 Processing ${pendingJobs.length} geocoding jobs...`);

			// Process each job
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

	private async geocodeJob(
		jobId: string,
		address: string,
		currentRetries: number
	) {
		try {
			const geo = await tryGeocodeJob(address);

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

			if (geo.geocodingStatus === "complete") {
				console.log(`✅ Geocoded job ${jobId}: ${address}`);
			} else {
				console.log(`⚠️  Geocoding failed for job ${jobId}: ${address}`);
			}
		} catch (error) {
			console.error(`❌ Error geocoding job ${jobId}:`, error);

			// Mark as failed with retry count
			await query(
				`UPDATE jobs 
				SET geocoding_status = 'failed',
					geocoding_retries = $1,
					updated_at = NOW()
				WHERE id = $2`,
				[currentRetries + 1, jobId]
			).catch((err) =>
				console.error("Failed to update geocoding status:", err)
			);
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
