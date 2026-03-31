import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { CustomerDetailResponseSchema } from "@/lib/schemas/customerSchemas";

export const customerDetailQueryKey = (customerId: string) =>
	["customer-detail", customerId] as const;

export function useCustomerDetail(customerId: string | null) {
	return useQuery({
		queryKey: ["customer-detail", customerId] as const,
		queryFn: async () => {
			const raw = await apiFetch<unknown>(`/customers/${customerId!}`);
			return CustomerDetailResponseSchema.parse(raw);
		},
		enabled: !!customerId,
		staleTime: 30_000
	});
}
