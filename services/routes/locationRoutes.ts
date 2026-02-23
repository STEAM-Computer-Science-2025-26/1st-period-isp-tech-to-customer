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

const locationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
	const authFastify = fastify as AuthenticatedFastify;

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

			return {
				success: true,
				timestamp: new Date()
			};
		}
	);

	// Get tech locations
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

	fastify.get(
		"/companies/:companyId/map-data",
		{
			preHandler: [authFastify.authenticate]
		},
		async (request, reply) => {
			const { companyId } = request.params as { companyId: string };
			const user = request.user as AuthUser;

			if (user.companyId !== companyId && user.role !== "dev") {
				return reply.status(403).send({ error: "Access denied" });
			}

			// use the shared db helper instead of creating a new Pool here
			const techs = await db.query(
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

			const jobs = await db.query(
				`
        SELECT 
          j.id,
          j.customer_name,
          j.address,
          j.latitude,
          j.longitude,
          j.status,
          j.priority,
          j.assigned_tech_id,
          j.created_at,
          j.required_skills
        FROM jobs j
        WHERE j.company_id = $1
          AND j.status IN ('unassigned', 'assigned', 'in_progress')
        ORDER BY 
          CASE j.priority 
            WHEN 'emergency' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END,
          j.created_at ASC
        `,
				[companyId]
			);

			return {
				techs: techs,
				jobs: jobs,
				lastUpdate: new Date()
			};
		}
	);
};

export default locationRoutes;
