// geocode-addresses.ts
// Run with: npx tsx geocode-addresses.ts

import { getSql } from "./db/connection";

interface GeocodeResult {
	lat: number;
	lon: number;
	display_name: string;
}

/**
 * Geocode an address using Nominatim (OpenStreetMap)
 * Free tier: 1 request per second
 */
async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
	try {
		const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;

		const response = await fetch(url, {
			headers: {
				"User-Agent": "HVAC-Dispatch-System/1.0" // Required by Nominatim
			}
		});

		if (!response.ok) {
			console.error(`Geocoding failed for "${address}": ${response.status}`);
			return null;
		}

		const data = await response.json();

		if (!data || data.length === 0) {
			console.warn(`No results found for "${address}"`);
			return null;
		}

		return {
			lat: parseFloat(data[0].lat),
			lon: parseFloat(data[0].lon),
			display_name: data[0].display_name
		};
	} catch (error) {
		console.error(`Error geocoding "${address}":`, error);
		return null;
	}
}

/**
 * Sleep for given milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Geocode all employees
 */
async function geocodeEmployees() {
	const sql = getSql();

	console.log("\n🔍 Fetching employees without coordinates...\n");

	const employees = await sql`
		SELECT id, home_address, name
		FROM employees
		WHERE latitude IS NULL OR longitude IS NULL
		ORDER BY created_at
	`;

	if (employees.length === 0) {
		console.log("✅ All employees already have coordinates!");
		return;
	}

	console.log(`Found ${employees.length} employees to geocode\n`);

	let successCount = 0;
	let failCount = 0;

	for (const emp of employees) {
		const address = emp.home_address as string;
		const name = (emp.name as string) || "Unknown";
		const id = emp.id as string;

		console.log(`📍 Geocoding: ${name} - "${address}"`);

		const result = await geocodeAddress(address);

		if (result) {
			await sql`
				UPDATE employees
				SET 
					latitude = ${result.lat},
					longitude = ${result.lon},
					location_updated_at = NOW()
				WHERE id = ${id}
			`;
			console.log(`   ✅ Success: ${result.lat}, ${result.lon}`);
			console.log(`   📝 ${result.display_name}`);
			successCount++;
		} else {
			console.log(`   ❌ Failed to geocode`);
			failCount++;
		}

		// Rate limit: 1 request per second (Nominatim requirement)
		if (employees.indexOf(emp) < employees.length - 1) {
			console.log(`   ⏳ Waiting 1 second...\n`);
			await sleep(1100);
		}
	}

	console.log(`\n📊 Employee Geocoding Results:`);
	console.log(`   ✅ Success: ${successCount}`);
	console.log(`   ❌ Failed: ${failCount}`);
}

/**
 * Geocode all jobs
 */
async function geocodeJobs() {
	const sql = getSql();

	console.log("\n\n🔍 Fetching jobs without coordinates...\n");

	const jobs = await sql`
		SELECT id, address, customer_name
		FROM jobs
		WHERE latitude IS NULL OR longitude IS NULL
		ORDER BY created_at
	`;

	if (jobs.length === 0) {
		console.log("✅ All jobs already have coordinates!");
		return;
	}

	console.log(`Found ${jobs.length} jobs to geocode\n`);

	let successCount = 0;
	let failCount = 0;

	for (const job of jobs) {
		const address = job.address as string;
		const customerName = job.customer_name as string;
		const id = job.id as string;

		console.log(`📍 Geocoding: ${customerName} - "${address}"`);

		const result = await geocodeAddress(address);

		if (result) {
			await sql`
				UPDATE jobs
				SET 
					latitude = ${result.lat},
					longitude = ${result.lon},
					location_updated_at = NOW()
				WHERE id = ${id}
			`;
			console.log(`   ✅ Success: ${result.lat}, ${result.lon}`);
			console.log(`   📝 ${result.display_name}`);
			successCount++;
		} else {
			console.log(`   ❌ Failed to geocode`);
			failCount++;
		}

		// Rate limit: 1 request per second
		if (jobs.indexOf(job) < jobs.length - 1) {
			console.log(`   ⏳ Waiting 1 second...\n`);
			await sleep(1100);
		}
	}

	console.log(`\n📊 Job Geocoding Results:`);
	console.log(`   ✅ Success: ${successCount}`);
	console.log(`   ❌ Failed: ${failCount}`);
}

/**
 * Main function
 */
async function main() {
	console.log("🌍 Starting Geocoding Process...");
	console.log("Using Nominatim (OpenStreetMap) - Free tier");
	console.log("Rate limit: 1 request per second\n");

	try {
		await geocodeEmployees();
		await geocodeJobs();

		console.log("\n\n✨ Geocoding Complete!\n");

		// Show summary
		const sql = getSql();
		const empStats = await sql`
			SELECT 
				COUNT(*) as total,
				COUNT(latitude) as with_coords
			FROM employees
		`;
		const jobStats = await sql`
			SELECT 
				COUNT(*) as total,
				COUNT(latitude) as with_coords
			FROM jobs
		`;

		console.log("📊 Final Statistics:");
		console.log(
			`   Employees: ${empStats[0].with_coords}/${empStats[0].total} have coordinates`
		);
		console.log(
			`   Jobs: ${jobStats[0].with_coords}/${jobStats[0].total} have coordinates\n`
		);
	} catch (error) {
		console.error("\n❌ Error during geocoding:", error);
		process.exit(1);
	}
}

main();
