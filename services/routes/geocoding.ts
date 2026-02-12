// services/routes/geocoding-fixed.ts
// WORKING GEOCODING IMPLEMENTATION

export type GeocodeResult = {
	latitude: number;
	longitude: number;
	formattedAddress: string;
};

export type GeocodeOutcome =
	| { success: true; result: GeocodeResult }
	| { success: false; error: string };

/**
 * Geocodes address using Geocod.io (already configured in original)
 */
export async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
	const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";

	if (!apiKey) {
		console.error("GOOGLE_MAPS_API_KEY not set");
		return { success: false, error: "API key not configured" };
	}

	if (!address || address.trim().length < 5) {
		return { success: false, error: "Address too short or empty" };
	}

	try {
		const url = `https://api.geocod.io/v1.7/geocode?q=${encodeURIComponent(address)}&api_key=${apiKey}`;
		const response = await fetch(url);

		if (!response.ok) {
			console.error("Geocoding provider error:", response.status);
			return {
				success: false,
				error: `Provider error: ${response.status}`
			};
		}

		const data = await response.json();

		if (!data.results || data.results.length === 0) {
			return { success: false, error: "No results found" };
		}

		const location = data.results[0].location;
		const formattedAddress = data.results[0].formatted_address;

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
			error: error instanceof Error ? error.message : "Request failed"
		};
	}
}

export async function tryGeocodeJob(address: string): Promise<{
	latitude: number | null;
	longitude: number | null;
	geocodingStatus: "complete" | "failed";
}> {
	const outcome = await geocodeAddress(address);

	if (outcome.success) {
		return {
			latitude: outcome.result.latitude,
			longitude: outcome.result.longitude,
			geocodingStatus: "complete"
		};
	}

	console.error(`Geocoding failed for address "${address}": ${outcome.error}`);
	return {
		latitude: null,
		longitude: null,
		geocodingStatus: "failed"
	};
}
