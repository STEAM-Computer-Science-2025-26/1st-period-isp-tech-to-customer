import { type MapJob } from "@/lib/schemas/mapSchemas";

export type PanelFilter = {
	search: string;
	statuses: Set<MapJob["status"]>;
	priorities: Set<MapJob["priority"]>;
	jobTypes: Set<string>;
	zipCode: string;
	dateAfter: string;
	dateBefore: string;
};

export function createEmptyFilter(): PanelFilter {
	return {
		search: "",
		statuses: new Set<MapJob["status"]>(),
		priorities: new Set<MapJob["priority"]>(),
		jobTypes: new Set<string>(),
		zipCode: "",
		dateAfter: "",
		dateBefore: ""
	};
}

export const STATUS_OPTIONS: { value: MapJob["status"]; label: string }[] = [
	{ value: "unassigned", label: "Unassigned" },
	{ value: "assigned", label: "Assigned" },
	{ value: "in_progress", label: "In Progress" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" }
];

export const PRIORITY_OPTIONS: {
	value: MapJob["priority"];
	label: string;
	cls: string;
}[] = [
	{
		value: "emergency",
		label: "Emergency",
		cls: "text-red-400 border-red-500/40 bg-red-500/10"
	},
	{
		value: "high",
		label: "High",
		cls: "text-orange-400 border-orange-500/40 bg-orange-500/10"
	},
	{
		value: "medium",
		label: "Medium",
		cls: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10"
	},
	{
		value: "low",
		label: "Low",
		cls: "text-green-400 border-green-500/40 bg-green-500/10"
	}
];

export const JOB_TYPE_OPTIONS: { value: string; label: string }[] = [
	{ value: "installation", label: "Installation" },
	{ value: "repair", label: "Repair" },
	{ value: "maintenance", label: "Maintenance" },
	{ value: "inspection", label: "Inspection" }
];

export type FilterSearchMatch =
	| { type: "status"; value: MapJob["status"] }
	| { type: "priority"; value: MapJob["priority"] }
	| { type: "jobType"; value: string }
	| { type: "zipCode"; value: string };

export function findFirstFilterMatch(query: string): FilterSearchMatch | null {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return null;

	const status = STATUS_OPTIONS.find((option) =>
		option.label.toLowerCase().includes(normalized)
	);
	if (status) return { type: "status", value: status.value };

	const priority = PRIORITY_OPTIONS.find((option) =>
		option.label.toLowerCase().includes(normalized)
	);
	if (priority) return { type: "priority", value: priority.value };

	const jobType = JOB_TYPE_OPTIONS.find((option) =>
		option.label.toLowerCase().includes(normalized)
	);
	if (jobType) return { type: "jobType", value: jobType.value };

	if (/^\d{1,5}$/.test(normalized)) {
		return { type: "zipCode", value: normalized };
	}

	return null;
}

export function countActiveFilters(f: PanelFilter): number {
	return [
		f.search,
		f.zipCode,
		f.dateAfter,
		f.dateBefore,
		...Array.from(f.statuses),
		...Array.from(f.priorities),
		...Array.from(f.jobTypes)
	].filter(Boolean).length;
}

export function extractZip(address: string): string {
	return address.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? "";
}

export function applyPanelFilter(jobs: MapJob[], f: PanelFilter): MapJob[] {
	return jobs.filter((job) => {
		if (f.search) {
			const q = f.search.toLowerCase();
			if (
				!job.customerName.toLowerCase().includes(q) &&
				!job.address.toLowerCase().includes(q)
			)
				return false;
		}
		if (f.statuses.size > 0 && !f.statuses.has(job.status)) return false;
		if (f.priorities.size > 0 && !f.priorities.has(job.priority)) return false;
		if (f.jobTypes.size > 0 && (!job.jobType || !f.jobTypes.has(job.jobType)))
			return false;
		if (f.zipCode && !extractZip(job.address).startsWith(f.zipCode)) {
			return false;
		}
		if (f.dateAfter && job.scheduledTime) {
			if (new Date(job.scheduledTime) < new Date(f.dateAfter)) return false;
		}
		if (f.dateBefore && job.scheduledTime) {
			const end = new Date(f.dateBefore);
			end.setHours(23, 59, 59, 999);
			if (new Date(job.scheduledTime) > end) return false;
		}
		return true;
	});
}

export function toggleSet<T>(prev: Set<T>, val: T): Set<T> {
	const next = new Set(prev);
	if (next.has(val)) next.delete(val);
	else next.add(val);
	return next;
}
