"use client";

import { useEffect, useState, useCallback } from "react";
import Header from "@/components/layout/Header";
import MainContent from "@/components/layout/MainContent";
import Sidebar from "@/components/layout/sidebar/Sidebar";
import { defaultSidebarItems } from "@/components/layout/sidebar/SidebarItems";
import { cn } from "@/lib/utils/index";
import { getToken, authHeaders } from "@/lib/auth";
import {
	AlertTriangle,
	MapPin,
	Clock,
	User,
	Zap,
	CheckCircle2,
	ChevronRight,
	RefreshCw,
	Star,
	Briefcase,
	Navigation,
	TriangleAlert,
	CircleDot,
	X
} from "lucide-react";
import { JobDTO, JobPriority } from "@/app/types/types";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Priority badge ───────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<
	JobPriority,
	{ label: string; className: string; icon: React.ReactNode }
> = {
	emergency: {
		label: "Emergency",
		className:
			"bg-destructive-background/15 text-destructive-text border border-destructive-background/30",
		icon: <TriangleAlert className="w-3 h-3" />
	},
	high: {
		label: "High",
		className:
			"bg-warning-background/20 text-warning-text border border-warning-foreground/30",
		icon: <Zap className="w-3 h-3" />
	},
	medium: {
		label: "Medium",
		className:
			"bg-accent-main/15 text-accent-text-dark border border-accent-main/30",
		icon: <CircleDot className="w-3 h-3" />
	},
	low: {
		label: "Low",
		className:
			"bg-background-secondary/60 text-text-secondary border border-background-secondary",
		icon: <CircleDot className="w-3 h-3 opacity-50" />
	}
};

function PriorityBadge({ priority }: { priority: JobPriority }) {
	const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
				cfg.className
			)}
		>
			{cfg.icon}
			{cfg.label}
		</span>
	);
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({
	value,
	max = 100,
	color = "bg-accent-main"
}: {
	value: number;
	max?: number;
	color?: string;
}) {
	const pct = Math.min(100, Math.round((value / max) * 100));
	return (
		<div className="flex items-center gap-2 w-full">
			<div className="flex-1 h-1.5 rounded-full bg-background-secondary overflow-hidden">
				<div
					className={cn(
						"h-full rounded-full transition-all duration-500",
						color
					)}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<span className="text-xs tabular-nums text-text-secondary w-8 text-right">
				{value.toFixed(1)}
			</span>
		</div>
	);
}

// ─── Job card ─────────────────────────────────────────────────────────────────

function JobCard({
	job,
	selected,
	onClick
}: {
	job: JobDTO;
	selected: boolean;
	onClick: () => void;
}) {
	const isEmergency = job.priority === "emergency";
	return (
		<button
			onClick={onClick}
			className={cn(
				"w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-150 group",
				selected
					? "bg-accent-main/10 border-accent-main/40 shadow-sm"
					: isEmergency
						? "bg-destructive-background/5 border-destructive-background/20 hover:bg-destructive-background/10 hover:border-destructive-background/30"
						: "bg-background-primary border-background-secondary hover:bg-background-secondary/40 hover:border-background-tertiary/50"
			)}
		>
			<div className="flex items-start justify-between gap-2 mb-2">
				<div className="flex items-center gap-2 min-w-0">
					{isEmergency && (
						<span className="shrink-0 w-1.5 h-1.5 rounded-full bg-destructive-text animate-pulse" />
					)}
					<p className="text-sm font-semibold text-text-main truncate">
						{job.customerName}
					</p>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					<PriorityBadge priority={job.priority} />
					<ChevronRight
						className={cn(
							"w-4 h-4 text-text-tertiary transition-transform",
							selected && "rotate-90 text-accent-text"
						)}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-1.5 text-xs text-text-secondary">
					<MapPin className="w-3 h-3 shrink-0" />
					<span className="truncate">{job.address}</span>
				</div>
				<div className="flex items-center gap-3 text-xs text-text-tertiary">
					<span className="flex items-center gap-1">
						<Briefcase className="w-3 h-3" />
						<span className="capitalize">{job.jobType?.replace("_", " ")}</span>
					</span>
					<span className="flex items-center gap-1">
						<Clock className="w-3 h-3" />
						{timeAgo(job.createdAt)}
					</span>
				</div>
			</div>
		</button>
	);
}

