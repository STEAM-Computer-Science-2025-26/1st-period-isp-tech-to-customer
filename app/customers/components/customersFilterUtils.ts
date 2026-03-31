export type CustomersFilter = {
	types: Set<"residential" | "commercial">;
	statuses: Set<"active" | "inactive">;
};

export function createEmptyCustomersFilter(): CustomersFilter {
	return {
		types: new Set(),
		statuses: new Set()
	};
}

export const CUSTOMER_TYPE_OPTIONS: {
	value: "residential" | "commercial";
	label: string;
}[] = [
	{ value: "residential", label: "Residential" },
	{ value: "commercial", label: "Commercial" }
];

export const CUSTOMER_STATUS_OPTIONS: {
	value: "active" | "inactive";
	label: string;
}[] = [
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" }
];

export type CustomerFilterSearchMatch =
	| { type: "customerType"; value: "residential" | "commercial" }
	| { type: "status"; value: "active" | "inactive" };

export function findFirstCustomerFilterMatch(
	query: string
): CustomerFilterSearchMatch | null {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return null;

	const type = CUSTOMER_TYPE_OPTIONS.find((o) =>
		o.label.toLowerCase().includes(normalized)
	);
	if (type) return { type: "customerType", value: type.value };

	const status = CUSTOMER_STATUS_OPTIONS.find((o) =>
		o.label.toLowerCase().includes(normalized)
	);
	if (status) return { type: "status", value: status.value };

	return null;
}

export function toggleSet<T extends string>(current: Set<T>, value: T): Set<T> {
	const next = new Set(current);
	if (next.has(value)) {
		next.delete(value);
	} else {
		next.add(value);
	}
	return next;
}

export function countActiveCustomerFilters(filters: CustomersFilter): number {
	return filters.types.size + filters.statuses.size;
}
