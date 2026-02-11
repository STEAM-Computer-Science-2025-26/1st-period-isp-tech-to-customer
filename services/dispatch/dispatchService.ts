import { query } from "../../db";
import { dispatch } from "../../algo/main-dispatch";
import { enrichMultipleTechnicians } from "./metrics";
import { assignJobToTech } from "./persistence";
import { TechnicianInput } from "../types/technicianInput";
import { string } from "zod";

/**
 * @param jobId
 * @param assignedByUserId
 * @param autoAssign
 * @returns
 */

export async function runDispatchForJob(
	jobId: string,
	assignedByUserId: string,
	autoAssign: boolean = true
): Promise<ReturnType<typeof dispatch>> {
	const jobResult = await query<{
		id: string;
		company_id: string;
		job_type: string;
		priority: string;
		address: string;
		latitude: number;
		longitude: number;
		status: string;
		geocoding_status: string;
	}>(
		`SELECT 
            id, company_id, job_type, priority, address, 
            latitude, longitude, status, geocoding_status
        FROM jobs
        WHERE id = $1`,
		[jobId]
	);

	if (jobResult.length === 0) {
		throw new Error(`Job ${jobId} not found`);
	}

	const job = jobResult[0];

	if (job.status !== "unassigned") {
		throw new Error(`Job ${jobId} is already ${job.status}. Cannot dispatch.`);
	}

	if (!job.latitude || !job.longitude) {
		throw new Error(
			`Job ${jobId} has no coordinates. Geocoding status: ${job.geocoding_status}`
		);
	}

	const techResult = await query<Record<string, unknown>>(
		`SELECT 
			id, name, company_id,
			is_active, is_available,
			current_jobs_count AS "currentJobsCount",
			max_concurrent_jobs AS "maxConcurrentJobs",
			latitude, longitude,
			max_travel_distance_miles AS "maxTravelDistanceMiles",
			skills,
			skill_level AS "skillLevel"
		FROM employees
		WHERE company_id = $1
			AND is_active = true
			AND is_available = true
			AND latitude IS NOT NULL
			AND longitude IS NOT NULL`,
		[job.company_id]
	);

	const enrichedTechs = await enrichMultipleTechnicians(techResult);
	const technicians: TechnicianInput[] = enrichedTechs.map((tech) => ({
		id: tech.id as string,
		name: tech.name as string,
		companyId: tech.companyId as string,
		isActive: tech.isActive as boolean,
		isAvailable: tech.isAvailable as boolean,
		currentJobsCount: tech.currentJobsCount as number,
		maxConcurrentJobs: tech.maxConcurrentJobs as number,
		dailyJobCount: (tech.dailyJobCount as number) || 0,
		recentJobCount: (tech.recentJobCount as number) || 0,
		recentCompletionRate: (tech.recentCompletionRate as number) || 0,
		latitude: tech.latitude as number,
		longitude: tech.longitude as number,
		maxTravelDistanceMiles: tech.maxTravelDistanceMiles as number,
		skills: tech.skills as string[],
		skillLevel: tech.skillLevel as Record<string, number>
	}));

	const jobSkillsResult = await query<{ required_skills: string[] }>(
		`SELECT required_skills FROM jobs WHERE id = $1`,
		[jobId]
	);

	const requiredSkills = jobSkillsResult[0]?.required_skills || [];
	const jobInput = {
		id: job.id,
		companyId: job.company_id,
		jobType: job.job_type,
		priority: job.priority,
		address: job.address,
		latitude: job.latitude,
		longitude: job.longitude,
		requiredSkills,
		minimumSkillLevel: 2 // This could be dynamic based on job type/priority
	};

	const recommendation = dispatch(jobInput, technicians);

	if (
		autoAssign &&
		!recommendation.requiresManualDispatch &&
		recommendation.assignedTech
	) {
		await assignJobToTech(
			jobId,
			recommendation.assignedTech.techId,
			assignedByUserId,
			false, // not manual override
			undefined, // no override reason
			recommendation // save full recommendation for analytics
		);
	}

	return recommendation;
}

/**
 * @param jobId
 * @returns
 */
export async function getDispatchRecommendations(jobId: string) {
	return runDispatchForJob(jobId, "system", false);
}

/**
 * @param jobId
 * @param assignedByUserId
 * @param techId
 * @param reason
 *
 */

export async function manualAssignJob(
	jobId: string,
	assignedByUserId: string,
	techId: string,
	reason: string
): Promise<void> {
	const recommendation = await getDispatchRecommendations(jobId);

	const chosenTech = recommendation.recommendations.find(
		(r) => r.techId === techId
	);

	if (!chosenTech) {
		throw new Error(
			`Tech ${techId} is not eligible for job ${jobId}. ` +
				`Eligible techs: ${recommendation.recommendations.map((r) => r.techId).join(", ")}`
		);
	}

	await assignJobToTech(
		jobId,
		techId,
		assignedByUserId,
		true, // is manual override
		reason
	);
}
