// services/routes/geocoding.ts
// WORKING GEOCODING IMPLEMENTATION using Geocod.io

export type GeocodeResult = {
	latitude: number;
	longitude: number;
	formattedAddress: string;
};

export type GeocodeOutcome =
	| { success: true; result: GeocodeResult }
	| { success: false; error: string };

/**
 * Geocodes address using Geocod.io
 * Get your API key from https://www.geocod.io
 */
export async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
	const apiKey = process.env.GEOCODIO_API_KEY;

	if (!apiKey) {
		console.error("GEOCODIO_API_KEY not set in environment variables");
		return { success: false, error: "API key not configured" };
	}

	if (!address || address.trim().length < 5) {
		return { success: false, error: "Address too short or empty" };
	}

	try {
		const url = `https://api.geocod.io/v1.7/geocode?q=${encodeURIComponent(address)}&api_key=${apiKey}`;
		const response = await fetch(url);

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Geocoding provider error:", response.status, errorText);
			return {
				success: false,
				error: `Provider error: ${response.status}`
			};
		}

		const data = await response.json();

		if (!data.results || data.results.length === 0) {
			return { success: false, error: "No results found for address" };
		}

		const bestResult = data.results[0];
		const location = bestResult.location;
		const formattedAddress = bestResult.formatted_address;

		if (
			!location ||
			typeof location.lat !== "number" ||
			typeof location.lng !== "number"
		) {
			return { success: false, error: "Invalid location data returned" };
		}

		return {
			success: true,
			result: {
				latitude: location.lat,
				longitude: location.lng,
				formattedAddress
			}
		};
	} catch (error) {
		console.error("Geocoding request failed:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Network request failed"
		};
	}
}

/**
 * Attempts to geocode a job address and returns the DB update payload.
 * Use this in createJob() after inserting the row.
 */
export async function tryGeocodeJob(address: string): Promise<{
	latitude: number | null;
	longitude: number | null;
	geocodingStatus: "complete" | "failed";
}> {
	const outcome = await geocodeAddress(address);

	if (outcome.success) {
		console.log(
			`✅ Geocoded address: "${address}" -> (${outcome.result.latitude}, ${outcome.result.longitude})`
		);
		return {
			latitude: outcome.result.latitude,
			longitude: outcome.result.longitude,
			geocodingStatus: "complete"
		};
	}

	console.error(
		`❌ Geocoding failed for address "${address}": ${outcome.error}`
	);
	return {
		latitude: null,
		longitude: null,
		geocodingStatus: "failed"
	};
}
