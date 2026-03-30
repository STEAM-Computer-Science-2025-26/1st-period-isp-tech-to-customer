import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
	MapDataResponseSchema,
	type MapDataResponse
} from "@/lib/schemas/mapSchemas";
import { rowsToCamelCase } from "@/lib/utils/casing";

export function useMapData(
	companyId: string | null,
	scheduledAfter?: string,
	scheduledBefore?: string,
	includeAll?: boolean
) {
	return useQuery<MapDataResponse>({
		queryKey: [
			"map-data",
			companyId,
			scheduledAfter,
			scheduledBefore,
			includeAll
		],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (scheduledAfter) params.set("scheduledAfter", scheduledAfter);
			if (scheduledBefore) params.set("scheduledBefore", scheduledBefore);
			if (includeAll) params.set("includeAll", "true");
			const qs = params.toString();
			const path = `/companies/${companyId}/map-data${qs ? `?${qs}` : ""}`;
			const raw = await apiFetch<{
				techs: Record<string, unknown>[];
				jobs: Record<string, unknown>[];
				lastUpdate: string;
			}>(path);
			// Neon returns snake_case column names — convert before Zod validates
			const normalized = {
				techs: rowsToCamelCase(raw.techs),
				jobs: rowsToCamelCase(raw.jobs),
				lastUpdate: raw.lastUpdate
			};
			return MapDataResponseSchema.parse(normalized);
		},
		enabled: !!companyId,
		refetchInterval: 30_000,
		staleTime: 20_000
	});
}
