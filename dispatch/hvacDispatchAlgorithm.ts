// HVAC Dispatch Algorithm v1.0 — Full Implementation
// Compliant with specification document

import type { Technician } from "../scripts/testDispatchAlgorithm";

// --------------------
// Types
// --------------------

type Job = {
  id: number;
  address: { lat: number; lng: number };
  priority: "normal" | "emergency";
  skillRequired: number;
};

type TechnicianScore = {
  tech: Technician;
  distanceScore: number;
  availScore: number;
  skillScore: number;
  perfScore: number;
  workloadScore: number;
  totalScore: number;
  eligibilityFailure?: string;
};

type DispatchResult = {
  jobId: number;
  assignedTech: Technician | null;
  topThree: TechnicianScore[];
  allScores: TechnicianScore[];
  manualDispatchRequired: boolean;
  timestamp: Date;
  emergencyJob: boolean;
};

// --------------------
// Constants (as per spec)
// --------------------

const CONFIG = {
  // Distance scoring thresholds
  DISTANCE_EXCELLENT_KM: 0,
  DISTANCE_GOOD_KM: 25,
  DISTANCE_MAX_KM: 50,
  
  // Score weights (100-point system)
  SCORE_DISTANCE_MAX: 40,
  SCORE_DISTANCE_GOOD: 20,
  SCORE_AVAILABILITY_ZERO_JOBS: 20,
  SCORE_AVAILABILITY_HALF_FULL: 10,
  SCORE_SKILL_EXACT: 20,
  SCORE_SKILL_ONE_OFF: 15,
  SCORE_SKILL_TWO_PLUS_OFF: 10,
  SCORE_PERFORMANCE_MAX: 10,
  SCORE_WORKLOAD_ZERO_JOBS: 10,
  SCORE_WORKLOAD_THREE_JOBS: 5,
  SCORE_WORKLOAD_SIX_PLUS_JOBS: 0,
  
  // Performance thresholds
  PERF_EXCELLENT: 95,
  PERF_GREAT: 90,
  PERF_GOOD: 85,
  PERF_ACCEPTABLE: 75,
  PERF_MIN_JOBS_FOR_SCORE: 10,
  PERF_DEFAULT_SCORE: 7,
  
  // Emergency adjustments
  EMERGENCY_DISTANCE_WEIGHT: 0.6, // 60% of score
  EMERGENCY_AVAILABILITY_PENALTY: 10,
  EMERGENCY_WORKLOAD_PENALTY: 10,
  EMERGENCY_TRAVEL_REDUCTION: 0.5, // 50% reduction in max travel
  
  // Tiebreaker threshold
  TIE_THRESHOLD: 0.1,
  
  // Earth radius approximation for distance calc
  KM_PER_DEGREE: 111,
};

// --------------------
// Utility Functions
// --------------------

/**
 * Compute approximate distance in kilometers using Euclidean approximation
 * Note: Production should use Haversine formula for accuracy
 */
function computeDistance(
  loc1: { lat: number; lng: number },
  loc2: { lat: number; lng: number }
): number {
  const dx = loc1.lat - loc2.lat;
  const dy = loc1.lng - loc2.lng;
  return Math.sqrt(dx * dx + dy * dy) * CONFIG.KM_PER_DEGREE;
}

/**
 * Calculate performance score based on recent job completion rate
 * Spec: Factor 4 — Recent Performance (10 points)
 */
function calculatePerformanceScore(recentPerformance: number[]): number {
  if (recentPerformance.length < CONFIG.PERF_MIN_JOBS_FOR_SCORE) {
    return CONFIG.PERF_DEFAULT_SCORE;
  }
  
  const avgCompletionRate = 
    recentPerformance.reduce((sum, rate) => sum + rate, 0) / recentPerformance.length;
  
  if (avgCompletionRate >= CONFIG.PERF_EXCELLENT) return 10;
  if (avgCompletionRate >= CONFIG.PERF_GREAT) return 9;
  if (avgCompletionRate >= CONFIG.PERF_GOOD) return 7;
  if (avgCompletionRate >= CONFIG.PERF_ACCEPTABLE) return 5;
  return 3;
}

// --------------------
// Stage 1 — Eligibility Filters
// --------------------

/**
 * Apply hard eligibility rules from spec Section 3
 * Returns eligible techs and ineligible techs with reasons
 */
