import { calculateDistance } from "../../algo/distance";
const OSRM_SERVER = "https://router.project-osrm.org";
// Single route
export async function getDriveTime(fromLat, fromLng, toLat, toLng) {
	const url = `${OSRM_SERVER}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
	try {
		const response = await fetch(url);
		const data = await response.json();
		if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
			throw new Error("No route found");
		}
		return {
			durationSeconds: Math.round(data.routes[0].duration),
			durationMinutes: Math.round(data.routes[0].duration / 60),
			distanceMeters: Math.round(data.routes[0].distance),
			distanceKm: Math.round(data.routes[0].distance / 100) / 10
		};
	} catch (error) {
		console.error("OSRM routing error:", error);
		// Fallback to Haversine
		const straightLineKm = calculateDistance(
			{ latitude: fromLat, longitude: fromLng },
			{ latitude: toLat, longitude: toLng }
		);
		return {
			durationSeconds: Math.round((straightLineKm / 50) * 3600),
			durationMinutes: Math.round((straightLineKm / 50) * 60),
			distanceMeters: Math.round(straightLineKm * 1000),
			distanceKm: straightLineKm
		};
	}
}
// Batch routes (WAY faster)
export async function getBatchDriveTimes(origin, destinations) {
	if (destinations.length === 0) {
		return [];
	}
	// OSRM Table API: get matrix of drive times
	const coords = [
		`${origin.lng},${origin.lat}`,
		...destinations.map((d) => `${d.lng},${d.lat}`)
	].join(";");
	const url = `${OSRM_SERVER}/table/v1/driving/${coords}?sources=0&annotations=duration,distance`;
	try {
		const response = await fetch(url, {
			headers: { "User-Agent": "TechToCustomer/1.0" }
		});
		if (!response.ok) {
			throw new Error(`OSRM API error: ${response.status}`);
		}
		const data = await response.json();
		if (data.code !== "Ok") {
			throw new Error(`OSRM error: ${data.code}`);
		}
		// data.durations[0] = [null, 840, 1200, ...] (first is null, rest are durations)
		const durations = data.durations[0].slice(1);
		const distances = data.distances ? data.distances[0].slice(1) : null;
		return durations.map((durationSeconds, index) => {
			if (durationSeconds === null) {
				// No route found, use Haversine fallback
				const straightLineKm = calculateDistance(
					{ latitude: origin.lat, longitude: origin.lng },
					{
						latitude: destinations[index].lat,
						longitude: destinations[index].lng
					}
				);
				return {
					durationSeconds: Math.round((straightLineKm / 50) * 3600),
					durationMinutes: Math.round((straightLineKm / 50) * 60),
					distanceMeters: Math.round(straightLineKm * 1000),
					distanceKm: straightLineKm
				};
			}
			return {
				durationSeconds: Math.round(durationSeconds),
				durationMinutes: Math.round(durationSeconds / 60),
				distanceMeters: distances ? Math.round(distances[index]) : 0,
				distanceKm: distances ? Math.round(distances[index] / 100) / 10 : 0
			};
		});
	} catch (error) {
		console.error(
			"Batch routing failed, falling back to individual requests:",
			error
		);
		// Fallback: individual requests (slower but better than failing)
		return Promise.all(
			destinations.map((dest) =>
				getDriveTime(origin.lat, origin.lng, dest.lat, dest.lng)
			)
		);
	}
}
