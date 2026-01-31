// skill-mapping.ts
// Configuration for mapping job types to required tech skills

export type JobType = 'installation' | 'repair' | 'maintenance' | 'inspection';

export type TechSkill = 
	| 'hvac_install'
	| 'hvac_repair'
	| 'hvac_maintenance'
	| 'electrical'
	| 'refrigeration'
	| 'ductwork'
	| 'plumbing'
	// Legacy skills (need to be migrated)
	| 'AC repair'
	| 'furnace'
	| 'heat pump'
	| 'installation'
	| 'inspection';

/**
 * Maps job types to required tech skills
 */
export const JOB_TYPE_TO_REQUIRED_SKILLS: Record<JobType, TechSkill[]> = {
	installation: ['hvac_install', 'installation'], // Accept both old and new
	repair: ['hvac_repair', 'AC repair'], // Accept both old and new
	maintenance: ['hvac_maintenance'],
	inspection: ['inspection']
};

/**
 * Maps legacy skill names to standardized names
 */
export const LEGACY_SKILL_MAPPING: Record<string, TechSkill> = {
	'AC repair': 'hvac_repair',
	'furnace': 'hvac_repair', // Furnace repair is a type of HVAC repair
	'heat pump': 'hvac_repair', // Heat pump repair is a type of HVAC repair
	'installation': 'hvac_install',
	'inspection': 'hvac_maintenance' // Inspections are part of maintenance
};

/**
 * Standardize a skill name
 */
export function standardizeSkill(skill: string): TechSkill {
	return (LEGACY_SKILL_MAPPING[skill] as TechSkill) || (skill as TechSkill);
}

/**
 * Check if a tech has the required skills for a job type
 */
export function hasRequiredSkills(
	techSkills: string[],
	jobType: JobType
): boolean {
	const requiredSkills = JOB_TYPE_TO_REQUIRED_SKILLS[jobType];
	const standardizedTechSkills = techSkills.map(standardizeSkill);
	
	// Tech must have at least one of the required skills
	return requiredSkills.some(required => 
		standardizedTechSkills.includes(standardizeSkill(required))
	);
}

/**
 * Get skill match score (0-1)
 * Higher score = better match
 */
export function getSkillMatchScore(
	techSkills: string[],
	jobType: JobType
): number {
	const requiredSkills = JOB_TYPE_TO_REQUIRED_SKILLS[jobType];
	const standardizedTechSkills = techSkills.map(standardizeSkill);
	
	let matchCount = 0;
	for (const required of requiredSkills) {
		if (standardizedTechSkills.includes(standardizeSkill(required))) {
			matchCount++;
		}
	}
	
	// Return percentage of required skills the tech has
	return matchCount / requiredSkills.length;
}

/**
 * Job difficulty levels with descriptions
 */
export const DIFFICULTY_LEVELS = {
	1: 'Very Easy - Routine task, minimal tools',
	2: 'Easy - Standard repair, common parts',
	3: 'Moderate - Requires diagnosis, some complexity',
	4: 'Hard - Complex system, specialized knowledge',
	5: 'Very Hard - Emergency, multi-system, high stakes'
} as const;

/**
 * Physicality ratings
 */
export const PHYSICALITY_RATINGS = {
	1: 'Light - Minimal physical effort (filter change, thermostat)',
	2: 'Low - Some lifting (<25 lbs), basic tools',
	3: 'Moderate - Regular lifting (25-50 lbs), ladder work',
	4: 'High - Heavy lifting (50-75 lbs), confined spaces',
	5: 'Very High - Very heavy lifting (>75 lbs), rooftop work'
} as const;

/**
 * Estimate job difficulty based on type and priority
 */
export function estimateJobDifficulty(
	jobType: JobType,
	priority: 'low' | 'medium' | 'high' | 'emergency'
): number {
	// Base difficulty by job type
	const baseDifficulty: Record<JobType, number> = {
		inspection: 1,
		maintenance: 2,
		repair: 3,
		installation: 4
	};
	
	// Priority modifier
	const priorityModifier = {
		low: 0,
		medium: 0,
		high: 1,
		emergency: 1
	};
	
	return Math.min(5, baseDifficulty[jobType] + priorityModifier[priority]);
}

/**
 * Estimate job physicality based on type
 */
export function estimateJobPhysicality(jobType: JobType): number {
	const basePhysicality: Record<JobType, number> = {
		inspection: 1,
		maintenance: 2,
		repair: 3,
		installation: 4
	};
	
	return basePhysicality[jobType];
}

/**
 * Estimate job duration in minutes
 */
export function estimateJobDuration(
	jobType: JobType,
	difficulty: number
): number {
	const baseDuration: Record<JobType, number> = {
		inspection: 60,
		maintenance: 90,
		repair: 120,
		installation: 240
	};
	
	// Add 30 minutes per difficulty level above 1
	return baseDuration[jobType] + ((difficulty - 1) * 30);
}