// ─── Tech recommendation card ─────────────────────────────────────────────────

function TechCard({
	tech,
	rank,
	isTop,
	onAssign,
	assigning
}: {
	tech: TechScore;
	rank: number;
	isTop: boolean;
	onAssign: (techId: string) => void;
	assigning: boolean;
}) {
	return (
		<div
			className={cn(
				"rounded-xl border p-4 transition-all duration-200",
				isTop
					? "bg-accent-main/10 border-accent-main/30"
					: "bg-background-primary border-background-secondary"
			)}
		>
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2.5">
					<div
						className={cn(
							"w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
							isTop
								? "bg-accent-main text-white"
								: "bg-background-secondary text-text-secondary"
						)}
					>
						{rank}
					</div>
					<div>
						<p className="text-sm font-semibold text-text-main flex items-center gap-1.5">
							{tech.techName}
							{isTop && (
								<Star className="w-3 h-3 text-accent-text fill-accent-text" />
							)}
						</p>
						<p className="text-xs text-text-tertiary">
							{tech.distanceMiles.toFixed(1)} mi away
						</p>
					</div>
				</div>
				<div className="text-right">
					<p className="text-lg font-bold text-text-main tabular-nums">
						{tech.totalScore.toFixed(0)}
					</p>
					<p className="text-xs text-text-tertiary">/ 100</p>
				</div>
			</div>

			<div className="space-y-2 mb-3">
				<div>
					<div className="flex justify-between text-xs text-text-tertiary mb-1">
						<span>Performance</span>
					</div>
					<ScoreBar
						value={tech.performanceScore}
						color="bg-success-foreground"
					/>
				</div>
				<div>
					<div className="flex justify-between text-xs text-text-tertiary mb-1">
						<span>Distance</span>
					</div>
					<ScoreBar
						value={Math.max(0, 100 - tech.distanceMiles * 3)}
						color="bg-accent-main"
					/>
				</div>
				<div>
					<div className="flex justify-between text-xs text-text-tertiary mb-1">
						<span>Availability</span>
					</div>
					<ScoreBar value={tech.workloadScore} color="bg-info-foreground" />
				</div>
			</div>

			<button
				onClick={() => onAssign(tech.techId)}
				disabled={assigning}
				className={cn(
					"w-full py-2 rounded-lg text-sm font-medium transition-all duration-150",
					isTop
						? "bg-accent-main text-white hover:bg-accent-text-dark disabled:opacity-60"
						: "bg-background-secondary text-text-main hover:bg-background-tertiary hover:text-text-primary disabled:opacity-60"
				)}
			>
				{assigning
					? "Assigning…"
					: isTop
						? "Assign (Recommended)"
						: "Override & Assign"}
			</button>
		</div>
	);
}

// ─── Dispatch panel ───────────────────────────────────────────────────────────

