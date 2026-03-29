"use client";

import { useEffect, useMemo, useState } from "react";
import MainContent from "@/components/layout/MainContent";
import { apiFetch } from "@/lib/api";
import { cn, formatReadableDateTime } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
	AlertCircle,
	ArrowLeft,
	CheckCircle2,
	Loader2,
	MapPin,
	Save,
	TriangleAlert
} from "lucide-react";
import type { JobPriority } from "@/app/types/types";

type TechScore = {
	techId: string;
	techName: string;
	totalScore: number;
	performanceScore: number;
	distanceMiles: number;
	workloadScore: number;
};

type DispatchRecommendation = {
	jobId: string;
	recommendations: TechScore[];
	assignedTech: TechScore | null;
	totalEligibleTechs: number;
	requiresManualDispatch: boolean;
	isEmergency: boolean;
	timestamp: string;
	manualDispatchReason?: string;
};

type BatchPlan = {
	createdAt: string;
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
	selectedJobs: Array<{
		id: string;
		customerName: string;
		address: string;
		priority: JobPriority;
	}>;
};

const BATCH_PLAN_STORAGE_KEY = "dispatch-batch-plan";

function PriorityBadge({ priority }: { priority: JobPriority }) {
	const classes: Record<JobPriority, string> = {
		emergency:
			"bg-destructive-background/15 text-destructive-text border border-destructive-foreground/30",
		high: "bg-warning-background/25 text-warning-text border border-warning-foreground/30",
		medium: "bg-accent-main/10 text-accent-text border border-accent-main/30",
		low: "bg-background-secondary/50 text-text-secondary border border-background-secondary"
	};

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize",
				classes[priority]
			)}
		>
			{priority === "emergency" && <TriangleAlert className="w-3 h-3" />}
			{priority}
		</span>
	);
}

