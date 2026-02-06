// fix-all-data.ts
// Master script to run all data fixes
// Run with: pnpm exec tsx fix-all-data.ts

import { execSync } from "child_process";
import readline from "readline";

function runScript(scriptPath: string, description: string) {
	console.log(`\n${"=".repeat(80)}`);
	console.log(`🚀 ${description}`);
	console.log(`${"=".repeat(80)}\n`);

	try {
		execSync(`pnpm exec tsx ${scriptPath}`, { stdio: "inherit" });
		console.log(`\n✅ ${description} - COMPLETE`);
	} catch (error) {
		console.error(`\n❌ ${description} - FAILED`);
		throw error;
	}
}

async function main() {
	console.log("\n");
	console.log("╔════════════════════════════════════════════════════════════════╗");
	console.log("║                                                                ║");
	console.log("║           🔧 HVAC Dispatch System - Data Fix Suite 🔧          ║");
	console.log("║                                                                ║");
	console.log("╚════════════════════════════════════════════════════════════════╝");
	console.log("\n");
	console.log(
		"This will fix all data issues in preparation for the dispatch algorithm:\n"
	);
	console.log("  1️⃣  Geocode all addresses (employees & jobs)");
	console.log("  2️⃣  Standardize employee skills");
	console.log("  3️⃣  Update job metadata (difficulty, physicality, duration)");
	console.log("\n");

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	const answer = await new Promise<string>((resolve) => {
		rl.question("Continue? (y/n): ", resolve);
	});
	rl.close();

	if (answer.toLowerCase() !== "y") {
		console.log("\n❌ Aborted by user\n");
		process.exit(0);
	}

	const startTime = Date.now();

	try {
		// Step 1: Geocode addresses
		runScript("geocode-addresses.ts", "Step 1: Geocoding Addresses");

		// Step 2: Standardize employee skills
		runScript(
			"standardize-employee-skills.ts",
			"Step 2: Standardizing Employee Skills"
		);

		// Step 3: Update job metadata
		runScript("update-job-metadata.ts", "Step 3: Updating Job Metadata");

		const endTime = Date.now();
		const durationSeconds = ((endTime - startTime) / 1000).toFixed(1);

		console.log("\n");
		console.log("╔════════════════════════════════════════════════════════════════╗");
		console.log("║                                                                ║");
		console.log("║                    ✨ ALL FIXES COMPLETE! ✨                   ║");
		console.log("║                                                                ║");
		console.log("╚════════════════════════════════════════════════════════════════╝");
		console.log("\n");
		console.log(`⏱️  Total time: ${durationSeconds} seconds\n`);
		console.log("✅ Your data is now ready for the dispatch algorithm!\n");
		console.log("Next steps:");
		console.log("  1. Review the geocoded coordinates");
		console.log("  2. Verify skill standardization");
		console.log("  3. Check job metadata estimates");
		console.log("  4. Build the dispatch algorithm!\n");
	} catch (error) {
		console.error("\n❌ Fix suite failed. Please review errors above.\n");
		process.exit(1);
	}
}

main();
