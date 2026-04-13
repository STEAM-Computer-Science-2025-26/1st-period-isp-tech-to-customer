import { useApiQuery } from "@/lib/hooks/useApiQuery";
import { JobsResponseSchema } from "@/lib/schemas/jobSchemas";

export const jobsQueryKey = ["jobs"] as const;

export function useJobs() {
	return useApiQuery(
		jobsQueryKey,
		"/jobs",
		JobsResponseSchema.transform((r) => r.jobs),
		30_000
	);
}
