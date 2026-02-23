import * as db from "../../db";
import { scoreAndRankCandidates } from "./scorer";
export async function batchDispatch(jobIds, companyId) {
    const startTime = Date.now();
    // Fetch jobs
    const jobs = (await db.query(`
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
  `, [jobIds, companyId]));
    if (jobs.length === 0) {
        return {
            assignments: [],
            unassigned: jobIds.map((id) => ({
                jobId: id,
                reason: "Job not found or already assigned"
            })),
            stats: {
                totalJobs: jobIds.length,
                assigned: 0,
                unassigned: jobIds.length,
                durationMs: Date.now() - startTime
            }
        };
    }
    // Fetch technicians with correct column names
    const techRows = (await db.query(`
	SELECT 
	  e.id,
	  e.name,
	  e.email,
	  e.phone,
	  e.skills,
	  e.is_available,
	  COALESCE(
		(SELECT COUNT(*)::integer
		 FROM jobs
		 WHERE assigned_tech_id = e.id
		   AND status IN ('assigned', 'in_progress')),
		0
	  ) AS current_jobs_count,
	  e.max_concurrent_jobs,
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
		tl.updated_at > NOW() - INTERVAL '10 minutes'
		OR tl.updated_at IS NULL
	  )
  `, [companyId]));
    const allTechs = techRows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        skills: row.skills,
        isAvailable: row.is_available,
        currentJobCount: row.current_jobs_count,
        maxJobsPerDay: row.max_concurrent_jobs,
        currentLatitude: row.current_latitude,
        currentLongitude: row.current_longitude,
        locationUpdatedAt: row.location_updated_at,
        avgRating: Number(row.avg_rating),
        currentLocation: row.current_latitude && row.current_longitude
            ? {
                latitude: parseFloat(row.current_latitude),
                longitude: parseFloat(row.current_longitude)
            }
            : undefined
    }));
    if (allTechs.length === 0) {
        return {
            assignments: [],
            unassigned: jobs.map((j) => ({
                jobId: j.id,
                reason: "No available technicians"
            })),
            stats: {
                totalJobs: jobs.length,
                assigned: 0,
                unassigned: jobs.length,
                durationMs: Date.now() - startTime
            }
        };
    }
    // Track tech capacity
    const techCapacity = new Map();
    allTechs.forEach((tech) => {
        const maxJobs = tech.maxJobsPerDay ?? 10;
        const currentJobs = tech.currentJobCount ?? 0;
        techCapacity.set(tech.id, maxJobs - currentJobs);
    });
    // Sort jobs by priority
    const priorityOrder = { emergency: 0, high: 1, medium: 2, low: 3 };
    const sortedJobs = jobs.sort((a, b) => {
        const pa = a.priority ?? "low";
        const pb = b.priority ?? "low";
        return priorityOrder[pa] - priorityOrder[pb];
    });
    const assignments = [];
    const unassigned = [];
    // Dispatch loop
    for (const job of sortedJobs) {
        const availableTechs = allTechs.filter((tech) => {
            const capacity = techCapacity.get(tech.id) || 0;
            return capacity > 0 && tech.currentLocation;
        });
        if (availableTechs.length === 0) {
            unassigned.push({
                jobId: job.id,
                reason: "No technicians with capacity available"
            });
            continue;
        }
        const isEmergency = job.priority === "emergency";
        const jobForScoring = {
            id: job.id,
            latitude: job.latitude == null
                ? undefined
                : typeof job.latitude === "string"
                    ? parseFloat(job.latitude)
                    : job.latitude,
            longitude: job.longitude == null
                ? undefined
                : typeof job.longitude === "string"
                    ? parseFloat(job.longitude)
                    : job.longitude,
            requiredSkills: job.required_skills
        };
        const ranked = await scoreAndRankCandidates(availableTechs, jobForScoring, isEmergency);
        if (ranked.length === 0 || ranked[0].score < 20) {
            unassigned.push({
                jobId: job.id,
                reason: "No suitable technician found (score too low)"
            });
            continue;
        }
        const bestMatch = ranked[0];
        const techId = bestMatch.tech.id;
        if (!techId) {
            unassigned.push({
                jobId: job.id,
                reason: "Selected technician has no id"
            });
            continue;
        }
        assignments.push({
            jobId: String(job.id),
            techId,
            techName: bestMatch.tech.name ?? "Unknown",
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
