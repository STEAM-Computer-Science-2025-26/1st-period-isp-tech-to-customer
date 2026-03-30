import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { JobResponseSchema } from "@/lib/schemas/jobSchemas";
import type { Job } from "@/lib/schemas/jobSchemas";

export const jobQueryKey = (jobId: string) => ["job", jobId] as const;

export function useJob(jobId: string | null) {
	return useQuery({
		queryKey: ["job", jobId] as const,
		queryFn: async () => {
			const raw = await apiFetch<unknown>(`/jobs/${jobId!}`);
			return JobResponseSchema.parse(raw).job;
		},
		enabled: !!jobId
	});
}

export function useUpdateJobStatus(jobId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: { status: string; completionNotes?: string }) =>
			apiFetch(`/jobs/${jobId}/status`, {
				method: "PUT",
				body: JSON.stringify(body)
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: jobQueryKey(jobId) });
		}
	});
}

export function useUpdateJob(jobId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: Partial<Job>) =>
			apiFetch(`/jobs/${jobId}`, {
				method: "PATCH",
				body: JSON.stringify(body)
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: jobQueryKey(jobId) });
		}
	});
}
