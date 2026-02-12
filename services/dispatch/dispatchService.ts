// services/dispatch/dispatchService-instrumented.ts

import { DispatchOrchestrator } from "./dispatchOrchestrator";
import { TechnicianRepository } from "../repositories/TechnicianRepository";
import { JobRepository } from "../repositories/JobRepository";
import * as metrics from "./metrics";

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
	// Get job to extract company ID and priority for metrics
	const job = await jobRepo.findById(jobId);
	if (!job) {
		throw new Error(`Job ${jobId} not found`);
	}

	const result = await orchestrator.dispatchJob(jobId, { autoAssign, assignedByUserId });

	// Record dispatch results
	if ((metrics as any).recordDispatchResult) {
		(metrics as any).recordDispatchResult(
			result.totalEligibleTechs,
			result.requiresManualDispatch,
			result.manualDispatchReason
		);
	}
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
	assignedByUserId: string,
	techId: string,
	reason: string
): Promise<void> {
	return orchestrator.manualAssign(jobId, techId, assignedByUserId, reason);
}

function recordDispatchResult(totalEligibleTechs: number, arg1: any) {
	throw new Error("Function not implemented.");
}
