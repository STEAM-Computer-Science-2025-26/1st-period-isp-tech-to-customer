// services/workers/geocodingWorker.ts
// Background worker that processes pending geocoding jobs
import { query } from "../../db";
import { tryGeocodeJob } from "../routes/geocoding";
const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 30000; // 30 seconds
const MAX_RETRIES = 3;
export class GeocodingWorker {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.hasRetriesColumn = null;
    }
    async start() {
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
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log("🛑 Geocoding worker stopped");
    }
    async processJobs() {
        try {
            const pendingJobs = await this.fetchPendingJobs();
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
        }
        catch (error) {
            console.error("❌ Error processing geocoding jobs:", error);
        }
    }
    async ensureRetriesColumn() {
        try {
            const result = await query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'geocoding_retries') AS exists");
            this.hasRetriesColumn = result[0]?.exists ?? false;
            if (!this.hasRetriesColumn) {
                await query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS geocoding_retries integer DEFAULT 0");
                this.hasRetriesColumn = true;
            }
        }
        catch (error) {
            this.hasRetriesColumn = false;
            console.error("❌ Failed to ensure geocoding_retries column:", error);
        }
    }
    async fetchPendingJobs() {
        const baseSelect = "SELECT id, address";
        const baseFrom = "FROM jobs";
        const baseOrder = "ORDER BY created_at ASC";
        if (this.hasRetriesColumn) {
            return query(`${baseSelect}, COALESCE(geocoding_retries, 0) AS geocoding_retries
				${baseFrom}
				WHERE geocoding_status = 'pending'
					OR (geocoding_status = 'failed'
						AND COALESCE(geocoding_retries, 0) < $1)
				${baseOrder}
				LIMIT $2`, [MAX_RETRIES, BATCH_SIZE]);
        }
        return query(`${baseSelect}, 0 AS geocoding_retries
			${baseFrom}
			WHERE geocoding_status = 'pending'
				OR geocoding_status = 'failed'
			${baseOrder}
			LIMIT $1`, [BATCH_SIZE]);
    }
    async logJobsSchemaInfo() {
        try {
            const dbInfo = await query("SELECT current_database() AS database, current_schema() AS schema");
            const columns = await query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'jobs' ORDER BY ordinal_position");
            const database = dbInfo[0]?.database ?? "unknown";
            const schema = dbInfo[0]?.schema ?? "unknown";
            const columnList = columns.map((col) => col.column_name).join(", ");
            console.log(`🧭 DB context: database=${database}, schema=${schema}, jobs columns=[${columnList}]`);
        }
        catch (error) {
            console.error("❌ Failed to log jobs schema info:", error);
        }
    }
    async geocodeJob(jobId, address, currentRetries) {
        try {
            const geo = await tryGeocodeJob(address);
            if (this.hasRetriesColumn) {
                await query(`UPDATE jobs 
					SET latitude = $1, 
						longitude = $2, 
						geocoding_status = $3,
						geocoding_retries = $4,
						updated_at = NOW()
					WHERE id = $5`, [
                    geo.latitude,
                    geo.longitude,
                    geo.geocodingStatus,
                    currentRetries + 1,
                    jobId
                ]);
            }
            else {
                await query(`UPDATE jobs 
					SET latitude = $1, 
						longitude = $2, 
						geocoding_status = $3,
						updated_at = NOW()
					WHERE id = $4`, [geo.latitude, geo.longitude, geo.geocodingStatus, jobId]);
            }
            if (geo.geocodingStatus === "complete") {
                console.log(`✅ Geocoded job ${jobId}: ${address}`);
            }
            else {
                console.log(`⚠️  Geocoding failed for job ${jobId}: ${address}`);
            }
        }
        catch (error) {
            console.error(`❌ Error geocoding job ${jobId}:`, error);
            // Mark as failed with retry count
            if (this.hasRetriesColumn) {
                await query(`UPDATE jobs 
					SET geocoding_status = 'failed',
						geocoding_retries = $1,
						updated_at = NOW()
					WHERE id = $2`, [currentRetries + 1, jobId]).catch((err) => console.error("Failed to update geocoding status:", err));
            }
            else {
                await query(`UPDATE jobs 
					SET geocoding_status = 'failed',
						updated_at = NOW()
					WHERE id = $1`, [jobId]).catch((err) => console.error("Failed to update geocoding status:", err));
            }
        }
    }
}
// Singleton instance
let workerInstance = null;
export function getGeocodingWorker() {
    if (!workerInstance) {
        workerInstance = new GeocodingWorker();
    }
    return workerInstance;
}
