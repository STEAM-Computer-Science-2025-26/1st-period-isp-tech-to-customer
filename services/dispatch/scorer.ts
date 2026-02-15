// services/dispatch/scorer.ts
import { getBatchDriveTimes, RouteInfo } from './routing';

interface GeoLocation {
  latitude?: number;
  longitude?: number;
}

export interface EmployeeDataType {
  id?: string;
  name?: string;
  currentLocation?: GeoLocation;
  isAvailable?: boolean;
  skills?: string[];
  avgRating?: number;
  currentJobCount?: number;
}

export interface JobDataType {
  id?: string;
  latitude?: number;
  longitude?: number;
  requiredSkills?: string[];
  isEmergency?: boolean;
}

export interface ScoredCandidate {
  tech: EmployeeDataType;
  score: number;
  driveTimeMinutes: number | null;
  breakdown: {
    distanceScore: number;
    availabilityScore: number;
    skillScore: number;
    performanceScore: number;
    workloadScore: number;
  };
}

export async function scoreAndRankCandidates(
  eligibleTechs: EmployeeDataType[],
  job: JobDataType,
  isEmergency: boolean
): Promise<ScoredCandidate[]> {

  if (job.latitude == null || job.longitude == null) {
    return [];
  }

  if (!eligibleTechs.length) return [];

  const jobLocation = { lat: job.latitude, lng: job.longitude };

  // Only consider techs with valid locations
  const validTechs = eligibleTechs.filter(
    tech => tech.currentLocation?.latitude != null && tech.currentLocation?.longitude != null
  );

  if (!validTechs.length) return [];

  const techLocations = validTechs.map(tech => ({
    lat: tech.currentLocation!.latitude!,
    lng: tech.currentLocation!.longitude!,
  }));

  const driveTimes = await getBatchDriveTimes(jobLocation, techLocations);

  const maxMinutes = isEmergency ? 20 : 45;
  const maxWeight = isEmergency ? 60 : 40;

  const scored: ScoredCandidate[] = validTechs.map((tech, index) => {
    const driveTime = driveTimes[index];

    const safeMinutes = Number.isFinite(driveTime?.durationMinutes) && driveTime!.durationMinutes >= 0
      ? driveTime!.durationMinutes
      : null;

    // Distance scoring
    let distanceScore = 0;
    if (safeMinutes != null) {
      const ratio = Math.min(safeMinutes / maxMinutes, 1);
      distanceScore = (1 - ratio) * maxWeight;
      distanceScore = Math.max(0, Math.min(distanceScore, maxWeight));
    }

    // Availability
    const availabilityScore = tech.isAvailable ? 20 : 0;

    // Partial skill matching
    const requiredSkills = job.requiredSkills ?? [];
    const matchedSkills = tech.skills?.filter(s => requiredSkills.includes(s)).length ?? 0;
    const skillScore = requiredSkills.length > 0
      ? (matchedSkills / requiredSkills.length) * 20
      : 20; // no required skills defaults to full score

    // Performance
    const safeRating = Number.isFinite(tech.avgRating) && tech.avgRating! > 0 ? tech.avgRating! : 3;
    const performanceScore = (safeRating / 5) * 10;

    // Workload
    const jobCount = Number.isFinite(tech.currentJobCount) && tech.currentJobCount! > 0 ? tech.currentJobCount! : 0;
    const workloadScore = Math.max(0, 10 - jobCount * 2);

    const totalScore = distanceScore + availabilityScore + skillScore + performanceScore + workloadScore;

    return {
      tech,
      score: Number.isFinite(totalScore) ? totalScore : 0,
      driveTimeMinutes: safeMinutes,
      breakdown: {
        distanceScore,
        availabilityScore,
        skillScore,
        performanceScore,
        workloadScore,
      }
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}