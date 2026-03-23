"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MainContent from "@/components/layout/MainContent";
import { useJob, useUpdateJobStatus, useUpdateJob } from "@/lib/hooks/useJob";
import { cn } from "@/lib/utils";
import {
	ArrowLeft,
	MapPin,
	Phone,
	Clock,
	User,
	Wrench,
	AlertTriangle,
	CheckCircle2,
	XCircle,
	ChevronRight,
	RefreshCw,
	FileText,
	Navigation
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: unknown) {
	if (iso == null) return "—";
	const d = new Date(iso as any);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit"
	});
}

// ─── Badges ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
	unassigned: "bg-background-secondary text-text-tertiary border-background-secondary",
	assigned: "bg-info/10 text-info-text border-info/25",
	in_progress: "bg-accent-main/10 text-accent-text border-accent-main/25",
	completed: "bg-success/10 text-success-text border-success/25",
	cancelled: "bg-destructive-background/10 text-destructive-text border-destructive-background/25"
};

const PRIORITY_STYLES: Record<string, string> = {
	low: "bg-background-secondary text-text-tertiary border-background-secondary",
	normal: "bg-background-secondary text-text-secondary border-background-secondary",
	medium: "bg-accent-main/10 text-accent-text border-accent-main/25",
	high: "bg-warning-background/20 text-warning-text border-warning-foreground/30",
	emergency: "bg-destructive-background/15 text-destructive-text border-destructive-background/30"
};

function StatusBadge({ status }: { status: string }) {
	return (
		<span className={cn(
			"inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border capitalize",
			STATUS_STYLES[status] ?? STATUS_STYLES.unassigned
		)}>
			{status.replace("_", " ")}
		</span>
	);
}

function PriorityBadge({ priority }: { priority: string }) {
	return (
		<span className={cn(
			"inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border capitalize",
			PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.normal
		)}>
			{priority}
		</span>
	);
}

// ─── Status transitions ───────────────────────────────────────────────────────

const STATUS_TRANSITIONS: Record<string, { label: string; next: string; className: string }[]> = {
	unassigned: [],
	assigned: [
		{ label: "Start Job", next: "in_progress", className: "bg-accent-main text-white hover:opacity-90" }
	],
	in_progress: [
		{ label: "Complete Job", next: "completed", className: "bg-success-foreground text-white hover:opacity-90" },
		{ label: "Cancel Job", next: "cancelled", className: "bg-background-secondary text-text-secondary hover:bg-background-tertiary" }
	],
	completed: [],
	cancelled: []
};

// ─── Info row ────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-start gap-3 py-3 border-b border-background-secondary/50 last:border-0">
			<div className="w-4 h-4 mt-0.5 text-text-tertiary shrink-0">{icon}</div>
			<div className="flex flex-col gap-0.5 min-w-0 flex-1">
				<p className="text-xs text-text-tertiary uppercase tracking-wide font-medium">{label}</p>
				<div className="text-sm text-text-main">{value}</div>
			</div>
		</div>
	);
}

// ─── Complete modal ───────────────────────────────────────────────────────────

