"use client";

import { useEffect, useRef, useState } from "react";
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
	SlidersHorizontal,
	Check,
	CalendarDays
} from "lucide-react";
import {
	type PanelFilter,
	createEmptyFilter,
	STATUS_OPTIONS,
	PRIORITY_OPTIONS,
	JOB_TYPE_OPTIONS,
	countActiveFilters,
	applyPanelFilter,
	toggleSet
} from "./mapFilterUtils";
import { PopoverDatePicker } from "@/components/ui/DateRangePicker";

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
	emergency: "text-red-700 bg-red-200/60 border-red-300/50",
	high: "text-orange-700 bg-orange-200/60 border-orange-300/50",
	medium: "text-amber-700 bg-amber-200/60 border-amber-300/50",
	low: "text-emerald-700 bg-emerald-200/60 border-emerald-300/50"
};

const STATUS_COLORS: Record<MapJob["status"], string> = {
	unassigned:
		"text-text-secondary bg-background-primary/80 border-accent-text/20",
	assigned: "text-blue-700 bg-blue-200/60 border-blue-300/50",
	in_progress: "text-violet-700 bg-violet-200/60 border-violet-300/50",
	completed: "text-emerald-700 bg-emerald-200/60 border-emerald-300/50",
	cancelled:
		"text-text-tertiary bg-background-primary/60 border-accent-text/15 line-through"
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

// ─── Filter UI helpers (matching MapFilterDropdown style) ───────────────────

function Section({
	title,
	children
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section>
			<p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-text-tertiary">
				{title}
			</p>
			{children}
		</section>
	);
}

function OptionList<T extends string>({
	options,
	selected,
	onToggle
}: {
	options: { value: T; label: string; cls?: string }[];
	selected: Set<T>;
	onToggle: (value: T) => void;
}) {
	return (
		<div className="flex flex-col">
			{options.map((option) => {
				const isActive = selected.has(option.value);
				return (
					<button
						key={option.value}
						type="button"
						onClick={() => onToggle(option.value)}
						className={cn(
							"-mx-4 flex items-center justify-between px-6 py-1 text-sm font-medium transition-colors hover:bg-background-primary/30",
							isActive
								? cn("text-text-primary", option.cls)
								: "text-text-secondary hover:text-text-primary"
						)}
					>
						<span>{option.label}</span>
						<span
							className={cn(
								"grid size-5 place-items-center rounded-full transition-colors",
								isActive ? "text-primary-foreground" : "text-transparent"
							)}
						>
							<Check className="size-3.5" />
						</span>
					</button>
				);
			})}
		</div>
	);
}

function formatSelectionSummary(start?: string, end?: string): string {
	const fmt = new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric"
	});
	const s = start ? fmt.format(new Date(start)) : undefined;
	const e = end ? fmt.format(new Date(end)) : undefined;
	if (s && e) return `${s} – ${e}`;
	if (s) return s;
	if (e) return e;
	return "Any date";
}

