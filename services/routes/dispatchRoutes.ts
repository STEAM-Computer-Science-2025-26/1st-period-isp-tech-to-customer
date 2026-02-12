import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import {
	runDispatchForJob,
	getDispatchRecommendations,
	manualAssignJob
} from "../dispatch/dispatchService";
import { completeJob, unassignJob, startJob } from "../dispatch/persistence";

// === DEFINE THE CONTRACT YOU SHOULD ALREADY HAVE ===
// If you want this somewhere else, move it to services/types/dispatch.ts
export type DispatchRecommendation = {
	requiresManualDispatch: boolean;
	technicianId?: string | null;
	score?: number;
	reason?: string;
};

const manualAssignSchema = z.object({
	techId: z.string().uuid(),
	reason: z.string().min(10, "Reason must be at least 10 characters")
});

const completeJobSchema = z.object({
	completionNotes: z.string().optional(),
	durationMinutes: z.number().int().min(1).optional(),
	firstTimeFix: z.boolean().optional(),
	customerRating: z.number().int().min(1).max(5).optional()
});

type AuthUser = {
	userId?: string;
	id?: string;
	role?: string;
	companyId?: string;
};

function getAuthUser(request: { user?: unknown }): AuthUser {
	return (request.user ?? {}) as AuthUser;
}

function getUserId(user: AuthUser): string {
	return user.userId ?? user.id ?? "unknown";
}

export function dispatchJob(fastify: FastifyInstance) {
	fastify.post("/jobs/:jobId/dispatch", async (request, reply) => {
		const { jobId } = request.params as { jobId: string };
		const user = getAuthUser(request);
		const userId = getUserId(user);

		try {
			const recommendation = (await runDispatchForJob(
				jobId,
				userId,
				true
			)) as unknown as DispatchRecommendation;

			return {
				recommendation,
				assigned: recommendation.requiresManualDispatch === false
			};
		} catch (error) {
			if (error instanceof Error) {
				if (error.message.includes("not found")) {
					return reply.code(404).send({ error: error.message });
				}
				if (error.message.includes("already")) {
					return reply.code(400).send({ error: error.message });
				}
				if (error.message.includes("no coordinates")) {
					return reply.code(400).send({ error: error.message });
				}
			}
			throw error;
		}
	});
}

export function getRecommendations(fastify: FastifyInstance) {
	fastify.get("/jobs/:jobId/recommendations", async (request, reply) => {
		const { jobId } = request.params as { jobId: string };

		try {
			const recommendation: DispatchRecommendation =
				await getDispatchRecommendations(jobId);

			return { recommendation };
		} catch (error) {
			if (error instanceof Error && error.message.includes("not found")) {
				return reply.code(404).send({ error: error.message });
			}
			throw error;
		}
	});
}

export function manualAssign(fastify: FastifyInstance) {
	fastify.post("/jobs/:jobId/assign", async (request, reply) => {
		const { jobId } = request.params as { jobId: string };
		const user = getAuthUser(request);
		const userId = getUserId(user);

		const parsed = manualAssignSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const { techId, reason } = parsed.data;

		try {
			await manualAssignJob(jobId, techId, userId, reason);
			return { success: true };
		} catch (error) {
			if (error instanceof Error) {
				if (error.message.includes("not eligible")) {
					return reply.code(400).send({ error: error.message });
				}
				if (error.message.includes("not found")) {
					return reply.code(404).send({ error: error.message });
				}
			}
			throw error;
		}
	});
}

export function completeJobRoute(fastify: FastifyInstance) {
	fastify.post("/jobs/:jobId/complete", async (request, reply) => {
		const { jobId } = request.params as { jobId: string };

		const parsed = completeJobSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const { completionNotes, durationMinutes, firstTimeFix, customerRating } =
			parsed.data;

		try {
			await completeJob(
				jobId,
				completionNotes,
				durationMinutes,
				firstTimeFix,
				customerRating
			);
			return { success: true };
		} catch (error) {
			if (error instanceof Error) {
				if (error.message.includes("not found")) {
					return reply.code(404).send({ error: error.message });
				}
				if (error.message.includes("already completed")) {
					return reply.code(400).send({ error: error.message });
				}
			}
			throw error;
		}
	});
}

export function startJobRoute(fastify: FastifyInstance) {
	fastify.post("/jobs/:jobId/start", async (request, reply) => {
		const { jobId } = request.params as { jobId: string };

		try {
			await startJob(jobId);
			return { success: true };
		} catch (error) {
			if (error instanceof Error && error.message.includes("not found")) {
				return reply.code(404).send({ error: error.message });
			}
			throw error;
		}
	});
}

export function unassignJobRoute(fastify: FastifyInstance) {
	fastify.delete("/jobs/:jobId/assignment", async (request, reply) => {
		const { jobId } = request.params as { jobId: string };

		try {
			await unassignJob(jobId);
			return { success: true };
		} catch (error) {
			if (error instanceof Error) {
				if (error.message.includes("not found")) {
					return reply.code(404).send({ error: error.message });
				}
				if (error.message.includes("not assigned")) {
					return reply.code(400).send({ error: error.message });
				}
			}
			throw error;
		}
	});
}

export async function dispatchRoutes(fastify: FastifyInstance) {
	fastify.register(async (authenticatedRoutes) => {
		authenticatedRoutes.addHook("onRequest", authenticate);

		dispatchJob(authenticatedRoutes);
		getRecommendations(authenticatedRoutes);
		manualAssign(authenticatedRoutes);
		completeJobRoute(authenticatedRoutes);
		startJobRoute(authenticatedRoutes);
		unassignJobRoute(authenticatedRoutes);
	});
}