function applyEligibilityFilters(
  technicians: Technician[],
  job: Job
): {
  eligible: Technician[];
  ineligible: Array<{ tech: Technician; reason: string }>;
} {
  const eligible: Technician[] = [];
  const ineligible: Array<{ tech: Technician; reason: string }> = [];
  
  // Calculate max travel distance (adjusted for emergencies)
  let maxTravelKm = CONFIG.DISTANCE_MAX_KM;
  if (job.priority === "emergency") {
    maxTravelKm *= CONFIG.EMERGENCY_TRAVEL_REDUCTION;
  }
  
  for (const tech of technicians) {
    // Rule 1 — Is Active
    if (!tech.active) {
      ineligible.push({ tech, reason: "Inactive (terminated or disabled)" });
      continue;
    }
    
    // Rule 2 — Is Available
    if (!tech.available) {
      ineligible.push({ tech, reason: "Not available (self-reported)" });
      continue;
    }
    
    // Rule 3 — Below Max Jobs Limit
    if (tech.currentJobs >= tech.maxJobs) {
      ineligible.push({ 
        tech, 
        reason: `Max jobs reached (${tech.currentJobs}/${tech.maxJobs})` 
      });
      continue;
    }
    
    // Rule 5 — Has Valid Location
    if (!tech.location || tech.location.lat === undefined || tech.location.lng === undefined) {
      ineligible.push({ tech, reason: "No valid location data" });
      continue;
    }
    
    // Rule 6 — Within Max Travel Distance
    const distance = computeDistance(tech.location, job.address);
    if (distance > maxTravelKm) {
      ineligible.push({ 
        tech, 
        reason: `Beyond max travel (${distance.toFixed(1)} km > ${maxTravelKm.toFixed(1)} km)` 
      });
      continue;
    }
    
    // Rule 7 — Meets Minimum Skill Level
    if (tech.skillLevel < job.skillRequired) {
      ineligible.push({ 
        tech, 
        reason: `Insufficient skill (level ${tech.skillLevel} < required ${job.skillRequired})` 
      });
      continue;
    }
    
    // Passed all filters
    eligible.push(tech);
  }
  
  return { eligible, ineligible };
}

// --------------------
// Stage 2 — Scoring System
// --------------------

/**
 * Score eligible technicians using the 100-point system from spec Section 4
 */
function scoreTechnicians(
  technicians: Technician[],
  job: Job
): TechnicianScore[] {
  return technicians.map((tech) => {
    const distance = computeDistance(tech.location, job.address);
    
    // Factor 1 — Distance (40 points)
    let distanceScore: number;
    if (distance <= CONFIG.DISTANCE_EXCELLENT_KM) {
      distanceScore = CONFIG.SCORE_DISTANCE_MAX;
    } else if (distance <= CONFIG.DISTANCE_GOOD_KM) {
      distanceScore = CONFIG.SCORE_DISTANCE_GOOD;
    } else {
      // Linear interpolation from 25km (20 pts) to 50km (0 pts)
      const ratio = (CONFIG.DISTANCE_MAX_KM - distance) / 
                    (CONFIG.DISTANCE_MAX_KM - CONFIG.DISTANCE_GOOD_KM);
      distanceScore = Math.max(0, CONFIG.SCORE_DISTANCE_GOOD * ratio);
    }
    
    // Factor 2 — Current Availability (20 points)
    let availScore: number;
    if (tech.currentJobs === 0) {
      availScore = CONFIG.SCORE_AVAILABILITY_ZERO_JOBS;
    } else {
      const jobRatio = tech.currentJobs / tech.maxJobs;
      if (jobRatio <= 0.5) {
        availScore = CONFIG.SCORE_AVAILABILITY_HALF_FULL;
      } else {
        // Linear decrease from half full (10 pts) to nearly full (0 pts)
        availScore = CONFIG.SCORE_AVAILABILITY_HALF_FULL * (1 - (jobRatio - 0.5) / 0.5);
        availScore = Math.max(0, availScore);
      }
    }
    
    // Factor 3 — Skill Match (20 points)
    const skillDifference = Math.abs(tech.skillLevel - job.skillRequired);
    let skillScore: number;
    if (skillDifference === 0) {
      skillScore = CONFIG.SCORE_SKILL_EXACT;
    } else if (skillDifference === 1) {
      skillScore = CONFIG.SCORE_SKILL_ONE_OFF;
    } else {
      skillScore = CONFIG.SCORE_SKILL_TWO_PLUS_OFF;
    }
    
    // Factor 4 — Recent Performance (10 points)
    const perfScore = calculatePerformanceScore(tech.recentPerformance);
    
    // Factor 5 — Daily Workload Balance (10 points)
    let workloadScore: number;
    if (tech.currentJobs === 0) {
      workloadScore = CONFIG.SCORE_WORKLOAD_ZERO_JOBS;
    } else if (tech.currentJobs === 3) {
      workloadScore = CONFIG.SCORE_WORKLOAD_THREE_JOBS;
    } else if (tech.currentJobs >= 6) {
      workloadScore = CONFIG.SCORE_WORKLOAD_SIX_PLUS_JOBS;
    } else if (tech.currentJobs < 3) {
      // Linear interpolation from 0 jobs (10 pts) to 3 jobs (5 pts)
      workloadScore = CONFIG.SCORE_WORKLOAD_ZERO_JOBS - 
                      ((CONFIG.SCORE_WORKLOAD_ZERO_JOBS - CONFIG.SCORE_WORKLOAD_THREE_JOBS) * 
                       tech.currentJobs / 3);
    } else {
      // Linear interpolation from 3 jobs (5 pts) to 6 jobs (0 pts)
      workloadScore = CONFIG.SCORE_WORKLOAD_THREE_JOBS * 
                      (1 - (tech.currentJobs - 3) / 3);
    }
    
    // Stage 3 — Emergency Overrides (if applicable)
    if (job.priority === "emergency") {
      // Distance becomes 60% of score
      const emergencyDistanceScore = distanceScore * 1.5; // Scale up to maintain 60% weight
      distanceScore = emergencyDistanceScore;
      
      // Steal 10 points from availability
      availScore = Math.max(0, availScore - CONFIG.EMERGENCY_AVAILABILITY_PENALTY);
      
      // Steal 10 points from workload
      workloadScore = Math.max(0, workloadScore - CONFIG.EMERGENCY_WORKLOAD_PENALTY);
    }
    
    // Calculate total score
    const totalScore = distanceScore + availScore + skillScore + perfScore + workloadScore;
    
    return {
      tech,
      distanceScore,
      availScore,
      skillScore,
      perfScore,
      workloadScore,
      totalScore,
    };
  });
}

