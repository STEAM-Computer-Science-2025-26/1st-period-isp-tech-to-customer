// lib/hooks/useEmployees.ts

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { EmployeesResponseSchema } from "@/lib/schemas/employeeSchemas";

export const employeesQueryKey = ["employees"] as const;

export function useEmployees() {
	return useQuery({
		queryKey: employeesQueryKey,
		queryFn: async () => {
			const raw = await apiFetch<unknown>("/api/employees");
			return EmployeesResponseSchema.parse(raw).employees;
		},
		staleTime: 60_000 // 60s — employee list changes infrequently
	});
}
