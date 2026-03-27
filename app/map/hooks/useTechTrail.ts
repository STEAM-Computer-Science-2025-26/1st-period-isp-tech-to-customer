import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
	TechTrailResponseSchema,
	type TechTrailPoint
} from "@/lib/schemas/mapSchemas";

export function useTechTrail(
	companyId: string | null,
	techId: string | null
): { trail: TechTrailPoint[] } {
	const { data } = useQuery({
		queryKey: ["tech-trail", companyId, techId],
		queryFn: async () => {
			const raw = await apiFetch<unknown>(
				`/companies/${companyId}/techs/${techId}/trail`
			);
			return TechTrailResponseSchema.parse(raw);
		},
		enabled: !!companyId && !!techId,
		refetchInterval: 30_000,
		staleTime: 20_000
	});

	return { trail: data?.trail ?? [] };
}
