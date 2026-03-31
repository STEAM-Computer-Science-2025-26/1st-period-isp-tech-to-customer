import type { JobDTO } from "@/app/types/types";

export type JobsFilter = {
	statuses: Set<JobDTO["status"]>;
	priorities: Set<JobDTO["priority"]>;
	jobTypes: Set<JobDTO["jobType"]>;
};

export function createEmptyJobsFilter(): JobsFilter {
	return {
		statuses: new Set<JobDTO["status"]>(),
		priorities: new Set<JobDTO["priority"]>(),
		jobTypes: new Set<JobDTO["jobType"]>()
	};
}

export const STATUS_OPTIONS: { value: JobDTO["status"]; label: string }[] = [
	{ value: "unassigned", label: "Unassigned" },
	{ value: "assigned", label: "Assigned" },
	{ value: "in_progress", label: "In Progress" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" }
];

export const PRIORITY_OPTIONS: {
	value: JobDTO["priority"];
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

export const JOB_TYPE_OPTIONS: { value: JobDTO["jobType"]; label: string }[] = [
	{ value: "installation", label: "Installation" },
	{ value: "repair", label: "Repair" },
	{ value: "maintenance", label: "Maintenance" },
	{ value: "inspection", label: "Inspection" }
];

export type FilterSearchMatch =
	| { type: "status"; value: JobDTO["status"] }
	| { type: "priority"; value: JobDTO["priority"] }
	| { type: "jobType"; value: JobDTO["jobType"] };

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

export function countActiveFilters(filters: JobsFilter): number {
	return (
		filters.statuses.size +
		filters.priorities.size +
		filters.jobTypes.size
	);
}
