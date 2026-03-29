import {
	FastifyInstance,
	FastifyPluginAsync,
	FastifyReply,
	FastifyRequest
} from "fastify";
import * as db from "../../db";

type AuthUser = {
	id?: string;
	companyId?: string;
	role?: string;
};

type AuthenticatedFastify = FastifyInstance & {
	authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
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
	const authFastify = fastify as AuthenticatedFastify;

	// POST /techs/me/location — tech submits their GPS position.
	// Updates the current-position upsert AND appends to the history log.
	fastify.post(
		"/techs/me/location",
		{
			preHandler: [authFastify.authenticate],
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

			// Upsert current position (fast lookup for live map)
			await db.query(
				`
        INSERT INTO tech_locations (tech_id, latitude, longitude, accuracy_meters, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (tech_id)
        DO UPDATE SET
          latitude = $2,
          longitude = $3,
          accuracy_meters = $4,
          updated_at = NOW()
        `,
				[techId, latitude, longitude, accuracy ?? null]
			);

			// Append to history so the map can draw a trail
			await db.query(
				`
        INSERT INTO tech_location_history (tech_id, latitude, longitude, accuracy_meters)
        VALUES ($1, $2, $3, $4)
        `,
				[techId, latitude, longitude, accuracy ?? null]
			);

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
			preHandler: [authFastify.authenticate]
		},
		async (request, reply) => {
			const { companyId } = request.params as { companyId: string };
			const user = request.user as AuthUser;

			if (user.companyId !== companyId && user.role !== "dev") {
				return reply.status(403).send({ error: "Access denied" });
			}

			const result = await db.query(
				`
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
        WHERE e.company_id = $1
          AND e.role = 'tech'
        ORDER BY tl.updated_at DESC NULLS LAST
        `,
				[companyId]
			);

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
			preHandler: [authFastify.authenticate]
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

			const techs = await db.query(
				`
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
			WHERE e.company_id = $1
			  AND e.role = 'tech'
			ORDER BY tl.updated_at DESC NULLS LAST
			`,
				[companyId]
			);

			// Build the status clause in JS so we never pass a boolean into raw SQL
			// (the db.query helper uses a tagged-template reconstruction that doesn't
			// handle uncast boolean parameters well in boolean OR expressions).
			const statusClause =
				includeAll === "true"
					? ""
					: "AND j.status IN ('unassigned', 'assigned', 'in_progress')";

			const jobs = await db.query(
				`
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
        WHERE j.company_id = $1
          ${statusClause}
          AND ($2::timestamptz IS NULL OR j.scheduled_time >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR j.scheduled_time <= $3::timestamptz)
        ORDER BY
          CASE j.priority
            WHEN 'emergency' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END,
          j.created_at ASC
        `,
				[companyId, scheduledAfter ?? null, scheduledBefore ?? null]
			);

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
			preHandler: [authFastify.authenticate]
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

			const rows = await db.query(
				`
        SELECT latitude, longitude, recorded_at
        FROM tech_location_history
        WHERE tech_id = $1
          AND recorded_at > NOW() - INTERVAL '1 hour'
        ORDER BY recorded_at ASC
        `,
				[techId]
			);

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
