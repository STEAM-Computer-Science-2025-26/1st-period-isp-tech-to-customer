"use client";

import { useMemo, useState } from "react";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import { cn } from "@/lib/utils/index";
import { KpiCard } from "@/components/ui/Card";
import { JobDTO } from "@/app/types/types";
import FadeEnd from "@/components/ui/FadeEnd";
import { useJobs } from "@/lib/hooks/useJobs";
import { useJob } from "@/lib/hooks/useJob";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
	formatReadableDate,
	formatReadableDateTime,
	formatRelativeTime
} from "@/lib/utils";
import {
	Search,
	Filter,
	MapPin,
	Phone,
	Clock,
	Wrench,
	ChevronRight,
	RefreshCw,
	AlertCircle
} from "lucide-react";
import { useRouter } from "next/navigation";

type DashboardAnalyticsResponse = {
	jobsToday: number;
	avgResponseMinutes: number | null;
	counts: {
		openJobs: number;
	};
	statusCounts: {
		unassigned: number;
		inProgress: number;
		scheduledNext24: number;
	};
};

type JobKpiResponse = {
	days: number;
	kpis: {
		total_jobs: string | number;
		completed: string | number;
		completion_rate_pct: string | number | null;
		avg_actual_duration: string | number | null;
	};
};

function StatusBadge({ status }: { status: JobDTO["status"] }) {
	const classes: Record<JobDTO["status"], string> = {
		unassigned:
			"bg-background-secondary text-text-tertiary border border-background-secondary",
		assigned:
			"bg-info-background/15 text-info-text border border-info-foreground/30",
		in_progress:
			"bg-accent-main/10 text-accent-text border border-accent-main/30",
		completed:
			"bg-success-background/15 text-success-text border border-success-foreground/30",
		cancelled:
			"bg-destructive-background/15 text-destructive-text border border-destructive-foreground/30"
	};

	return (
		<span
			className={cn(
				"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
				classes[status]
			)}
		>
			{status.replace("_", " ")}
		</span>
	);
}

function PriorityBadge({ priority }: { priority: JobDTO["priority"] }) {
	const classes: Record<JobDTO["priority"], string> = {
		low: "text-text-secondary",
		medium: "text-accent-text",
		high: "text-warning-text",
		emergency: "text-destructive-text"
	};

	return (
		<span className={cn("text-xs font-semibold capitalize", classes[priority])}>
			{priority}
		</span>
	);
}

function JobDetailPanel({
	jobId,
	onOpenFull
}: {
	jobId: string | null;
	onOpenFull: () => void;
}) {
	const {
		data: job,
		isLoading,
		error,
		refetch,
		isFetching
	} = useJob(jobId ?? "");

	if (!jobId) {
		return (
			<div className="h-full flex items-center justify-center p-5 text-sm text-text-tertiary">
				Select a job to view details.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="h-full flex items-center justify-center p-5 text-sm text-text-tertiary">
				Loading job details...
			</div>
		);
	}

	if (error || !job) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-5 gap-3 text-sm text-destructive-text">
				<AlertCircle className="w-5 h-5" />
				<p>Failed to load job details.</p>
				<button
					onClick={() => void refetch()}
					className="px-3 py-1.5 rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
				>
					Retry
				</button>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			<div className="px-5 py-4 border-b border-background-secondary flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-xs text-text-tertiary uppercase tracking-wide">
						Job
					</p>
					<h3 className="text-sm font-semibold text-text-main truncate">
						{job.customerName}
					</h3>
				</div>
				<button
					onClick={onOpenFull}
					className="text-xs px-2.5 py-1 rounded-lg bg-accent-main text-white hover:opacity-90 transition-opacity"
				>
					Open Full Page
				</button>
			</div>

			<div className="flex-1 overflow-y-auto p-5 space-y-4">
				<div className="flex items-center gap-2 flex-wrap">
					<StatusBadge status={job.status} />
					<PriorityBadge priority={job.priority} />
					<span className="text-xs text-text-tertiary capitalize flex items-center gap-1">
						<Wrench className="w-3 h-3" />
						{job.jobType.replace("_", " ")}
					</span>
				</div>

				<div className="space-y-3 text-sm">
					<div className="flex items-start gap-2 text-text-secondary">
						<MapPin className="w-4 h-4 mt-0.5 text-text-tertiary" />
						<span>{job.address}</span>
					</div>
					<div className="flex items-center gap-2 text-text-secondary">
						<Phone className="w-4 h-4 text-text-tertiary" />
						<span>{job.phone}</span>
					</div>
					<div className="flex items-center gap-2 text-text-secondary">
						<Clock className="w-4 h-4 text-text-tertiary" />
						<span>Scheduled: {formatReadableDateTime(job.scheduledTime)}</span>
					</div>
					<div className="text-text-secondary text-xs">
						Created: {formatReadableDateTime(job.createdAt)}
					</div>
					<div className="text-text-secondary text-xs">
						Completed: {formatReadableDateTime(job.completedAt)}
					</div>
				</div>

				<div className="rounded-xl border border-background-secondary bg-background-primary p-3 space-y-2">
					<p className="text-xs uppercase tracking-wide text-text-tertiary">
						Notes
					</p>
					<p className="text-sm text-text-secondary whitespace-pre-wrap">
						{job.initialNotes ?? "No initial notes."}
					</p>
					{job.completionNotes && (
						<p className="text-sm text-text-secondary whitespace-pre-wrap border-t border-background-secondary pt-2">
							{job.completionNotes}
						</p>
					)}
				</div>

				<button
					onClick={() => void refetch()}
					disabled={isFetching}
					className="w-full flex items-center justify-center gap-1.5 text-xs text-text-secondary border border-background-secondary rounded-lg py-2 hover:bg-background-secondary transition-colors disabled:opacity-60"
				>
					<RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
					Refresh Details
				</button>
			</div>
		</div>
	);
}

