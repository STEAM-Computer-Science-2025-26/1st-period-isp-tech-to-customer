/**
 * HVAC Dispatch Algorithm — Comprehensive Test Script
 * Tests all aspects of the v1.0 specification
 */

export type Technician = {
  id: number;
  name: string;
  active: boolean;
  available: boolean;
  maxJobs: number;
  currentJobs: number;
  location: { lat: number; lng: number };
  skillLevel: number;
  recentPerformance: number[]; // last 10 jobs (completion %)
};

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
  distance?: number; // actual distance in km
};

// --------------------
// Configuration
// --------------------
const CONFIG = {
  DISTANCE_EXCELLENT_KM: 0,
  DISTANCE_GOOD_KM: 25,
  DISTANCE_MAX_KM: 50,
  
  SCORE_DISTANCE_MAX: 40,
  SCORE_DISTANCE_GOOD: 20,
  SCORE_AVAILABILITY_ZERO: 20,
  SCORE_AVAILABILITY_HALF: 10,
  SCORE_SKILL_EXACT: 20,
  SCORE_SKILL_ONE_OFF: 15,
  SCORE_SKILL_TWO_PLUS: 10,
  SCORE_WORKLOAD_ZERO: 10,
  SCORE_WORKLOAD_THREE: 5,
  SCORE_WORKLOAD_SIX_PLUS: 0,
  
  PERF_EXCELLENT: 95,
  PERF_GREAT: 90,
  PERF_GOOD: 85,
  PERF_ACCEPTABLE: 75,
  PERF_MIN_JOBS: 10,
  PERF_DEFAULT: 7,
  
  EMERGENCY_DISTANCE_MULTIPLIER: 1.5,
  EMERGENCY_AVAIL_PENALTY: 10,
  EMERGENCY_WORKLOAD_PENALTY: 10,
  EMERGENCY_TRAVEL_REDUCTION: 0.5,
  
  KM_PER_DEGREE: 111,
};

// --------------------
// Utilities
// --------------------
function computeDistance(
  loc1: { lat: number; lng: number },
  loc2: { lat: number; lng: number }
): number {
  const dx = loc1.lat - loc2.lat;
  const dy = loc1.lng - loc2.lng;
  return Math.sqrt(dx * dx + dy * dy) * CONFIG.KM_PER_DEGREE;
}

function calculatePerformanceScore(recentPerformance: number[]): number {
  if (recentPerformance.length < CONFIG.PERF_MIN_JOBS) {
    return CONFIG.PERF_DEFAULT;
  }
  
  const avg = recentPerformance.reduce((sum, val) => sum + val, 0) / recentPerformance.length;
  
  if (avg >= CONFIG.PERF_EXCELLENT) return 10;
  if (avg >= CONFIG.PERF_GREAT) return 9;
  if (avg >= CONFIG.PERF_GOOD) return 7;
  if (avg >= CONFIG.PERF_ACCEPTABLE) return 5;
  return 3;
}

// --------------------
// Stage 1: Eligibility
// --------------------
function filterEligibleTechs(
  techs: Technician[],
  job: Job
): {
  eligible: Technician[];
  ineligible: Array<{ tech: Technician; reason: string }>;
} {
  const eligible: Technician[] = [];
  const ineligible: Array<{ tech: Technician; reason: string }> = [];
  
  let maxTravelKm = CONFIG.DISTANCE_MAX_KM;
  if (job.priority === "emergency") {
    maxTravelKm *= CONFIG.EMERGENCY_TRAVEL_REDUCTION;
  }
  
  for (const tech of techs) {
    // Rule 1: Is Active
    if (!tech.active) {
      ineligible.push({ tech, reason: "Inactive" });
      continue;
    }
    
    // Rule 2: Is Available
    if (!tech.available) {
      ineligible.push({ tech, reason: "Not available" });
      continue;
    }
    
    // Rule 3: Below Max Jobs
    if (tech.currentJobs >= tech.maxJobs) {
      ineligible.push({
        tech,
        reason: `Max jobs reached (${tech.currentJobs}/${tech.maxJobs})`,
      });
      continue;
    }
    
    // Rule 5: Has Valid Location
    if (!tech.location || 
        tech.location.lat === undefined || 
        tech.location.lng === undefined) {
      ineligible.push({ tech, reason: "No valid location" });
      continue;
    }
    
    // Rule 6: Within Max Travel
    const distance = computeDistance(tech.location, job.address);
    if (distance > maxTravelKm) {
      ineligible.push({
        tech,
        reason: `Too far (${distance.toFixed(1)} km > ${maxTravelKm.toFixed(1)} km)`,
      });
      continue;
    }
    
    // Rule 7: Meets Skill Level
    if (tech.skillLevel < job.skillRequired) {
      ineligible.push({
        tech,
        reason: `Insufficient skill (L${tech.skillLevel} < L${job.skillRequired})`,
      });
      continue;
    }
    
    eligible.push(tech);
  }
  
  return { eligible, ineligible };
}

