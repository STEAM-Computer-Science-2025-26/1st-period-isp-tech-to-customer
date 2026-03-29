"use client";

import { useEffect, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { cn } from "@/lib/utils";
import { type MapJob, type MapTech } from "@/lib/schemas/mapSchemas";
import {
	X,
	MapPin,
	Phone,
	Clock,
	Wrench,
	User,
	AlertCircle,
	CheckCircle2,
	Navigation,
	Search,
	SlidersHorizontal
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type DriveTime = {
	techId: string;
	techName: string;
	durationText: string;
	distanceText: string;
	durationSeconds: number;
};

type Props = {
	selectedJob: MapJob | null;
	selectedTech: MapTech | null;
	allTechs: MapTech[];
	allJobs: MapJob[];
	onJobSelect: (job: MapJob) => void;
	onZoomTo: (loc: { lat: number; lng: number }) => void;
	onClose: () => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<MapJob["priority"], string> = {
	emergency: "bg-red-500",
	high: "bg-orange-500",
	medium: "bg-yellow-500",
	low: "bg-green-500"
};

const PRIORITY_COLORS: Record<MapJob["priority"], string> = {
	emergency: "text-red-400 bg-red-500/10 border-red-500/30",
	high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
	medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
	low: "text-green-400 bg-green-500/10 border-green-500/30"
};

const STATUS_COLORS: Record<MapJob["status"], string> = {
	unassigned: "text-text-tertiary bg-background-primary border-accent-text/20",
	assigned: "text-blue-400 bg-blue-500/10 border-blue-500/30",
	in_progress: "text-purple-400 bg-purple-500/10 border-purple-500/30",
	completed: "text-green-400 bg-green-500/10 border-green-500/30",
	cancelled:
		"text-text-tertiary bg-background-primary border-accent-text/20 line-through"
};

const JOB_TYPE_LABELS: Record<string, string> = {
	installation: "Installation",
	repair: "Repair",
	maintenance: "Maintenance",
	inspection: "Inspection"
};

function Badge({
	children,
	className
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
				className
			)}
		>
			{children}
		</span>
	);
}

function formatTime(iso: string | null) {
	if (!iso) return "Not scheduled";
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit"
	});
}

function secondsAgo(secondsSinceUpdate: number | null): string {
	if (secondsSinceUpdate === null) return "Unknown";
	if (secondsSinceUpdate < 60) return `${Math.round(secondsSinceUpdate)}s ago`;
	if (secondsSinceUpdate < 3600)
		return `${Math.round(secondsSinceUpdate / 60)}m ago`;
	return `${Math.round(secondsSinceUpdate / 3600)}h ago`;
}

// ─── Panel filter types & helpers ────────────────────────────────────────────

type PanelFilter = {
	search: string;
	statuses: Set<MapJob["status"]>;
	priorities: Set<MapJob["priority"]>;
	jobTypes: Set<string>;
	zipCode: string;
	dateAfter: string;
	dateBefore: string;
};

const EMPTY_FILTER: PanelFilter = {
	search: "",
	statuses: new Set(),
	priorities: new Set(),
	jobTypes: new Set(),
	zipCode: "",
	dateAfter: "",
	dateBefore: ""
};