const JobsPage = () => {
	const {
		data: jobs = [],
		isLoading: jobsLoading,
		error: jobsError
	} = useJobs();
	const router = useRouter();
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<"all" | JobDTO["status"]>(
		"all"
	);
	const [priorityFilter, setPriorityFilter] = useState<
		"all" | JobDTO["priority"]
	>("all");
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const [sidePanelOpen, setSidePanelOpen] = useState(false);

	const { data: dashboardData } = useQuery({
		queryKey: ["jobs-page-dashboard-kpi"],
		queryFn: () =>
			apiFetch<DashboardAnalyticsResponse>("/analytics/dashboard?days=30")
	});

	const { data: jobKpiData } = useQuery({
		queryKey: ["jobs-page-job-kpi"],
		queryFn: () => apiFetch<JobKpiResponse>("/analytics/job-kpis?days=30")
	});

	const filteredJobs = useMemo(() => {
		const needle = search.trim().toLowerCase();

		return jobs.filter((job) => {
			if (statusFilter !== "all" && job.status !== statusFilter) return false;
			if (priorityFilter !== "all" && job.priority !== priorityFilter) {
				return false;
			}

			if (!needle) return true;

			return [job.customerName, job.address, job.phone, job.jobType]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(needle));
		});
	}, [jobs, search, statusFilter, priorityFilter]);

	const jobsToday = dashboardData?.jobsToday ?? 0;
	const unassigned = dashboardData?.statusCounts.unassigned ?? 0;
	const inProgress = dashboardData?.statusCounts.inProgress ?? 0;
	const completionRate =
		jobKpiData?.kpis.completion_rate_pct != null
			? `${Number(jobKpiData.kpis.completion_rate_pct).toFixed(1)}%`
			: "--";
	const avgDuration =
		jobKpiData?.kpis.avg_actual_duration != null
			? `${Math.round(Number(jobKpiData.kpis.avg_actual_duration))}m`
			: "--";

	const handleRowClick = (jobId: string) => {
		setSelectedJobId(jobId);
		setSidePanelOpen(true);
	};

	return (
		<>
			<MainContent className={cn(`flex flex-col gap-4`)}>
				<FadeEnd
					className={cn("h-48 w-full overflow-hidden")}
					orientation="horizontal"
					prefix="both"
					fromColorClass="from-background-main"
					sizeClass="w-8"
					wrapperClassName="flex px-2 flex-row h-full w-full overflow-x-auto no-scrollbar gap-3 bg-transparent"
				>
					<KpiCard
						title="Total Jobs Today"
						value={String(jobsToday)}
						meta="Today"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Unassigned"
						value={String(unassigned)}
						meta="Needs dispatch"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="In Progress"
						value={String(inProgress)}
						meta="Active jobs"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Completion Rate"
						value={completionRate}
						meta="Last 30 days"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Avg Duration"
						value={avgDuration}
						meta="Actual minutes"
						className={cn("w-xs shrink-0")}
					/>
				</FadeEnd>

				<div className="mx-2 rounded-xl border border-background-secondary bg-background-primary p-3 flex flex-col gap-3">
					<div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:justify-between">
						<div className="relative w-full lg:max-w-md">
							<Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
							<input
								type="text"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search customer, address, phone, or job type"
								className="w-full rounded-lg border border-background-secondary bg-background-main pl-9 pr-3 py-2 text-sm text-text-main placeholder:text-text-tertiary focus:outline-none focus:border-accent-main/50"
							/>
						</div>

						<div className="flex items-center gap-2 flex-wrap">
							<div className="inline-flex items-center gap-2 text-xs text-text-tertiary">
								<Filter className="w-3 h-3" />
								Filters
							</div>
							<select
								value={statusFilter}
								onChange={(event) =>
									setStatusFilter(event.target.value as typeof statusFilter)
								}
								className="rounded-lg border border-background-secondary bg-background-main px-2.5 py-2 text-xs text-text-main"
							>
								<option value="all">All Statuses</option>
								<option value="unassigned">Unassigned</option>
								<option value="assigned">Assigned</option>
								<option value="in_progress">In Progress</option>
								<option value="completed">Completed</option>
								<option value="cancelled">Cancelled</option>
							</select>
							<select
								value={priorityFilter}
								onChange={(event) =>
									setPriorityFilter(event.target.value as typeof priorityFilter)
								}
								className="rounded-lg border border-background-secondary bg-background-main px-2.5 py-2 text-xs text-text-main"
							>
								<option value="all">All Priorities</option>
								<option value="emergency">Emergency</option>
								<option value="high">High</option>
								<option value="medium">Medium</option>
								<option value="low">Low</option>
							</select>
							<button
								onClick={() => {
									setSearch("");
									setStatusFilter("all");
									setPriorityFilter("all");
								}}
								className="rounded-lg border border-background-secondary px-2.5 py-2 text-xs text-text-secondary hover:bg-background-secondary transition-colors"
							>
								Clear
							</button>
						</div>
					</div>

					<div className="text-xs text-text-tertiary px-1">
						Showing {filteredJobs.length} of {jobs.length} jobs
					</div>

					<div className="w-full rounded-xl border border-background-secondary bg-background-primary relative pt-12">
						<div className="border-b border-secondary/50 h-12 absolute top-0 inset-x-4 items-center grid grid-cols-[1.4fr_1.8fr_0.9fr_0.9fr_0.8fr_1fr_1fr_1.5rem]">
							{[
								"Customer",
								"Address",
								"Type",
								"Status",
								"Priority",
								"Scheduled",
								"Created",
								""
							].map((col) => (
								<p key={col} className="text-sm font-medium text-foreground/60">
									{col}
								</p>
							))}
						</div>

						<ul className="w-full divide-y divide-background-secondary/50 px-4 py-3">
							{jobsLoading && (
								<li className="text-xs text-text-tertiary py-3 px-4">
									Loading jobs...
								</li>
							)}
							{!jobsLoading && filteredJobs.length === 0 && (
								<li className="text-xs text-text-tertiary py-3 px-4">
									No jobs match the current filters.
								</li>
							)}
							{filteredJobs.map((job) => (
								<li
									key={job.id}
									className={cn(
										"grid grid-cols-[1.4fr_1.8fr_0.9fr_0.9fr_0.8fr_1fr_1fr_1.5rem] items-center px-4 py-3 cursor-pointer hover:bg-background-secondary/30 rounded-lg transition-colors",
										selectedJobId === job.id && "bg-accent-main/10"
									)}
									onClick={() => handleRowClick(job.id)}
								>
									<p className="text-sm font-medium text-text-main truncate">
										{job.customerName}
									</p>
									<p className="text-sm text-text-secondary truncate">
										{job.address}
									</p>
									<p className="text-sm capitalize text-text-secondary">
										{job.jobType.replace("_", " ")}
									</p>
									<StatusBadge status={job.status} />
									<PriorityBadge priority={job.priority} />
									<p className="text-xs text-text-secondary">
										{formatReadableDateTime(job.scheduledTime)}
									</p>
									<p className="text-xs text-text-tertiary">
										{formatReadableDate(job.createdAt)} (
										{formatRelativeTime(job.createdAt)})
									</p>
									<ChevronRight className="w-4 h-4 text-text-tertiary" />
								</li>
							))}
						</ul>
					</div>
				</div>
				{jobsError && (
					<p className={cn("mx-2 text-sm text-red-600")}>{jobsError.message}</p>
				)}
			</MainContent>
			<SidePanel isOpen={sidePanelOpen} onOpenChange={setSidePanelOpen}>
				<JobDetailPanel
					jobId={selectedJobId}
					onOpenFull={() => {
						if (!selectedJobId) return;
						router.push(`/jobs/${selectedJobId}`);
						setSidePanelOpen(false);
					}}
				/>
			</SidePanel>
		</>
	);
};

export default JobsPage;
