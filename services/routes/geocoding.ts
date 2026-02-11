export type GeocodeResult = {
	latitude: number;
	longitude: number;
	formattedAddress: string; // normalized address returned by the provider
};
export type GeocodeOutcome =
	| { success: true; result: GeocodeResult }
	| { success: false; error: string };

/**
 * converts address to coordinates
 * @param address
 * @returns GeocodeOutcome
 */

export async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
	const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";

	if (!apiKey) {
		console.error(
			"Geocoding API key is not set. Please set GOOGLE_MAPS_API_KEY in your environment variables."
		);
		return {
			success: false,
			error: "API key not configured"
		};
	}

	if (!address || address.trim().length < 5) {
		return {
			success: false,
			error: "Address is too short or empty"
		};
	}
	try {
		const url = `https://api.geocod.io/v1.7/geocode?q=${encodeURIComponent(address)}&api_key=${apiKey}`;
		const response = await fetch(url);

		if (!response.ok) {
			console.error(
				"Geocoding provider responded with non-OK status",
				response.status
			);
			return {
				success: false,
				error: `Geocoding provider error: ${response.status}`
			};
		}

		const data = await response.json();

		if (data && data.status === "OVER_QUERY_LIMIT") {
			console.error("Geocoding API quota exceeded.");
			return {
				success: false,
				error: "Try again later, map problem"
			};
		}
		if (!data.results || data.results.length === 0) {
			return {
				success: false,
				error: "No geocoding results found"
			};
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
		console.error("Error during geocoding request", error);
		return {
			success: false,
			error: "Geocoding request failed"
		};
	}
}

/**
 * @param address
 * @returns
 *
 */
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
