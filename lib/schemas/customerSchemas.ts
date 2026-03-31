// lib/schemas/customerSchemas.ts
// Zod schemas for customer-related API responses.

import { z } from "zod";

// Handles DOUBLE PRECISION columns that Neon may return as numeric strings.
const numOrNull = z.preprocess(
	(value) => (value === null || value === undefined ? null : Number(value)),
	z.number().nullable()
);

// Matches the Customer type defined in app/customers/page.tsx
export const CustomerSchema = z
	.object({
		id: z.string(),
		firstName: z.string(),
		lastName: z.string(),
		companyName: z.string().nullable().optional(),
		customerType: z.string(),
		email: z.string().nullable().optional(),
		phone: z.string(),
		address: z.string(),
		city: z.string(),
		state: z.string(),
		zip: z.string(),
		latitude: numOrNull.optional(),
		longitude: numOrNull.optional(),
		notes: z.string().nullable().optional(),
		isActive: z.boolean(),
		noShowCount: z.number(),
		createdAt: z.string()
	})
	.passthrough();

export const CustomersResponseSchema = z.object({
	customers: z.array(CustomerSchema)
});

const CustomerDetailJobSchema = z
	.object({
		id: z.string(),
		jobType: z.string(),
		status: z.string(),
		priority: z.string(),
		scheduledTime: z.string().nullable().optional(),
		completedAt: z.string().nullable().optional()
	})
	.passthrough();

const CustomerDetailEquipmentSchema = z
	.object({
		id: z.string(),
		equipmentType: z.string(),
		ageYears: z.number().nullable().optional()
	})
	.passthrough();

const CustomerDetailLocationSchema = z
	.object({
		id: z.string(),
		label: z.string(),
		address: z.string(),
		city: z.string(),
		state: z.string()
	})
	.passthrough();

const CustomerDetailCommunicationSchema = z
	.object({
		id: z.string()
	})
	.passthrough();

export const CustomerDetailResponseSchema = z.object({
	customer: CustomerSchema,
	jobs: z.array(CustomerDetailJobSchema),
	equipment: z.array(CustomerDetailEquipmentSchema),
	locations: z.array(CustomerDetailLocationSchema),
	communications: z.array(CustomerDetailCommunicationSchema)
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerDetailResponse = z.infer<
	typeof CustomerDetailResponseSchema
>;
