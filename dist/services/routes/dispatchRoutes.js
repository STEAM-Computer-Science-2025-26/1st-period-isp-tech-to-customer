// routes/dispatchRoutes.ts - COMBINED VERSION
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import {
	runDispatchForJob,
	getDispatchRecommendations,
	manualAssignJob
} from "../dispatch/dispatchService";
import { completeJob, unassignJob, startJob } from "../dispatch/persistence";
import { batchDispatch } from "../../services/dispatch/batchDispatch";
// Schemas
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
const batchDispatchSchema = z.object({
	jobIds: z.array(z.string().uuid()).min(1, "At least one job ID required")
});
// Helper functions
function getAuthUser(request) {
	return request.user ?? {};
}
function getUserId(user) {
	return user.userId ?? user.id ?? "unknown";
}
// Single job dispatch
export function dispatchJob(fastify) {
	fastify.post("/jobs/:jobId/dispatch", async (request, reply) => {
		const { jobId } = request.params;
		const user = getAuthUser(request);
		const userId = getUserId(user);
		try {
			const recommendation = await runDispatchForJob(jobId, userId, true);
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
// Batch dispatch (NEW - OPTIMIZED)
export function batchDispatchRoute(fastify) {
	fastify.post("/dispatch/batch", async (request, reply) => {
		const user = getAuthUser(request);
		const companyId = user.companyId;
		if (!companyId) {
			return reply.code(403).send({ error: "Company ID required" });
		}
		const parsed = batchDispatchSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}
		const { jobIds } = parsed.data;
		try {
			// Run optimized batch dispatch
			const result = await batchDispatch(jobIds, companyId);
			// Assignments returned in `result.assignments`; persistence should be handled
			// by the batchDispatch implementation. If additional persistence here is
			// required, implement and export it from the batchDispatch module.
			return {
				success: true,
				...result
			};
		} catch (error) {
			console.error("Batch dispatch error:", error);
			if (error instanceof Error) {
				return reply.code(500).send({
					error: "Batch dispatch failed",
					message: error.message
				});
			}
			return reply.code(500).send({ error: "Batch dispatch failed" });
		}
	});
}
// Get recommendations
export function getRecommendations(fastify) {
	fastify.get("/jobs/:jobId/recommendations", async (request, reply) => {
		const { jobId } = request.params;
		try {
			const recommendation = await getDispatchRecommendations(jobId);
			return { recommendation };
		} catch (error) {
			if (error instanceof Error && error.message.includes("not found")) {
				return reply.code(404).send({ error: error.message });
			}
			throw error;
		}
	});
}
// Manual assign
export function manualAssign(fastify) {
	fastify.post("/jobs/:jobId/assign", async (request, reply) => {
		const { jobId } = request.params;
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
// Complete job
export function completeJobRoute(fastify) {
	fastify.post("/jobs/:jobId/complete", async (request, reply) => {
		const { jobId } = request.params;
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
// Start job
export function startJobRoute(fastify) {
	fastify.post("/jobs/:jobId/start", async (request, reply) => {
		const { jobId } = request.params;
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
// Unassign job
export function unassignJobRoute(fastify) {
	fastify.delete("/jobs/:jobId/assignment", async (request, reply) => {
		const { jobId } = request.params;
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
// Main route registration
export async function dispatchRoutes(fastify) {
	fastify.register(async (authenticatedRoutes) => {
		authenticatedRoutes.addHook("onRequest", authenticate);
		// Single job operations
		dispatchJob(authenticatedRoutes);
		getRecommendations(authenticatedRoutes);
		manualAssign(authenticatedRoutes);
		completeJobRoute(authenticatedRoutes);
		startJobRoute(authenticatedRoutes);
		unassignJobRoute(authenticatedRoutes);
		// Batch operations (NEW)
		batchDispatchRoute(authenticatedRoutes);
	});
}