// --------------------
// Stage 2: Scoring
// --------------------
function scoreTechnicians(techs: Technician[], job: Job): TechnicianScore[] {
  return techs.map((tech) => {
    const distance = computeDistance(tech.location, job.address);
    
    // Factor 1: Distance (40 points)
    let distanceScore: number;
    if (distance <= CONFIG.DISTANCE_EXCELLENT_KM) {
      distanceScore = CONFIG.SCORE_DISTANCE_MAX;
    } else if (distance <= CONFIG.DISTANCE_GOOD_KM) {
      // Linear: 0km=40pts, 25km=20pts
      distanceScore = CONFIG.SCORE_DISTANCE_MAX - 
        ((distance / CONFIG.DISTANCE_GOOD_KM) * 
        (CONFIG.SCORE_DISTANCE_MAX - CONFIG.SCORE_DISTANCE_GOOD));
    } else {
      // Linear: 25km=20pts, 50km=0pts
      const ratio = (CONFIG.DISTANCE_MAX_KM - distance) / 
                    (CONFIG.DISTANCE_MAX_KM - CONFIG.DISTANCE_GOOD_KM);
      distanceScore = Math.max(0, CONFIG.SCORE_DISTANCE_GOOD * ratio);
    }
    
    // Factor 2: Availability (20 points)
    let availScore: number;
    if (tech.currentJobs === 0) {
      availScore = CONFIG.SCORE_AVAILABILITY_ZERO;
    } else {
      const jobRatio = tech.currentJobs / tech.maxJobs;
      if (jobRatio <= 0.5) {
        availScore = CONFIG.SCORE_AVAILABILITY_HALF;
      } else {
        // Linear decrease: 50%=10pts, 100%=0pts
        availScore = CONFIG.SCORE_AVAILABILITY_HALF * (1 - (jobRatio - 0.5) / 0.5);
        availScore = Math.max(0, availScore);
      }
    }
    
    // Factor 3: Skill Match (20 points)
    const skillDiff = Math.abs(tech.skillLevel - job.skillRequired);
    const skillScore =
      skillDiff === 0 ? CONFIG.SCORE_SKILL_EXACT :
      skillDiff === 1 ? CONFIG.SCORE_SKILL_ONE_OFF :
      CONFIG.SCORE_SKILL_TWO_PLUS;
    
    // Factor 4: Performance (10 points)
    const perfScore = calculatePerformanceScore(tech.recentPerformance);
    
    // Factor 5: Workload (10 points)
    let workloadScore: number;
    if (tech.currentJobs === 0) {
      workloadScore = CONFIG.SCORE_WORKLOAD_ZERO;
    } else if (tech.currentJobs === 3) {
      workloadScore = CONFIG.SCORE_WORKLOAD_THREE;
    } else if (tech.currentJobs >= 6) {
      workloadScore = CONFIG.SCORE_WORKLOAD_SIX_PLUS;
    } else if (tech.currentJobs < 3) {
      // Linear: 0→3 jobs = 10→5 pts
      workloadScore = CONFIG.SCORE_WORKLOAD_ZERO -
        ((CONFIG.SCORE_WORKLOAD_ZERO - CONFIG.SCORE_WORKLOAD_THREE) *
        tech.currentJobs / 3);
    } else {
      // Linear: 3→6 jobs = 5→0 pts
      workloadScore = CONFIG.SCORE_WORKLOAD_THREE *
        (1 - (tech.currentJobs - 3) / 3);
    }
    
    // Stage 3: Emergency Overrides
    if (job.priority === "emergency") {
      distanceScore *= CONFIG.EMERGENCY_DISTANCE_MULTIPLIER;
      availScore = Math.max(0, availScore - CONFIG.EMERGENCY_AVAIL_PENALTY);
      workloadScore = Math.max(0, workloadScore - CONFIG.EMERGENCY_WORKLOAD_PENALTY);
    }
    
    const totalScore = distanceScore + availScore + skillScore + perfScore + workloadScore;
    
    return {
      tech,
      distanceScore,
      availScore,
      skillScore,
      perfScore,
      workloadScore,
      totalScore,
      distance,
    };
  });
}

