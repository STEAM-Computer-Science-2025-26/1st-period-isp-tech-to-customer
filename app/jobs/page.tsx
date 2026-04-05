"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import { cn } from "@/lib/utils/index";
import { KpiCard } from "@/components/ui/Card";
import { JobDTO } from "@/app/types/types";
import FadeEnd from "@/components/ui/FadeEnd";
import { useJobs } from "@/lib/hooks/useJobs";
import {
	useOpenToCustomer,
	useOpenToJob,
	useOpenToJobOnMap
} from "@/lib/hooks/useOpenTo";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import JobsFilterDropdown from "./components/JobsFilterDropdown";
import {
	countActiveFilters,
	createEmptyJobsFilter,
	findFirstFilterMatch,
	toggleSet
} from "./components/jobsFilterUtils";
import { formatNumericDate } from "@/lib/utils";
import {
	ChevronRight,
	ArrowUpDown,
	ArrowUp,
	ArrowDown
} from "lucide-react";
import { FilterSearchBar } from "@/components/ui/FilterSearchBar";
import { APIProvider } from "@vis.gl/react-google-maps";
import { CopyCell } from "@/components/ui/CopyCell";
import {
	StatusBadge,
	PriorityBadge,
	stripZipCode
} from "@/components/panels/JobDetailPanel";
import { JobDetailDrawer } from "@/components/jobs/JobDetailDrawer";

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

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

