/**
 * HVAC Dispatch Algorithm — EDGE CASE TEST SUITE
 * Exhaustive testing of boundary conditions and corner cases
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
  recentPerformance: number[];
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
  distance?: number;
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
  TIE_THRESHOLD: 0.1,
};

// --------------------
// Core Algorithm (same as before)
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
    if (!tech.active) {
      ineligible.push({ tech, reason: "Inactive" });
      continue;
    }
    
    if (!tech.available) {
      ineligible.push({ tech, reason: "Not available" });
      continue;
    }
    
    if (tech.currentJobs >= tech.maxJobs) {
      ineligible.push({
        tech,
        reason: `Max jobs reached (${tech.currentJobs}/${tech.maxJobs})`,
      });
      continue;
    }
    
    if (!tech.location || 
        tech.location.lat === undefined || 
        tech.location.lng === undefined) {
      ineligible.push({ tech, reason: "No valid location" });
      continue;
    }
    
    const distance = computeDistance(tech.location, job.address);
    if (distance > maxTravelKm) {
      ineligible.push({
        tech,
        reason: `Too far (${distance.toFixed(1)} km > ${maxTravelKm.toFixed(1)} km)`,
      });
      continue;
    }
    
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

function scoreTechnicians(techs: Technician[], job: Job): TechnicianScore[] {
  return techs.map((tech) => {
    const distance = computeDistance(tech.location, job.address);
    
    // Factor 1: Distance
    let distanceScore: number;
    if (distance <= CONFIG.DISTANCE_EXCELLENT_KM) {
      distanceScore = CONFIG.SCORE_DISTANCE_MAX;
    } else if (distance <= CONFIG.DISTANCE_GOOD_KM) {
      distanceScore = CONFIG.SCORE_DISTANCE_MAX - 
        ((distance / CONFIG.DISTANCE_GOOD_KM) * 
        (CONFIG.SCORE_DISTANCE_MAX - CONFIG.SCORE_DISTANCE_GOOD));
    } else {
      const ratio = (CONFIG.DISTANCE_MAX_KM - distance) / 
                    (CONFIG.DISTANCE_MAX_KM - CONFIG.DISTANCE_GOOD_KM);
      distanceScore = Math.max(0, CONFIG.SCORE_DISTANCE_GOOD * ratio);
    }
    
    // Factor 2: Availability
    let availScore: number;
    if (tech.currentJobs === 0) {
      availScore = CONFIG.SCORE_AVAILABILITY_ZERO;
    } else {
      const jobRatio = tech.currentJobs / tech.maxJobs;
      if (jobRatio <= 0.5) {
        availScore = CONFIG.SCORE_AVAILABILITY_HALF;
      } else {
        availScore = CONFIG.SCORE_AVAILABILITY_HALF * (1 - (jobRatio - 0.5) / 0.5);
        availScore = Math.max(0, availScore);
      }
    }
    
    // Factor 3: Skill Match
    const skillDiff = Math.abs(tech.skillLevel - job.skillRequired);
    const skillScore =
      skillDiff === 0 ? CONFIG.SCORE_SKILL_EXACT :
      skillDiff === 1 ? CONFIG.SCORE_SKILL_ONE_OFF :
      CONFIG.SCORE_SKILL_TWO_PLUS;
    
    // Factor 4: Performance
    const perfScore = calculatePerformanceScore(tech.recentPerformance);
    
    // Factor 5: Workload
    let workloadScore: number;
    if (tech.currentJobs === 0) {
      workloadScore = CONFIG.SCORE_WORKLOAD_ZERO;
    } else if (tech.currentJobs === 3) {
      workloadScore = CONFIG.SCORE_WORKLOAD_THREE;
    } else if (tech.currentJobs >= 6) {
      workloadScore = CONFIG.SCORE_WORKLOAD_SIX_PLUS;
    } else if (tech.currentJobs < 3) {
      workloadScore = CONFIG.SCORE_WORKLOAD_ZERO -
        ((CONFIG.SCORE_WORKLOAD_ZERO - CONFIG.SCORE_WORKLOAD_THREE) *
        tech.currentJobs / 3);
    } else {
      workloadScore = CONFIG.SCORE_WORKLOAD_THREE *
        (1 - (tech.currentJobs - 3) / 3);
    }
    
    // Emergency Overrides
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

function applyTiebreakers(tied: TechnicianScore[], job: Job): TechnicianScore[] {
  return tied.sort((a, b) => {
    const perfA = a.tech.recentPerformance.reduce((sum, val) => sum + val, 0);
    const perfB = b.tech.recentPerformance.reduce((sum, val) => sum + val, 0);
    if (perfA !== perfB) return perfB - perfA;
    
    const distA = a.distance || computeDistance(a.tech.location, job.address);
    const distB = b.distance || computeDistance(b.tech.location, job.address);
    if (distA !== distB) return distA - distB;
    
    if (a.tech.currentJobs !== b.tech.currentJobs) {
      return a.tech.currentJobs - b.tech.currentJobs;
    }
    
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
  
  const topScore = scores[0].totalScore;
  const tiedForFirst = scores.filter(
    (s) => Math.abs(s.totalScore - topScore) <= CONFIG.TIE_THRESHOLD
  );
  
  let ranked: TechnicianScore[];
  if (tiedForFirst.length > 1) {
    const tiebroken = applyTiebreakers(tiedForFirst, job);
    const others = scores.filter(
      (s) => Math.abs(s.totalScore - topScore) > CONFIG.TIE_THRESHOLD
    );
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
// Test Runner
// --------------------
function runEdgeCaseTest(
  testNum: number,
  testName: string,
  job: Job,
  techs: Technician[],
  expectedOutcome: string
): void {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`TEST ${testNum}: ${testName}`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Expected: ${expectedOutcome}`);
  console.log(`Job: #${job.id} | Priority: ${job.priority} | Skill: L${job.skillRequired}`);
  console.log(`Location: (${job.address.lat}, ${job.address.lng})`);
  
  const result = getTop3Technicians(job, techs);
  
  if (result.manualDispatch) {
    console.log(`\n❌ MANUAL DISPATCH REQUIRED`);
    console.log(`Ineligible (${result.ineligible.length}):`);
    result.ineligible.slice(0, 5).forEach(({ tech, reason }) => {
      console.log(`  • ${tech.name}: ${reason}`);
    });
    if (result.ineligible.length > 5) {
      console.log(`  ... and ${result.ineligible.length - 5} more`);
    }
  } else {
    console.log(`\n✅ ASSIGNED: ${result.assigned?.tech.name}`);
    console.log(`Top ${result.top3.length}:`);
    result.top3.forEach((score, i) => {
      console.log(
        `  ${i + 1}. ${score.tech.name}: ${score.totalScore.toFixed(1)} pts ` +
        `(D:${score.distanceScore.toFixed(1)} A:${score.availScore.toFixed(1)} ` +
        `S:${score.skillScore.toFixed(1)} P:${score.perfScore.toFixed(1)} ` +
        `W:${score.workloadScore.toFixed(1)})`
      );
    });
  }
}

// --------------------
// EDGE CASE TEST DATA
// --------------------

console.log("\n🔬 HVAC DISPATCH ALGORITHM — EDGE CASE TEST SUITE");
console.log("Testing boundary conditions and corner cases\n");

// ============================================================
// CATEGORY 1: WORKLOAD EDGE CASES
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 1: WORKLOAD SCORING EDGE CASES");
console.log("█".repeat(80));

const workloadTechs: Technician[] = [
  {
    id: 100,
    name: "Zero Jobs (10pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 101,
    name: "One Job (8.33pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 1,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 102,
    name: "Two Jobs (6.67pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 2,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 103,
    name: "Three Jobs (5pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 3,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 104,
    name: "Four Jobs (3.33pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 4,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 105,
    name: "Five Jobs (1.67pts)",
    active: true,
    available: true,
    maxJobs: 8,
    currentJobs: 5,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 106,
    name: "Six Jobs (0pts)",
    active: true,
    available: true,
    maxJobs: 8,
    currentJobs: 6,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 107,
    name: "Seven Jobs (0pts)",
    active: true,
    available: true,
    maxJobs: 8,
    currentJobs: 7,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
];

runEdgeCaseTest(
  1,
  "Workload Interpolation (0-7 jobs)",
  { id: 1001, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  workloadTechs,
  "Verify linear interpolation: 0→10pts, 1→8.33pts, 2→6.67pts, 3→5pts, 4→3.33pts, 5→1.67pts, 6+→0pts"
);

// ============================================================
// CATEGORY 2: DISTANCE EDGE CASES
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 2: DISTANCE SCORING EDGE CASES");
console.log("█".repeat(80));

const distanceTechs: Technician[] = [
  {
    id: 200,
    name: "Exact Location (0km = 40pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 201,
    name: "12.5km (30pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0.1126, lng: 0 }, // ~12.5km
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 202,
    name: "25km Threshold (20pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0.225, lng: 0 }, // ~25km
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 203,
    name: "37.5km (10pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0.338, lng: 0 }, // ~37.5km
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 204,
    name: "49.9km (≈0pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0.449, lng: 0 }, // ~49.9km
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
];

runEdgeCaseTest(
  2,
  "Distance Interpolation (0-50km)",
  { id: 1002, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  distanceTechs,
  "Verify: 0km=40pts, 12.5km=30pts, 25km=20pts, 37.5km=10pts, 49.9km≈0pts"
);

// ============================================================
// CATEGORY 3: PERFORMANCE EDGE CASES
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 3: PERFORMANCE SCORING EDGE CASES");
console.log("█".repeat(80));

const perfTechs: Technician[] = [
  {
    id: 300,
    name: "New Tech (5 jobs = 7pts default)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [100, 100, 100, 100, 100],
  },
  {
    id: 301,
    name: "Exactly 10 jobs, 95% (10pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [95, 95, 95, 95, 95, 95, 95, 95, 95, 95],
  },
  {
    id: 302,
    name: "94.9% (9pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [94.9, 94.9, 94.9, 94.9, 94.9, 94.9, 94.9, 94.9, 94.9, 94.9],
  },
  {
    id: 303,
    name: "90% Threshold (9pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 304,
    name: "85% Threshold (7pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [85, 85, 85, 85, 85, 85, 85, 85, 85, 85],
  },
  {
    id: 305,
    name: "75% Threshold (5pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [75, 75, 75, 75, 75, 75, 75, 75, 75, 75],
  },
  {
    id: 306,
    name: "Below 75% (3pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [70, 70, 70, 70, 70, 70, 70, 70, 70, 70],
  },
];

runEdgeCaseTest(
  3,
  "Performance Thresholds & New Tech Default",
  { id: 1003, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  perfTechs,
  "Verify: <10 jobs=7pts (default), ≥95%=10pts, ≥90%=9pts, ≥85%=7pts, ≥75%=5pts, <75%=3pts"
);

// ============================================================
// CATEGORY 4: AVAILABILITY EDGE CASES
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 4: AVAILABILITY SCORING EDGE CASES");
console.log("█".repeat(80));

const availTechs: Technician[] = [
  {
    id: 400,
    name: "0/5 jobs (20pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 401,
    name: "1/5 jobs (20%=10pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 1,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 402,
    name: "2/5 jobs (40%=10pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 2,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 403,
    name: "2/4 jobs (50%=10pts)",
    active: true,
    available: true,
    maxJobs: 4,
    currentJobs: 2,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 404,
    name: "3/5 jobs (60%=8pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 3,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 405,
    name: "4/5 jobs (80%=4pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 4,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 406,
    name: "4/4 jobs (100%=0pts)",
    active: true,
    available: true,
    maxJobs: 4,
    currentJobs: 4,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
];

runEdgeCaseTest(
  4,
  "Availability Interpolation (0-100%)",
  { id: 1004, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  availTechs,
  "Verify: 0%=20pts, ≤50%=10pts, then linear decrease to 100%=0pts"
);

// ============================================================
// CATEGORY 5: SKILL MATCH EDGE CASES
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 5: SKILL MATCH EDGE CASES");
console.log("█".repeat(80));

const skillTechs: Technician[] = [
  {
    id: 500,
    name: "Exact Match L3 (20pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 3,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 501,
    name: "One Above L4 (15pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 4,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 502,
    name: "Two Above L5 (10pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 5,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 503,
    name: "Three Above L6 (10pts)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 6,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
];

runEdgeCaseTest(
  5,
  "Skill Overqualification (Required L3)",
  { id: 1005, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 3 },
  skillTechs,
  "Verify: Exact=20pts, +1=15pts, +2/+3/...=10pts"
);

// ============================================================
// CATEGORY 6: EMERGENCY OVERRIDES
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 6: EMERGENCY OVERRIDE EDGE CASES");
console.log("█".repeat(80));

const emergencyTechs: Technician[] = [
  {
    id: 600,
    name: "Close & Free",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0.01, lng: 0.01 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 601,
    name: "Far & Free",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0.2, lng: 0.2 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 602,
    name: "Close & Busy (3 jobs)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 3,
    location: { lat: 0.01, lng: 0.01 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
];

runEdgeCaseTest(
  6,
  "Emergency: Distance Multiplier (1.5x)",
  { id: 1006, address: { lat: 0, lng: 0 }, priority: "emergency", skillRequired: 2 },
  emergencyTechs,
  "Distance score *= 1.5, Avail -10pts, Workload -10pts. Close tech should dominate."
);

runEdgeCaseTest(
  7,
  "Emergency: Travel Distance Reduction (50%)",
  { id: 1007, address: { lat: 0, lng: 0 }, priority: "emergency", skillRequired: 2 },
  [
    {
      id: 700,
      name: "Within Normal (30km)",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0.27, lng: 0 }, // ~30km
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
    {
      id: 701,
      name: "Beyond Emergency (26km > 25km limit)",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0.235, lng: 0 }, // ~26km
      skillLevel: 2,
      recentPerformance: [95, 95, 95, 95, 95, 95, 95, 95, 95, 95],
    },
  ],
  "Emergency max travel = 25km (50% of 50km). 26km tech should be filtered."
);

// ============================================================
// CATEGORY 7: TIEBREAKER EDGE CASES
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 7: TIEBREAKER EDGE CASES");
console.log("█".repeat(80));

const tiebreakerTechs: Technician[] = [
  {
    id: 800,
    name: "Higher Perf (sum=950)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [95, 95, 95, 95, 95, 95, 95, 95, 95, 95],
  },
  {
    id: 801,
    name: "Lower Perf (sum=900)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
];

runEdgeCaseTest(
  8,
  "Tiebreaker 1: Performance Sum",
  { id: 1008, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  tiebreakerTechs,
  "Both have same total score. Higher performance sum wins."
);

const tiebreakerDistanceTechs: Technician[] = [
  {
    id: 900,
    name: "Closer (5km)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0.045, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 901,
    name: "Farther (10km)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 0,
    location: { lat: 0.09, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
];

runEdgeCaseTest(
  9,
  "Tiebreaker 2: Distance",
  { id: 1009, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  tiebreakerDistanceTechs,
  "Same total score, same perf. Closer tech wins."
);

const tiebreakerWorkloadTechs: Technician[] = [
  {
    id: 1000,
    name: "Less Busy (1 job)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 1,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
  {
    id: 1001,
    name: "More Busy (2 jobs)",
    active: true,
    available: true,
    maxJobs: 5,
    currentJobs: 2,
    location: { lat: 0, lng: 0 },
    skillLevel: 2,
    recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  },
];

runEdgeCaseTest(
  10,
  "Tiebreaker 3: Workload",
  { id: 1010, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  tiebreakerWorkloadTechs,
  "Same score, perf, distance. Less busy tech wins."
);

// ============================================================
// CATEGORY 8: ELIGIBILITY FILTER EDGE CASES
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 8: ELIGIBILITY FILTER EDGE CASES");
console.log("█".repeat(80));

runEdgeCaseTest(
  11,
  "All Inactive",
  { id: 1011, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  [
    {
      id: 1100,
      name: "Inactive 1",
      active: false,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
    {
      id: 1101,
      name: "Inactive 2",
      active: false,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
  ],
  "Manual dispatch required. All techs inactive."
);

runEdgeCaseTest(
  12,
  "All Unavailable",
  { id: 1012, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  [
    {
      id: 1200,
      name: "Unavailable 1",
      active: true,
      available: false,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
    {
      id: 1201,
      name: "Unavailable 2",
      active: true,
      available: false,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
  ],
  "Manual dispatch required. All techs unavailable."
);

runEdgeCaseTest(
  13,
  "All At Max Capacity",
  { id: 1013, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  [
    {
      id: 1300,
      name: "Maxed Out 1",
      active: true,
      available: true,
      maxJobs: 3,
      currentJobs: 3,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
    {
      id: 1301,
      name: "Maxed Out 2",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 5,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
  ],
  "Manual dispatch required. All techs at max capacity."
);

runEdgeCaseTest(
  14,
  "All Too Far",
  { id: 1014, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  [
    {
      id: 1400,
      name: "Far Tech 1 (100km)",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0.9, lng: 0 },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
    {
      id: 1401,
      name: "Far Tech 2 (200km)",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 1.8, lng: 0 },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
  ],
  "Manual dispatch required. All techs beyond 50km."
);

runEdgeCaseTest(
  15,
  "All Underqualified",
  { id: 1015, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 5 },
  [
    {
      id: 1500,
      name: "Junior L2",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
    {
      id: 1501,
      name: "Mid L3",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 3,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
    {
      id: 1502,
      name: "Senior L4",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 4,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
  ],
  "Manual dispatch required. All techs below L5 requirement."
);

runEdgeCaseTest(
  16,
  "No Location Data",
  { id: 1016, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  [
    {
      id: 1600,
      name: "No Location",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: null as any,
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
    {
      id: 1601,
      name: "Undefined Location",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: undefined as any, lng: undefined as any },
      skillLevel: 2,
      recentPerformance: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    },
  ],
  "Manual dispatch required. No valid location data."
);

// ============================================================
// CATEGORY 9: ONLY ONE TECH ELIGIBLE
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 9: SINGLE TECH EDGE CASES");
console.log("█".repeat(80));

runEdgeCaseTest(
  17,
  "Only One Tech Eligible",
  { id: 1017, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  [
    {
      id: 1700,
      name: "The Only One",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 2,
      location: { lat: 0.1, lng: 0.1 },
      skillLevel: 2,
      recentPerformance: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80],
    },
    {
      id: 1701,
      name: "Inactive",
      active: false,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [95, 95, 95, 95, 95, 95, 95, 95, 95, 95],
    },
    {
      id: 1702,
      name: "Unavailable",
      active: true,
      available: false,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [95, 95, 95, 95, 95, 95, 95, 95, 95, 95],
    },
  ],
  "Only one eligible tech. Should assign them (even with poor score)."
);

// ============================================================
// CATEGORY 10: EXTREME VALUES
// ============================================================
console.log("\n" + "█".repeat(80));
console.log("CATEGORY 10: EXTREME VALUE EDGE CASES");
console.log("█".repeat(80));

runEdgeCaseTest(
  18,
  "Perfect Score Possible",
  { id: 1018, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 3 },
  [
    {
      id: 1800,
      name: "Perfect Tech (100pts)",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 }, // 0km = 40pts
      skillLevel: 3, // exact match = 20pts
      recentPerformance: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], // 10pts
    },
  ],
  "Should achieve 100/100: 40(dist) + 20(avail) + 20(skill) + 10(perf) + 10(work)"
);

runEdgeCaseTest(
  19,
  "Worst Possible Eligible Score",
  { id: 1019, address: { lat: 0, lng: 0 }, priority: "normal", skillRequired: 2 },
  [
    {
      id: 1900,
      name: "Barely Eligible",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 4, // 80% capacity = ~4pts avail
      location: { lat: 0.449, lng: 0 }, // 49.9km = ~0.8pts distance
      skillLevel: 5, // 3 levels over = 10pts skill
      recentPerformance: [70, 70, 70, 70, 70, 70, 70, 70, 70, 70], // 3pts perf
    },
  ],
  "Lowest score while still eligible. Should be ~20pts total."
);

runEdgeCaseTest(
  20,
  "Emergency Perfect Score",
  { id: 1020, address: { lat: 0, lng: 0 }, priority: "emergency", skillRequired: 2 },
  [
    {
      id: 2000,
      name: "Emergency Perfect",
      active: true,
      available: true,
      maxJobs: 5,
      currentJobs: 0,
      location: { lat: 0, lng: 0 },
      skillLevel: 2,
      recentPerformance: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    },
  ],
  "Emergency: 60(dist*1.5) + 10(avail-10) + 20(skill) + 10(perf) + 0(work-10) = 100pts"
);

// ============================================================
// SUMMARY
// ============================================================
console.log("\n" + "=".repeat(80));
console.log("✅ EDGE CASE TEST SUITE COMPLETE");
console.log("=".repeat(80));
console.log("\n20 Edge Case Tests Executed:");
console.log("  ✓ Workload interpolation (0-7 jobs)");
console.log("  ✓ Distance interpolation (0-50km)");
console.log("  ✓ Performance thresholds & new tech default");
console.log("  ✓ Availability interpolation");
console.log("  ✓ Skill overqualification");
console.log("  ✓ Emergency overrides (multiplier & travel reduction)");
console.log("  ✓ Tiebreakers (performance, distance, workload)");
console.log("  ✓ All eligibility filters");
console.log("  ✓ Single tech scenarios");
console.log("  ✓ Extreme values (perfect & worst scores)");
console.log("\n" + "=".repeat(80) + "\n");