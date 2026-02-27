import { calculateDistance } from "./distance";
import { TechnicianInput } from "../services/types/technicianInput";

/** Technician input type — all fields optional to prevent runtime errors */

/** Job input type — optional fields handled safely */
type JobInput = {
	latitude?: number;
	longitude?: number;
	requiredSkills?: string[];
	minimumSkillLevel?: number;
	priority?: string;
};

/**
 * Calculate distance score based on miles from job.
 * Emergency jobs have higher max points (60 vs 40).
 * Edge cases:
 *  - distance <= 0 → max points
 *  - distance >= 50 → 0 points
 *  - Linear interpolation for anything in between
 */
function calculateDistanceScore(
	distanceMiles: number = 0,
	isEmergency: boolean = false
): number {
	const maxPoints = isEmergency ? 60 : 40;
	if (distanceMiles <= 0) return maxPoints;
	if (distanceMiles >= 50) return 0;
	const score = maxPoints * (1 - distanceMiles / 50);
	return Math.round(Math.max(0, score) * 100) / 100;
}

/**
 * Calculate availability score based on current workload.
 * Emergency jobs get lower max points.
 * Edge cases:
 *  - No jobs or maxJobs <= 0 → max points
 *  - Linear reduction based on utilization
 */
function calculateAvailabilityScore(
	currentJobs: number = 0,
	maxJobs: number = 1,
	isEmergency: boolean = false
): number {
	const maxPoints = isEmergency ? 10 : 20;
	if (currentJobs <= 0 || maxJobs <= 0) return maxPoints;
	const utilization = currentJobs / maxJobs;
	const score = maxPoints * (1 - utilization);
	return Math.round(Math.max(0, score) * 100) / 100;
}

/**
 * Calculate skill match score.
 * All skills exactly met or overqualified (no deficit, any excess) → 15 (not perfect 20,
 *   because excess qualification wastes a higher-tier tech on a routine job).
 * Exact match (all levels exactly equal to minimum) → 20
 * Mixed: some over, some slight deficit (avgDeficit <= 1) → 15
 * Underqualified (avgDeficit > 1) → 10
 * No required skills → 20
 * Handles missing skillLevel or requiredSkills safely.
 */
function calculateSkillMatchScore(
	tech: TechnicianInput,
	job: JobInput
): number {
	const maxPoints = 20;
	const requiredSkills = job.requiredSkills || [];
	if (requiredSkills.length === 0) return maxPoints;

	let totalDifference = 0;
	let hasOverqualified = false;
	let hasExactMatch = false;

	for (const skill of requiredSkills) {
		const techLevel = tech.skillLevel?.[skill] ?? 0;
		const minLevel = job.minimumSkillLevel ?? 0;
		const deficit = Math.max(0, minLevel - techLevel); // only penalize under-qualification
		totalDifference += deficit;
		if (techLevel > minLevel) hasOverqualified = true;
		if (techLevel === minLevel) hasExactMatch = true;
	}

	const avgDeficit = totalDifference / requiredSkills.length;

	// All skills overqualified (no deficits, no exact matches) → 15
	// Overqualified wastes a senior tech; penalize slightly
	if (avgDeficit === 0 && hasOverqualified && !hasExactMatch) return 15;

	// Exact match (all skills exactly at minimum, no over, no under) → 20
	if (avgDeficit === 0) return maxPoints;

	// Mixed: some over, some slight deficit → 15
	if (hasOverqualified && avgDeficit <= 1) return 15;

	// Genuinely underqualified → 10
	return 10;
}

/**
 * Calculate performance score based on completion rate and job history.
 * New techs (<10 jobs) get default 70%.
 * Scoring tiers:
 *  - >=95% → 10
 *  - >=90% → 9
 *  - >=85% → 7
 *  - >=75% → 5
 *  - <75% → 3
 */
function calculatePerformanceScore(
	completionRate: number = 0,
	recentJobCount: number = 0
): number {
	const maxPoints = 10;
	if (recentJobCount < 10) return Math.round(maxPoints * 0.7);
	if (completionRate >= 0.95) return maxPoints;
	if (completionRate >= 0.9) return Math.round(maxPoints * 0.9);
	if (completionRate >= 0.85) return Math.round(maxPoints * 0.7);
	if (completionRate >= 0.75) return Math.round(maxPoints * 0.5);
	return Math.round(maxPoints * 0.3);
}

/**
 * Calculate workload score based on daily jobs.
 *  - 0 jobs → max points
 *  - 3 jobs → 50% points
 *  - 6+ jobs → 0 points
 *  - Emergency → 0 points
 */
function calculateWorkloadScore(
	dailyJobCount: number = 0,
	isEmergency: boolean = false
): number {
	if (isEmergency) return 0;
	const maxPoints = 10;
	if (dailyJobCount <= 0) return maxPoints;
	if (dailyJobCount >= 6) return 0;
	const score = maxPoints * (1 - dailyJobCount / 6);
	return Math.round(Math.max(0, score) * 100) / 100;
}

/**
 * Score a single technician for a job.
 * Returns breakdown of all scoring factors and total score.
 * Handles missing fields safely.
 */
export function scoreTechnician(
	tech: TechnicianInput,
	job: JobInput
): {
	techId: string;
	techName: string;
	distanceScore: number;
	availabilityScore: number;
	skillMatchScore: number;
	performanceScore: number;
	workloadScore: number;
	totalScore: number;
	distanceMiles: number;
	isEmergency: boolean;
} {
	const isEmergency = job.priority === "emergency";

	const techCoords = {
		latitude: tech.latitude ?? 0,
		longitude: tech.longitude ?? 0
	};
	const jobCoords = {
		latitude: job.latitude ?? 0,
		longitude: job.longitude ?? 0
	};

	const distanceMiles = calculateDistance(techCoords, jobCoords) || 0;

	const distanceScore = calculateDistanceScore(distanceMiles, isEmergency);
	const availabilityScore = calculateAvailabilityScore(
		tech.currentJobsCount ?? 0,
		tech.maxConcurrentJobs ?? 1,
		isEmergency
	);
	const skillMatchScore = calculateSkillMatchScore(tech, job);
	const performanceScore = calculatePerformanceScore(
		tech.recentCompletionRate ?? 0,
		tech.recentJobCount ?? 0
	);
	const workloadScore = calculateWorkloadScore(
		tech.dailyJobCount ?? 0,
		isEmergency
	);

	const totalScore = Math.min(
		100,
		Math.max(
			0,
			distanceScore +
				availabilityScore +
				skillMatchScore +
				performanceScore +
				workloadScore
		)
	);

	return {
		techId: tech.id ?? "unknown",
		techName: tech.name ?? "unknown",
		distanceScore,
		availabilityScore,
		skillMatchScore,
		performanceScore,
		workloadScore,
		totalScore: Math.round(totalScore * 100) / 100,
		distanceMiles,
		isEmergency
	};
}

/**
 * Score multiple technicians for a job.
 * Returns array of score objects.
 * Handles empty or invalid arrays safely.
 */
export function scoreAllTechnicians(
	technicians: TechnicianInput[],
	job: JobInput
) {
	if (!Array.isArray(technicians)) return [];
	return technicians.map((tech) => scoreTechnician(tech, job));
}