function DispatchPanel({
	job,
	onClose,
	onAssigned
}: {
	job: JobDTO;
	onClose: () => void;
	onAssigned: (jobId: string) => void;
}) {
	const [rec, setRec] = useState<DispatchRecommendation | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [assigning, setAssigning] = useState<string | null>(null); // techId being assigned
	const [overrideReason, setOverrideReason] = useState("");
	const [showOverrideInput, setShowOverrideInput] = useState(false);
	const [pendingTechId, setPendingTechId] = useState<string | null>(null);

	const fetchRecommendation = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/jobs/${job.id}/recommendations`, {
				method: "GET",
				headers: authHeaders()
			});
			if (!res.ok) throw new Error(`Server error (${res.status})`);
			const data = (await res.json()) as {
				recommendation: DispatchRecommendation;
			};
			setRec(data.recommendation);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Failed to fetch recommendations"
			);
		} finally {
			setLoading(false);
		}
	}, [job.id]);

	useEffect(() => {
		void fetchRecommendation();
	}, [fetchRecommendation]);

	const handleAssign = (techId: string) => {
		const isTop = rec?.recommendations[0]?.techId === techId;
		if (!isTop) {
			setPendingTechId(techId);
			setShowOverrideInput(true);
			return;
		}
		void confirmAssign(techId, undefined);
	};

	const confirmAssign = async (techId: string, reason?: string) => {
		setAssigning(techId);
		setShowOverrideInput(false);
		try {
			const res = await fetch(`/api/jobs/${job.id}/assign`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ techId, reason })
			});
			if (!res.ok) {
				const err = (await res.json()) as { error?: string };
				throw new Error(err.error ?? `Assignment failed (${res.status})`);
			}
			onAssigned(job.id);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Assignment failed");
		} finally {
			setAssigning(null);
			setPendingTechId(null);
		}
	};

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-start justify-between p-5 border-b border-background-secondary">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2 mb-1">
						<PriorityBadge priority={job.priority} />
						<span className="text-xs text-text-tertiary capitalize">
							{job.jobType?.replace("_", " ")}
						</span>
					</div>
					<h2 className="text-base font-bold text-text-main truncate">
						{job.customerName}
					</h2>
					<p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
						<MapPin className="w-3 h-3 shrink-0" /> {job.address}
					</p>
				</div>
				<button
					onClick={onClose}
					className="shrink-0 ml-2 w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:bg-background-secondary hover:text-text-main transition-colors"
				>
					<X className="w-4 h-4" />
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-5 space-y-4">
				{loading && (
					<div className="flex flex-col items-center justify-center py-16 gap-3">
						<RefreshCw className="w-6 h-6 text-accent-text animate-spin" />
						<p className="text-sm text-text-secondary">
							Running dispatch algorithm…
						</p>
					</div>
				)}

				{error && !loading && (
					<div className="flex items-start gap-2 p-3 rounded-lg bg-destructive-background/10 border border-destructive-background/20 text-destructive-text text-sm">
						<AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
						<div>
							<p className="font-medium">Error</p>
							<p className="text-xs opacity-80 mt-0.5">{error}</p>
							<button
								onClick={fetchRecommendation}
								className="text-xs underline mt-1"
							>
								Retry
							</button>
						</div>
					</div>
				)}

				{rec && !loading && (
					<>
						{/* Stats row */}
						<div className="grid grid-cols-3 gap-2">
							<div className="bg-background-primary rounded-lg p-3 border border-background-secondary text-center">
								<p className="text-lg font-bold text-text-main">
									{rec.totalEligibleTechs}
								</p>
								<p className="text-xs text-text-tertiary mt-0.5">Eligible</p>
							</div>
							<div className="bg-background-primary rounded-lg p-3 border border-background-secondary text-center">
								<p className="text-lg font-bold text-text-main">
									{rec.recommendations.length}
								</p>
								<p className="text-xs text-text-tertiary mt-0.5">Ranked</p>
							</div>
							<div
								className={cn(
									"rounded-lg p-3 border text-center",
									rec.requiresManualDispatch
										? "bg-warning-background/10 border-warning-foreground/20"
										: "bg-success-background/10 border-success-foreground/20"
								)}
							>
								<p
									className={cn(
										"text-xs font-semibold mt-1",
										rec.requiresManualDispatch
											? "text-warning-text"
											: "text-success-text"
									)}
								>
									{rec.requiresManualDispatch ? "Manual" : "Auto-ready"}
								</p>
							</div>
						</div>

						{/* Manual dispatch warning */}
						{rec.requiresManualDispatch && (
							<div className="flex items-start gap-2 p-3 rounded-lg bg-warning-background/10 border border-warning-foreground/20 text-warning-text text-sm">
								<AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
								<div>
									<p className="font-medium text-xs">
										Manual Dispatch Required
									</p>
									<p className="text-xs opacity-80 mt-0.5">
										{rec.manualDispatchReason ?? "No eligible techs found."}
									</p>
								</div>
							</div>
						)}

						{/* Tech recommendations */}
						{rec.recommendations.length > 0 ? (
							<div className="space-y-2.5">
								<p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
									Top Recommendations
								</p>
								{rec.recommendations.map((tech, i) => (
									<TechCard
										key={tech.techId}
										tech={tech}
										rank={i + 1}
										isTop={i === 0}
										onAssign={handleAssign}
										assigning={assigning === tech.techId}
									/>
								))}
							</div>
						) : (
							<div className="flex flex-col items-center py-8 gap-2 text-center">
								<User className="w-8 h-8 text-text-tertiary" />
								<p className="text-sm font-medium text-text-secondary">
									No techs available
								</p>
								<p className="text-xs text-text-tertiary">
									All technicians are at capacity or unavailable.
								</p>
							</div>
						)}

						{/* Refresh */}
						<button
							onClick={fetchRecommendation}
							className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
						>
							<RefreshCw className="w-3 h-3" />
							Refresh recommendations
						</button>
					</>
				)}

				{/* Override reason modal */}
				{showOverrideInput && pendingTechId && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
						<div className="bg-background-primary border border-background-secondary rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
							<h3 className="text-sm font-bold text-text-main mb-1">
								Override Recommendation
							</h3>
							<p className="text-xs text-text-secondary mb-4">
								You're assigning a non-recommended tech. Please provide a reason
								for the audit log.
							</p>
							<textarea
								value={overrideReason}
								onChange={(e) => setOverrideReason(e.target.value)}
								placeholder="e.g. Customer requested specific technician"
								rows={3}
								className="w-full text-sm bg-background-main border border-background-secondary rounded-lg px-3 py-2 text-text-main placeholder:text-text-tertiary resize-none outline-none focus:border-accent-text transition-colors"
							/>
							<div className="flex gap-2 mt-4">
								<button
									onClick={() => {
										setShowOverrideInput(false);
										setPendingTechId(null);
										setOverrideReason("");
									}}
									className="flex-1 py-2 rounded-lg text-sm border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
								>
									Cancel
								</button>
								<button
									disabled={!overrideReason.trim()}
									onClick={() =>
										void confirmAssign(pendingTechId, overrideReason)
									}
									className="flex-1 py-2 rounded-lg text-sm bg-accent-main text-white font-medium hover:bg-accent-text-dark transition-colors disabled:opacity-50"
								>
									Confirm Override
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DispatchPage() {
	const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
	const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

	const [jobs, setJobs] = useState<JobDTO[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedJob, setSelectedJob] = useState<JobDTO | null>(null);

	const loadJobs = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/jobs?status=unassigned`, {
				headers: authHeaders()
			});
			if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`);
			const data = (await res.json()) as { jobs?: JobDTO[] };
			const fetched = data.jobs ?? [];
			// Sort: emergency first, then by createdAt desc
			fetched.sort((a, b) => {
				if (a.priority === "emergency" && b.priority !== "emergency") return -1;
				if (b.priority === "emergency" && a.priority !== "emergency") return 1;
				return (
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
			});
			setJobs(fetched);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load jobs");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadJobs();
	}, [loadJobs]);

	const handleAssigned = (jobId: string) => {
		setJobs((prev) => prev.filter((j) => j.id !== jobId));
		setSelectedJob(null);
	};

	const emergencyCount = jobs.filter((j) => j.priority === "emergency").length;

	return (
		<>
			<Header
				sidebarAutoCollapse={sidebarAutoCollapse}
				sidebarIsStrip={sidebarIsStrip}
				onMobileMenuClick={() => setMobileSidebarOpen((o) => !o)}
				mobileMenuOpen={mobileSidebarOpen}
			/>
			<MainContent
				sidebarAutoCollapse={sidebarAutoCollapse}
				sidebarIsStrip={sidebarIsStrip}
				showHeader={false}
				showSidebar={false}
				className={cn("flex flex-col h-screen overflow-hidden")}
			>
				{/* Page header */}
				<div className="px-4 pt-2 pb-3 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div>
							<h1 className="text-base font-bold text-text-main flex items-center gap-2">
								<Navigation className="w-4 h-4 text-accent-text" />
								Dispatch
							</h1>
							<p className="text-xs text-text-tertiary mt-0.5">
								{loading
									? "Loading…"
									: `${jobs.length} unassigned job${jobs.length !== 1 ? "s" : ""}`}
								{emergencyCount > 0 && (
									<span className="ml-2 text-destructive-text font-medium">
										· {emergencyCount} emergency
									</span>
								)}
							</p>
						</div>
					</div>
					<button
						onClick={loadJobs}
						className={cn(
							"flex items-center gap-1.5 text-xs text-text-secondary border border-background-secondary px-3 py-1.5 rounded-lg hover:bg-background-secondary transition-colors",
							loading && "opacity-50 pointer-events-none"
						)}
					>
						<RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
						Refresh
					</button>
				</div>

				{/* Main split layout */}
				<div className="flex-1 flex overflow-hidden mx-2 mb-2 gap-3">
					{/* Job list */}
					<div
						className={cn(
							"flex flex-col transition-all duration-300",
							selectedJob ? "w-80 shrink-0" : "flex-1"
						)}
					>
						<div className="flex-1 overflow-y-auto space-y-2 pr-1">
							{error && (
								<div className="flex items-center gap-2 p-3 rounded-lg bg-destructive-background/10 border border-destructive-background/20 text-destructive-text text-sm">
									<AlertTriangle className="w-4 h-4 shrink-0" />
									<p>{error}</p>
								</div>
							)}
							{!loading && jobs.length === 0 && !error && (
								<div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
									<div className="w-12 h-12 rounded-2xl bg-success-background/20 flex items-center justify-center">
										<CheckCircle2 className="w-6 h-6 text-success-text" />
									</div>
									<p className="text-sm font-semibold text-text-main">
										All caught up!
									</p>
									<p className="text-xs text-text-tertiary">
										No unassigned jobs right now.
									</p>
								</div>
							)}
							{jobs.map((job) => (
								<JobCard
									key={job.id}
									job={job}
									selected={selectedJob?.id === job.id}
									onClick={() =>
										setSelectedJob((prev) => (prev?.id === job.id ? null : job))
									}
								/>
							))}
						</div>
					</div>

					{/* Dispatch panel */}
					{selectedJob && (
						<div className="flex-1 bg-background-primary rounded-xl border border-background-secondary overflow-hidden flex flex-col">
							<DispatchPanel
								job={selectedJob}
								onClose={() => setSelectedJob(null)}
								onAssigned={handleAssigned}
							/>
						</div>
					)}

					{/* Empty state for panel */}
					{!selectedJob && jobs.length > 0 && (
						<div className="hidden lg:flex flex-1 items-center justify-center bg-background-primary/50 rounded-xl border border-dashed border-background-secondary">
							<div className="text-center">
								<Navigation className="w-8 h-8 text-text-tertiary mx-auto mb-2 opacity-50" />
								<p className="text-sm text-text-secondary font-medium">
									Select a job to dispatch
								</p>
								<p className="text-xs text-text-tertiary mt-1">
									The algorithm will find the best tech
								</p>
							</div>
						</div>
					)}
				</div>
			</MainContent>
			<Sidebar
				title="Tech to Customer"
				autoCollapse={false}
				items={defaultSidebarItems}
				mobileOpen={mobileSidebarOpen}
				onMobileOpenChange={setMobileSidebarOpen}
				hideMobileToggleButton
				onFlagsChange={({ autoCollapse, isStrip }) => {
					setSidebarAutoCollapse(autoCollapse);
					setSidebarIsStrip(isStrip);
				}}
			/>
		</>
	);
}
