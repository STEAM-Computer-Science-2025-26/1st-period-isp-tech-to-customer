"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import { cn } from "@/lib/utils/index";
import { KpiCard } from "@/components/ui/Card";
import { JobDTO } from "@/app/types/types";
import FadeEnd from "@/components/ui/FadeEnd";
import { useJobs } from "@/lib/hooks/useJobs";
import { useJob } from "@/lib/hooks/useJob";
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
import {
	formatReadableDateTime,
	formatNumericDate,
	formatPhoneNumber
} from "@/lib/utils";
import CustomSelect from "@/components/ui/CustomSelect";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";
import {
	Search,
	MapPin,
	Phone,
	Clock,
	Wrench,
	ChevronRight,
	RefreshCw,
	AlertCircle,
	SlidersHorizontal,
	Copy,
	Check,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	ExternalLink,
	Pencil,
	X,
	Hammer,
	Settings2,
	ScanSearch,
	Calendar
} from "lucide-react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { PopoverDatePicker } from "@/components/ui/DateRangePicker";
import { CopyCell } from "@/components/ui/CopyCell";

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
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
			{status.replaceAll("_", " ")}
		</span>
	);
}

function PriorityBadge({ priority }: { priority: JobDTO["priority"] }) {
	const classes: Record<JobDTO["priority"], string> = {
		low: "text-text-secondary",
		medium: "text-accent-text",
		high: "text-warning-foreground",
		emergency: "text-destructive-foreground"
	};

	return (
		<span className={cn("text-xs font-semibold capitalize", classes[priority])}>
			{priority}
		</span>
	);
}

function stripZipCode(address: string): string {
	return address.replace(/\s*\b\d{5}(?:-\d{4})?\b\s*$/, "").trim();
}