export default function DispatchReviewPage() {
	const router = useRouter();
	const [plan, setPlan] = useState<BatchPlan | null>(null);
	const [loadingPlan, setLoadingPlan] = useState(true);
	const [recommendationByJob, setRecommendationByJob] = useState<
		Record<string, DispatchRecommendation>
	>({});
	const [selectedTechByJob, setSelectedTechByJob] = useState<
		Record<string, string>
	>({});
	const [loadingRecommendations, setLoadingRecommendations] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [assigning, setAssigning] = useState(false);

	useEffect(() => {
		const raw = sessionStorage.getItem(BATCH_PLAN_STORAGE_KEY);
		if (!raw) {
			setLoadingPlan(false);
			setError("No batch dispatch plan found. Start from the Dispatch page.");
			return;
		}

		try {
			const parsed = JSON.parse(raw) as BatchPlan;
			if (!parsed.selectedJobs || parsed.selectedJobs.length === 0) {
				throw new Error("Batch plan is empty");
			}
			setPlan(parsed);
		} catch {
			setError("Batch dispatch plan is invalid.");
		}
		setLoadingPlan(false);
	}, []);

	useEffect(() => {
		if (!plan) return;

		let cancelled = false;
		setLoadingRecommendations(true);
		setError(null);

		void (async () => {
			const recommendations: Record<string, DispatchRecommendation> = {};
			const selectedTechMap: Record<string, string> = {};

			for (const job of plan.selectedJobs) {
				try {
					const response = await apiFetch<{
						recommendation: DispatchRecommendation;
					}>(`/jobs/${job.id}/recommendations`);
					recommendations[job.id] = response.recommendation;

					const suggested = plan.assignments.find(
						(assignment) => assignment.jobId === job.id
					);
					const fallbackTechId =
						response.recommendation.recommendations[0]?.techId;
					if (suggested?.techId) {
						selectedTechMap[job.id] = suggested.techId;
					} else if (fallbackTechId) {
						selectedTechMap[job.id] = fallbackTechId;
					}
				} catch {
					// Keep loading other jobs even if one fails.
				}
			}

			if (!cancelled) {
				setRecommendationByJob(recommendations);
				setSelectedTechByJob(selectedTechMap);
				setLoadingRecommendations(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [plan]);

	const assignableRows = useMemo(() => {
		if (!plan) return [];
		return plan.selectedJobs.filter((job) =>
			Boolean(selectedTechByJob[job.id])
		);
	}, [plan, selectedTechByJob]);

	const runAssignAll = async () => {
		if (!plan) return;
		if (assignableRows.length === 0) {
			setError("No jobs have a technician selected to assign.");
			return;
		}

		setAssigning(true);
		setError(null);
		try {
			const response = await apiFetch<{
				success: boolean;
				assignedCount: number;
				failedCount: number;
				failed: Array<{ jobId: string; reason: string }>;
			}>("/dispatch/batch/assign", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					assignments: assignableRows.map((row) => ({
						jobId: row.id,
						techId: selectedTechByJob[row.id],
						reason: "Batch dispatch review assignment"
					}))
				})
			});

			if (response.failedCount > 0) {
				setError(
					`${response.assignedCount} assigned, ${response.failedCount} failed. Review queue again before retrying.`
				);
			}

			sessionStorage.removeItem(BATCH_PLAN_STORAGE_KEY);
			router.push("/dispatch");
		} catch (assignError) {
			setError(
				assignError instanceof Error
					? assignError.message
					: "Failed to assign technicians"
			);
		} finally {
			setAssigning(false);
		}
	};

	if (loadingPlan) {
		return (
			<MainContent
				headerTitle="Dispatch Review"
				className="flex flex-col gap-4"
			>
				<div className="mx-2 rounded-xl border border-background-secondary bg-background-primary p-6 text-sm text-text-secondary inline-flex items-center gap-2">
					<Loader2 className="w-4 h-4 animate-spin" />
					Loading batch plan...
				</div>
			</MainContent>
		);
	}

	return (
		<MainContent headerTitle="Dispatch Review" className="flex flex-col gap-4">
			<div className="mx-2 rounded-xl border border-background-secondary bg-background-primary p-4 flex items-center justify-between gap-2">
				<div>
					<h1 className="text-base font-semibold text-text-main">
						Batch Dispatch Review
					</h1>
					<p className="text-xs text-text-tertiary mt-1">
						Adjust technician choices before assigning all jobs.
					</p>
					{plan?.createdAt && (
						<p className="text-[11px] text-text-tertiary mt-0.5">
							Generated {formatReadableDateTime(plan.createdAt)}
						</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => router.push("/dispatch")}
						className="rounded-lg border border-background-secondary px-3 py-1.5 text-xs text-text-secondary hover:bg-background-secondary transition-colors inline-flex items-center gap-1"
					>
						<ArrowLeft className="w-3 h-3" /> Back
					</button>
					<button
						onClick={() => void runAssignAll()}
						disabled={assigning || assignableRows.length === 0}
						className="rounded-lg bg-accent-main text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-1"
					>
						<Save className="w-3 h-3" />
						{assigning
							? "Assigning..."
							: `Assign All (${assignableRows.length})`}
					</button>
				</div>
			</div>

			{error && (
				<div className="mx-2 rounded-lg border border-destructive-background/30 bg-destructive-background/10 text-destructive-text px-3 py-2 text-sm inline-flex items-start gap-2">
					<AlertCircle className="w-4 h-4 mt-0.5" />
					<span>{error}</span>
				</div>
			)}

			{loadingRecommendations && (
				<div className="mx-2 rounded-lg border border-background-secondary bg-background-primary px-3 py-2 text-sm text-text-secondary inline-flex items-center gap-2">
					<Loader2 className="w-4 h-4 animate-spin" />
					Loading recommendation details...
				</div>
			)}

			<div className="mx-2 flex flex-col gap-3 pb-8">
				{plan?.selectedJobs.map((job) => {
					const recommendation = recommendationByJob[job.id];
					const options = recommendation?.recommendations ?? [];
					const hasOptions = options.length > 0;

					return (
						<div
							key={job.id}
							className="rounded-xl border border-background-secondary bg-background-primary p-4"
						>
							<div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
								<div className="min-w-0">
									<div className="flex items-center gap-2 flex-wrap mb-1">
										<PriorityBadge priority={job.priority} />
										{plan.unassigned.some((item) => item.jobId === job.id) && (
											<span className="text-[11px] px-2 py-0.5 rounded-full border border-warning-foreground/30 bg-warning-background/20 text-warning-text">
												Needs review
											</span>
										)}
									</div>
									<h2 className="text-sm font-semibold text-text-main truncate">
										{job.customerName}
									</h2>
									<p className="text-xs text-text-secondary inline-flex items-center gap-1 mt-1">
										<MapPin className="w-3 h-3" />
										{job.address}
									</p>
								</div>

								<div className="w-full lg:w-72">
									<select
										value={selectedTechByJob[job.id] ?? ""}
										onChange={(event) =>
											setSelectedTechByJob((current) => ({
												...current,
												[job.id]: event.target.value
											}))
										}
										disabled={!hasOptions}
										className="w-full rounded-lg border border-background-secondary bg-background-main px-3 py-2 text-xs text-text-main disabled:opacity-60"
									>
										{!hasOptions && (
											<option value="">No tech options available</option>
										)}
										{options.map((tech) => (
											<option key={tech.techId} value={tech.techId}>
												{tech.techName} · score {tech.totalScore.toFixed(0)} ·{" "}
												{tech.distanceMiles.toFixed(1)} mi
											</option>
										))}
									</select>
									{recommendation?.requiresManualDispatch && (
										<p className="text-[11px] text-warning-text mt-1 inline-flex items-center gap-1">
											<TriangleAlert className="w-3 h-3" />
											{recommendation.manualDispatchReason ??
												"Manual review required"}
										</p>
									)}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{plan && plan.selectedJobs.length > 0 && !loadingRecommendations && (
				<div className="mx-2 rounded-xl border border-success-foreground/30 bg-success-background/15 px-4 py-3 text-sm text-success-text inline-flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4" />
					Ready to assign {assignableRows.length} jobs.
				</div>
			)}
		</MainContent>
	);
}
