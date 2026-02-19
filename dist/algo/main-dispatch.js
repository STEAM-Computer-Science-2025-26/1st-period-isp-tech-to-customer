import { filterEligibleTechnicians } from "./stage1-eligibility";
import { scoreAllTechnicians } from "./scoring";
import { createRecommendation } from "./ranker";
/*
full dispatch pipeline for a single job:
  1. filter eligible techs (stage 1 - hard rules)
  2. score eligible techs (stage 2 - weighted scoring)
  3. rank and recommend (stage 4 - sort + assign)

returns a DispatchRecommendation. if no techs are eligible,
requiresManualDispatch will be true and assignedTech will be null.
*/
export function dispatch(job, technicians) {
    console.log(`\n Checking ${technicians.length} technicians for job ${job.id}...`);
    const { eligible, ineligible } = filterEligibleTechnicians(technicians, job);
    if (ineligible.length > 0) {
        console.log(`Ineligible technicians for job ${job.id}: ${ineligible.map((t) => t.technician.id).join(", ")}`);
        ineligible.forEach(({ technician, result }) => {
            console.log(` - ${technician.name}: ${result.failedRules[0]}`);
        });
    }
    console.log(`\n Found ${eligible.length} eligible technicians for job ${job.id}.`);
    const scores = scoreAllTechnicians(eligible, job);
    const isEmergency = job.priority.toLowerCase() === "emergency";
    console.log(`\n Ranking all eligible technicians for job ${job.id}...`);
    const recommendation = createRecommendation(job.id, scores, isEmergency);
    console.log(`\n Top Tech: ${recommendation.assignedTech?.techName ?? "none — manual dispatch required"} ` +
        `(${recommendation.assignedTech?.totalScore ?? "—"}/100 pts)\n`);
    return recommendation;
}
/*
runs dispatch for multiple jobs against the same technician pool.
each job is processed independently — workload state is not mutated
between jobs (stateless). caller is responsible for any real-time
workload updates between jobs if needed.
*/
export function batchDispatch(jobs, technicians) {
    console.log(`\n Starting batch dispatch for ${jobs.length} jobs...`);
    const recommendations = jobs.map((job, index) => {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Processing Job ${index + 1}/${jobs.length} (ID: ${job.id})`);
        console.log(`${"=".repeat(70)}\n`);
        return dispatch(job, technicians);
    });
    console.log(`\n Batch dispatch completed for ${jobs.length} jobs.`);
    return recommendations;
}
/*
override the auto-assigned tech with a dispatcher's manual choice.

the selected tech must be in the existing recommendations list —
this prevents overriding to a tech who was ineligible or unscored.

returns a new recommendation object (does not mutate the original).
*/
export function overrideAssignment(originalRecommendation, selectedTechId, overrideReason) {
    const selectedTech = originalRecommendation.recommendations.find((rec) => rec.techId === selectedTechId);
    if (!selectedTech) {
        throw new Error(`Tech with ID ${selectedTechId} is not in the list of eligible technicians for job ${originalRecommendation.jobId}. ` +
            `Available techs: ${originalRecommendation.recommendations.map((r) => `${r.techId} (${r.techName})`).join(", ")}`);
    }
    return {
        ...originalRecommendation,
        assignedTech: {
            techId: selectedTech.techId,
            techName: selectedTech.techName,
            totalScore: selectedTech.totalScore
        },
        override: {
            reason: overrideReason,
            overriddenAt: new Date().toISOString()
        }
    };
}
/*
aggregates stats across a batch of recommendations.

overrideRate = overrides / autoAssigned (not total jobs) because
overrides are only meaningful against jobs that could have been
auto-assigned. passing overridesCount is optional.
*/
export function getDispatchStats(recommendations, overridesCount) {
    const totalJobs = recommendations.length;
    const autoAssigned = recommendations.filter((r) => !r.requiresManualDispatch).length;
    const manualDispatchRequired = recommendations.filter((r) => r.requiresManualDispatch).length;
    const emergencyJobs = recommendations.filter((r) => r.isEmergency).length;
    const totalEligible = recommendations.reduce((sum, r) => sum + r.totalEligibleTechs, 0);
    const averageEligibleTechs = totalJobs > 0 ? Math.round((totalEligible / totalJobs) * 100) / 100 : 0;
    const stats = {
        totalJobs,
        autoAssigned,
        manualDispatchRequired,
        emergencyJobs,
        averageEligibleTechs
    };
    if (overridesCount !== undefined && autoAssigned > 0) {
        stats.overrideRate =
            Math.round((overridesCount / autoAssigned) * 10000) / 100;
    }
    return stats;
}
