// services/geocoding.ts
//
// Geocoding interface for the dispatch system.
//
// HOW TO WIRE IN A REAL PROVIDER:
//   1. Implement the GeocodeResult return shape using your provider's SDK
//      (Google Maps, Mapbox, Radar, etc.)
//   2. Replace the throwing stub in geocodeAddress() below
//   3. Set your API key in .env (e.g. GEOCODING_API_KEY=...)
//   4. Call geocodeAddress() in createJob() after inserting the row,
//      then update the job's lat/lng and geocoding_status in the DB.
//
// The rest of the system (dispatch, scoring, eligibility) already expects
// lat/lng on the job — this is the only place you need to fill them in.

export type GeocodeResult = {
	latitude: number;
	longitude: number;
	formattedAddress: string; // normalized address returned by the provider
};

export type GeocodeOutcome =
	| { success: true; result: GeocodeResult }
	| { success: false; error: string };

/*
geocodes a street address into lat/lng coordinates.

returns a GeocodeOutcome — always succeeds structurally so callers
can handle failure gracefully without try/catch at every call site.

on failure, the job should be marked geocoding_status = 'failed'
so it can be retried or flagged for manual review.
*/
export async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
	// TODO: Replace this stub with a real geocoding provider.
	// Example providers: Google Maps Geocoding API, Mapbox, Radar.io
	//
	// Example Google Maps implementation:
	//   import { Client } from "@googlemaps/google-maps-services-js";
	//   const client = new Client({});
	//   const response = await client.geocode({
	//     params: { address, key: process.env.GEOCODING_API_KEY! }
	//   });
	//   const loc = response.data.results[0]?.geometry.location;
	//   if (!loc) return { success: false, error: "No results returned" };
	//   return { success: true, result: {
	//     latitude: loc.lat,
	//     longitude: loc.lng,
	//     formattedAddress: response.data.results[0].formatted_address
	//   }};

	void address; // suppress unused param warning until implemented
	throw new Error(
		"geocodeAddress() is not yet implemented. " +
			"See services/geocoding.ts for instructions."
	);
}

/*
attempts to geocode a job address and returns the DB update payload.

use this in createJob() after inserting the row:

  const geo = await tryGeocodeJob(job.address);
  await query(
    `UPDATE jobs SET latitude=$1, longitude=$2, geocoding_status=$3 WHERE id=$4`,
    [geo.latitude, geo.longitude, geo.geocodingStatus, job.id]
  );
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
