import type { JobPriority } from "@/app/types/types";

export type BatchPlanAssignment = {
	jobId: string;
	techId: string;
	techName: string;
	score: number;
	driveTimeMinutes: number;
};

export type BatchPlanUnassigned = {
	jobId: string;
	reason: string;
};

export type BatchPlanSelectedJob = {
	id: string;
	customerName: string;
	address: string;
	priority: JobPriority;
};

export type BatchPlan = {
	createdAt: string;
	assignments: BatchPlanAssignment[];
	unassigned: BatchPlanUnassigned[];
	selectedJobs: BatchPlanSelectedJob[];
};
