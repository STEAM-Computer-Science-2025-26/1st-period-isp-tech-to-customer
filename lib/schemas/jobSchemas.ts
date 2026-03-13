// lib/schemas/jobSchemas.ts
// Zod schemas for job-related API responses.
// Types are derived from schemas with z.infer — no separate type file needed.

import { z } from "zod";

export const JobStatusSchema = z.enum([
	"unassigned",
	"assigned",
	"in_progress",
	"completed",
	"cancelled"
]);

export const JobPrioritySchema = z.enum(["low", "medium", "high", "emergency"]);

export const JobTypeSchema = z.enum([
	"installation",
	"repair",
	"maintenance",
	"inspection"
]);

// Matches JobDTO in services/types/jobTypes.ts exactly.
// .passthrough() allows extra fields the backend may add without breaking validation.
export const JobDTOSchema = z
	.object({
		id: z.string(),
		companyId: z.string(),
		customerName: z.string(),
		address: z.string(),
		phone: z.string(),
		jobType: JobTypeSchema,
		status: JobStatusSchema,
		priority: JobPrioritySchema,
		assignedTechId: z.string().optional(),
		scheduledTime: z.string().optional(),
		createdAt: z.string(),
		completedAt: z.string().optional(),
		initialNotes: z.string().optional(),
		completionNotes: z.string().optional()
	})
	.passthrough();

export const JobsResponseSchema = z.object({
	jobs: z.array(JobDTOSchema)
});
