import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
	MapDataResponseSchema,
	type MapDataResponse
} from "@/lib/schemas/mapSchemas";

export function useMapData(
	companyId: string | null,
	scheduledAfter?: string,
	scheduledBefore?: string
) {
	return useQuery<MapDataResponse>({
		queryKey: ["map-data", companyId, scheduledAfter, scheduledBefore],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (scheduledAfter) params.set("scheduledAfter", scheduledAfter);
			if (scheduledBefore) params.set("scheduledBefore", scheduledBefore);
			const qs = params.toString();
			const path = `/companies/${companyId}/map-data${qs ? `?${qs}` : ""}`;
			const raw = await apiFetch<unknown>(path);
			return MapDataResponseSchema.parse(raw);
		},
		enabled: !!companyId,
		refetchInterval: 30_000,
		staleTime: 20_000
	});
}