// --------------------
// Stage 4: Assignment
// --------------------
function applyTiebreakers(tied: TechnicianScore[], job: Job): TechnicianScore[] {
  return tied.sort((a, b) => {
    // 1. Higher performance sum
    const perfA = a.tech.recentPerformance.reduce((sum, val) => sum + val, 0);
    const perfB = b.tech.recentPerformance.reduce((sum, val) => sum + val, 0);
    if (perfA !== perfB) return perfB - perfA;
    
    // 2. Shorter distance
    const distA = a.distance || computeDistance(a.tech.location, job.address);
    const distB = b.distance || computeDistance(b.tech.location, job.address);
    if (distA !== distB) return distA - distB;
    
    // 3. Lower workload
    if (a.tech.currentJobs !== b.tech.currentJobs) {
      return a.tech.currentJobs - b.tech.currentJobs;
    }
    
    // 4. Random (true tie)
    return Math.random() - 0.5;
  });
}

function getTop3Technicians(job: Job, techs: Technician[]): {
  top3: TechnicianScore[];
  assigned: TechnicianScore | null;
  manualDispatch: boolean;
  ineligible: Array<{ tech: Technician; reason: string }>;
} {
  const { eligible, ineligible } = filterEligibleTechs(techs, job);
  
  if (eligible.length === 0) {
    return {
      top3: [],
      assigned: null,
      manualDispatch: true,
      ineligible,
    };
  }
  
  const scores = scoreTechnicians(eligible, job);
  scores.sort((a, b) => b.totalScore - a.totalScore);
  
  // Handle ties at top
  const topScore = scores[0].totalScore;
  const tiedForFirst = scores.filter((s) => Math.abs(s.totalScore - topScore) <= 0.1);
  
  let ranked: TechnicianScore[];
  if (tiedForFirst.length > 1) {
    const tiebroken = applyTiebreakers(tiedForFirst, job);
    const others = scores.filter((s) => Math.abs(s.totalScore - topScore) > 0.1);
    ranked = [...tiebroken, ...others];
  } else {
    ranked = scores;
  }
  
  return {
    top3: ranked.slice(0, 3),
    assigned: ranked[0],
    manualDispatch: false,
    ineligible,
  };
}

// --------------------
// Display Functions
// --------------------
function displayResults(
  job: Job,
  result: ReturnType<typeof getTop3Technicians>
): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Job #${job.id} ${job.priority === "emergency" ? "🚨 EMERGENCY" : ""}`);
  console.log(`Location: (${job.address.lat}, ${job.address.lng})`);
  console.log(`Skill Required: Level ${job.skillRequired}`);
  console.log(`${"=".repeat(70)}`);
  
  if (result.manualDispatch) {
    console.log(`\n❌ MANUAL DISPATCH REQUIRED - No eligible technicians\n`);
    console.log("Ineligible technicians:");
    result.ineligible.forEach(({ tech, reason }) => {
      console.log(`  • ${tech.name}: ${reason}`);
    });
    return;
  }
  
  console.log(`\n✅ ASSIGNED: ${result.assigned?.tech.name}\n`);
  console.log("Top 3 Recommendations:");
  
  result.top3.forEach((score, index) => {
    const isAssigned = index === 0;
    console.log(`\n${index + 1}. ${score.tech.name} ${isAssigned ? "⭐" : ""}`);
    console.log(`   Total: ${score.totalScore.toFixed(1)}/100 pts`);
    console.log(`   └─ Distance:     ${score.distanceScore.toFixed(1)} pts (${score.distance?.toFixed(1)} km)`);
    console.log(`   └─ Availability: ${score.availScore.toFixed(1)} pts (${score.tech.currentJobs}/${score.tech.maxJobs} jobs)`);
    console.log(`   └─ Skill Match:  ${score.skillScore.toFixed(1)} pts (L${score.tech.skillLevel} vs L${job.skillRequired})`);
    console.log(`   └─ Performance:  ${score.perfScore.toFixed(1)} pts`);
    console.log(`   └─ Workload:     ${score.workloadScore.toFixed(1)} pts`);
  });
  
  console.log("");
}