const JobsPageContent = () => {
	const {
		data: jobs = [],
		isLoading: jobsLoading,
		error: jobsError
	} = useJobs();
	const { data: customers = [] } = useCustomers();
	const router = useRouter();
	const openToCustomer = useOpenToCustomer();
	const openToJob = useOpenToJob();
	const openToJobOnMap = useOpenToJobOnMap();
	const searchParams = useSearchParams();
	const [searchQuery, setSearchQuery] = useState("");
	const [filterQuery, setFilterQuery] = useState("");
	const [filters, setFilters] = useState(createEmptyJobsFilter());
	const [filterOpen, setFilterOpen] = useState(false);
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const [sidePanelOpen, setSidePanelOpen] = useState(false);
	type SortKey =
		| "customerName"
		| "address"
		| "jobType"
		| "status"
		| "priority"
		| "scheduledTime"
		| "createdAt"
		| null;
	const [sortKey, setSortKey] = useState<SortKey>(null);
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
	const [prevSort, setPrevSort] = useState<{
		key: SortKey;
		direction: "asc" | "desc";
	}>({ key: null, direction: "asc" });

	const handleSort = (key: NonNullable<SortKey>) => {
		if (sortKey !== key) {
			setPrevSort({ key: sortKey, direction: sortDirection });
			setSortKey(key);
			setSortDirection("asc");
		} else if (sortDirection === "asc") {
			setSortDirection("desc");
		} else {
			setSortKey(prevSort.key);
			setSortDirection(prevSort.direction);
		}
	};

	// Deep-link support: ?job=<id>&view=panel|full
	useEffect(() => {
		const jobId = searchParams.get("job");
		if (!jobId) return;
		const view = searchParams.get("view");
		if (view === "full") {
			router.replace(`/jobs/${jobId}`);
			return;
		}
		setSelectedJobId(jobId);
		setSidePanelOpen(true);
		router.replace("/jobs", { scroll: false });
	}, [searchParams, router]);

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
		const needle = searchQuery.trim().toLowerCase();
		const base = jobs.filter((job) => {
			if (filters.statuses.size > 0 && !filters.statuses.has(job.status)) {
				return false;
			}
			if (
				filters.priorities.size > 0 &&
				!filters.priorities.has(job.priority)
			) {
				return false;
			}
			if (filters.jobTypes.size > 0 && !filters.jobTypes.has(job.jobType)) {
				return false;
			}

			if (!needle) return true;

			return [job.customerName, job.address, job.phone, job.jobType]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(needle));
		});

		if (!sortKey) return base;

		const statusOrder: JobDTO["status"][] = [
			"unassigned",
			"assigned",
			"in_progress",
			"completed",
			"cancelled"
		];
		const priorityOrder: JobDTO["priority"][] = [
			"emergency",
			"high",
			"medium",
			"low"
		];
		const direction = sortDirection === "asc" ? 1 : -1;
		const sorted = [...base].sort((a, b) => {
			switch (sortKey) {
				case "customerName":
					return a.customerName.localeCompare(b.customerName) * direction;
				case "address":
					return (
						stripZipCode(a.address).localeCompare(stripZipCode(b.address)) *
						direction
					);
				case "jobType":
					return a.jobType.localeCompare(b.jobType) * direction;
				case "status":
					return (
						(statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)) *
						direction
					);
				case "priority":
					return (
						(priorityOrder.indexOf(a.priority) -
							priorityOrder.indexOf(b.priority)) *
						direction
					);
				case "scheduledTime": {
					const aTime = a.scheduledTime
						? new Date(a.scheduledTime).getTime()
						: 0;
					const bTime = b.scheduledTime
						? new Date(b.scheduledTime).getTime()
						: 0;
					return (aTime - bTime) * direction;
				}
				case "createdAt": {
					const aTime = new Date(a.createdAt).getTime();
					const bTime = new Date(b.createdAt).getTime();
					return (aTime - bTime) * direction;
				}
				default:
					return 0;
			}
		});
		return sorted;
	}, [jobs, searchQuery, filters, sortKey, sortDirection]);

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
	const activeFilterCount = countActiveFilters(filters);

	useEffect(() => {
		if (!filterOpen) {
			setFilterQuery("");
		}
	}, [filterOpen]);

	const handleFilterSubmit = (query: string) => {
		const match = findFirstFilterMatch(query);
		if (!match) return;

		setFilters((current) => {
			switch (match.type) {
				case "status":
					return {
						...current,
						statuses: toggleSet(current.statuses, match.value)
					};
				case "priority":
					return {
						...current,
						priorities: toggleSet(current.priorities, match.value)
					};
				case "jobType":
					return {
						...current,
						jobTypes: toggleSet(current.jobTypes, match.value)
					};
			}
		});
	};

	const handleRowClick = (jobId: string) => {
		setSelectedJobId(jobId);
		setSidePanelOpen(true);
		openToJob(jobId, "panel");
	};

	const resolveCustomerIdForJob = useCallback(
		(job: JobDTO): string | null => {
			const normalize = (value: string) => value.trim().toLowerCase();
			const normalizePhone = (value: string) => value.replace(/\D/g, "");

			const normalizedJobName = normalize(job.customerName ?? "");
			if (!normalizedJobName) return null;

			const nameMatches = customers.filter((customer) => {
				const fullName = `${customer.firstName} ${customer.lastName}`;
				return normalize(fullName) === normalizedJobName;
			});

			if (nameMatches.length === 0) return null;
			if (nameMatches.length === 1) return nameMatches[0]?.id ?? null;

			const normalizedJobPhone = normalizePhone(job.phone ?? "");
			if (normalizedJobPhone) {
				const phoneMatch = nameMatches.find(
					(customer) =>
						normalizePhone(customer.phone ?? "") === normalizedJobPhone
				);
				if (phoneMatch) return phoneMatch.id;
			}

			const normalizedJobAddress = normalize(stripZipCode(job.address ?? ""));
			const addressMatch = nameMatches.find((customer) => {
				const customerAddress = normalize(
					stripZipCode(
						`${customer.address}, ${customer.city}, ${customer.state}`
					)
				);
				return customerAddress === normalizedJobAddress;
			});

			return addressMatch?.id ?? nameMatches[0]?.id ?? null;
		},
		[customers]
	);

	const selectedJob = useMemo(
		() => jobs.find((job) => job.id === selectedJobId) ?? null,
		[jobs, selectedJobId]
	);

	const selectedCustomerId = useMemo(
		() => (selectedJob ? resolveCustomerIdForJob(selectedJob) : null),
		[selectedJob, resolveCustomerIdForJob]
	);

	const copyToClipboard = async (text: string) => {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Clipboard can be blocked by browser permissions/user settings.
		}
	};

	return (
		<APIProvider apiKey={MAPS_API_KEY} libraries={["places"]}>
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

				<div className="mx-2 rounded-xl flex flex-col gap-3">
					<FilterSearchBar
						doubleSearch
						searchQuery={searchQuery}
						onSearchChange={setSearchQuery}
						searchPlaceholder="Search customer, address, phone, or job type"
						filterOpen={filterOpen}
						onFilterOpenChange={setFilterOpen}
						activeFilterCount={activeFilterCount}
						onClearFilters={() => {
							setSearchQuery("");
							setFilterQuery("");
							setFilters(createEmptyJobsFilter());
						}}
						filterQuery={filterQuery}
						onFilterQueryChange={setFilterQuery}
						onFilterQuerySubmit={handleFilterSubmit}
						filterDropdown={
							<JobsFilterDropdown
								searchQuery={filterQuery}
								value={filters}
								onChange={setFilters}
								onClear={() => setFilters(createEmptyJobsFilter())}
							/>
						}
						className="w-full lg:max-w-md"
					/>

					<div className="w-full rounded-xl border border-background-secondary bg-background-primary relative pt-12">
						<div
							className="border-b px-3 border-secondary/50 h-12 absolute top-0 inset-x-4 items-center grid grid-cols-[1.4fr_1.8fr_0.9fr_0.9fr_0.8fr_1fr_1fr_1.5rem]"
							role="row"
						>
							{(
								[
									{ label: "Customer", key: "customerName" },
									{ label: "Address", key: "address" },
									{ label: "Type", key: "jobType" },
									{ label: "Status", key: "status" },
									{ label: "Priority", key: "priority" },
									{ label: "Scheduled", key: "scheduledTime" },
									{ label: "Created", key: "createdAt" },
									{ label: "", key: null }
								] as const
							).map((col) => (
								<div
									key={col.label}
									role="columnheader"
									className="text-sm font-medium text-foreground/60"
								>
									{col.key ? (
										<button
											type="button"
											onClick={() => handleSort(col.key)}
											className="group flex items-center gap-1.5 hover:text-foreground/80 transition-colors"
											aria-label={`Sort by ${col.label}`}
										>
											<span>{col.label}</span>
											<span
												className={cn(
													"text-text-tertiary transition-opacity",
													sortKey === col.key
														? "opacity-100"
														: "opacity-0 group-hover:opacity-100"
												)}
											>
												{sortKey === col.key ? (
													sortDirection === "asc" ? (
														<ArrowUp className="w-3 h-3" />
													) : (
														<ArrowDown className="w-3 h-3" />
													)
												) : (
													<ArrowUpDown className="w-3 h-3" />
												)}
											</span>
										</button>
									) : null}
								</div>
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
							{filteredJobs.map((job) => {
								const customerId = resolveCustomerIdForJob(job);

								return (
									<li
										key={job.id}
										className={cn(
											"grid group grid-cols-[1.4fr_1.8fr_0.9fr_0.9fr_0.8fr_1fr_1fr_1.5rem] items-center px-4 py-3 cursor-pointer hover:bg-background-secondary/30 first:rounded-t-lg last:rounded-b-lg transition-colors",
											selectedJobId === job.id && "bg-accent-main/10"
										)}
										role="row"
										onClick={() => handleRowClick(job.id)}
										title="Open job details in the side panel"
									>
										<div role="cell" className="min-w-0">
											<button
												type="button"
												onClick={(event) => {
													if (!customerId) return;
													event.stopPropagation();
													openToCustomer(customerId, "panel");
												}}
												className={cn(
													"w-full truncate text-left text-sm font-medium transition-colors",
													customerId
														? "cursor-pointer text-text-main hover:text-accent-text"
														: "text-text-main"
												)}
												title={
													customerId
														? "Open customer detail panel"
														: "Customer not found"
												}
											>
												{job.customerName}
											</button>
										</div>
										<div role="cell" className="min-w-0">
											<button
												type="button"
												onClick={(event) => {
													event.stopPropagation();
													openToJobOnMap(job.id);
												}}
												className="w-full cursor-pointer truncate text-left text-sm text-text-secondary transition-colors hover:text-accent-text"
												title="Open this job location on the map"
											>
												{stripZipCode(job.address)}
											</button>
										</div>
										<div
											role="cell"
											className="text-sm capitalize text-text-secondary group-hover:text-text-main transition-colors"
										>
											{job.jobType.replaceAll("_", " ")}
										</div>
										<div role="cell">
											<StatusBadge status={job.status} />
										</div>
										<div role="cell">
											<PriorityBadge priority={job.priority} />
										</div>
										<CopyCell
											value={formatNumericDate(job.scheduledTime)}
											copyText={formatNumericDate(job.scheduledTime)}
											className="text-xs text-text-secondary"
											textClassName="truncate"
											ariaLabel="Copy scheduled date"
											onCopy={copyToClipboard}
										/>
										<CopyCell
											value={formatNumericDate(job.createdAt)}
											copyText={formatNumericDate(job.createdAt)}
											className="text-xs text-text-tertiary"
											textClassName="truncate"
											ariaLabel="Copy created date"
											onCopy={copyToClipboard}
										/>
										<div role="cell" className="flex items-center justify-end">
											<button
												type="button"
												onClick={(event) => {
													event.stopPropagation();
													handleRowClick(job.id);
												}}
												className="inline-flex cursor-pointer items-center justify-center text-text-tertiary transition-colors hover:text-text-main"
												title="Open job detail panel"
											>
												<ChevronRight className="w-4 h-4 group-hover:scale-175 transition-transform" />
											</button>
										</div>
									</li>
								);
							})}
						</ul>
					</div>

					<div className="text-xs text-text-tertiary px-1">
						Showing {filteredJobs.length} of {jobs.length} jobs
					</div>
				</div>
				{jobsError && (
					<p className={cn("mx-2 text-sm text-red-600")}>{jobsError.message}</p>
				)}
			</MainContent>
			<SidePanel isOpen={sidePanelOpen} onOpenChange={setSidePanelOpen}>
				<JobDetailDrawer
					jobId={selectedJobId}
					customerId={selectedCustomerId}
					onOpenFull={() => {
						if (!selectedJobId) return;
						openToJob(selectedJobId, "full");
						setSidePanelOpen(false);
					}}
					onClose={() => setSidePanelOpen(false)}
				/>
			</SidePanel>
		</APIProvider>
	);
};

export default function JobsPage() {
	return (
		<Suspense fallback={null}>
			<JobsPageContent />
		</Suspense>
	);
}
