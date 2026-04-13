import { useApiQuery } from "@/lib/hooks/useApiQuery";
import { CustomersResponseSchema } from "@/lib/schemas/customerSchemas";

export const customersQueryKey = ["customers"] as const;

export function useCustomers() {
	return useApiQuery(
		customersQueryKey,
		"/customers",
		CustomersResponseSchema.transform((r) => r.customers),
		60_000 // 60s — customer list changes infrequently
	);
}