// --------------------
// Stage 4 — Assignment
// --------------------

/**
 * Apply tiebreaker logic as per spec Section 6
 */
function applyTiebreakers(
  tied: TechnicianScore[],
  job: Job
): TechnicianScore[] {
  return tied.sort((a, b) => {
    // 1. Higher recent performance (sum of completion rates)
    const perfSumA = a.tech.recentPerformance.reduce((sum, val) => sum + val, 0);
    const perfSumB = b.tech.recentPerformance.reduce((sum, val) => sum + val, 0);
    if (perfSumA !== perfSumB) {
      return perfSumB - perfSumA; // Higher is better
    }
    
    // 2. Shorter distance
    const distA = computeDistance(a.tech.location, job.address);
    const distB = computeDistance(b.tech.location, job.address);
    if (distA !== distB) {
      return distA - distB; // Lower is better
    }
    
    // 3. Lower workload today
    if (a.tech.currentJobs !== b.tech.currentJobs) {
      return a.tech.currentJobs - b.tech.currentJobs; // Lower is better
    }
    
    // 4. Random selection (true tie)
    return Math.random() - 0.5;
  });
}

/**
 * Get top 3 technicians and determine assignment
 */
function assignTechnician(
  job: Job,
  technicians: Technician[]
): DispatchResult {
  const timestamp = new Date();
  
  // Stage 1 — Eligibility
  const { eligible, ineligible } = applyEligibilityFilters(technicians, job);
  
  // Check for no eligible technicians
  if (eligible.length === 0) {
    console.log(`\n⚠️  Job ${job.id}: MANUAL DISPATCH REQUIRED`);
    console.log("No eligible technicians found.");
    console.log("Ineligible technicians:");
    ineligible.forEach(({ tech, reason }) => {
      console.log(`  - ${tech.name}: ${reason}`);
    });
    
    return {
      jobId: job.id,
      assignedTech: null,
      topThree: [],
      allScores: ineligible.map(({ tech, reason }) => ({
        tech,
        distanceScore: 0,
        availScore: 0,
        skillScore: 0,
        perfScore: 0,
        workloadScore: 0,
        totalScore: 0,
        eligibilityFailure: reason,
      })),
      manualDispatchRequired: true,
      timestamp,
      emergencyJob: job.priority === "emergency",
    };
  }
  
  // Stage 2 — Scoring
  const scores = scoreTechnicians(eligible, job);
  
  // Sort by total score (descending)
  scores.sort((a, b) => b.totalScore - a.totalScore);
  
  // Handle ties at the top
  const topScore = scores[0].totalScore;
  const tiedForFirst = scores.filter(
    (s) => Math.abs(s.totalScore - topScore) <= CONFIG.TIE_THRESHOLD
  );
  
  let rankedScores: TechnicianScore[];
  if (tiedForFirst.length > 1) {
    const tiebroken = applyTiebreakers(tiedForFirst, job);
    const others = scores.filter(
      (s) => Math.abs(s.totalScore - topScore) > CONFIG.TIE_THRESHOLD
    );
    rankedScores = [...tiebroken, ...others];
  } else {
    rankedScores = scores;
  }
  
  // Get top 3 for recommendation
  const topThree = rankedScores.slice(0, 3);
  
  return {
    jobId: job.id,
    assignedTech: rankedScores[0].tech,
    topThree,
    allScores: rankedScores,
    manualDispatchRequired: false,
    timestamp,
    emergencyJob: job.priority === "emergency",
  };
}