function countActiveFilters(f: PanelFilter): number {
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

function extractZip(address: string): string {
	return address.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? "";
}

function applyPanelFilter(jobs: MapJob[], f: PanelFilter): MapJob[] {
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
		if (f.zipCode) {
			if (!extractZip(job.address).startsWith(f.zipCode)) return false;
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

// ─── Jobs list (default panel state — nothing selected) ──────────────────────

const STATUS_OPTIONS: { value: MapJob["status"]; label: string }[] = [
	{ value: "unassigned", label: "Unassigned" },
	{ value: "assigned", label: "Assigned" },
	{ value: "in_progress", label: "In Progress" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" }
];

const PRIORITY_OPTIONS: {
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

const JOB_TYPE_OPTIONS: { value: string; label: string }[] = [
	{ value: "installation", label: "Installation" },
	{ value: "repair", label: "Repair" },
	{ value: "maintenance", label: "Maintenance" },
	{ value: "inspection", label: "Inspection" }
];

function toggleSet<T>(prev: Set<T>, val: T): Set<T> {
	const next = new Set(prev);
	if (next.has(val)) next.delete(val);
	else next.add(val);
	return next;
}

function JobsList({
	jobs,
	onJobSelect,
	onZoomTo
}: {
	jobs: MapJob[];
	onJobSelect: (job: MapJob) => void;
	onZoomTo: (loc: { lat: number; lng: number }) => void;
}) {
	const [filterOpen, setFilterOpen] = useState(false);
	const [filter, setFilter] = useState<PanelFilter>(EMPTY_FILTER);

	const filtered = applyPanelFilter(jobs, filter);
	const activeCount = countActiveFilters(filter);

	return (
		<div className="flex flex-col h-full">
			{/* ── Header ── */}
			<div className="px-4 py-3 border-b border-accent-text/20 shrink-0">
				<div className="flex items-center justify-between gap-2">
					<div className="min-w-0">
						<h2 className="font-semibold text-text-primary">Active Jobs</h2>
						<p className="text-xs text-text-tertiary mt-0.5">
							{filtered.length === jobs.length
								? `${jobs.length} job${jobs.length !== 1 ? "s" : ""}`
								: `${filtered.length} of ${jobs.length} jobs`}
						</p>
					</div>
					<button
						onClick={() => setFilterOpen((v) => !v)}
						title="Filter jobs"
						className={cn(
							"relative shrink-0 size-8 rounded-xl flex items-center justify-center transition-colors border",
							filterOpen || activeCount > 0
								? "bg-primary text-primary-foreground border-primary"
								: "border-accent-text/30 text-text-secondary hover:text-text-primary hover:bg-background-primary/50"
						)}
					>
						<SlidersHorizontal className="size-3.5" />
						{activeCount > 0 && (
							<span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center border border-background-secondary">
								{activeCount}
							</span>
						)}
					</button>
				</div>

				{/* Search */}
				<div className="mt-2 flex items-center gap-2 bg-background-primary/50 border border-accent-text/20 rounded-xl px-2.5 py-1.5">
					<Search className="size-3.5 text-text-tertiary shrink-0" />
					<input
						type="text"
						value={filter.search}
						onChange={(e) =>
							setFilter((f) => ({ ...f, search: e.target.value }))
						}
						placeholder="Search name or address…"
						className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary outline-none"
					/>
					{filter.search && (
						<button
							onClick={() => setFilter((f) => ({ ...f, search: "" }))}
							className="text-text-tertiary hover:text-text-primary"
						>
							<X className="size-3" />
						</button>
					)}
				</div>
			</div>

			{/* ── Filter panel ── */}
			{filterOpen && (
				<div className="px-4 py-3 border-b border-accent-text/20 shrink-0 space-y-3 bg-background-primary/20">
					{/* Status */}
					<div>
						<p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">
							Status
						</p>
						<div className="flex flex-wrap gap-1">
							{STATUS_OPTIONS.map(({ value, label }) => (
								<button
									key={value}
									onClick={() =>
										setFilter((f) => ({
											...f,
											statuses: toggleSet(f.statuses, value)
										}))
									}
									className={cn(
										"px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
										filter.statuses.has(value)
											? cn("border-transparent", STATUS_COLORS[value])
											: "border-accent-text/20 text-text-secondary hover:text-text-primary hover:bg-background-primary/50"
									)}
								>
									{label}
								</button>
							))}
						</div>
					</div>

					{/* Priority */}
					<div>
						<p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">
							Priority
						</p>
						<div className="flex flex-wrap gap-1">
							{PRIORITY_OPTIONS.map(({ value, label, cls }) => (
								<button
									key={value}
									onClick={() =>
										setFilter((f) => ({
											...f,
											priorities: toggleSet(f.priorities, value)
										}))
									}
									className={cn(
										"px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
										filter.priorities.has(value)
											? cls
											: "border-accent-text/20 text-text-secondary hover:text-text-primary hover:bg-background-primary/50"
									)}
								>
									{label}
								</button>
							))}
						</div>
					</div>

					{/* Job type */}
					<div>
						<p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">
							Type
						</p>
						<div className="flex flex-wrap gap-1">
							{JOB_TYPE_OPTIONS.map(({ value, label }) => (
								<button
									key={value}
									onClick={() =>
										setFilter((f) => ({
											...f,
											jobTypes: toggleSet(f.jobTypes, value)
										}))
									}
									className={cn(
										"px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
										filter.jobTypes.has(value)
											? "border-blue-500/40 text-blue-400 bg-blue-500/10"
											: "border-accent-text/20 text-text-secondary hover:text-text-primary hover:bg-background-primary/50"
									)}
								>
									{label}
								</button>
							))}
						</div>
					</div>

					{/* Zip code */}
					<div>
						<p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">
							Zip Code
						</p>
						<input
							type="text"
							value={filter.zipCode}
							onChange={(e) =>
								setFilter((f) => ({
									...f,
									zipCode: e.target.value.replace(/\D/g, "").slice(0, 5)
								}))
							}
							placeholder="e.g. 30301"
							className="w-full bg-background-primary/50 border border-accent-text/20 rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary/50"
						/>
					</div>

					{/* Date range */}
					<div>
						<p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">
							Scheduled Date Range
						</p>
						<div className="flex items-center gap-1.5">
							<input
								type="date"
								value={filter.dateAfter}
								onChange={(e) =>
									setFilter((f) => ({ ...f, dateAfter: e.target.value }))
								}
								className="flex-1 bg-background-primary/50 border border-accent-text/20 rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-primary/50 [color-scheme:dark]"
							/>
							<span className="text-text-tertiary text-xs shrink-0">to</span>
							<input
								type="date"
								value={filter.dateBefore}
								onChange={(e) =>
									setFilter((f) => ({ ...f, dateBefore: e.target.value }))
								}
								className="flex-1 bg-background-primary/50 border border-accent-text/20 rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-primary/50 [color-scheme:dark]"
							/>
						</div>
					</div>

					{/* Clear all */}
					{activeCount > 0 && (
						<button
							onClick={() => setFilter(EMPTY_FILTER)}
							className="w-full py-1.5 rounded-xl text-xs text-text-tertiary hover:text-text-primary border border-accent-text/20 hover:bg-background-primary/50 transition-colors"
						>
							Clear all filters
						</button>
					)}
				</div>
			)}

			{/* ── Job list ── */}
			<div className="flex-1 overflow-y-auto divide-y divide-accent-text/10">
				{filtered.length === 0 && (
					<p className="text-sm text-text-tertiary p-4">
						{activeCount > 0 ? "No jobs match your filters" : "No active jobs"}
					</p>
				)}
				{filtered.map((job) => (
					<button
						key={job.id}
						onClick={() => {
							if (job.latitude !== null && job.longitude !== null) {
								onZoomTo({ lat: job.latitude, lng: job.longitude });
							}
							onJobSelect(job);
						}}
						className="w-full text-left px-4 py-3 hover:bg-background-primary/40 transition-colors flex items-start gap-3"
					>
						<div
							className={cn(
								"mt-1 size-2.5 rounded-full shrink-0",
								PRIORITY_DOT[job.priority]
							)}
						/>
						<div className="flex-1 min-w-0">
							<div className="flex items-center justify-between gap-2">
								<span className="font-medium text-sm text-text-primary truncate">
									{job.customerName}
								</span>
								<Badge className={STATUS_COLORS[job.status]}>
									{job.status.replace("_", " ")}
								</Badge>
							</div>
							<p className="text-xs text-text-tertiary truncate mt-0.5">
								{job.address}
							</p>
							{job.scheduledTime && (
								<p className="text-xs text-text-secondary mt-0.5">
									{formatTime(job.scheduledTime)}
								</p>
							)}
						</div>
					</button>
				))}
			</div>
		</div>
	);
}

// ─── Drive time fetcher using Distance Matrix API ─────────────────────────────

function useDriveTimes(
	job: MapJob | null,
	techs: MapTech[]
): { driveTimes: DriveTime[]; loading: boolean } {
	const routesLib = useMapsLibrary("routes");
	const [driveTimes, setDriveTimes] = useState<DriveTime[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!routesLib || !job?.latitude || !job?.longitude) {
			setDriveTimes([]);
			return;
		}

		const availableTechs = techs.filter(
			(t) => t.latitude !== null && t.longitude !== null
		);
		if (!availableTechs.length) {
			setDriveTimes([]);
			return;
		}

		setLoading(true);
		const service = new routesLib.DistanceMatrixService();
		const destination = { lat: job.latitude, lng: job.longitude };
		const origins = availableTechs.map((t) => ({
			lat: t.latitude!,
			lng: t.longitude!
		}));

		// Access TravelMode/UnitSystem from the loaded library to avoid the
		// `google` global (which isn't in this tsconfig's `types` array).
		const { TravelMode, UnitSystem } = routesLib as unknown as {
			TravelMode: { DRIVING: string };
			UnitSystem: { IMPERIAL: number };
		};

		service.getDistanceMatrix(
			{
				origins,
				destinations: [destination],
				travelMode: TravelMode.DRIVING as never,
				unitSystem: UnitSystem.IMPERIAL as never
			},
			(
				result: {
					rows: Array<{
						elements: Array<{
							status: string;
							duration: { text: string; value: number };
							distance: { text: string };
						}>;
					}>;
				} | null,
				status: string
			) => {
				setLoading(false);
				if (status !== "OK" || !result) return;
				const times: DriveTime[] = [];
				result.rows.forEach((row, i: number) => {
					const el = row.elements[0];
					if (el?.status === "OK") {
						times.push({
							techId: availableTechs[i].techId,
							techName: availableTechs[i].techName,
							durationText: el.duration.text,
							distanceText: el.distance.text,
							durationSeconds: el.duration.value
						});
					}
				});
				times.sort((a, b) => a.durationSeconds - b.durationSeconds);
				setDriveTimes(times);
			}
		);
	}, [routesLib, job, techs]);

	return { driveTimes, loading };
}

// ─── Job detail panel ─────────────────────────────────────────────────────────

function JobDetail({
	job,
	allTechs,
	onClose
}: {
	job: MapJob;
	allTechs: MapTech[];
	onClose: () => void;
}) {
	const assignedTech = allTechs.find((t) => t.techId === job.assignedTechId);
	const { driveTimes, loading } = useDriveTimes(job, allTechs);

	return (
		<div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
			{/* Header */}
			<div className="flex items-start justify-between gap-2">
				<div className="flex-1 min-w-0">
					<p className="text-xs text-text-tertiary mb-1">Job</p>
					<h2 className="font-semibold text-text-primary leading-tight">
						{job.customerName}
					</h2>
				</div>
				<button
					onClick={onClose}
					className="shrink-0 p-1 rounded-lg hover:bg-background-primary text-text-tertiary hover:text-text-primary transition-colors"
				>
					<X className="size-4" />
				</button>
			</div>

			{/* Badges */}
			<div className="flex flex-wrap gap-1.5">
				<Badge className={PRIORITY_COLORS[job.priority]}>
					{job.priority.charAt(0).toUpperCase() + job.priority.slice(1)}
				</Badge>
				<Badge className={STATUS_COLORS[job.status]}>
					{job.status.replace("_", " ")}
				</Badge>
				{job.jobType && (
					<Badge className="text-text-secondary bg-background-primary border-accent-text/20">
						{JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
					</Badge>
				)}
			</div>

			{/* Details */}
			<div className="flex flex-col gap-2 text-sm">
				<div className="flex items-start gap-2 text-text-secondary">
					<MapPin className="size-3.5 mt-0.5 shrink-0" />
					<span className="leading-snug">{job.address}</span>
				</div>
				<div className="flex items-center gap-2 text-text-secondary">
					<Clock className="size-3.5 shrink-0" />
					<span>{formatTime(job.scheduledTime)}</span>
				</div>
				{assignedTech ? (
					<div className="flex items-center gap-2 text-text-secondary">
						<User className="size-3.5 shrink-0" />
						<span>{assignedTech.techName}</span>
					</div>
				) : (
					<div className="flex items-center gap-2 text-text-tertiary">
						<AlertCircle className="size-3.5 shrink-0" />
						<span>Unassigned</span>
					</div>
				)}
				{job.requiredSkills.length > 0 && (
					<div className="flex items-start gap-2 text-text-secondary">
						<Wrench className="size-3.5 mt-0.5 shrink-0" />
						<span className="leading-snug">
							{job.requiredSkills.join(", ")}
						</span>
					</div>
				)}
			</div>

			{/* Drive times from techs */}
			<div className="border-t border-accent-text/20 pt-3">
				<p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
					Drive times from techs
				</p>
				{loading && (
					<p className="text-xs text-text-tertiary">Calculating...</p>
				)}
				{!loading && driveTimes.length === 0 && (
					<p className="text-xs text-text-tertiary">No techs with location</p>
				)}
				<div className="flex flex-col gap-1.5">
					{driveTimes.slice(0, 5).map((dt) => (
						<div
							key={dt.techId}
							className="flex items-center justify-between text-xs"
						>
							<span className="text-text-secondary truncate max-w-[120px]">
								{dt.techName}
							</span>
							<span className="text-text-primary font-medium shrink-0 ml-2">
								{dt.durationText} · {dt.distanceText}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Action */}
			<a
				href="/dispatch"
				className="mt-auto block text-center px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
			>
				Open in Dispatch
			</a>
		</div>
	);
}

// ─── Tech detail panel ────────────────────────────────────────────────────────

function TechDetail({ tech, onClose }: { tech: MapTech; onClose: () => void }) {
	return (
		<div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
			{/* Header */}
			<div className="flex items-start justify-between gap-2">
				<div className="flex-1 min-w-0">
					<p className="text-xs text-text-tertiary mb-1">Technician</p>
					<h2 className="font-semibold text-text-primary leading-tight">
						{tech.techName}
					</h2>
				</div>
				<button
					onClick={onClose}
					className="shrink-0 p-1 rounded-lg hover:bg-background-primary text-text-tertiary hover:text-text-primary transition-colors"
				>
					<X className="size-4" />
				</button>
			</div>

			{/* Availability */}
			<div className="flex items-center gap-2">
				{tech.isAvailable ? (
					<Badge className="text-green-400 bg-green-500/10 border-green-500/30">
						<CheckCircle2 className="size-3 mr-1" />
						Available
					</Badge>
				) : (
					<Badge className="text-text-tertiary bg-background-primary border-accent-text/20">
						Unavailable
					</Badge>
				)}
				{tech.currentJobId && (
					<Badge className="text-purple-400 bg-purple-500/10 border-purple-500/30">
						On a job
					</Badge>
				)}
			</div>

			{/* Details */}
			<div className="flex flex-col gap-2 text-sm">
				{tech.phone && (
					<div className="flex items-center gap-2 text-text-secondary">
						<Phone className="size-3.5 shrink-0" />
						<a
							href={`tel:${tech.phone}`}
							className="hover:text-text-primary transition-colors"
						>
							{tech.phone}
						</a>
					</div>
				)}
				<div className="flex items-center gap-2 text-text-secondary">
					<Navigation className="size-3.5 shrink-0" />
					<span>
						Last seen{" "}
						<span className="text-text-primary">
							{secondsAgo(tech.secondsSinceUpdate)}
						</span>
					</span>
				</div>
				{tech.skills.length > 0 && (
					<div className="flex items-start gap-2 text-text-secondary">
						<Wrench className="size-3.5 mt-0.5 shrink-0" />
						<span className="leading-snug">{tech.skills.join(", ")}</span>
					</div>
				)}
			</div>

			{/* Trail note */}
			<div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-300">
				Location trail for the past hour is shown on the map.
			</div>
		</div>
	);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function MapSidePanel({
	selectedJob,
	selectedTech,
	allTechs,
	allJobs,
	onJobSelect,
	onZoomTo,
	onClose
}: Props) {
	if (selectedJob) {
		return (
			<JobDetail job={selectedJob} allTechs={allTechs} onClose={onClose} />
		);
	}
	if (selectedTech) {
		return <TechDetail tech={selectedTech} onClose={onClose} />;
	}
	return (
		<JobsList jobs={allJobs} onJobSelect={onJobSelect} onZoomTo={onZoomTo} />
	);
}
