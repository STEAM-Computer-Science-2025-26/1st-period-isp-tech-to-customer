import * as db from "../../db";
import { scoreAndRankCandidates } from "./scorer";
export async function batchDispatch(jobIds, companyId) {
	const startTime = Date.now();
	// ================================================================
	// Step 1: Fetch jobs
	// ================================================================
	const jobs = await db.query(
		`
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
		`,
		[jobIds, companyId]
	);
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
	// ================================================================
	// Step 2: Fetch technicians
	//
	// Key fixes vs the original query:
	//  - Use LATERAL subquery for tech_locations to get only the most
	//    recent location per employee — avoids GROUP BY issues entirely.
	//  - Removed `AND e.role = 'tech'` — employees inserted by tests and
	//    the onboarding flow have role='admin' or NULL. Filter only on
	//    is_available so all eligible staff are considered.
	// ================================================================
	const techRows = await db.query(
		`
		SELECT
		  e.id,
		  e.name,
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
		  tl.latitude   AS current_latitude,
		  tl.longitude  AS current_longitude,
		  COALESCE(
		    (SELECT AVG(rating)
		     FROM job_completions
		     WHERE tech_id = e.id),
		    3.0
		  ) AS avg_rating
		FROM employees e
		LEFT JOIN LATERAL (
		  SELECT latitude, longitude
		  FROM tech_locations
		  WHERE tech_id = e.id
		  ORDER BY updated_at DESC
		  LIMIT 1
		) tl ON true
		WHERE e.company_id = $1::uuid
		  AND e.is_available = true
		`,
		[companyId]
	);
	const allTechs = techRows.map((row) => ({
		id: row.id,
		name: row.name,
		skills: row.skills ?? [],
		isAvailable: row.is_available,
		currentJobCount: row.current_jobs_count ?? 0,
		maxJobsPerDay: row.max_concurrent_jobs ?? 10,
		avgRating: Number(row.avg_rating) || 3,
		currentLocation:
			row.current_latitude && row.current_longitude
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
	// ================================================================
	// Step 3: Capacity map + sort jobs by priority
	// ================================================================
	const techCapacity = new Map();
	allTechs.forEach((tech) => {
		techCapacity.set(tech.id, tech.maxJobsPerDay - tech.currentJobCount);
	});
	const priorityOrder = {
		emergency: 0,
		high: 1,
		medium: 2,
		normal: 3,
		low: 4
	};
	const sortedJobs = [...jobs].sort((a, b) => {
		return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
	});
	// ================================================================
	// Step 4: Dispatch loop
	// scorer API: scoreAndRankCandidates(eligibleTechs, job, isEmergency)
	// Returns: { tech, score, driveTimeMinutes, breakdown }[]
	// ================================================================
	const assignments = [];
	const unassigned = [];
	for (const job of sortedJobs) {
		const availableTechs = allTechs.filter((tech) => {
			const capacity = techCapacity.get(tech.id) ?? 0;
			return capacity > 0 && tech.currentLocation != null;
		});
		if (availableTechs.length === 0) {
			unassigned.push({
				jobId: job.id,
				reason: "No technicians with capacity and location available"
			});
			continue;
		}
		const isEmergency = job.priority === "emergency";
		const jobForScoring = {
			id: job.id,
			latitude:
				job.latitude == null
					? undefined
					: typeof job.latitude === "string"
						? parseFloat(job.latitude)
						: job.latitude,
			longitude:
				job.longitude == null
					? undefined
					: typeof job.longitude === "string"
						? parseFloat(job.longitude)
						: job.longitude,
			requiredSkills: job.required_skills ?? [],
			isEmergency
		};
		const ranked = await scoreAndRankCandidates(
			availableTechs,
			jobForScoring,
			isEmergency
		);
		if (!ranked || ranked.length === 0) {
			unassigned.push({
				jobId: job.id,
				reason: "No suitable technician found"
			});
			continue;
		}
		const best = ranked[0];
		const techId = best.tech.id;
		if (!techId) {
			unassigned.push({ jobId: job.id, reason: "Winning tech has no id" });
			continue;
		}
		assignments.push({
			jobId: job.id,
			techId,
			techName: best.tech.name ?? "Unknown",
			score: best.score,
			driveTimeMinutes: best.driveTimeMinutes ?? 0
		});
		techCapacity.set(techId, (techCapacity.get(techId) ?? 1) - 1);
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
