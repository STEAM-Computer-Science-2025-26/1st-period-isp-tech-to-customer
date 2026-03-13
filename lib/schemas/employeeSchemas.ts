// lib/schemas/employeeSchemas.ts
// Zod schemas for employee-related API responses.

import { z } from "zod";

export const EmployeeSkillSchema = z.enum([
	"hvac_install",
	"hvac_repair",
	"hvac_maintenance",
	"electrical",
	"refrigeration",
	"ductwork",
	"plumbing"
]);

// Matches the Employee type defined in app/employees/page.tsx
export const EmployeeSchema = z
	.object({
		id: z.string(),
		userId: z.string(),
		companyId: z.string(),
		name: z.string(),
		email: z.string().nullable(),
		role: z.string().nullable(),
		phone: z.string().nullable(),
		skills: z.array(EmployeeSkillSchema),
		skillLevel: z.record(z.string(), z.number()),
		homeAddress: z.string(),
		isAvailable: z.boolean(),
		isActive: z.boolean(),
		rating: z.number(),
		currentJobId: z.string().nullable(),
		maxConcurrentJobs: z.number(),
		latitude: z.number().nullable(),
		longitude: z.number().nullable(),
		internalNotes: z.string().nullable(),
		createdAt: z.string()
	})
	.passthrough();

export const EmployeesResponseSchema = z.object({
	employees: z.array(EmployeeSchema)
});

export type Employee = z.infer<typeof EmployeeSchema>;
