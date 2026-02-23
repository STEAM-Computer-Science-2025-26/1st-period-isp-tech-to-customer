// scripts/linkJobsToCustomers.ts
// One-time migration: existing jobs have customer_name as a text field.
// This script creates customer records from that data and links them.
// Run once after deploying the customer schema. Safe to re-run — idempotent.

import { getSql } from "../db";

interface OrphanJob {
	id: string;
	company_id: string;
	customer_name: string;
	address: string;
	city: string | null;
	state: string | null;
	zip: string | null;
	phone: string | null;
}

interface ExistingCustomer {
	id: string;
}

async function linkJobsToCustomers(): Promise<void> {
	const sql = getSql();

	console.log("🔗 Starting job → customer linking migration...");

	// Find all jobs that don't have a customer_id yet
	const orphanJobs = (await sql`
		SELECT
			id,
			company_id,
			customer_name,
			address,
			city,
			state,
			zip,
			phone
		FROM jobs
		WHERE customer_id IS NULL
		  AND customer_name IS NOT NULL
		  AND customer_name != ''
		ORDER BY company_id, customer_name
	`) as OrphanJob[];

	if (orphanJobs.length === 0) {
		console.log("✅ No orphan jobs found — all jobs already linked");
		return;
	}

	console.log(`Found ${orphanJobs.length} jobs without customer records`);

	// Group by company_id + customer_name so we create one customer
	// per unique name per company (not one per job)
	const customerMap = new Map<string, string>(); // "companyId:name" → customerId

	let created = 0;
	let linked = 0;
	let skipped = 0;

	for (const job of orphanJobs) {
		const key = `${job.company_id}:${job.customer_name.toLowerCase().trim()}`;

		// Already processed this customer in this run
		if (customerMap.has(key)) {
			const customerId = customerMap.get(key)!;
			await sql`
				UPDATE jobs SET customer_id = ${customerId}, updated_at = NOW()
				WHERE id = ${job.id}
			`;
			linked++;
			continue;
		}

		// Check if a matching customer already exists in the DB
		// Match on company + name + address (loose — some addresses may differ)
		const nameParts = job.customer_name.trim().split(" ");
		const firstName = nameParts[0] ?? "Unknown";
		const lastName = nameParts.slice(1).join(" ") || "Customer";

		const existing = (await sql`
			SELECT id FROM customers
			WHERE company_id = ${job.company_id}
			  AND LOWER(first_name) = LOWER(${firstName})
			  AND LOWER(last_name)  = LOWER(${lastName})
			  AND is_active = true
			LIMIT 1
		`) as ExistingCustomer[];

		let customerId: string;

		if (existing[0]) {
			// Customer already exists — just link
			customerId = existing[0].id;
			skipped++;
		} else {
			// Create a new customer from the job data
			const result = (await sql`
				INSERT INTO customers (
					company_id, first_name, last_name,
					phone, address, city, state, zip,
					customer_type, geocoding_status,
					notes
				) VALUES (
					${job.company_id},
					${firstName},
					${lastName},
					${job.phone ?? null},
					${job.address ?? ""},
					${job.city ?? null},
					${job.state ?? null},
					${job.zip ?? null},
					'residential',
					'pending',
					'Migrated from job history'
				)
				RETURNING id
			`) as { id: string }[];

			customerId = result[0].id;
			created++;
		}

		customerMap.set(key, customerId);

		// Link the job
		await sql`
			UPDATE jobs SET customer_id = ${customerId}, updated_at = NOW()
			WHERE id = ${job.id}
		`;
		linked++;
	}

	console.log(`✅ Migration complete:`);
	console.log(`   Created:  ${created} new customer records`);
	console.log(`   Linked:   ${linked} jobs to customers`);
	console.log(`   Skipped:  ${skipped} (customer already existed)`);
	console.log(`   Geocoding queued for new customers — worker will pick up`);
}

// Run
linkJobsToCustomers().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
