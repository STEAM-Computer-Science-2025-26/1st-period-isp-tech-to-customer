"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MainContent from "@/components/layout/MainContent";
import { apiFetch } from "@/lib/api";
import { cn, formatReadableDateTime, formatRelativeTime } from "@/lib/utils";
import {
	AlertCircle,
	CheckCircle2,
	ChevronRight,
	Clock,
	MapPin,
	Navigation,
	RefreshCw,
	Search,
	TriangleAlert,
	Users,
	Zap,
	Filter
} from "lucide-react";
import type { BatchPlan } from "@/app/dispatch/types";
import PriorityBadge from "@/app/dispatch/PriorityBadge";
import type { JobDTO, JobPriority } from "@/app/types/types";
import { useRouter, useSearchParams } from "next/navigation";
import type { DispatchRecommendation } from "@/lib/types/dispatch";
import { BATCH_PLAN_STORAGE_KEY } from "@/lib/constants/dispatch";

type BatchRecommendationResponse = {
	success: boolean;
	assignments: Array<{
		jobId: string;
		techId: string;
		techName: string;
		score: number;
		driveTimeMinutes: number;
	}>;
	unassigned: Array<{
		jobId: string;
		reason: string;
	}>;
	stats: {
		totalJobs: number;
		assigned: number;
		unassigned: number;
		durationMs: number;
	};
};

const PRIORITY_ORDER: Record<JobPriority, number> = {
	emergency: 0,
	high: 1,
	medium: 2,
	low: 3
};

