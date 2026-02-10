import { filterEligibleTechnicians } from "./stage1-eligibility";
import { scoreAllTechnicians } from "./scoring";
import { createRecommendation } from "./ranker";
import { TechnicianInput } from "../services/types/technicianInput";
type jobInput = {
    id: string;
    companyId: string;
    jobType: string;
    priority: string;
    address: string;
    latitude: number;
    longitude: number;
    requiredSkills: string[];
    minimumSkillLevel: number;
}



/*
*filter eligible techs(stage 1)
*check if any techs are eligible
*score eligible techs(stage 2)
*rank eligible techs(stage 4)
*returns recommendation
*/
export function dispatch(
    job: jobInput,
    technicians: TechnicianInput[]
) {
    console.log(`\n Checking ${technicians.length} technicians for job ${job.id}...`);

    const { eligible, ineligible } = filterEligibleTechnicians(technicians, job);

    if (ineligible.length > 0) {
        console.log(`Ineligible technicians for job ${job.id}: ${ineligible.map(t => (t as any).id).join(", ")}`);
        ineligible.forEach(({ technician, result }) => {
            console.log(` - ${technician.name}: ${result.failedRules[0]}`);
        });
    }

    console.log(`\n Found ${eligible.length} eligible technicians for job ${job.id}.`);

    const scores = scoreAllTechnicians(eligible, job);

    console.log(`\n ranking all eligible technicians for job ${job.id}...`);
    const isEmergency = (job.priority || "").toLowerCase() === "emergency";

    // Only assign top tech if there is at least one eligible technician
    const topTech = scores.length > 0 ? createRecommendation(job.id, scores, isEmergency).assignedTech : undefined;

    const recommendation = {
        ...createRecommendation(job.id, scores, isEmergency),
        requiresManualDispatch: eligible.length === 0 // THIS is the fix
    };

    console.log(`\n Top Tech: ${topTech?.techName || "undefined"} (${topTech?.totalScore || "undefined"}/100 pts)\n`);

    return recommendation;
}

export function batchDispatch(
    jobs: jobInput[],
    technicians: TechnicianInput[]
) {
    console.log(`\n Starting batch dispatch for ${jobs.length} jobs...`);

    const recommendations = jobs.map((job, index) => {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`Processing Job ${index + 1}/${jobs.length} (ID: ${job.id})`);
        console.log(`${'='.repeat(70)}\n`);
        return dispatch(job, technicians);
    });

    console.log(`\n Batch dispatch completed for ${jobs.length} jobs.`);
    return recommendations;
}

/*
find the selected text in recommendation
validate that the selected tech is in the list of eligible techs
return modified information with override info
*/

export function overrideAssignment(
    originalRecommendation: ReturnType<typeof createRecommendation>,
    selectedTechId: string,
    overrideReason: string
) {
    const selectedTech = originalRecommendation.recommendations.find(
        rec=> rec.techId === selectedTechId
    )
    if(!selectedTech) {
        throw new Error(
            `Tech with ID ${selectedTechId} is not in the list of eligible technicians for job ${originalRecommendation.jobId}. Available techs: ${originalRecommendation.recommendations.map(r => `${r.techId} (${r.techName})`).join(", ")}`
        );
    }

    // return a modified recommendation with the override applied
    const modifiedRecommendation = {
        ...originalRecommendation,
        assignedTech: {
            techId: selectedTech.techId,
            techName: selectedTech.techName,
            totalScore: (selectedTech as any).totalScore
        },
        override: {
            reason: overrideReason,
            overriddenAt: new Date().toISOString()
        }
    };

    return modifiedRecommendation;
}

/*
count total jobs processed
count auto-assigned vs. manual overrides
calculate average eligible techs per job
calculate override rate
return all stats
*/
export function getDispatchStats(
    recommendations: Array<ReturnType<typeof createRecommendation>>,
    overridesCount?: number
) {
    
    const totalJobs = recommendations.length;
    const autoAssigned = recommendations.filter(r => !r.requiresManualDispatch).length;
    const manualDispatchRequired = recommendations.filter(r => r.requiresManualDispatch).length;   
    const emergencyJobs = recommendations.filter(r => r.isEmergency).length;
    const totalEligible = recommendations.reduce((sum, r) => sum + r.totalEligibleTechs, 0);
    const averageEligibleTechs = totalJobs > 0 
        ? Math.round((totalEligible / totalJobs) * 100) / 100 
        : 0;
    const stats: {
        totalJobs: number;
        autoAssigned: number;
        manualDispatchRequired: number;
        emergencyJobs: number;
        averageEligibleTechs: number;
        overrideRate?: number;
    } = {
        totalJobs,
        autoAssigned,
        manualDispatchRequired,
        emergencyJobs,
        averageEligibleTechs
    };
    if (overridesCount !== undefined && autoAssigned > 0) {
        stats.overrideRate = Math.round((overridesCount / autoAssigned) * 10000) / 100; // Percentage with 2 decimals
    }
    return stats;
}