// --------------------
// Test Data
// --------------------
const technicians: Technician[] = [
  {
    id: 1,
    name: "Alice",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [95, 96, 97, 98, 99, 95, 96, 97, 98, 99], // 97% avg
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
    recentPerformance: [85, 86, 87, 88, 89, 85, 86, 87, 88, 89], // 87% avg
  },
  {
    id: 3,
    name: "Charlie",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 2, lng: 2 },
    skillLevel: 2,
    recentPerformance: [80, 81, 82, 83, 84, 80, 81, 82, 83, 84], // 82% avg
  },
  {
    id: 4,
    name: "Diana",
    active: true,
    available: false, // Not available
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 3, lng: 3 },
    skillLevel: 4,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90], // 90% avg
  },
  {
    id: 5,
    name: "Eve",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 3,
    location: { lat: 0.2, lng: 0.2 },
    skillLevel: 2,
    recentPerformance: [92, 93, 94, 95, 96, 92, 93, 94, 95, 96], // 94% avg
  },
  {
    id: 6,
    name: "Frank",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 5, // At max capacity
    location: { lat: 0.1, lng: 0.1 },
    skillLevel: 3,
    recentPerformance: [98, 97, 96, 95, 94, 98, 97, 96, 95, 94], // 96% avg
  },
  {
    id: 7,
    name: "Grace",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 1,
    location: { lat: 0.15, lng: 0.15 },
    skillLevel: 1, // Underqualified for level 2
    recentPerformance: [88, 89, 90, 91, 92, 88, 89, 90, 91, 92], // 90% avg
  },
  {
    id: 8,
    name: "Hank",
    active: false, // Inactive
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 3,
    recentPerformance: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  },
  {
    id: 9,
    name: "Iris",
    active: true,
    available: true,
    maxJobs: 8,
    currentJobs: 6, // High workload
    location: { lat: 0.3, lng: 0.3 },
    skillLevel: 2,
    recentPerformance: [91, 92, 93, 94, 95, 91, 92, 93, 94, 95], // 93% avg
  },
  {
    id: 10,
    name: "Jake",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 1,
    location: { lat: 0.25, lng: 0.25 },
    skillLevel: 4, // Overqualified
    recentPerformance: [89, 90, 91, 92, 93, 89, 90, 91, 92, 93], // 91% avg
  },
];

// --------------------
// Test Cases
// --------------------
console.log("\n🧪 HVAC DISPATCH ALGORITHM — TEST SCRIPT");
console.log("Testing v1.0 Specification Compliance\n");

// Test 1: Normal Priority Job
const normalJob: Job = {
  id: 101,
  address: { lat: 0.1, lng: 0.1 },
  priority: "normal",
  skillRequired: 2,
};

const normalResult = getTop3Technicians(normalJob, technicians);
displayResults(normalJob, normalResult);

// Test 2: Emergency Job
const emergencyJob: Job = {
  id: 102,
  address: { lat: 0.2, lng: 0.2 },
  priority: "emergency",
  skillRequired: 2,
};

const emergencyResult = getTop3Technicians(emergencyJob, technicians);
displayResults(emergencyJob, emergencyResult);

// Test 3: High Skill Requirement
const advancedJob: Job = {
  id: 103,
  address: { lat: 0.5, lng: 0.5 },
  priority: "normal",
  skillRequired: 3,
};

const advancedResult = getTop3Technicians(advancedJob, technicians);
displayResults(advancedJob, advancedResult);

// Test 4: No Eligible Technicians
const impossibleJob: Job = {
  id: 104,
  address: { lat: 100, lng: 100 }, // Too far
  priority: "normal",
  skillRequired: 2,
};

const impossibleResult = getTop3Technicians(impossibleJob, technicians);
displayResults(impossibleJob, impossibleResult);

// Summary Statistics
console.log(`${"=".repeat(70)}`);
console.log("📊 TEST SUMMARY");
console.log(`${"=".repeat(70)}`);
console.log(`Total Technicians: ${technicians.length}`);
console.log(`Active & Available: ${technicians.filter(t => t.active && t.available).length}`);
console.log(`Tests Run: 4`);
console.log(`Manual Dispatch Required: 1 (Test 4)`);
console.log(`${"=".repeat(70)}\n`);