import { FastifyInstance } from "fastify";
import { authenticate, requireCompanyAccess } from "../middleware/auth";
import { logJobAssignment, getAssignmentLogs } from "../logging/assignmentLogger";
import { logJobCompletion } from "../logging/completionLogger";
import { getPerformanceSnapshots, getTechPerformanceTrend } from "../logging/performanceTracker";
import { z } from "zod";
// Make sure the path below points to your Prisma client instance (commonly at ../prisma/client or ../../prisma/client)
import { prisma } from "../../prisma/client"; // adjust import path as needed

const assignmentLogSchema = z.object({
    jobId: z.string().uuid(),
    assignedTechId: z.string().uuid(),
    companyId: z.string().uuid(),
    assignedByUserId: z.string().uuid().nullable(),
    isManualOverride: z.boolean(),
    overrideReason: z.string().nullable(),
    technicianSnapshot: z.object({
        techId: z.string().uuid(),
        techName: z.string(),
        activeStatus: z.boolean(),
        availabilityStatus: z.boolean(),
        skillLevel: z.record(z.string(), z.number()),
        distanceToJobKm: z.number(),
        currentWorkload: z.number(),
        shiftStart: z.string().nullable(),
        shiftEnd: z.string().nullable(),
        emergencyCapable: z.boolean()
    }),
    scoringDetails: z.object({
        distanceScore: z.number(),
        availabilityScore: z.number(),
        skillMatchScore: z.number(),
        recentPerformanceScore: z.number(),
        workloadBalanceScore: z.number(),
        totalScore: z.number(),
        rankAmongEligible: z.number(),
        totalEligibleTechs: z.number()
    }),
    jobType: z.string(),
    jobComplexity: z.string().nullable(),
    jobPriority: z.string(),
    scheduledTime: z.string().nullable(),
    isEmergency: z.boolean(),
    requiresManualDispatch: z.boolean()
});

export async function loggingRoutes(fastify: FastifyInstance) {
    async function getCompletionLogs({
        companyId,
        jobId,
        techId,
        startDate,
        endDate,
        minRating,
        firstTimeFixOnly,
        limit = 50,
        offset = 0
    }: {
        companyId: string;
        jobId?: string;
        techId?: string;
        startDate?: string;
        endDate?: string;
        minRating?: number;
        firstTimeFixOnly?: boolean;
        limit?: number;
        offset?: number;
    }) {
        const where: any = {
            companyId
        };

        if (jobId) where.jobId = jobId;
        if (techId) where.techId = techId;
        if (startDate || endDate) {
            where.completedAt = {};
            if (startDate) where.completedAt.gte = new Date(startDate);
            if (endDate) where.completedAt.lte = new Date(endDate);
        }
        if (typeof minRating === "number") where.rating = { gte: minRating };
        if (firstTimeFixOnly) where.firstTimeFix = true;

        const logs = await prisma.completionLog.findMany({
            where,
            orderBy: { completedAt: "desc" },
            skip: offset,
            take: limit
        });

        return logs;
    }

    fastify.register(async (authenticatedRoutes) => {
        authenticatedRoutes.addHook("onRequest", authenticate);

        // Create assignment log
        authenticatedRoutes.post("/logs/assignment", async (request, reply) => {
            const parsed = assignmentLogSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(400).send({ error: "Invalid request body", details: parsed.error });
            }

            const logId = await logJobAssignment(parsed.data);
            return { success: true, logId };
        });

        // Get assignment logs
        authenticatedRoutes.get("/logs/assignments", async (request, reply) => {
            const authUser = request.user as any;
            const isDev = authUser?.role === "dev";

            const query = request.query as any;
            const companyId = isDev ? (query.companyId || authUser.companyId) : authUser.companyId;

            if (!companyId) {
                return reply.code(400).send({ error: "Missing companyId" });
            }

            const logs = await getAssignmentLogs({
                companyId,
                jobId: query.jobId,
                techId: query.techId,
                startDate: query.startDate,
                endDate: query.endDate,
                limit: query.limit,
                offset: query.offset
            });

            return { logs };
        });

        // Create completion log
        authenticatedRoutes.post("/logs/completion", async (request, reply) => {
            // Similar validation and handling as assignment log
            const logId = await logJobCompletion(request.body as any);
            return { success: true, logId };
        });

        // Get completion logs
        authenticatedRoutes.get("/logs/completions", async (request, reply) => {
            const authUser = request.user as any;
            const isDev = authUser?.role === "dev";

            const query = request.query as any;
            const companyId = isDev ? (query.companyId || authUser.companyId) : authUser.companyId;

            if (!companyId) {
                return reply.code(400).send({ error: "Missing companyId" });
            }

            const logs = await getCompletionLogs({
                companyId,
                jobId: query.jobId,
                techId: query.techId,
                startDate: query.startDate,
                endDate: query.endDate,
                minRating: query.minRating,
                firstTimeFixOnly: query.firstTimeFixOnly === 'true',
                limit: query.limit,
                offset: query.offset
            });

            return { logs };
        });

        // Get performance snapshots
        authenticatedRoutes.get("/logs/performance/:techId", async (request, reply) => {
            const { techId } = request.params as { techId: string };
            const authUser = request.user as any;
            const isDev = authUser?.role === "dev";

            const query = request.query as any;
            const companyId = isDev ? (query.companyId || authUser.companyId) : authUser.companyId;

            if (!companyId) {
                return reply.code(400).send({ error: "Missing companyId" });
            }

            const snapshots = await getPerformanceSnapshots({
                companyId,
                techId,
                startDate: query.startDate,
                endDate: query.endDate,
                limit: query.limit,
                offset: query.offset
            });

            return { snapshots };
        });

        // Get performance trend
        authenticatedRoutes.get("/logs/performance/:techId/trend", async (request, reply) => {
            const { techId } = request.params as { techId: string };
            const authUser = request.user as any;
            const isDev = authUser?.role === "dev";

            const query = request.query as any;
            const companyId = isDev ? (query.companyId || authUser.companyId) : authUser.companyId;

            if (!companyId) {
                return reply.code(400).send({ error: "Missing companyId" });
            }

            const days = parseInt(query.days || '30');
            const trend = await getTechPerformanceTrend(techId, companyId, days);

            return { trend };
        });
    });
}