function CompleteModal({
	onConfirm,
	onCancel,
	loading
}: {
	onConfirm: (notes: string) => void;
	onCancel: () => void;
	loading: boolean;
}) {
	const [notes, setNotes] = useState("");
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
			<div className="bg-background-primary border border-background-secondary rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl flex flex-col gap-4">
				<h3 className="text-sm font-bold text-text-main">Complete Job</h3>
				<p className="text-xs text-text-secondary">Add any completion notes before marking this job done.</p>
				<textarea
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					placeholder="Completion notes (optional)..."
					rows={3}
					className="w-full text-sm bg-background-main border border-background-secondary rounded-lg px-3 py-2 text-text-main placeholder:text-text-tertiary resize-none outline-none focus:border-accent-text transition-colors"
				/>
				<div className="flex gap-2">
					<button
						onClick={onCancel}
						className="flex-1 py-2 rounded-lg text-sm border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={() => onConfirm(notes)}
						disabled={loading}
						className="flex-1 py-2 rounded-lg text-sm bg-success-foreground text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
					>
						{loading ? "Completing..." : "Complete"}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
	const params = useParams();
	const router = useRouter();
	const jobId = params.jobId as string;

	const { data: job, isLoading, error } = useJob(jobId);
	const updateStatus = useUpdateJobStatus(jobId);
	const updateJob = useUpdateJob(jobId);

	const [showCompleteModal, setShowCompleteModal] = useState(false);
	const [editingNotes, setEditingNotes] = useState(false);
	const [notesValue, setNotesValue] = useState("");

	const transitions = STATUS_TRANSITIONS[job?.status ?? "unassigned"] ?? [];

	const handleTransition = (next: string) => {
		if (next === "completed") {
			setShowCompleteModal(true);
			return;
		}
		updateStatus.mutate({ status: next });
	};

	const handleComplete = (notes: string) => {
		updateStatus.mutate(
			{ status: "completed", completionNotes: notes },
			{ onSuccess: () => setShowCompleteModal(false) }
		);
	};

	const handleSaveNotes = () => {
		updateJob.mutate(
			{ initialNotes: notesValue },
			{ onSuccess: () => setEditingNotes(false) }
		);
	};

	return (
		<>
			<MainContent className="flex flex-col gap-4 pb-8">
				{/* Back */}
				<div className="mx-2 pt-1">
					<button
						onClick={() => router.push("/jobs")}
						className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-main transition-colors"
					>
						<ArrowLeft className="w-4 h-4" />
						All Jobs
					</button>
				</div>

				{isLoading && (
					<div className="flex items-center justify-center py-24 text-text-tertiary text-sm">
						<RefreshCw className="w-4 h-4 animate-spin mr-2" />
						Loading job...
					</div>
				)}

				{error && (
					<div className="mx-2 p-4 bg-destructive-background/10 border border-destructive-background/25 rounded-xl text-sm text-destructive-text flex items-center gap-2">
						<AlertTriangle className="w-4 h-4 shrink-0" />
						{error.message}
					</div>
				)}

				{job && (
					<>
						{/* Header */}
						<div className="mx-2 bg-background-primary rounded-xl border border-background-secondary p-5">
							<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
								<div className="flex flex-col gap-2">
									<div className="flex items-center gap-2 flex-wrap">
										<StatusBadge status={job.status} />
										<PriorityBadge priority={job.priority} />
										<span className="text-xs text-text-tertiary capitalize">
											{job.jobType.replace("_", " ")}
										</span>
									</div>
									<h1 className="text-lg font-semibold text-text-main">
										{job.customerName}
									</h1>
									<div className="flex items-center gap-1.5 text-xs text-text-secondary">
										<MapPin className="w-3 h-3 shrink-0" />
										{job.address}
									</div>
									<div className="flex items-center gap-4 text-xs text-text-tertiary flex-wrap">
										<span className="flex items-center gap-1">
											<Phone className="w-3 h-3" />
											{job.phone}
										</span>
										<span className="flex items-center gap-1">
											<Clock className="w-3 h-3" />
											Created {formatDate(job.createdAt)}
										</span>
									</div>
								</div>

								{/* Status actions */}
								{transitions.length > 0 && (
									<div className="flex flex-col gap-2 shrink-0">
										{transitions.map((t) => (
											<button
												key={t.next}
												onClick={() => handleTransition(t.next)}
												disabled={updateStatus.isPending}
												className={cn(
													"px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50",
													t.className
												)}
											>
												{updateStatus.isPending ? "Updating..." : t.label}
											</button>
										))}
									</div>
								)}
							</div>

							{/* Stats row */}
							<div className="mt-4 pt-4 border-t border-background-secondary grid grid-cols-2 sm:grid-cols-4 gap-4">
								<div>
									<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">Scheduled</p>
									<p className="text-sm font-medium text-text-main">{formatDate(job.scheduledTime)}</p>
								</div>
								<div>
									<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">Completed</p>
									<p className="text-sm font-medium text-text-main">{formatDate(job.completedAt)}</p>
								</div>
								<div>
									<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">Tech</p>
									<div className="text-sm font-medium text-text-main">
										{job.assignedTechId ? (
											<button
												onClick={() => router.push(`/employees/${job.assignedTechId}`)}
												className="text-accent-text hover:underline flex items-center gap-1"
											>
												View tech <ChevronRight className="w-3 h-3" />
											</button>
										) : (
											<span className="text-text-tertiary">Unassigned</span>
										)}
									</div>
								</div>
								<div>
									<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">Geocoding</p>
									<p className="text-sm font-medium text-text-main capitalize">
										{String(job.geocodingStatus ?? "—")}
									</p>
								</div>
							</div>
						</div>

						{/* Details + Notes */}
						<div className="mx-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
							{/* Details */}
							<div className="bg-background-primary rounded-xl border border-background-secondary p-5">
								<h3 className="text-sm font-semibold text-text-main mb-3">Details</h3>
								<InfoRow
									icon={<Wrench className="w-4 h-4" />}
									label="Job Type"
									value={<span className="capitalize">{job.jobType.replace("_", " ")}</span>}
								/>
								<InfoRow
									icon={<User className="w-4 h-4" />}
									label="Required Skills"
									value={
										Array.isArray(job.requiredSkills) && job.requiredSkills.length > 0
											? job.requiredSkills.join(", ")
											: "None specified"
									}
								/>
								<InfoRow
									icon={<MapPin className="w-4 h-4" />}
									label="Coordinates"
									value={
										job.latitude != null && job.longitude != null && typeof job.latitude === "number" && typeof job.longitude === "number"
											? <span className="font-mono text-xs">{job.latitude.toFixed(5)}, {job.longitude.toFixed(5)}</span>
											: "Not geocoded"
									}
								/>
								<InfoRow
									icon={<Clock className="w-4 h-4" />}
									label="Last Updated"
									value={formatDate(job.updatedAt)}
								/>
								{job.geocodingStatus === "failed" && (
									<div className="mt-3 pt-3 border-t border-background-secondary">
										<p className="text-xs text-warning-text flex items-center gap-1">
											<Navigation className="w-3 h-3" />
											Geocoding failed — retry via the worker or update the address
										</p>
									</div>
								)}
							</div>

							{/* Notes */}
							<div className="bg-background-primary rounded-xl border border-background-secondary p-5">
								<div className="flex items-center justify-between mb-3">
									<h3 className="text-sm font-semibold text-text-main">Notes</h3>
									{!editingNotes && (
										<button
											onClick={() => {
												setNotesValue(job.initialNotes ?? "");
												setEditingNotes(true);
											}}
											className="text-xs text-accent-text hover:underline"
										>
											Edit
										</button>
									)}
								</div>

								{editingNotes ? (
									<div className="flex flex-col gap-2">
										<textarea
											value={notesValue}
											onChange={(e) => setNotesValue(e.target.value)}
											rows={5}
											className="w-full text-sm bg-background-main border border-background-secondary rounded-lg px-3 py-2 text-text-main placeholder:text-text-tertiary resize-none outline-none focus:border-accent-text transition-colors"
											placeholder="Job notes..."
										/>
										<div className="flex gap-2">
											<button
												onClick={() => setEditingNotes(false)}
												className="flex-1 py-1.5 rounded-lg text-xs border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
											>
												Cancel
											</button>
											<button
												onClick={handleSaveNotes}
												disabled={updateJob.isPending}
												className="flex-1 py-1.5 rounded-lg text-xs bg-accent-main text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
											>
												{updateJob.isPending ? "Saving..." : "Save"}
											</button>
										</div>
									</div>
								) : (
									<p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
										{job.initialNotes ?? <span className="text-text-tertiary">No notes added.</span>}
									</p>
								)}

								{job.completionNotes && (
									<div className="mt-4 pt-4 border-t border-background-secondary">
										<p className="text-xs text-text-tertiary uppercase tracking-wide font-medium mb-2">
											Completion Notes
										</p>
										<p className="text-sm text-text-secondary leading-relaxed">
											{job.completionNotes}
										</p>
									</div>
								)}
							</div>
						</div>

						{/* Quick actions */}
						<div className="mx-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
							{[
								{ label: "Dispatch", icon: <Navigation className="w-4 h-4" />, href: "/dispatch" },
								{ label: "Time Tracking", icon: <Clock className="w-4 h-4" />, href: "#" },
								{ label: "Estimates", icon: <FileText className="w-4 h-4" />, href: "#" },
								{ label: "Invoices", icon: <FileText className="w-4 h-4" />, href: "#" }
							].map((action) => (
								<button
									key={action.label}
									onClick={() => router.push(action.href)}
									className="flex flex-col items-center gap-2 p-4 bg-background-primary rounded-xl border border-background-secondary hover:bg-background-secondary/30 hover:border-accent-main/30 transition-all text-text-secondary hover:text-text-main"
								>
									{action.icon}
									<span className="text-xs font-medium">{action.label}</span>
								</button>
							))}
						</div>
					</>
				)}
			</MainContent>

			{showCompleteModal && (
				<CompleteModal
					onConfirm={handleComplete}
					onCancel={() => setShowCompleteModal(false)}
					loading={updateStatus.isPending}
				/>
			)}
		</>
	);
}