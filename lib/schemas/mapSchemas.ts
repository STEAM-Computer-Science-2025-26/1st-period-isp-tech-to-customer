// lib/schemas/mapSchemas.ts
// Zod schemas for /companies/:companyId/map-data and related map endpoints.

import { z } from "zod";

export const MapTechSchema = z.object({
	techId: z.string(),
	techName: z.string(),
	phone: z.string().nullable(),
	isAvailable: z.boolean(),
	currentJobId: z.string().nullable(),
	skills: z.array(z.string()),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	accuracyMeters: z.number().nullable(),
	lastUpdate: z.string().nullable(),
	secondsSinceUpdate: z.number().nullable()
});

export const MapJobSchema = z.object({
	id: z.string(),
	customerName: z.string(),
	address: z.string(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	status: z.enum(["unassigned", "assigned", "in_progress"]),
	priority: z.enum(["low", "medium", "high", "emergency"]),
	assignedTechId: z.string().nullable(),
	scheduledTime: z.string().nullable(),
	jobType: z
		.enum(["installation", "repair", "maintenance", "inspection"])
		.nullable(),
	createdAt: z.string(),
	requiredSkills: z.array(z.string())
});

export const MapDataResponseSchema = z.object({
	techs: z.array(MapTechSchema),
	jobs: z.array(MapJobSchema),
	lastUpdate: z.string()
});

export const TechTrailPointSchema = z.object({
	latitude: z.number(),
	longitude: z.number(),
	recordedAt: z.string()
});

export const TechTrailResponseSchema = z.object({
	trail: z.array(TechTrailPointSchema)
});

export type MapTech = z.infer<typeof MapTechSchema>;
export type MapJob = z.infer<typeof MapJobSchema>;
export type MapDataResponse = z.infer<typeof MapDataResponseSchema>;
export type TechTrailPoint = z.infer<typeof TechTrailPointSchema>;
