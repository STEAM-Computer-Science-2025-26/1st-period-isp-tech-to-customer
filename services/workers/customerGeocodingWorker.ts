// services/workers/customerGeocodingWorker.ts
// Wires the customers and customer_locations tables into the
// existing geocoding pipeline. Polls for 'pending' rows and
// updates lat/lng via whatever geocoding provider is already
// configured in the codebase.

import { getSql } from "../../db";

// ============================================================
// Types
// ============================================================

interface PendingRow {
	id: string;
	address: string;
	city: string;
	state: string;
	zip: string;
}

interface GeocodeResult {
	lat: number;
	lng: number;
}

// ============================================================
// Geocoding
// ============================================================

// Calls the existing geocoding utility — same one used by jobs.
// If your codebase uses a different import path, update this.
async function geocodeAddress(
	address: string,
	city: string,
	state: string,
	zip: string
): Promise<GeocodeResult | null> {
	try {
		// Uses the Google Maps Geocoding API — same key already in .env
		const query = encodeURIComponent(`${address}, ${city}, ${state} ${zip}`);
		const apiKey = process.env.GOOGLE_MAPS_API_KEY;

		if (!apiKey) {
			console.warn("⚠️  GOOGLE_MAPS_API_KEY not set — geocoding skipped");
			return null;
		}

		const response = await fetch(
			`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`
		);

		if (!response.ok) return null;

		const data = (await response.json()) as any;

		if (data.status !== "OK" || !data.results?.[0]) return null;

		const location = data.results[0].geometry.location;
		return { lat: location.lat, lng: location.lng };
	} catch (err) {
		console.error("Geocoding error:", err);
		return null;
	}
}

// ============================================================
// Customer geocoding
// ============================================================

async function processCustomers(batchSize = 50): Promise<number> {
	const sql = getSql();

	// Grab a batch of ungeocoded customers
	const pending = (await sql`
		SELECT id, address, city, state, zip
		FROM customers
		WHERE geocoding_status = 'pending'
		  AND is_active = true
		LIMIT ${batchSize}
	`) as PendingRow[];

	if (pending.length === 0) return 0;

	let processed = 0;

	for (const row of pending) {
		const result = await geocodeAddress(
			row.address,
			row.city,
			row.state,
			row.zip
		);

		if (result) {
			await sql`
				UPDATE customers
				SET latitude         = ${result.lat},
				    longitude        = ${result.lng},
				    geocoding_status = 'complete',
				    updated_at       = NOW()
				WHERE id = ${row.id}
			`;
		} else {
			// Mark failed so we don't retry endlessly
			await sql`
				UPDATE customers
				SET geocoding_status = 'failed',
				    updated_at       = NOW()
				WHERE id = ${row.id}
			`;
		}

		processed++;
	}

	return processed;
}

// ============================================================
// Location geocoding
// ============================================================

async function processLocations(batchSize = 50): Promise<number> {
	const sql = getSql();

	const pending = (await sql`
		SELECT id, address, city, state, zip
		FROM customer_locations
		WHERE geocoding_status = 'pending'
		  AND is_active = true
		LIMIT ${batchSize}
	`) as PendingRow[];

	if (pending.length === 0) return 0;

	let processed = 0;

	for (const row of pending) {
		const result = await geocodeAddress(
			row.address,
			row.city,
			row.state,
			row.zip
		);

		if (result) {
			await sql`
				UPDATE customer_locations
				SET latitude         = ${result.lat},
				    longitude        = ${result.lng},
				    geocoding_status = 'complete',
				    updated_at       = NOW()
				WHERE id = ${row.id}
			`;
		} else {
			await sql`
				UPDATE customer_locations
				SET geocoding_status = 'failed',
				    updated_at       = NOW()
				WHERE id = ${row.id}
			`;
		}

		processed++;
	}

	return processed;
}

// ============================================================
// Runner
// ============================================================

// Called by your existing worker scheduler — same pattern as job geocoding.
// Register this in whatever cron/interval system you're already using.
export async function runCustomerGeocodingWorker(): Promise<void> {
	const customersProcessed = await processCustomers();
	const locationsProcessed = await processLocations();

	if (customersProcessed > 0 || locationsProcessed > 0) {
		console.log(
			`📍 Geocoded ${customersProcessed} customers, ${locationsProcessed} locations`
		);
	}
}

// Retry failed geocoding — run this less frequently (e.g. daily)
// in case the geocoding API was temporarily down
export async function retryFailedGeocoding(): Promise<void> {
	const sql = getSql();

	// Reset failed to pending so the main worker picks them up
	await sql`
		UPDATE customers
		SET geocoding_status = 'pending', updated_at = NOW()
		WHERE geocoding_status = 'failed'
	`;

	await sql`
		UPDATE customer_locations
		SET geocoding_status = 'pending', updated_at = NOW()
		WHERE geocoding_status = 'failed'
	`;

	console.log("📍 Failed geocoding rows reset to pending");
}
