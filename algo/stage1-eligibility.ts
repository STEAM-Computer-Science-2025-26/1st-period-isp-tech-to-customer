import { calculateDistance, areValidCoordinates } from "./distance";

interface JobInput {
    id: string;
    companyId: string;
    latitude: number;
    longitude: number;
    requiredSkills: string[];
    minimumSkillLevel: number;
}

interface TechnicianInput {
    id: string;
    name: string;
    companyId: string;
    isActive: boolean;
    isAvailable: boolean;
    currentJobsCount: number;
    maxConcurrentJobs: number;
    latitude: number | null;
    longitude: number | null;
    skills: string[];
    skillLevel: Record<string, number>;
    distanceMiles: number;
    recentCompletionRate: number;
    recentJobCount: number;
    dailyJobCount: number;
    maxTravelDistanceMiles: number;
}

interface EligibilityResult {
    isEligible: boolean;
    failedRules: string[];
    passedRules: string[];
}

interface IneligibleTechnician {
    technician: TechnicianInput;
    result: EligibilityResult;
}

interface FilterEligibleTechniciansResult {
    eligible: TechnicianInput[];
    ineligible: IneligibleTechnician[];
}

export function checkEligibility(
    tech: TechnicianInput,
    job: JobInput
): EligibilityResult {
    const failedRules: string[] = [];
    const passedRules: string[] = [];

    if (!tech.isActive) {
        failedRules.push("Rule 1: Technician is not active");
    } else {
        passedRules.push("Rule 1: Technician is active");
    }

    if (!tech.isAvailable) {
        failedRules.push("Rule 2: Technician is not available");
    } else {
        passedRules.push("Rule 2: Technician is available");
    }

    if (tech.currentJobsCount >= tech.maxConcurrentJobs) {
        failedRules.push("Rule 3: Technician is at capacity");
    } else {
        passedRules.push("Rule 3: Technician is not at capacity");
    }

    if (tech.companyId !== job.companyId) {
        failedRules.push("Rule 4: Technician is not from the same company");
    } else {
        passedRules.push("Rule 4: Technician is from the same company");
    }

    const techCoords =
        tech.latitude !== null && tech.longitude !== null
            ? { latitude: tech.latitude, longitude: tech.longitude }
            : null;

    if (!areValidCoordinates(techCoords)) {
        failedRules.push("Rule 5: Technician has invalid location");
    } else {
        passedRules.push("Rule 5: Technician has valid location");
    }

    const jobCoords = { latitude: job.latitude, longitude: job.longitude };

    if (areValidCoordinates(techCoords)) {
        const actualDistance = calculateDistance(
            techCoords as { latitude: number; longitude: number },
            jobCoords
        );

        if (actualDistance > tech.maxTravelDistanceMiles) {
            failedRules.push(
                `Rule 6: Technician is too far away (actual: ${actualDistance.toFixed(
                    2
                )} mi)`
            );
        } else {
            passedRules.push("Rule 6: Technician is within distance");
        }
    } else {
        failedRules.push("Rule 6: Cannot compute distance due to invalid location");
    }

    const missingSkills = job.requiredSkills.filter((requiredSkill) => {
        const techLevel = tech.skillLevel[requiredSkill] ?? 0;
        return (
            !tech.skills.includes(requiredSkill) ||
            techLevel < job.minimumSkillLevel
        );
    });

    if (missingSkills.length > 0) {
        failedRules.push(
            `Rule 7: Technician does not meet skill requirements. Missing or insufficient skills: ${missingSkills.join(
                ", "
            )}`
        );
    } else {
        passedRules.push("Rule 7: Technician meets skill requirements");
    }

    return {
        isEligible: failedRules.length === 0,
        failedRules,
        passedRules,
    };
}

export function filterEligibleTechnicians(
    technicians: TechnicianInput[],
    job: JobInput
): FilterEligibleTechniciansResult {
    const eligible: TechnicianInput[] = [];
    const ineligible: IneligibleTechnician[] = [];

    for (const tech of technicians) {
        const result = checkEligibility(tech, job);

        if (result.isEligible) {
            eligible.push(tech);
        } else {
            ineligible.push({ technician: tech, result });
        }
    }

    return { eligible, ineligible };
}