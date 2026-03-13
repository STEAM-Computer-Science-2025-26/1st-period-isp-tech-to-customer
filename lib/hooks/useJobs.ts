// lib/hooks/useJobs.ts

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { JobsResponseSchema } from "@/lib/schemas/jobSchemas";

// Named constant — required for reliable cache invalidation via queryClient.invalidateQueries
export const jobsQueryKey = ["jobs"] as const;

export function useJobs() {
	return useQuery({
		queryKey: jobsQueryKey,
		queryFn: async () => {
			const raw = await apiFetch<unknown>("/jobs");
			return JobsResponseSchema.parse(raw).jobs;
		},
		staleTime: 30_000 // 30s — jobs list is fairly fresh
	});
}