function parseTimeFromISO(iso: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (isNaN(d.getTime())) return "";
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function applyTimeToISO(dateISO: string, time: string): string {
	if (!dateISO) return "";
	const [h = 0, m = 0] = time.split(":").map(Number);
	const d = new Date(dateISO);
	if (isNaN(d.getTime())) return "";
	d.setHours(h, m, 0, 0);
	return d.toISOString();
}

function JobDetailPanel({
	jobId,
	onOpenFull
}: {
	jobId: string | null;
	onOpenFull: () => void;
}) {
	const { data: job, isLoading, error, refetch, isFetching } = useJob(jobId);
	const openToJobOnMap = useOpenToJobOnMap();
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState({
		customerName: "",
		address: "",
		phone: "",
		jobType: "",
		status: "unassigned" as JobDTO["status"],
		priority: "low" as JobDTO["priority"],
		scheduledTime: "",
		createdAt: "",
		completedAt: "",
		initialNotes: "",
		completionNotes: ""
	});
	const [localOverride, setLocalOverride] = useState<JobDTO | null>(null);
	const [openPicker, setOpenPicker] = useState<
		"scheduled" | "created" | "completed" | null
	>(null);
	const scheduledRef = useRef<HTMLButtonElement>(null);
	const createdRef = useRef<HTMLButtonElement>(null);
	const completedRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!job) return;
		setIsEditing(false);
		setLocalOverride(null);
		setDraft({
			customerName: job.customerName ?? "",
			address: job.address ?? "",
			phone: formatPhoneNumber(job.phone ?? ""),
			jobType: job.jobType ?? "",
			status: job.status,
			priority: job.priority,
			scheduledTime: job.scheduledTime ?? "",
			createdAt: job.createdAt ?? "",
			completedAt: job.completedAt ?? "",
			initialNotes: job.initialNotes ?? "",
			completionNotes: job.completionNotes ?? ""
		});
	}, [job]);

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

	const displayJob = isEditing
		? { ...job, ...draft }
		: localOverride
			? localOverride
			: job;

	const handleCancelEdit = () => {
		if (!displayJob) return;
		setIsEditing(false);
		setDraft({
			customerName: displayJob.customerName ?? "",
			address: displayJob.address ?? "",
			phone: displayJob.phone ?? "",
			jobType: displayJob.jobType ?? "",
			status: displayJob.status,
			priority: displayJob.priority,
			scheduledTime: displayJob.scheduledTime ?? "",
			createdAt: displayJob.createdAt ?? "",
			completedAt: displayJob.completedAt ?? "",
			initialNotes: displayJob.initialNotes ?? "",
			completionNotes: displayJob.completionNotes ?? ""
		});
	};

	const handleSaveEdit = () => {
		if (!job) return;
		setLocalOverride({
			...job,
			customerName: draft.customerName,
			address: draft.address,
			phone: draft.phone.replace(/\D/g, ""),
			jobType: draft.jobType as JobDTO["jobType"],
			status: draft.status,
			priority: draft.priority,
			scheduledTime: draft.scheduledTime || null,
			createdAt: draft.createdAt || job.createdAt,
			completedAt: draft.completedAt || null,
			initialNotes: draft.initialNotes,
			completionNotes: draft.completionNotes
		});
		setIsEditing(false);
	};

	return (
		<div className="h-full flex flex-col">
			<div className="px-4 py-3 border-b border-background-secondary flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-xs mb-1 text-text-tertiary uppercase tracking-wide">
						Job
					</p>
					{isEditing ? (
						<input
							value={draft.customerName}
							onChange={(event) =>
								setDraft((prev) => ({
									...prev,
									customerName: event.target.value
								}))
							}
							className="w-full rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-sm font-semibold text-text-main focus:outline-none focus:border-accent-main/50"
						/>
					) : (
						<h3 className="text-sm font-semibold text-text-main truncate">
							{displayJob.customerName}
						</h3>
					)}
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={onOpenFull}
						className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
						title="Open full page"
					>
						<ExternalLink className="w-4 h-4" />
					</button>
					<button
						onClick={() => void refetch()}
						disabled={isFetching}
						className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors disabled:opacity-60"
						title="Refresh details"
					>
						<RefreshCw
							className={cn("w-4 h-4", isFetching && "animate-spin")}
						/>
					</button>
					{isEditing ? (
						<>
							<button
								onClick={handleSaveEdit}
								className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
								title="Save edits"
							>
								<Check className="w-4 h-4" />
							</button>
							<button
								onClick={handleCancelEdit}
								className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
								title="Cancel edits"
							>
								<X className="w-4 h-4" />
							</button>
						</>
					) : (
						<button
							onClick={() => setIsEditing(true)}
							className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
							title="Edit details"
						>
							<Pencil className="w-4 h-4" />
						</button>
					)}
				</div>
			</div>

			<div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-h-0">
				<div className="flex items-center gap-2 flex-wrap">
					{isEditing ? (
						<>
							<CustomSelect
								value={draft.status}
								onChange={(value) =>
									setDraft((prev) => ({
										...prev,
										status: value as JobDTO["status"]
									}))
								}
								options={[
									{ value: "unassigned", label: "Unassigned" },
									{ value: "assigned", label: "Assigned" },
									{ value: "in_progress", label: "In Progress" },
									{ value: "completed", label: "Completed" },
									{ value: "cancelled", label: "Cancelled" }
								]}
							/>
							<CustomSelect
								value={draft.priority}
								onChange={(value) =>
									setDraft((prev) => ({
										...prev,
										priority: value as JobDTO["priority"]
									}))
								}
								options={[
									{ value: "emergency", label: "Emergency" },
									{ value: "high", label: "High" },
									{ value: "medium", label: "Medium" },
									{ value: "low", label: "Low" }
								]}
							/>
							<CustomSelect
								value={draft.jobType as JobDTO["jobType"]}
								onChange={(value) =>
									setDraft((prev) => ({
										...prev,
										jobType: value
									}))
								}
								options={[
									{
										value: "installation",
										label: "Installation",
										icon: <Hammer className="w-3 h-3" />
									},
									{
										value: "repair",
										label: "Repair",
										icon: <Wrench className="w-3 h-3" />
									},
									{
										value: "maintenance",
										label: "Maintenance",
										icon: <Settings2 className="w-3 h-3" />
									},
									{
										value: "inspection",
										label: "Inspection",
										icon: <ScanSearch className="w-3 h-3" />
									}
								]}
							/>
						</>
					) : (
						<>
							<StatusBadge status={displayJob.status} />
							<PriorityBadge priority={displayJob.priority} />
							<span className="text-xs text-text-tertiary capitalize flex items-center gap-1">
								<Wrench className="w-3 h-3" />
								{displayJob.jobType.replaceAll("_", " ")}
							</span>
						</>
					)}
				</div>

				<div className="space-y-3 text-sm">
					<div className="flex items-start gap-2 text-text-secondary">
						<MapPin className="w-4 h-4 mt-0.5 text-text-tertiary" />
						{isEditing ? (
							<AddressAutocomplete
								value={draft.address}
								onChange={(value) =>
									setDraft((prev) => ({ ...prev, address: value }))
								}
								className="flex-1"
							/>
						) : (
							<button
								type="button"
								onClick={() => openToJobOnMap(displayJob.id)}
								className="text-left cursor-pointer transition-colors hover:text-text-main"
								title="Open this job location on the map"
							>
								{displayJob.address}
							</button>
						)}
					</div>
					<div className="flex items-center gap-2 text-text-secondary">
						<Phone className="w-4 h-4 text-text-tertiary" />
						{isEditing ? (
							<input
								value={draft.phone}
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										phone: formatPhoneNumber(event.target.value)
									}))
								}
								inputMode="tel"
								placeholder="(555)-123-4567"
								className="flex-1 rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-sm text-text-main focus:outline-none focus:border-accent-main/50"
							/>
						) : (
							<span>{formatPhoneNumber(displayJob.phone ?? "")}</span>
						)}
					</div>
					<div className="flex items-center gap-2 text-text-secondary">
						<Clock className="w-4 h-4 text-text-tertiary" />
						{isEditing ? (
							<>
								<button
									ref={scheduledRef}
									type="button"
									onClick={() =>
										setOpenPicker((p) =>
											p === "scheduled" ? null : "scheduled"
										)
									}
									className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-sm text-text-main hover:border-accent-main/50"
								>
									<span>
										{draft.scheduledTime
											? formatReadableDateTime(draft.scheduledTime)
											: "Not set"}
									</span>
									<Calendar className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />
								</button>
								<PopoverDatePicker
									open={openPicker === "scheduled"}
									onOpenChange={(open) =>
										setOpenPicker(open ? "scheduled" : null)
									}
									anchorEl={scheduledRef.current}
									mode="single"
									showHeader={false}
									selection={{ start: draft.scheduledTime || undefined }}
									onChange={({ start }) =>
										setDraft((prev) => ({
											...prev,
											scheduledTime: start
												? applyTimeToISO(
														start,
														parseTimeFromISO(prev.scheduledTime) || "09:00"
													)
												: ""
										}))
									}
									time={parseTimeFromISO(draft.scheduledTime)}
									onTimeChange={(time) =>
										setDraft((prev) => ({
											...prev,
											scheduledTime: prev.scheduledTime
												? applyTimeToISO(prev.scheduledTime, time)
												: ""
										}))
									}
								/>
							</>
						) : (
							<span>
								Scheduled: {formatReadableDateTime(displayJob.scheduledTime)}
							</span>
						)}
					</div>
					<div className="text-text-secondary text-xs">
						{isEditing ? (
							<div className="flex items-center gap-2">
								<span className="shrink-0 text-text-tertiary">Created:</span>
								<button
									ref={createdRef}
									type="button"
									onClick={() =>
										setOpenPicker((p) => (p === "created" ? null : "created"))
									}
									className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-xs text-text-main hover:border-accent-main/50"
								>
									<span>
										{draft.createdAt
											? formatReadableDateTime(draft.createdAt)
											: "Not set"}
									</span>
									<Calendar className="w-3 h-3 shrink-0 text-text-tertiary" />
								</button>
								<PopoverDatePicker
									open={openPicker === "created"}
									onOpenChange={(open) =>
										setOpenPicker(open ? "created" : null)
									}
									anchorEl={createdRef.current}
									mode="single"
									showHeader={false}
									selection={{ start: draft.createdAt || undefined }}
									onChange={({ start }) =>
										setDraft((prev) => ({
											...prev,
											createdAt: start
												? applyTimeToISO(
														start,
														parseTimeFromISO(prev.createdAt) || "00:00"
													)
												: ""
										}))
									}
									time={parseTimeFromISO(draft.createdAt)}
									onTimeChange={(time) =>
										setDraft((prev) => ({
											...prev,
											createdAt: prev.createdAt
												? applyTimeToISO(prev.createdAt, time)
												: ""
										}))
									}
								/>
							</div>
						) : (
							<>Created: {formatReadableDateTime(displayJob.createdAt)}</>
						)}
					</div>
					{(displayJob.completedAt || isEditing) && (
						<div className="text-text-secondary text-xs">
							{isEditing ? (
								<div className="flex flex-col gap-2">
									<label className="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={draft.completedAt !== ""}
											onChange={(e) =>
												setDraft((prev) => ({
													...prev,
													completedAt: e.target.checked
														? new Date().toISOString()
														: ""
												}))
											}
											className="accent-accent-main rounded"
										/>
										<span className="text-text-tertiary">Completed</span>
									</label>
									{draft.completedAt !== "" && (
										<div className="flex items-center gap-2">
											<button
												ref={completedRef}
												type="button"
												onClick={() =>
													setOpenPicker((p) =>
														p === "completed" ? null : "completed"
													)
												}
												className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-xs text-text-main hover:border-accent-main/50"
											>
												<span>{formatReadableDateTime(draft.completedAt)}</span>
												<Calendar className="w-3 h-3 shrink-0 text-text-tertiary" />
											</button>
											<PopoverDatePicker
												open={openPicker === "completed"}
												onOpenChange={(open) =>
													setOpenPicker(open ? "completed" : null)
												}
												anchorEl={completedRef.current}
												mode="single"
												showHeader={false}
												selection={{ start: draft.completedAt || undefined }}
												onChange={({ start }) =>
													setDraft((prev) => ({
														...prev,
														completedAt: start
															? applyTimeToISO(
																	start,
																	parseTimeFromISO(prev.completedAt) || "00:00"
																)
															: ""
													}))
												}
												time={parseTimeFromISO(draft.completedAt)}
												onTimeChange={(time) =>
													setDraft((prev) => ({
														...prev,
														completedAt: prev.completedAt
															? applyTimeToISO(prev.completedAt, time)
															: ""
													}))
												}
											/>
										</div>
									)}
								</div>
							) : (
								<>Completed: {formatReadableDateTime(displayJob.completedAt)}</>
							)}
						</div>
					)}
				</div>

				<div className="rounded-xl flex flex-col gap-2 flex-1 min-h-0">
					<p className="text-xs uppercase tracking-wide text-text-tertiary">
						Notes
					</p>
					{isEditing ? (
						<>
							<textarea
								value={draft.initialNotes}
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										initialNotes: event.target.value
									}))
								}
								className="w-full flex-1 resize-none rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-2 text-sm text-text-main"
								placeholder="Initial notes"
							/>
							<textarea
								value={draft.completionNotes}
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										completionNotes: event.target.value
									}))
								}
								className="w-full flex-1 resize-none rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-2 text-sm text-text-main"
								placeholder="Completion notes"
							/>
						</>
					) : (
						<>
							<p className="text-sm text-text-secondary whitespace-pre-wrap">
								{displayJob.initialNotes ?? "No initial notes."}
							</p>
							{displayJob.completionNotes && (
								<p className="text-sm text-text-secondary whitespace-pre-wrap border-t border-background-secondary pt-2">
									{displayJob.completionNotes}
								</p>
							)}
						</>
					)}
				</div>
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
	const filterActive = filterOpen;
	const searchMode = filterOpen ? "filters" : "jobs";

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
					(customer) => normalizePhone(customer.phone ?? "") === normalizedJobPhone
				);
				if (phoneMatch) return phoneMatch.id;
			}

			const normalizedJobAddress = normalize(stripZipCode(job.address ?? ""));
			const addressMatch = nameMatches.find((customer) => {
				const customerAddress = normalize(
					stripZipCode(`${customer.address}, ${customer.city}, ${customer.state}`)
				);
				return customerAddress === normalizedJobAddress;
			});

			return addressMatch?.id ?? nameMatches[0]?.id ?? null;
		},
		[customers]
	);

	const copyToClipboard = async (text: string) => {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const fallback = document.createElement("textarea");
			fallback.value = text;
			fallback.setAttribute("readonly", "true");
			fallback.style.position = "absolute";
			fallback.style.left = "-9999px";
			document.body.appendChild(fallback);
			fallback.select();
			document.execCommand("copy");
			document.body.removeChild(fallback);
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
					<div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:justify-between">
						<div className="relative w-full lg:max-w-md">
							<div className="flex w-full items-center gap-2">
								<div className="relative z-30 w-full">
									<Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
									<input
										type="text"
										value={searchMode === "filters" ? filterQuery : searchQuery}
										onChange={(event) => {
											const nextValue = event.target.value;
											if (searchMode === "filters") {
												setFilterQuery(nextValue);
											} else {
												setSearchQuery(nextValue);
											}
										}}
										onKeyDown={(event) => {
											if (searchMode === "filters" && event.key === "Enter") {
												event.preventDefault();
												handleFilterSubmit(filterQuery);
											}
										}}
										placeholder={
											searchMode === "filters"
												? "Search filters..."
												: "Search customer, address, phone, or job type"
										}
										className={cn(
											`w-full rounded-lg border border-background-secondary bg-background-primary pl-9 pr-3 py-2 text-sm text-text-main placeholder:text-text-tertiary focus:outline-none focus:border-accent-main/50`,
											searchMode === "filters"
												? "bg-transparent border-transparent focus:border-transparent"
												: ""
										)}
									/>
								</div>
								<button
									onClick={() => setFilterOpen((value) => !value)}
									title="Toggle job filters"
									className={cn(
										"relative z-30 flex size-10 shrink-0 items-center justify-center rounded-lg",
										filterActive
											? "border-transparent bg-primary text-primary-foreground"
											: "border border-accent-text/30 bg-background-primary text-text-secondary backdrop-blur-md transition-colors hover:bg-background-secondary/50 hover:text-text-primary"
									)}
								>
									<SlidersHorizontal className="size-4" />
									{activeFilterCount > 0 ? (
										<span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-background-secondary bg-accent-main/50 text-[10px] font-bold text-primary-foreground">
											{activeFilterCount}
										</span>
									) : null}
								</button>
							</div>

							{filterOpen ? (
								<JobsFilterDropdown
									className="absolute left-0 top-[calc(100%+0.5rem)] w-full"
									searchQuery={filterQuery}
									value={filters}
									onChange={setFilters}
									onClear={() => setFilters(createEmptyJobsFilter())}
								/>
							) : null}
						</div>

						<button
							onClick={() => {
								setSearchQuery("");
								setFilterQuery("");
								setFilters(createEmptyJobsFilter());
							}}
							className="self-start rounded-lg border border-background-secondary px-2.5 py-2 text-xs text-text-secondary hover:bg-background-secondary transition-colors lg:self-auto"
						>
							Clear
						</button>
					</div>

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
				<JobDetailPanel
					jobId={selectedJobId}
					onOpenFull={() => {
						if (!selectedJobId) return;
						openToJob(selectedJobId, "full");
						setSidePanelOpen(false);
					}}
				/>
			</SidePanel>
		</APIProvider>
	);
};

export default JobsPage;
