import { useApiQuery } from "@/lib/hooks/useApiQuery";
import { EmployeesResponseSchema } from "@/lib/schemas/employeeSchemas";

export const employeesQueryKey = ["employees"] as const;

export function useEmployees() {
	return useApiQuery(
		employeesQueryKey,
		"/employees",
		EmployeesResponseSchema.transform((r) => r.employees),
		60_000 // 60s — employee list changes infrequently
	);
}
