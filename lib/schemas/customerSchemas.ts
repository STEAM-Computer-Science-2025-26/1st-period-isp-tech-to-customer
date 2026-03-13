// lib/schemas/customerSchemas.ts
// Zod schemas for customer-related API responses.

import { z } from "zod";

// Matches the Customer type defined in app/customers/page.tsx
export const CustomerSchema = z
	.object({
		id: z.string(),
		firstName: z.string(),
		lastName: z.string(),
		companyName: z.string().optional(),
		customerType: z.string(),
		email: z.string(),
		phone: z.string(),
		address: z.string(),
		city: z.string(),
		state: z.string(),
		zip: z.string(),
		isActive: z.boolean(),
		noShowCount: z.number(),
		createdAt: z.string()
	})
	.passthrough();

export const CustomersResponseSchema = z.object({
	customers: z.array(CustomerSchema)
});

export type Customer = z.infer<typeof CustomerSchema>;
