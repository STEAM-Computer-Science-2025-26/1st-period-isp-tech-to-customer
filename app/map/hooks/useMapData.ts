import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
	MapDataResponseSchema,
	type MapDataResponse
} from "@/lib/schemas/mapSchemas";

// Convert a single snake_case key → camelCase key
function keyToCamel(key: string): string {
	return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Shallow-convert all keys in an object from snake_case to camelCase
function rowToCamel(row: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of Object.keys(row)) out[keyToCamel(k)] = row[k];
	return out;
}

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
				techs: raw.techs.map(rowToCamel),
				jobs: raw.jobs.map(rowToCamel),
				lastUpdate: raw.lastUpdate
			};
			return MapDataResponseSchema.parse(normalized);
		},
		enabled: !!companyId,
		refetchInterval: 30_000,
		staleTime: 20_000
	});
}
