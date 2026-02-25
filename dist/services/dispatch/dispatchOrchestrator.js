// services/dispatch/DispatchOrchestrator.ts
import { dispatch } from "../../algo/main-dispatch";
import { filterEligibleTechnicians } from "../../algo/stage1-eligibility";
export class DispatchOrchestrator {
    constructor(techRepo, jobRepo) {
        this.techRepo = techRepo;
        this.jobRepo = jobRepo;
    }
    async dispatchJob(jobId, options = {}) {
        const { autoAssign = true, assignedByUserId = "system" } = options;
        // 1. Load job
        const job = await this.jobRepo.findById(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }
        // 2. Validate job state
        if (job.status !== "unassigned") {
            throw new Error(`Job ${jobId} is already ${job.status}. Cannot dispatch.`);
        }
        if (!job.latitude || !job.longitude) {
            throw new Error(`Job ${jobId} has no coordinates. Geocoding status: ${job.geocodingStatus}`);
        }
        // 3. Load eligible techs
        const techRecords = await this.techRepo.findEligibleForDispatch(job.companyId);
        // 4. Enrich with metrics (batched queries)
        const technicians = await this.techRepo.enrichWithMetrics(techRecords);
        // 5. Build job input for algorithm
        const jobInput = {
            id: job.id,
            companyId: job.companyId,
            jobType: job.jobType,
            priority: job.priority,
            address: job.address,
            latitude: job.latitude,
            longitude: job.longitude,
            requiredSkills: job.requiredSkills || [],
            minimumSkillLevel: 2
        };
        // 6. Run dispatch algorithm
        const recommendation = dispatch(jobInput, technicians);
        // 7. Auto-assign if requested and possible
        if (autoAssign &&
            !recommendation.requiresManualDispatch &&
            recommendation.assignedTech) {
            await this.assignJobToTech(jobId, recommendation.assignedTech.techId, assignedByUserId, false, undefined, recommendation, job);
        }
        return recommendation;
    }
    async manualAssign(jobId, techId, assignedByUserId, reason) {
        // 1. Load job
        const job = await this.jobRepo.findById(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }
        if (job.status !== "unassigned") {
            throw new Error(`Job ${jobId} is already ${job.status}. Cannot assign.`);
        }
        if (!job.latitude || !job.longitude) {
            throw new Error(`Job ${jobId} has no coordinates. Geocoding status: ${job.geocodingStatus}`);
        }
        // 2. Verify tech is eligible
        const techRecords = await this.techRepo.findEligibleForDispatch(job.companyId);
        const technicians = await this.techRepo.enrichWithMetrics(techRecords);
        const jobInput = {
            id: job.id,
            companyId: job.companyId,
            latitude: job.latitude,
            longitude: job.longitude,
            requiredSkills: job.requiredSkills || [],
            minimumSkillLevel: 2
        };
        const { eligible } = filterEligibleTechnicians(technicians, jobInput);
        const chosenTech = eligible.find((t) => t.id === techId);
        if (!chosenTech) {
            const eligibleIds = eligible.map((t) => `${t.id} (${t.name})`).join(", ");
            throw new Error(`Tech ${techId} is not eligible for job ${jobId}. ` +
                `Eligible techs: ${eligibleIds || "none"}`);
        }
        // 3. Assign
        await this.assignJobToTech(jobId, techId, assignedByUserId, true, reason, null, job);
    }
    async assignJobToTech(jobId, techId, assignedByUserId, isManualOverride, overrideReason, recommendation, job) {
        const client = await this.jobRepo.getClient();
        try {
            await client.query("BEGIN");
            // Lock the job to prevent concurrent assignments
            const lockedJob = await this.jobRepo.findByIdWithLock(jobId, client);
            if (!lockedJob) {
                throw new Error(`Job ${jobId} not found`);
            }
            // Check if already assigned (race condition check)
            if (lockedJob.assignedTechId) {
                throw new Error(`Job ${jobId} is already assigned to tech ${lockedJob.assignedTechId}`);
            }
            // Get tech to check capacity
            const techResult = await client.query(`SELECT id, current_jobs_count, max_concurrent_jobs
				FROM employees WHERE id = $1`, [techId]);
            if (techResult.rows.length === 0) {
                throw new Error("Tech not found");
            }
            const tech = techResult.rows[0];
            if (tech.current_jobs_count >= tech.max_concurrent_jobs) {
                throw new Error(`Tech ${techId} has reached max concurrent jobs limit`);
            }
            // Perform assignment
            await this.jobRepo.assignToTech(jobId, techId, client);
            await this.jobRepo.updateEmployeeWorkload(techId, jobId, client);
            // Log assignment for analytics
            await this.jobRepo.logAssignment(jobId, techId, job.companyId, assignedByUserId, isManualOverride, overrideReason || null, recommendation, job.priority, job.jobType, client);
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
}