// ─── Jobs list (default panel state — nothing selected) ─────────────────────

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
	const [filter, setFilter] = useState<PanelFilter>(() => createEmptyFilter());
	const [datePickerOpen, setDatePickerOpen] = useState(false);
	const dateAnchorRef = useRef<HTMLButtonElement>(null);

	// Close date picker when filter panel closes
	useEffect(() => {
		if (!filterOpen) setDatePickerOpen(false);
	}, [filterOpen]);

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
							"relative shrink-0 size-8 rounded-xl flex items-center justify-center transition-colors",
							filterOpen || activeCount > 0
								? "text-primary"
								: "text-text-tertiary hover:text-text-primary"
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

				{/* Search — borderless, text-only with icon */}
				<div className="mt-2 flex items-center gap-2 px-0.5 py-1.5">
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
							className="text-text-tertiary hover:text-text-primary transition-colors"
						>
							<X className="size-3" />
						</button>
					)}
				</div>
			</div>

			{/* ── Filter panel (matching MapFilterDropdown layout) ── */}
			{filterOpen && (
				<div className="px-4 py-3 border-b border-accent-text/20 shrink-0 space-y-3">
					<Section title="Status">
						<OptionList
							options={STATUS_OPTIONS}
							selected={filter.statuses}
							onToggle={(v) =>
								setFilter((f) => ({
									...f,
									statuses: toggleSet(f.statuses, v)
								}))
							}
						/>
					</Section>

					<Section title="Priority">
						<OptionList
							options={PRIORITY_OPTIONS}
							selected={filter.priorities}
							onToggle={(v) =>
								setFilter((f) => ({
									...f,
									priorities: toggleSet(f.priorities, v)
								}))
							}
						/>
					</Section>

					<Section title="Job type">
						<OptionList
							options={JOB_TYPE_OPTIONS}
							selected={filter.jobTypes}
							onToggle={(v) =>
								setFilter((f) => ({
									...f,
									jobTypes: toggleSet(f.jobTypes, v)
								}))
							}
						/>
					</Section>

					<Section title="Other">
						<div className="flex flex-col">
							{/* ZIP code row */}
							<div className="-mx-4 flex items-center justify-between gap-3 px-6 py-1 text-sm font-medium text-text-secondary transition-colors hover:bg-background-primary/30 hover:text-text-primary">
								<span className="text-text-primary">ZIP code</span>
								<input
									type="text"
									value={filter.zipCode}
									onChange={(e) =>
										setFilter((f) => ({
											...f,
											zipCode: e.target.value.replace(/\D/g, "").slice(0, 5)
										}))
									}
									placeholder="30301"
									className="w-14 rounded-md border border-accent-text/20 bg-background-secondary/80 px-1.5 py-px text-center text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary/50"
								/>
							</div>

							{/* Scheduled date — triggers PopoverDatePicker */}
							<button
								ref={dateAnchorRef}
								type="button"
								onClick={() => setDatePickerOpen((v) => !v)}
								className="-mx-4 flex items-center justify-between px-6 py-1 text-sm font-medium text-text-secondary transition-colors hover:bg-background-primary/30 hover:text-text-primary"
							>
								<span className="text-text-primary">Scheduled window</span>
								<div className="flex items-center gap-2 text-xs text-text-tertiary">
									<span>
										{formatSelectionSummary(
											filter.dateAfter,
											filter.dateBefore
										)}
									</span>
									<CalendarDays className="size-3.5 text-text-secondary" />
								</div>
							</button>
						</div>
					</Section>

					{/* Clear all */}
					{activeCount > 0 && (
						<button
							onClick={() => setFilter(createEmptyFilter())}
							className="w-full py-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
						>
							Clear all filters
						</button>
					)}
				</div>
			)}

			{/* PopoverDatePicker portal */}
			<PopoverDatePicker
				open={filterOpen && datePickerOpen}
				onOpenChange={setDatePickerOpen}
				anchorEl={dateAnchorRef.current}
				mode="range"
				showHeader={false}
				selection={{
					start: filter.dateAfter,
					end: filter.dateBefore
				}}
				onChange={({ start, end }) =>
					setFilter((f) => ({
						...f,
						dateAfter: start ?? "",
						dateBefore: end ?? ""
					}))
				}
				onClear={() =>
					setFilter((f) => ({
						...f,
						dateAfter: "",
						dateBefore: ""
					}))
				}
			/>

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
					className="shrink-0 p-1 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
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
					className="shrink-0 p-1 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
				>
					<X className="size-4" />
				</button>
			</div>

			{/* Availability */}
			<div className="flex items-center gap-2">
				{tech.isAvailable ? (
					<Badge className="text-emerald-700 bg-emerald-200/60 border-emerald-300/50">
						<CheckCircle2 className="size-3 mr-1" />
						Available
					</Badge>
				) : (
					<Badge className="text-text-tertiary bg-background-primary border-accent-text/20">
						Unavailable
					</Badge>
				)}
				{tech.currentJobId && (
					<Badge className="text-violet-700 bg-violet-200/60 border-violet-300/50">
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