// --------------------
// Logging & Reporting
// --------------------

/**
 * Log dispatch result for data collection (Section 7)
 */
function logDispatchResult(result: DispatchResult): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Job ID: ${result.jobId} ${result.emergencyJob ? "🚨 EMERGENCY" : ""}`);
  console.log(`Timestamp: ${result.timestamp.toISOString()}`);
  console.log(`${"=".repeat(60)}`);
  
  if (result.manualDispatchRequired) {
    console.log("❌ MANUAL DISPATCH REQUIRED - No eligible technicians");
    return;
  }
  
  console.log(`\n✅ ASSIGNED: ${result.assignedTech?.name}`);
  console.log(`\nTop 3 Recommendations:`);
  
  result.topThree.forEach((score, index) => {
    console.log(`\n${index + 1}. ${score.tech.name} (ID: ${score.tech.id})`);
    console.log(`   Total Score: ${score.totalScore.toFixed(1)}/100`);
    console.log(`   ├─ Distance:     ${score.distanceScore.toFixed(1)} pts`);
    console.log(`   ├─ Availability: ${score.availScore.toFixed(1)} pts`);
    console.log(`   ├─ Skill Match:  ${score.skillScore.toFixed(1)} pts`);
    console.log(`   ├─ Performance:  ${score.perfScore.toFixed(1)} pts`);
    console.log(`   └─ Workload:     ${score.workloadScore.toFixed(1)} pts`);
    console.log(`   Current Jobs: ${score.tech.currentJobs}/${score.tech.maxJobs}`);
  });
  
  // TODO: Store in database for v2.0 analysis
  // - All technician scores
  // - Final ranking
  // - Assigned tech
  // - Override flag (when dispatcher changes)
  // - Job outcome
  // - Actual vs estimated completion time
}

// --------------------
// Example Usage
// --------------------

const sampleTechnicians: Technician[] = [
  {
    id: 1,
    name: "Alice",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [95, 90, 85, 100, 92, 88, 90, 85, 95, 90],
  },
  {
    id: 2,
    name: "Bob",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 2,
    location: { lat: 1, lng: 1 },
    skillLevel: 3,
    recentPerformance: [80, 85, 90, 88, 92, 85, 87, 90, 89, 91],
  },
  {
    id: 3,
    name: "Charlie",
    active: true,
    available: true,
    maxJobs: 8,
    currentJobs: 0,
    location: { lat: 2, lng: 2 },
    skillLevel: 2,
    recentPerformance: [70, 75, 80, 85, 90, 70, 75, 80, 85, 90],
  },
  {
    id: 4,
    name: "Diana",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 3,
    location: { lat: 0.3, lng: 0.3 },
    skillLevel: 3,
    recentPerformance: [98, 97, 96, 95, 99, 97, 98, 96, 97, 98],
  },
  {
    id: 5,
    name: "Eve",
    active: false, // Inactive
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0.1, lng: 0.1 },
    skillLevel: 3,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
];

// Test Case 1: Normal Priority Job
const normalJob: Job = {
  id: 101,
  address: { lat: 0.5, lng: 0.5 },
  priority: "normal",
  skillRequired: 2,
};

const normalResult = assignTechnician(normalJob, sampleTechnicians);
logDispatchResult(normalResult);

// Test Case 2: Emergency Job
const emergencyJob: Job = {
  id: 102,
  address: { lat: 0.2, lng: 0.2 },
  priority: "emergency",
  skillRequired: 2,
};

const emergencyResult = assignTechnician(emergencyJob, sampleTechnicians);
logDispatchResult(emergencyResult);

// Export for use in other modules
export { assignTechnician, type DispatchResult, type TechnicianScore, CONFIG };