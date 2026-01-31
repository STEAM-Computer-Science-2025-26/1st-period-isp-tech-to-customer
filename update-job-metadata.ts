// update-job-metadata.ts
// Run with: npx tsx update-job-metadata.ts

import { getSql } from "./db/connection";
import {
	estimateJobDifficulty,
	estimateJobPhysicality,
	estimateJobDuration
} from "./skill-mapping";

type JobType = 'installation' | 'repair' | 'maintenance' | 'inspection';
type Priority = 'low' | 'medium' | 'high' | 'emergency';

interface Job {
	id: string;
	job_type: JobType;
	priority: Priority;
	initial_notes: string | null;
	difficulty_level: number | null;
	physicality_rating: number | null;
	estimated_duration_minutes: number | null;
}

/**
 * Update jobs with estimated metadata
 */
async function updateJobMetadata() {
	const sql = getSql();
	
	console.log("\n📝 Fetching jobs without metadata...\n");
	
	const jobs = await sql`
		SELECT 
			id,
			job_type,
			priority,
			initial_notes,
			difficulty_level,
			physicality_rating,
			estimated_duration_minutes
		FROM jobs
		WHERE 
			difficulty_level IS NULL 
			OR physicality_rating IS NULL 
			OR estimated_duration_minutes IS NULL
	` as Job[];

	if (jobs.length === 0) {
		console.log("✅ All jobs already have metadata!");
		return;
	}

	console.log(`Found ${jobs.length} jobs to update\n`);

	let updateCount = 0;

	for (const job of jobs) {
		const difficulty = estimateJobDifficulty(job.job_type, job.priority);
		const physicality = estimateJobPhysicality(job.job_type);
		const duration = estimateJobDuration(job.job_type, difficulty);

		console.log(`📋 Job ${job.id.substring(0, 8)}...`);
		console.log(`   Type: ${job.job_type}, Priority: ${job.priority}`);
		console.log(`   → Difficulty: ${difficulty}/5`);
		console.log(`   → Physicality: ${physicality}/5`);
		console.log(`   → Duration: ${duration} minutes`);

		await sql`
			UPDATE jobs
			SET 
				difficulty_level = ${difficulty},
				physicality_rating = ${physicality},
				estimated_duration_minutes = ${duration},
				updated_at = NOW()
			WHERE id = ${job.id}
		`;

		updateCount++;
		console.log(`   ✅ Updated\n`);
	}

	console.log(`\n📊 Update Results:`);
	console.log(`   ✅ Updated: ${updateCount} jobs\n`);
}

/**
 * Generate detailed descriptions for jobs that don't have them
 */
async function generateDetailedDescriptions() {
	const sql = getSql();
	
	console.log("\n📝 Generating detailed descriptions for jobs...\n");
	
	const jobs = await sql`
		SELECT 
			id,
			job_type,
			priority,
			initial_notes,
			detailed_description
		FROM jobs
		WHERE 
			detailed_description IS NULL
			OR detailed_description = ''
	` as Job[];

	if (jobs.length === 0) {
		console.log("✅ All jobs already have detailed descriptions!");
		return;
	}

	console.log(`Found ${jobs.length} jobs to update\n`);

	let updateCount = 0;

	for (const job of jobs) {
		// Use initial_notes as detailed_description if available
		const description = job.initial_notes || `${job.priority} priority ${job.job_type} job`;

		console.log(`📋 Job ${job.id.substring(0, 8)}...`);
		console.log(`   → Description: "${description}"`);

		await sql`
			UPDATE jobs
			SET 
				detailed_description = ${description},
				updated_at = NOW()
			WHERE id = ${job.id}
		`;

		updateCount++;
		console.log(`   ✅ Updated\n`);
	}

	console.log(`\n📊 Update Results:`);
	console.log(`   ✅ Updated: ${updateCount} jobs\n`);
}

/**
 * Set default values for boolean fields
 */
async function setDefaultBooleans() {
	const sql = getSql();
	
	console.log("\n🔧 Setting default boolean values...\n");
	
	// Set has_gate_code to false if null
	const gateCodeResult = await sql`
		UPDATE jobs
		SET has_gate_code = false
		WHERE has_gate_code IS NULL
		RETURNING id
	`;
	console.log(`✅ Set has_gate_code=false for ${gateCodeResult.length} jobs`);

	// Set has_pets to false if null
	const petsResult = await sql`
		UPDATE jobs
		SET has_pets = false
		WHERE has_pets IS NULL
		RETURNING id
	`;
	console.log(`✅ Set has_pets=false for ${petsResult.length} jobs\n`);
}

/**
 * Main function
 */
async function main() {
	console.log("🔄 Starting Job Metadata Update...\n");

	try {
		await setDefaultBooleans();
		await generateDetailedDescriptions();
		await updateJobMetadata();
		
		console.log("\n✨ Job Metadata Update Complete!\n");
		
		// Show summary
		const sql = getSql();
		const stats = await sql`
			SELECT 
				COUNT(*) as total,
				COUNT(difficulty_level) as with_difficulty,
				COUNT(physicality_rating) as with_physicality,
				COUNT(estimated_duration_minutes) as with_duration,
				COUNT(detailed_description) as with_description
			FROM jobs
		`;
		
		const stat = stats[0];
		console.log("📊 Final Statistics:");
		console.log(`   Total jobs: ${stat.total}`);
		console.log(`   With difficulty: ${stat.with_difficulty}/${stat.total}`);
		console.log(`   With physicality: ${stat.with_physicality}/${stat.total}`);
		console.log(`   With duration: ${stat.with_duration}/${stat.total}`);
		console.log(`   With description: ${stat.with_description}/${stat.total}\n`);
		
	} catch (error) {
		console.error("\n❌ Error during update:", error);
		process.exit(1);
	}
}

main();