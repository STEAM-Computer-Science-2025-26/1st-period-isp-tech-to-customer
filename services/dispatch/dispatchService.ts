// services/dispatch/dispatchService-instrumented.ts

import { DispatchOrchestrator } from "./dispatchOrchestrator";
import { TechnicianRepository } from "../repositories/TechnicianRepository";
import { JobRepository } from "../repositories/JobRepository";
import * as metrics from "./metrics";
import { getSql } from "../../db";

// Singleton instances
const techRepo = new TechnicianRepository();
const jobRepo = new JobRepository();
const orchestrator = new DispatchOrchestrator(techRepo, jobRepo);

/**
 * Run dispatch for a job with metrics tracking
 */
export async function runDispatchForJob(
	jobId: string,
	assignedByUserId: string,
	autoAssign: boolean = true
) {
	// Get job to extract company ID and priority for metrics
	const job = await jobRepo.findById(jobId);
	if (!job) {
		throw new Error(`Job ${jobId} not found`);
	}

	const result = await orchestrator.dispatchJob(jobId, {
		autoAssign: false,
		assignedByUserId
	});

	if (autoAssign && !result.requiresManualDispatch && result.assignedTech) {
		await manualAssignJob(
			jobId,
			result.assignedTech.techId,
			assignedByUserId,
			"Auto dispatch assignment"
		);
	}

	metrics.recordDispatchResult(
		result.totalEligibleTechs,
		result.requiresManualDispatch,
		result.manualDispatchReason
	);
	return result;
}

/**
 * Get dispatch recommendations without assigning
 */
export async function getDispatchRecommendations(jobId: string) {
	const job = await jobRepo.findById(jobId);
	if (!job) {
		throw new Error(`Job ${jobId} not found`);
	}

	const result = await orchestrator.dispatchJob(jobId, { autoAssign: false });

	// Track eligible techs even for preview
	// eligible techs metric not available; skip observing in preview
	return result;
}

/**
 * Manually assign a job to a specific tech
 */
export async function manualAssignJob(
	jobId: string,
	techId: string,
	assignedByUserId: string,
	reason?: string
): Promise<void> {
	const sql = getSql();
	const normalizedReason = reason?.trim() || "Manual dispatcher assignment";

	const jobRows = (await sql`
		SELECT id, company_id AS "companyId", status
		FROM jobs
		WHERE id = ${jobId}
	`) as Array<{ id: string; companyId: string; status: string }>;

	const job = jobRows[0];
	if (!job) {
		throw new Error(`Job ${jobId} not found`);
	}

	if (job.status !== "unassigned") {
		throw new Error(`Job ${jobId} is already ${job.status}. Cannot assign.`);
	}

	const techRows = (await sql`
		SELECT
			id,
			company_id AS "companyId",
			is_active AS "isActive",
			is_available AS "isAvailable",
			current_jobs_count AS "currentJobsCount",
			max_concurrent_jobs AS "maxConcurrentJobs"
		FROM employees
		WHERE id = ${techId}
	`) as Array<{
		id: string;
		companyId: string;
		isActive: boolean;
		isAvailable: boolean;
		currentJobsCount: number | string;
		maxConcurrentJobs: number | string;
	}>;

	const tech = techRows[0];
	if (!tech) {
		throw new Error("Tech not found");
	}

	if (tech.companyId !== job.companyId) {
		throw new Error(`Tech ${techId} is not from the same company`);
	}

	if (!tech.isActive || !tech.isAvailable) {
		throw new Error(`Tech ${techId} is not eligible for assignment`);
	}

	const currentJobsCount = Number(tech.currentJobsCount) || 0;
	const maxConcurrentJobs = Number(tech.maxConcurrentJobs) || 1;
	if (currentJobsCount >= maxConcurrentJobs) {
		throw new Error(`Tech ${techId} has reached max concurrent jobs limit`);
	}

	await sql`
		UPDATE jobs
		SET
			assigned_tech_id = ${techId},
			status = 'assigned',
			assigned_at = NOW(),
			updated_at = NOW()
		WHERE id = ${jobId}
	`;

	await sql`
		UPDATE employees
		SET
			current_jobs_count = COALESCE(current_jobs_count, 0) + 1,
			current_job_id = ${jobId},
			updated_at = NOW()
		WHERE id = ${techId}
	`;

	await sql`
		INSERT INTO job_assignments (
			job_id,
			tech_id,
			assigned_at,
			assignment_method,
			assigned_by_user_id,
			override_reason,
			new_job_id
		)
		VALUES (
			${jobId},
			${techId},
			NOW(),
			${"manual"},
			${assignedByUserId},
			${normalizedReason},
			${jobId}
		)
	`;
}
