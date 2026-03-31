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
		isActive: z.boolean(),
		noShowCount: z.number(),
		createdAt: z.string()
	})
	.passthrough();

export const CustomersResponseSchema = z.object({
	customers: z.array(CustomerSchema)
});

export type Customer = z.infer<typeof CustomerSchema>;
