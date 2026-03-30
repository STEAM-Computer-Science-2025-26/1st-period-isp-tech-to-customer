// lib/hooks/useCustomers.ts

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { CustomersResponseSchema } from "@/lib/schemas/customerSchemas";

export const customersQueryKey = ["customers"] as const;

export function useCustomers() {
	return useQuery({
		queryKey: customersQueryKey,
		queryFn: async () => {
			const raw = await apiFetch<unknown>("/api/customers");
			return CustomersResponseSchema.parse(raw).customers;
		},
		staleTime: 60_000 // 60s — customer list changes infrequently
	});
}