function SingleDispatchPanel({
	job,
	onClose,
	onAssigned
}: {
	job: JobDTO;
	onClose: () => void;
	onAssigned: (jobId: string) => void;
}) {
	const [recommendation, setRecommendation] =
		useState<DispatchRecommendation | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [assigningTechId, setAssigningTechId] = useState<string | null>(null);
	const [overrideTechId, setOverrideTechId] = useState<string | null>(null);
	const [overrideReason, setOverrideReason] = useState("");
	const [dispatchingBest, setDispatchingBest] = useState(false);

	const fetchRecommendation = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await apiFetch<{
				recommendation: DispatchRecommendation;
			}>(`/jobs/${job.id}/recommendations`);
			setRecommendation(response.recommendation);
		} catch (fetchError) {
			setError(
				fetchError instanceof Error
					? fetchError.message
					: "Failed to fetch recommendations"
			);
		} finally {
			setLoading(false);
		}
	}, [job.id]);

	useEffect(() => {
		void fetchRecommendation();
	}, [fetchRecommendation]);

	const assignTech = async (techId: string, reason?: string) => {
		setAssigningTechId(techId);
		setError(null);
		try {
			await apiFetch(`/jobs/${job.id}/assign`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ techId, reason })
			});
			onAssigned(job.id);
		} catch (assignError) {
			setError(
				assignError instanceof Error ? assignError.message : "Assignment failed"
			);
		} finally {
			setAssigningTechId(null);
			setOverrideTechId(null);
			setOverrideReason("");
		}
	};

	const autoAssignRecommended = async () => {
		setDispatchingBest(true);
		setError(null);
		try {
			const response = await apiFetch<{
				recommendation: DispatchRecommendation;
				assigned: boolean;
			}>(`/jobs/${job.id}/dispatch`, {
				method: "POST"
			});

			if (response.assigned) {
				onAssigned(job.id);
				return;
			}

			setRecommendation(response.recommendation);
		} catch (dispatchError) {
			setError(
				dispatchError instanceof Error
					? dispatchError.message
					: "Auto dispatch failed"
			);
		} finally {
			setDispatchingBest(false);
		}
	};

	return (
		<div className="h-full flex flex-col">
			<div className="px-5 py-4 border-b border-background-secondary flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<PriorityBadge priority={job.priority} />
						<span className="text-xs text-text-tertiary capitalize">
							{job.jobType.replaceAll("_", " ")}
						</span>
					</div>
					<h2 className="text-sm font-semibold text-text-main truncate">
						{job.customerName}
					</h2>
					<p className="text-xs text-text-secondary mt-1 inline-flex items-center gap-1">
						<MapPin className="w-3 h-3" />
						{job.address}
					</p>
				</div>
				<button
					onClick={onClose}
					className="px-2 py-1 rounded-lg text-xs text-text-secondary border border-background-secondary hover:bg-background-secondary transition-colors"
				>
					Close
				</button>
			</div>

			<div className="flex-1 overflow-y-auto p-5 space-y-4">
				<button
					onClick={() => void autoAssignRecommended()}
					disabled={dispatchingBest}
					className="w-full rounded-lg bg-accent-main text-white text-sm font-medium py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
				>
					{dispatchingBest
						? "Running Dispatch..."
						: "Auto Assign Best Technician"}
				</button>

				{loading && (
					<div className="flex items-center justify-center gap-2 text-sm text-text-secondary py-8">
						<RefreshCw className="w-4 h-4 animate-spin" />
						Loading recommendations...
					</div>
				)}

				{error && (
					<div className="rounded-lg border border-destructive-background/30 bg-destructive-background/10 text-destructive-text px-3 py-2 text-sm inline-flex items-start gap-2">
						<AlertCircle className="w-4 h-4 mt-0.5" />
						<span>{error}</span>
					</div>
				)}

				{recommendation && !loading && (
					<>
						<div className="grid grid-cols-3 gap-2">
							<div className="rounded-lg border border-background-secondary bg-background-primary p-3 text-center">
								<p className="text-lg font-semibold text-text-main">
									{recommendation.totalEligibleTechs}
								</p>
								<p className="text-[11px] text-text-tertiary">Eligible</p>
							</div>
							<div className="rounded-lg border border-background-secondary bg-background-primary p-3 text-center">
								<p className="text-lg font-semibold text-text-main">
									{recommendation.recommendations.length}
								</p>
								<p className="text-[11px] text-text-tertiary">Ranked</p>
							</div>
							<div className="rounded-lg border border-background-secondary bg-background-primary p-3 text-center">
								<p className="text-sm font-semibold text-text-main capitalize">
									{recommendation.requiresManualDispatch
										? "Manual"
										: "Auto Ready"}
								</p>
								<p className="text-[11px] text-text-tertiary">Dispatch Mode</p>
							</div>
						</div>

						{recommendation.requiresManualDispatch && (
							<div className="rounded-lg border border-warning-foreground/30 bg-warning-background/20 text-warning-text px-3 py-2 text-xs inline-flex items-start gap-2">
								<TriangleAlert className="w-3.5 h-3.5 mt-0.5" />
								<span>
									{recommendation.manualDispatchReason ??
										"Manual assignment required for this job."}
								</span>
							</div>
						)}

						<div className="space-y-2">
							<p className="text-xs uppercase tracking-wide text-text-tertiary">
								Technician Recommendations
							</p>
							{recommendation.recommendations.map((tech, index) => {
								const isRecommended = index === 0;
								return (
									<div
										key={tech.techId}
										className={cn(
											"rounded-lg border p-3",
											isRecommended
												? "border-accent-main/40 bg-accent-main/10"
												: "border-background-secondary bg-background-primary"
										)}
									>
										<div className="flex items-start justify-between gap-2">
											<div>
												<p className="text-sm font-semibold text-text-main">
													{tech.techName}
												</p>
												<p className="text-xs text-text-tertiary mt-0.5">
													Score {tech.totalScore.toFixed(0)} ·{" "}
													{tech.distanceMiles.toFixed(1)} mi
												</p>
											</div>
											<button
												onClick={() => {
													if (isRecommended) {
														void assignTech(tech.techId);
														return;
													}
													setOverrideTechId(tech.techId);
												}}
												disabled={assigningTechId === tech.techId}
												className={cn(
													"text-xs px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-60",
													isRecommended
														? "bg-accent-main text-white hover:opacity-90"
														: "border border-background-secondary text-text-secondary hover:bg-background-secondary"
												)}
											>
												{assigningTechId === tech.techId
													? "Assigning..."
													: isRecommended
														? "Assign Best"
														: "Override"}
											</button>
										</div>

										{overrideTechId === tech.techId && (
											<div className="mt-3 pt-3 border-t border-background-secondary space-y-2">
												<textarea
													value={overrideReason}
													onChange={(event) =>
														setOverrideReason(event.target.value)
													}
													placeholder="Reason for override (required)"
													rows={2}
													className="w-full rounded-lg border border-background-secondary bg-background-main px-2.5 py-2 text-xs text-text-main placeholder:text-text-tertiary resize-none"
												/>
												<div className="flex gap-2">
													<button
														onClick={() => {
															setOverrideTechId(null);
															setOverrideReason("");
														}}
														className="flex-1 text-xs border border-background-secondary rounded-lg py-1.5 text-text-secondary hover:bg-background-secondary"
													>
														Cancel
													</button>
													<button
														onClick={() =>
															void assignTech(tech.techId, overrideReason)
														}
														disabled={overrideReason.trim().length < 10}
														className="flex-1 text-xs bg-accent-main text-white rounded-lg py-1.5 hover:opacity-90 disabled:opacity-50"
													>
														Confirm Override
													</button>
												</div>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

export default function DispatchPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [jobs, setJobs] = useState<JobDTO[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [priorityFilter, setPriorityFilter] = useState<"all" | JobPriority>(
		"all"
	);
	const [selectMode, setSelectMode] = useState(false);
	const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
	const [activeJobId, setActiveJobId] = useState<string | null>(null);
	const [batchPlan, setBatchPlan] = useState<BatchPlan | null>(null);
	const [batchLoading, setBatchLoading] = useState(false);
	const [batchAssigning, setBatchAssigning] = useState(false);
	const [batchError, setBatchError] = useState<string | null>(null);

	const loadJobs = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await apiFetch<{ jobs?: JobDTO[] }>(
				"/jobs?status=unassigned"
			);
			const fetchedJobs = [...(response.jobs ?? [])].sort((a, b) => {
				const priorityDiff =
					PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
				if (priorityDiff !== 0) return priorityDiff;
				return (
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
			});
			setJobs(fetchedJobs);
		} catch (fetchError) {
			setError(
				fetchError instanceof Error ? fetchError.message : "Failed to load jobs"
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadJobs();
	}, [loadJobs]);

	// Deep-link support: ?job=<id>
	useEffect(() => {
		const jobId = searchParams.get("job");
		if (!jobId) return;
		setActiveJobId(jobId);
		router.replace("/dispatch", { scroll: false });
	}, [searchParams, router]);

	const filteredJobs = useMemo(() => {
		const needle = search.trim().toLowerCase();
		return jobs.filter((job) => {
			if (priorityFilter !== "all" && job.priority !== priorityFilter)
				return false;
			if (!needle) return true;

			return [job.customerName, job.address, job.phone, job.jobType]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(needle));
		});
	}, [jobs, search, priorityFilter]);

	const activeJob = useMemo(
		() => jobs.find((job) => job.id === activeJobId) ?? null,
		[jobs, activeJobId]
	);

	const selectedCount = selectedJobIds.size;
	const allVisibleSelected =
		filteredJobs.length > 0 &&
		filteredJobs.every((job) => selectedJobIds.has(job.id));

	const toggleSelected = (jobId: string) => {
		setSelectedJobIds((current) => {
			const next = new Set(current);
			if (next.has(jobId)) {
				next.delete(jobId);
			} else {
				next.add(jobId);
			}
			return next;
		});
	};

	const toggleSelectAllVisible = () => {
		setSelectedJobIds((current) => {
			const next = new Set(current);
			if (allVisibleSelected) {
				filteredJobs.forEach((job) => next.delete(job.id));
				return next;
			}

			filteredJobs.forEach((job) => next.add(job.id));
			return next;
		});
	};

	const handleAssigned = (jobId: string) => {
		setJobs((current) => current.filter((job) => job.id !== jobId));
		setSelectedJobIds((current) => {
			if (!current.has(jobId)) return current;
			const next = new Set(current);
			next.delete(jobId);
			return next;
		});
		if (activeJobId === jobId) {
			setActiveJobId(null);
		}
	};

	const runBatchDispatchRecommendation = async () => {
		if (selectedJobIds.size === 0) return;

		setBatchLoading(true);
		setBatchError(null);
		try {
			const jobIds = [...selectedJobIds];
			const response = await apiFetch<BatchRecommendationResponse>(
				"/dispatch/batch",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ jobIds })
				}
			);

			const selectedJobs = jobs
				.filter((job) => selectedJobIds.has(job.id))
				.map((job) => ({
					id: job.id,
					customerName: job.customerName,
					address: job.address,
					priority: job.priority
				}));

			const plan: BatchPlan = {
				createdAt: new Date().toISOString(),
				assignments: response.assignments,
				unassigned: response.unassigned,
				selectedJobs
			};

			setBatchPlan(plan);
		} catch (dispatchError) {
			setBatchError(
				dispatchError instanceof Error
					? dispatchError.message
					: "Failed to generate batch recommendations"
			);
		} finally {
			setBatchLoading(false);
		}
	};

	const assignAllBatch = async () => {
		if (!batchPlan || batchPlan.assignments.length === 0) return;

		setBatchAssigning(true);
		setBatchError(null);
		try {
			const response = await apiFetch<{
				success: boolean;
				assignedCount: number;
				assignedJobIds: string[];
				failed: Array<{ jobId: string; reason: string }>;
			}>("/dispatch/batch/assign", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					assignments: batchPlan.assignments.map((assignment) => ({
						jobId: assignment.jobId,
						techId: assignment.techId,
						reason: "Batch dispatch assign-all"
					}))
				})
			});

			const assignedSet = new Set(response.assignedJobIds);
			setJobs((current) => current.filter((job) => !assignedSet.has(job.id)));
			setSelectedJobIds((current) => {
				const next = new Set(current);
				assignedSet.forEach((jobId) => next.delete(jobId));
				return next;
			});
			if (activeJobId && assignedSet.has(activeJobId)) {
				setActiveJobId(null);
			}

			if (response.failed.length > 0) {
				setBatchError(
					`${response.assignedCount} jobs assigned. ${response.failed.length} failed.`
				);
			} else {
				setBatchPlan(null);
			}
		} catch (assignError) {
			setBatchError(
				assignError instanceof Error
					? assignError.message
					: "Batch assign failed"
			);
		} finally {
			setBatchAssigning(false);
		}
	};

	const viewBatchPlan = () => {
		if (!batchPlan) return;
		sessionStorage.setItem(BATCH_PLAN_STORAGE_KEY, JSON.stringify(batchPlan));
		router.push("/dispatch/review");
	};

	const emergencyCount = jobs.filter(
		(job) => job.priority === "emergency"
	).length;

	return (
		<MainContent headerTitle="Dispatch" className="flex flex-col gap-4">
			<div className="mx-2 rounded-xl border border-background-secondary bg-background-primary p-3 flex flex-col gap-3">
				<div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:justify-between">
					<div>
						<h1 className="text-base font-semibold text-text-main inline-flex items-center gap-2">
							<Navigation className="w-4 h-4 text-accent-text" /> Dispatch Queue
						</h1>
						<p className="text-xs text-text-tertiary mt-1">
							{loading
								? "Loading jobs..."
								: `${jobs.length} unassigned jobs · ${emergencyCount} emergency`}
						</p>
					</div>

					<div className="flex items-center gap-2 flex-wrap">
						<button
							onClick={() => void loadJobs()}
							disabled={loading}
							className="rounded-lg border border-background-secondary px-3 py-1.5 text-xs text-text-secondary hover:bg-background-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
						>
							<RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
							Refresh
						</button>
						<button
							onClick={() => setSelectMode((current) => !current)}
							className={cn(
								"rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
								selectMode
									? "bg-accent-main text-white border-accent-main"
									: "border-background-secondary text-text-secondary hover:bg-background-secondary"
							)}
						>
							{selectMode ? "Done Selecting" : "Select Jobs"}
						</button>
						<button
							onClick={() => void runBatchDispatchRecommendation()}
							disabled={selectedCount === 0 || batchLoading}
							className="rounded-lg bg-accent-main text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
						>
							{batchLoading
								? "Building suggestions..."
								: `Batch Dispatch (${selectedCount})`}
						</button>
					</div>
				</div>

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

					<div className="flex items-center gap-2">
						<span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
							<Filter className="w-3 h-3" /> Priority
						</span>
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
					</div>
				</div>

				{selectMode && filteredJobs.length > 0 && (
					<div className="flex items-center justify-between rounded-lg border border-background-secondary bg-background-main px-3 py-2">
						<p className="text-xs text-text-secondary">
							{selectedCount} selected of {filteredJobs.length} visible jobs
						</p>
						<button
							onClick={toggleSelectAllVisible}
							className="text-xs text-accent-text hover:text-accent-text-dark transition-colors"
						>
							{allVisibleSelected ? "Clear visible" : "Select all visible"}
						</button>
					</div>
				)}

				{batchPlan && (
					<div className="rounded-xl border border-info-foreground/30 bg-info-background/15 px-4 py-3">
						<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
							<div>
								<p className="text-sm font-semibold text-info-text inline-flex items-center gap-1.5">
									<Users className="w-4 h-4" />
									Technicians selected
								</p>
								<p className="text-xs text-text-secondary mt-1">
									{batchPlan.assignments.length} ready to assign ·{" "}
									{batchPlan.unassigned.length} require manual handling
								</p>
							</div>
							<div className="flex items-center gap-2">
								<button
									onClick={viewBatchPlan}
									className="rounded-lg border border-background-secondary bg-background-main px-3 py-1.5 text-xs text-text-secondary hover:bg-background-secondary transition-colors"
								>
									View
								</button>
								<button
									onClick={() => void assignAllBatch()}
									disabled={
										batchAssigning || batchPlan.assignments.length === 0
									}
									className="rounded-lg bg-accent-main text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
								>
									{batchAssigning ? "Assigning..." : "Assign All"}
								</button>
							</div>
						</div>
					</div>
				)}

				{batchError && (
					<div className="rounded-lg border border-destructive-background/30 bg-destructive-background/10 text-destructive-text px-3 py-2 text-sm inline-flex items-start gap-2">
						<AlertCircle className="w-4 h-4 mt-0.5" />
						<span>{batchError}</span>
					</div>
				)}
			</div>

			<div className="mx-2 flex-1 min-h-0 flex gap-3">
				<div
					className={cn(
						"rounded-xl border border-background-secondary bg-background-primary overflow-hidden",
						activeJob ? "w-md shrink-0" : "flex-1"
					)}
				>
					<div className="h-full overflow-y-auto divide-y divide-background-secondary/60">
						{error && (
							<div className="p-4 text-sm text-destructive-text inline-flex items-start gap-2">
								<AlertCircle className="w-4 h-4 mt-0.5" />
								<span>{error}</span>
							</div>
						)}

						{!loading && filteredJobs.length === 0 && !error && (
							<div className="p-8 text-center">
								<div className="mx-auto size-11 rounded-2xl bg-success-background/20 text-success-text grid place-items-center">
									<CheckCircle2 className="w-6 h-6" />
								</div>
								<p className="mt-3 text-sm font-semibold text-text-main">
									All caught up
								</p>
								<p className="text-xs text-text-tertiary mt-1">
									No unassigned jobs in the queue.
								</p>
							</div>
						)}

						{filteredJobs.map((job) => {
							const selected = activeJobId === job.id;
							const checked = selectedJobIds.has(job.id);
							return (
								<button
									key={job.id}
									onClick={() => {
										if (selectMode) {
											toggleSelected(job.id);
											return;
										}
										setActiveJobId(job.id);
									}}
									className={cn(
										"w-full text-left px-4 py-3 transition-colors",
										selected
											? "bg-accent-main/10"
											: "hover:bg-background-secondary/30"
									)}
								>
									<div className="flex items-start gap-2">
										{selectMode && (
											<input
												type="checkbox"
												checked={checked}
												onChange={() => toggleSelected(job.id)}
												onClick={(event) => event.stopPropagation()}
												className="mt-1"
											/>
										)}
										<div className="min-w-0 flex-1">
											<div className="flex items-center justify-between gap-2">
												<p className="text-sm font-semibold text-text-main truncate">
													{job.customerName}
												</p>
												<PriorityBadge priority={job.priority} />
											</div>
											<p className="text-xs text-text-secondary mt-1 inline-flex items-center gap-1">
												<MapPin className="w-3 h-3" />
												<span className="truncate">{job.address}</span>
											</p>
											<div className="flex items-center justify-between mt-2 text-[11px] text-text-tertiary">
												<span className="inline-flex items-center gap-1">
													<Clock className="w-3 h-3" />
													{formatReadableDateTime(job.scheduledTime)}
												</span>
												<span>{formatRelativeTime(job.createdAt)}</span>
											</div>
										</div>
										<ChevronRight className="w-4 h-4 text-text-tertiary mt-1" />
									</div>
								</button>
							);
						})}
					</div>
				</div>

				{activeJob ? (
					<div className="flex-1 rounded-xl border border-background-secondary bg-background-primary overflow-hidden">
						<SingleDispatchPanel
							job={activeJob}
							onClose={() => setActiveJobId(null)}
							onAssigned={handleAssigned}
						/>
					</div>
				) : (
					<div className="hidden lg:flex flex-1 rounded-xl border border-dashed border-background-secondary items-center justify-center bg-background-primary/40">
						<div className="text-center">
							<div className="mx-auto size-10 rounded-xl bg-accent-main/15 text-accent-text grid place-items-center">
								<Zap className="w-5 h-5" />
							</div>
							<p className="text-sm font-semibold text-text-main mt-3">
								Select a job for one-by-one dispatch
							</p>
							<p className="text-xs text-text-tertiary mt-1">
								Or select multiple jobs to run batch dispatch recommendations.
							</p>
						</div>
					</div>
				)}
			</div>
		</MainContent>
	);
}
