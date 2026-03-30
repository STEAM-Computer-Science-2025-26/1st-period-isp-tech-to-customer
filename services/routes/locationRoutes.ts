import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { getSql } from "../../db";
import { authenticate } from "../middleware/auth";

type AuthUser = {
	id?: string;
	companyId?: string;
	role?: string;
};

// Snap an array of {lat, lng} points to roads via the Google Roads API.
// Returns the original points unchanged if the API key is missing or the call fails.
async function snapToRoads(
	points: Array<{ lat: number; lng: number }>
): Promise<Array<{ lat: number; lng: number }>> {
	const apiKey = process.env.GOOGLE_MAPS_API_KEY;
	if (!apiKey || points.length < 2) return points;

	// Roads API accepts max 100 points per request; downsample if needed
	const sampled =
		points.length > 100
			? points.filter((_, i) => i % Math.ceil(points.length / 100) === 0)
			: points;

	const path = sampled.map((p) => `${p.lat},${p.lng}`).join("|");
	const url = `https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(path)}&interpolate=true&key=${apiKey}`;

	try {
		const res = await fetch(url);
		if (!res.ok) return points;
		const data = (await res.json()) as {
			snappedPoints?: Array<{
				location: { latitude: number; longitude: number };
			}>;
		};
		if (!data.snappedPoints?.length) return points;
		return data.snappedPoints.map((sp) => ({
			lat: sp.location.latitude,
			lng: sp.location.longitude
		}));
	} catch {
		return points;
	}
}

const locationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
	// POST /techs/me/location — tech submits their GPS position.
	// Updates the current-position upsert AND appends to the history log.
	fastify.post(
		"/techs/me/location",
		{
			preHandler: [authenticate],
			schema: {
				body: {
					type: "object",
					required: ["latitude", "longitude"],
					properties: {
						latitude: { type: "number", minimum: -90, maximum: 90 },
						longitude: { type: "number", minimum: -180, maximum: 180 },
						accuracy: { type: "number", nullable: true }
					}
				}
			}
		},
		async (request, _reply) => {
			const { latitude, longitude, accuracy } = request.body as {
				latitude: number;
				longitude: number;
				accuracy?: number;
			};

			const techId = (request.user as AuthUser).id;
			const sql = getSql();
			const acc = accuracy ?? null;

			// Upsert current position (fast lookup for live map)
			await sql`
				INSERT INTO tech_locations (tech_id, latitude, longitude, accuracy_meters, updated_at)
				VALUES (${techId}, ${latitude}, ${longitude}, ${acc}, NOW())
				ON CONFLICT (tech_id)
				DO UPDATE SET
				  latitude = ${latitude},
				  longitude = ${longitude},
				  accuracy_meters = ${acc},
				  updated_at = NOW()
			`;

			// Append to history so the map can draw a trail
			await sql`
				INSERT INTO tech_location_history (tech_id, latitude, longitude, accuracy_meters)
				VALUES (${techId}, ${latitude}, ${longitude}, ${acc})
			`;

			return {
				success: true,
				timestamp: new Date()
			};
		}
	);

	// GET /companies/:companyId/tech-locations — current location of all techs
	fastify.get(
		"/companies/:companyId/tech-locations",
		{
			preHandler: [authenticate]
		},
		async (request, reply) => {
			const { companyId } = request.params as { companyId: string };
			const user = request.user as AuthUser;

			if (user.companyId !== companyId && user.role !== "dev") {
				return reply.status(403).send({ error: "Access denied" });
			}

			const sql = getSql();
			const result = await sql`
				SELECT
				  e.id as tech_id,
				  e.name as tech_name,
				  e.phone,
				  e.is_available,
				  e.current_job_id,
				  e.skills,
				  tl.latitude,
				  tl.longitude,
				  tl.accuracy_meters,
				  tl.updated_at as last_update,
				  EXTRACT(EPOCH FROM (NOW() - tl.updated_at)) as seconds_since_update
				FROM employees e
				LEFT JOIN tech_locations tl ON tl.tech_id = e.id
				WHERE e.company_id = ${companyId}
				  AND e.role = 'tech'
				ORDER BY tl.updated_at DESC NULLS LAST
			`;

			return {
				techs: result,
				timestamp: new Date()
			};
		}
	);

	// GET /companies/:companyId/map-data — full snapshot for the dispatch map.
	// Supports optional timeline filtering via query params:
	//   scheduledAfter  (ISO string) — only jobs scheduled at or after this time
	//   scheduledBefore (ISO string) — only jobs scheduled at or before this time
	fastify.get(
		"/companies/:companyId/map-data",
		{
			preHandler: [authenticate]
		},
		async (request, reply) => {
			const { companyId } = request.params as { companyId: string };
			const { scheduledAfter, scheduledBefore, includeAll } = request.query as {
				scheduledAfter?: string;
				scheduledBefore?: string;
				includeAll?: string;
			};
			const user = request.user as AuthUser;

			if (user.companyId !== companyId && user.role !== "dev") {
				return reply.status(403).send({ error: "Access denied" });
			}

			// Validate timestamp params — return 400 instead of letting Postgres throw 500
			const afterDate = scheduledAfter ? new Date(scheduledAfter) : null;
			const beforeDate = scheduledBefore ? new Date(scheduledBefore) : null;
			if (
				scheduledAfter &&
				(afterDate === null || isNaN(afterDate.getTime()))
			) {
				return reply
					.status(400)
					.send({ error: "Invalid scheduledAfter timestamp" });
			}
			if (
				scheduledBefore &&
				(beforeDate === null || isNaN(beforeDate.getTime()))
			) {
				return reply
					.status(400)
					.send({ error: "Invalid scheduledBefore timestamp" });
			}

			const sql = getSql();

			const techs = await sql`
				SELECT
				  e.id            AS "techId",
				  e.name          AS "techName",
				  e.phone,
				  e.is_available  AS "isAvailable",
				  e.current_job_id AS "currentJobId",
				  e.skills,
				  tl.latitude,
				  tl.longitude,
				  tl.accuracy_meters     AS "accuracyMeters",
				  tl.updated_at          AS "lastUpdate",
				  EXTRACT(EPOCH FROM (NOW() - tl.updated_at)) AS "secondsSinceUpdate"
				FROM employees e
				LEFT JOIN tech_locations tl ON tl.tech_id = e.id
				WHERE e.company_id = ${companyId}
				  AND e.role = 'tech'
				ORDER BY tl.updated_at DESC NULLS LAST
			`;

			const showAll = includeAll === "true";
			const jobs = await sql`
				SELECT
				  j.id,
				  j.customer_name    AS "customerName",
				  j.address,
				  j.latitude,
				  j.longitude,
				  j.status,
				  j.priority,
				  j.assigned_tech_id AS "assignedTechId",
				  j.scheduled_time   AS "scheduledTime",
				  j.job_type         AS "jobType",
				  j.created_at       AS "createdAt",
				  j.required_skills  AS "requiredSkills"
				FROM jobs j
				WHERE j.company_id = ${companyId}
				  AND (${showAll} OR j.status IN ('unassigned', 'assigned', 'in_progress'))
				  AND (${afterDate}::timestamptz IS NULL OR j.scheduled_time >= ${afterDate}::timestamptz)
				  AND (${beforeDate}::timestamptz IS NULL OR j.scheduled_time <= ${beforeDate}::timestamptz)
				ORDER BY
				  CASE j.priority
				    WHEN 'emergency' THEN 0
				    WHEN 'high' THEN 1
				    WHEN 'medium' THEN 2
				    ELSE 3
				  END,
				  j.created_at ASC
			`;

			return {
				techs,
				jobs,
				lastUpdate: new Date()
			};
		}
	);

	// GET /companies/:companyId/techs/:techId/trail
	// Returns the last hour of location history for one tech, snapped to roads.
	fastify.get(
		"/companies/:companyId/techs/:techId/trail",
		{
			preHandler: [authenticate]
		},
		async (request, reply) => {
			const { companyId, techId } = request.params as {
				companyId: string;
				techId: string;
			};
			const user = request.user as AuthUser;

			if (user.companyId !== companyId && user.role !== "dev") {
				return reply.status(403).send({ error: "Access denied" });
			}

			const sql = getSql();
			const rows = await sql`
				SELECT latitude, longitude, recorded_at AS "recordedAt"
				FROM tech_location_history
				WHERE tech_id = ${techId}
				  AND recorded_at > NOW() - INTERVAL '1 hour'
				ORDER BY recorded_at ASC
			`;

			if (!rows.length) {
				return { trail: [] };
			}

			const points = (
				rows as Array<{
					latitude: number;
					longitude: number;
					recordedAt: string;
				}>
			).map((r) => ({ lat: r.latitude, lng: r.longitude }));

			const snapped = await snapToRoads(points);

			const trail = snapped.map((pt, i) => ({
				latitude: pt.lat,
				longitude: pt.lng,
				recordedAt:
					(rows as Array<{ recordedAt: string }>)[i]?.recordedAt ??
					new Date().toISOString()
			}));

			return { trail };
		}
	);
};

export default locationRoutes;
