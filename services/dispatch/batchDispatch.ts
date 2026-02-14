import * as db from '../../db';
import { scoreAndRankCandidates } from '../dispatch/scorer';

export interface BatchDispatchResult {
  assignments: Array<{
    jobId: string;
    techId: string;
    techName: string;
    score: number;
    driveTimeMinutes: number;
  }>;
  unassigned: Array<{
    jobId: string;
    reason: string;
  }>;
  stats: {
    totalJobs: number;
    assigned: number;
    unassigned: number;
    durationMs: number;
  };
}

export async function batchDispatch(
  jobIds: string[],
  companyId: string
): Promise<BatchDispatchResult> {
  const startTime = Date.now();

  // Fetch jobs
  const jobs = await db.query<{
    id: string;
    customer_name: string;
    address: string;
    latitude: string | number;
    longitude: string | number;
    status: string;
    priority: string;
    required_skills: string[];
    created_at: string;
  }>(`
    SELECT 
      id,
      customer_name,
      address,
      latitude,
      longitude,
      status,
      priority,
      required_skills,
      created_at
    FROM jobs
    WHERE id = ANY($1::uuid[])
      AND company_id = $2::uuid
      AND status = 'unassigned'
  `, [jobIds, companyId]);

  if (jobs.length === 0) {
    return {
      assignments: [],
      unassigned: jobIds.map(id => ({ jobId: id, reason: 'Job not found or already assigned' })),
      stats: {
        totalJobs: jobIds.length,
        assigned: 0,
        unassigned: jobIds.length,
        durationMs: Date.now() - startTime
      }
    };
  }

  // Fetch technicians
  const techRows = await db.query<{
    id: string;
    name: string;
    email: string;
    phone: string;
    skills: string[];
    is_available: boolean;
    current_job_count: number;
    max_jobs_per_day: number | null;
    current_latitude: string | null;
    current_longitude: string | null;
    location_updated_at: string | null;
    avg_rating: string;
  }>(`
    SELECT 
      e.id,
      e.name,
      e.email,
      e.phone,
      e.skills,
      e.is_available,
      e.current_job_count,
      e.max_jobs_per_day,
      tl.latitude AS current_latitude,
      tl.longitude AS current_longitude,
      tl.updated_at AS location_updated_at,
      COALESCE(
        (SELECT AVG(rating)
         FROM job_completions
         WHERE tech_id = e.id),
        3.0
      ) AS avg_rating
    FROM employees e
    LEFT JOIN tech_locations tl
      ON tl.tech_id = e.id
    WHERE e.company_id = $1::uuid
      AND e.role = 'tech'
      AND e.is_available = true
      AND (
        e.current_job_count < e.max_jobs_per_day
        OR e.max_jobs_per_day IS NULL
      )
      AND (
        tl.updated_at > NOW() - INTERVAL '10 minutes'
        OR tl.updated_at IS NULL
      )
  `, [companyId]);

  const allTechs = techRows.map(row => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    skills: row.skills,
    isAvailable: row.is_available,
    currentJobCount: row.current_job_count,
    maxJobsPerDay: row.max_jobs_per_day,
    currentLatitude: row.current_latitude,
    currentLongitude: row.current_longitude,
    locationUpdatedAt: row.location_updated_at,
    avgRating: Number(row.avg_rating),
    currentLocation: row.current_latitude && row.current_longitude ? {
      latitude: parseFloat(row.current_latitude),
      longitude: parseFloat(row.current_longitude)
    } : undefined
  }));

  if (allTechs.length === 0) {
    return {
      assignments: [],
      unassigned: jobs.map(j => ({ jobId: j.id, reason: 'No available technicians' })),
      stats: {
        totalJobs: jobs.length,
        assigned: 0,
        unassigned: jobs.length,
        durationMs: Date.now() - startTime
      }
    };
  }

  // Track tech capacity
  const techCapacity = new Map<string, number>();
  allTechs.forEach(tech => {
    const maxJobs = tech.maxJobsPerDay ?? 10;
    const currentJobs = tech.currentJobCount ?? 0;
    techCapacity.set(tech.id, maxJobs - currentJobs);
  });

  // Sort jobs by priority
  const priorityOrder = { emergency: 0, high: 1, medium: 2, low: 3 } as const;
  type PriorityKey = keyof typeof priorityOrder;
  const sortedJobs = jobs.sort((a, b) => {
    const pa = (a.priority as PriorityKey) ?? 'low';
    const pb = (b.priority as PriorityKey) ?? 'low';
    return priorityOrder[pa] - priorityOrder[pb];
  });

  const assignments: BatchDispatchResult['assignments'] = [];
  const unassigned: BatchDispatchResult['unassigned'] = [];

  // Dispatch loop
  for (const job of sortedJobs) {
    const availableTechs = allTechs.filter(tech => {
      const capacity = techCapacity.get(tech.id) || 0;
      return capacity > 0 && tech.currentLocation;
    });

    if (availableTechs.length === 0) {
      unassigned.push({
        jobId: job.id,
        reason: 'No technicians with capacity available'
      });
      continue;
    }

    const isEmergency = job.priority === 'emergency';
    const jobForScoring = {
      id: job.id,
      latitude:
        job.latitude == null
          ? undefined
          : typeof job.latitude === 'string'
          ? parseFloat(job.latitude)
          : job.latitude,
      longitude:
        job.longitude == null
          ? undefined
          : typeof job.longitude === 'string'
          ? parseFloat(job.longitude)
          : job.longitude,
      requiredSkills: job.required_skills,
    };

    const ranked = await scoreAndRankCandidates(availableTechs, jobForScoring as any, isEmergency);

    if (ranked.length === 0 || ranked[0].score < 20) {
      unassigned.push({
        jobId: job.id,
        reason: 'No suitable technician found (score too low)'
      });
      continue;
    }

    const bestMatch = ranked[0];
    const techId = bestMatch.tech.id;

    if (!techId) {
      unassigned.push({
        jobId: job.id,
        reason: 'Selected technician has no id'
      });
      continue;
    }

    assignments.push({
      jobId: String(job.id),
      techId,
      techName: bestMatch.tech.name ?? 'Unknown',
      score: bestMatch.score,
      driveTimeMinutes: bestMatch.driveTimeMinutes ?? 0
    });

    techCapacity.set(techId, (techCapacity.get(techId) || 0) - 1);
  }

  return {
    assignments,
    unassigned,
    stats: {
      totalJobs: jobs.length,
      assigned: assignments.length,
      unassigned: unassigned.length,
      durationMs: Date.now() - startTime
    }
  };
}

// UUID helper
function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
  }

  const getRandomBytes = (() => {
      if (typeof crypto !== 'undefined' && typeof (crypto as any).getRandomValues === 'function') {
          return (n: number) => (crypto as any).getRandomValues(new Uint8Array(n));
      }
      return null;
  })();

  if (getRandomBytes) {
      const rnds = getRandomBytes(16);
      rnds[6] = (rnds[6] & 0x0f) | 0x40;
      rnds[8] = (rnds[8] & 0x3f) | 0x80;
      const hex = (n: number) => n.toString(16).padStart(2, '0');
      return (
          hex(rnds[0]) + hex(rnds[1]) + hex(rnds[2]) + hex(rnds[3]) + '-' +
          hex(rnds[4]) + hex(rnds[5]) + '-' +
          hex(rnds[6]) + hex(rnds[7]) + '-' +
          hex(rnds[8]) + hex(rnds[9]) + '-' +
          hex(rnds[10]) + hex(rnds[11]) + hex(rnds[12]) + hex(rnds[13]) + hex(rnds[14]) + hex(rnds[15])
      );
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
  });
}
