import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { ZodSchema } from "zod";

export function useApiQuery<T>(
	queryKey: readonly (string | number)[],
	path: string,
	schema: ZodSchema<T>,
	staleTime = 60_000
) {
	return useQuery({
		queryKey: [...queryKey],
		queryFn: async () => {
			const raw = await apiFetch<unknown>(path);
			return schema.parse(raw);
		},
		staleTime
	});
}
