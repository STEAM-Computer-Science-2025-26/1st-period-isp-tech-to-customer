// standardize-employee-skills.ts
// Run with: npx tsx standardize-employee-skills.ts

import { getSql } from "./db/connection";
import { standardizeSkill } from "./skill-mapping";

interface Employee {
	id: string;
	name: string;
	skills: string[];
}

/**
 * Standardize all employee skills
 */
async function standardizeEmployeeSkills() {
	const sql = getSql();

	console.log("\n🔧 Standardizing employee skills...\n");

	const employees = (await sql`
		SELECT id, name, skills
		FROM employees
		ORDER BY name
	`) as Employee[];

	console.log(`Found ${employees.length} employees\n`);

	let updateCount = 0;
	let unchangedCount = 0;

	for (const emp of employees) {
		const originalSkills = emp.skills;
		const standardizedSkills = [
			...new Set(originalSkills.map(standardizeSkill))
		];

		// Check if skills changed
		const skillsChanged =
			JSON.stringify(originalSkills.sort()) !==
			JSON.stringify(standardizedSkills.sort());

		console.log(`👤 ${emp.name || "Unknown"} (${emp.id.substring(0, 8)}...)`);
		console.log(`   Original: [${originalSkills.join(", ")}]`);

		if (skillsChanged) {
			console.log(`   Standardized: [${standardizedSkills.join(", ")}]`);

			await sql`
				UPDATE employees
				SET 
					skills = ${standardizedSkills},
					updated_at = NOW()
				WHERE id = ${emp.id}
			`;

			updateCount++;
			console.log(`   ✅ Updated\n`);
		} else {
			console.log(`   ℹ️  No changes needed\n`);
			unchangedCount++;
		}
	}

	console.log(`\n📊 Standardization Results:`);
	console.log(`   ✅ Updated: ${updateCount} employees`);
	console.log(`   ℹ️  Unchanged: ${unchangedCount} employees\n`);
}

/**
 * Add specialty_types based on skills
 */
async function addSpecialtyTypes() {
	const sql = getSql();

	console.log("\n🎯 Adding specialty types based on skills...\n");

	const employees = (await sql`
		SELECT id, name, skills
		FROM employees
		ORDER BY name
	`) as Employee[];

	// Map skills to specialty types
	const skillToSpecialty: Record<string, string[]> = {
		hvac_install: ["installation", "heating", "cooling"],
		hvac_repair: ["repair", "heating", "cooling"],
		hvac_maintenance: ["maintenance", "heating", "cooling"],
		electrical: ["electrical"],
		refrigeration: ["cooling", "refrigeration"],
		ductwork: ["ventilation"],
		plumbing: ["plumbing"]
	};

	for (const emp of employees) {
		const specialties = new Set<string>();

		for (const skill of emp.skills) {
			const standardized = standardizeSkill(skill);
			const types = skillToSpecialty[standardized] || [];
			types.forEach((t) => specialties.add(t));
		}

		const specialtyArray = Array.from(specialties);

		console.log(`👤 ${emp.name || "Unknown"}`);
		console.log(`   Skills: [${emp.skills.join(", ")}]`);
		console.log(`   Specialties: [${specialtyArray.join(", ")}]`);

		await sql`
			UPDATE employees
			SET 
				specialty_types = ${specialtyArray},
				updated_at = NOW()
			WHERE id = ${emp.id}
		`;

		console.log(`   ✅ Updated\n`);
	}

	console.log(`✅ Added specialty types for ${employees.length} employees\n`);
}

/**
 * Set default max_distance_km
 */
async function setDefaultMaxDistance() {
	const sql = getSql();

	console.log("\n📏 Setting default max distance...\n");

	const result = await sql`
		UPDATE employees
		SET max_distance_km = 50
		WHERE max_distance_km IS NULL
		RETURNING id
	`;

	console.log(`✅ Set max_distance_km=50 for ${result.length} employees\n`);
}

/**
 * Main function
 */
async function main() {
	console.log("🔄 Starting Employee Skill Standardization...\n");

	try {
		await standardizeEmployeeSkills();
		await addSpecialtyTypes();
		await setDefaultMaxDistance();

		console.log("\n✨ Employee Standardization Complete!\n");

		// Show summary
		const sql = getSql();
		const stats = await sql`
			SELECT 
				COUNT(*) as total,
				COUNT(specialty_types) as with_specialties,
				COUNT(max_distance_km) as with_max_distance
			FROM employees
		`;

		const stat = stats[0];
		console.log("📊 Final Statistics:");
		console.log(`   Total employees: ${stat.total}`);
		console.log(`   With specialties: ${stat.with_specialties}/${stat.total}`);
		console.log(
			`   With max distance: ${stat.with_max_distance}/${stat.total}\n`
		);

		// Show skill distribution
		const skillStats = await sql`
			SELECT 
				unnest(skills) as skill,
				COUNT(*) as count
			FROM employees
			GROUP BY skill
			ORDER BY count DESC
		`;

		console.log("🎯 Skill Distribution:");
		for (const s of skillStats) {
			console.log(`   ${s.skill}: ${s.count} techs`);
		}
		console.log();
	} catch (error) {
		console.error("\n❌ Error during standardization:", error);
		process.exit(1);
	}
}

main();
