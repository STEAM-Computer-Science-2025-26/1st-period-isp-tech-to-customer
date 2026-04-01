"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/index";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import FadeEnd from "@/components/ui/FadeEnd";
import { FilterSearchBar } from "@/components/ui/FilterSearchBar";
import CalendarFilterDropdown from "@/app/calendar/components/CalendarFilterDropdown";
import type { JobDTO } from "@/app/types/types";
import { apiFetch } from "@/lib/api";
import { Eye } from "lucide-react";
import { JobDetailPanel } from "@/components/panels/JobDetailPanel";
import { useOpenToJob } from "@/lib/hooks/useOpenTo";

type EventTone = "urgent" | "normal" | "info";

type CalendarEvent = {
	jobId: string;
	title: string;
	jobType: string;
	address: string;
	scheduledTime: string | null;
	tone: EventTone;
};

type EmployeeSummary = {
	id: string;
	name: string;
};

type FilterOption = { value: string; label: string };

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_HEIGHT = 72; // px per hour

const getWeekDays = (date: Date): Date[] => {
	const startOfWeek = new Date(date);
	startOfWeek.setDate(date.getDate() - date.getDay());
	const days = [];
	for (let i = 0; i < 7; i++) {
		const day = new Date(startOfWeek);
		day.setDate(startOfWeek.getDate() + i);
		days.push(day);
	}
	return days;
};

const getMonthDays = (date: Date): Date[] => {
	const year = date.getFullYear();
	const month = date.getMonth();
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);
	const startDate = new Date(firstDay);
	startDate.setDate(firstDay.getDate() - firstDay.getDay());
	const days = [];
	let current = new Date(startDate);
	while (current <= lastDay || days.length % 7 !== 0) {
		days.push(new Date(current));
		current.setDate(current.getDate() + 1);
		if (days.length > 42) break;
	}
	return days;
};

const toEventTone = (job: JobDTO): EventTone => {
	if (job.priority === "emergency" || job.priority === "high") return "urgent";
	if (job.priority === "medium") return "normal";
	return "info";
};

const formatHour = (hour: number): string => {
	if (hour === 0) return "12am";
	if (hour === 12) return "12pm";
	return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
};

const formatEventTime = (iso: string): string => {
	const d = new Date(iso);
	if (isNaN(d.getTime())) return "";
	const h = d.getHours();
	const m = d.getMinutes();
	const label = h === 0 ? "12" : h <= 12 ? String(h) : String(h - 12);
	const ampm = h < 12 ? "am" : "pm";
	return m === 0
		? `${label}${ampm}`
		: `${label}:${String(m).padStart(2, "0")}${ampm}`;
};

const mapJobsToDayEvents = (
	jobs: JobDTO[]
): Record<string, CalendarEvent[]> => {
	const grouped: Record<string, CalendarEvent[]> = {};

	for (const job of jobs) {
		const sourceTime = job.scheduledTime ?? job.createdAt;
		const sourceDate = sourceTime ? new Date(sourceTime) : null;
		if (!sourceDate || isNaN(sourceDate.getTime())) continue;

		const dayKey = sourceDate.toISOString().split("T")[0];

		if (!grouped[dayKey]) grouped[dayKey] = [];

		grouped[dayKey].push({
			jobId: String(job.id),
			title: job.customerName?.trim() || "Unnamed Customer",
			jobType: job.jobType.replace(/_/g, " "),
			address: job.address?.trim() || "",
			scheduledTime: job.scheduledTime ?? null,
			tone: toEventTone(job)
		});
	}

	return grouped;
};

const toneClasses: Record<EventTone, string> = {
	urgent:
		"border-l-destructive-background bg-destructive-background/10 text-destructive-text",
	normal:
		"border-l-success-foreground bg-success-background/10 text-success-text",
	info: "border-l-info-foreground bg-info-background/10 text-info-text"
};

const toneDotClasses: Record<EventTone, string> = {
	urgent: "bg-destructive-foreground",
	normal: "bg-success-foreground",
	info: "bg-info-foreground"
};

// ── Day view with time grid ──────────────────────────────────────────────────

const DayTimeGrid = ({
	events,
	onSelect,
	selectedJobId
}: {
	events: CalendarEvent[];
	onSelect: (jobId: string) => void;
	selectedJobId: string | null;
}) => {
	const hours = Array.from(
		{ length: END_HOUR - START_HOUR + 1 },
		(_, i) => START_HOUR + i
	);
	const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

	// Split events into positioned (have scheduledTime) and unscheduled
	const positioned = events.filter((e) => {
		if (!e.scheduledTime) return false;
		const d = new Date(e.scheduledTime);
		const h = d.getHours();
		return h >= START_HOUR && h < END_HOUR;
	});
	const unscheduled = events.filter((e) => {
		if (!e.scheduledTime) return true;
		const d = new Date(e.scheduledTime);
		const h = d.getHours();
		return h < START_HOUR || h >= END_HOUR;
	});

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			{unscheduled.length > 0 && (
				<div className="px-4 py-3 border-b border-background-secondary/40">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-2">
						Outside hours / Unscheduled
					</p>
					<div className="flex flex-col gap-1.5">
						{unscheduled.map((event) => (
							<EventCard
								key={event.jobId}
								event={event}
								onSelect={onSelect}
								selected={selectedJobId === event.jobId}
								compact
							/>
						))}
					</div>
				</div>
			)}
			<div className="relative flex-1" style={{ minHeight: totalHeight }}>
				{/* Hour lines */}
				{hours.map((hour) => (
					<div
						key={hour}
						className="absolute inset-x-0 flex items-start pointer-events-none"
						style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
					>
						<span className="w-14 shrink-0 pr-2 text-right text-[11px] text-text-tertiary -mt-2 select-none">
							{formatHour(hour)}
						</span>
						<div className="flex-1 border-t border-background-secondary/40" />
					</div>
				))}

				{/* Events */}
				<div className="absolute inset-y-0 left-14 right-3">
					{positioned.map((event) => {
						const d = new Date(event.scheduledTime!);
						const top =
							(d.getHours() - START_HOUR) * HOUR_HEIGHT +
							(d.getMinutes() / 60) * HOUR_HEIGHT;
						return (
							<div
								key={event.jobId}
								className="absolute left-0 right-0"
								style={{ top, minHeight: HOUR_HEIGHT * 0.75 }}
							>
								<EventCard
									event={event}
									onSelect={onSelect}
									selected={selectedJobId === event.jobId}
								/>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};

// ── Event card ───────────────────────────────────────────────────────────────

const EventCard = ({
	event,
	onSelect,
	selected,
	compact = false
}: {
	event: CalendarEvent;
	onSelect: (jobId: string) => void;
	selected: boolean;
	compact?: boolean;
}) => {
	return (
		<button
			type="button"
			onClick={() => onSelect(event.jobId)}
			className={cn(
				"w-full text-left rounded-r-lg border border-accent-main/20 border-l-2 px-3 py-2 transition-all cursor-pointer",
				"hover:shadow-md hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-main/50",
				toneClasses[event.tone],
				selected && "ring-2 ring-accent-main/60 shadow-md"
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				<span
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						toneDotClasses[event.tone]
					)}
				/>
				<p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5">
					{event.title}
				</p>
				<span className="shrink-0 rounded-md bg-background-main/70 px-1.5 py-0.5 text-[11px] font-medium capitalize text-text-secondary">
					{event.jobType}
				</span>
			</div>
			{!compact && (
				<div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-[11px] text-text-secondary/80">
					<span className="min-w-0 truncate">{event.address}</span>
					{event.scheduledTime && (
						<span className="shrink-0 whitespace-nowrap font-medium">
							{formatEventTime(event.scheduledTime)}
						</span>
					)}
				</div>
			)}
		</button>
	);
};

// ── Main page ────────────────────────────────────────────────────────────────

const CalendarPage = () => {
	const openToJob = useOpenToJob();
	const [jobs, setJobs] = useState<JobDTO[]>([]);
	const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
	const [filterOpen, setFilterOpen] = useState(false);
	const [viewOpen, setViewOpen] = useState(false);
	const [filterQuery, setFilterQuery] = useState("");
	const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
	const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
	const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
	const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
	const [currentView, setCurrentView] = useState<"day" | "week" | "month">(
		"week"
	);
	const [currentDate, setCurrentDate] = useState(new Date());
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const [sidePanelOpen, setSidePanelOpen] = useState(false);

	useEffect(() => {
		let isMounted = true;
		const loadJobs = async () => {
			try {
				const payload = await apiFetch<{ jobs?: JobDTO[] }>("/jobs");
				if (isMounted) setJobs(payload.jobs ?? []);
			} catch {
				if (isMounted) setJobs([]);
			}
		};
		void loadJobs();
		return () => {
			isMounted = false;
		};
	}, []);

	useEffect(() => {
		let isMounted = true;
		const loadEmployees = async () => {
			try {
				const payload = await apiFetch<{ employees?: EmployeeSummary[] }>(
					"/employees"
				);
				if (isMounted) setEmployees(payload.employees ?? []);
			} catch {
				if (isMounted) setEmployees([]);
			}
		};
		void loadEmployees();
		return () => {
			isMounted = false;
		};
	}, []);

	const handleSelectJob = (jobId: string) => {
		setSelectedJobId(jobId);
		setSidePanelOpen(true);
	};

	const employeeOptions = useMemo<FilterOption[]>(() => {
		const employeeMap = new Map(
			employees.map((employee) => [String(employee.id), employee.name])
		);
		const unique = new Map<string, string>();
		let hasUnassigned = false;
		for (const job of jobs) {
			if (job.assignedTechId) {
				const techId = String(job.assignedTechId);
				const name = employeeMap.get(techId) ?? "Unknown tech";
				unique.set(techId, name);
			} else {
				hasUnassigned = true;
			}
		}
		const options = Array.from(unique.entries())
			.map(([value, label]) => ({ value, label }))
			.sort((a, b) => a.label.localeCompare(b.label));
		if (hasUnassigned)
			options.unshift({ value: "unassigned", label: "Unassigned" });
		return options;
	}, [employees, jobs]);

	const priorityOrder = ["emergency", "high", "medium", "low"];
	const priorityOptions = useMemo<FilterOption[]>(() => {
		const unique = new Set<string>();
		for (const job of jobs) if (job.priority) unique.add(job.priority);
		return Array.from(unique)
			.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b))
			.map((value) => ({ value, label: value.replace(/_/g, " ") }));
	}, [jobs]);

	const statusOrder = [
		"unassigned",
		"assigned",
		"in_progress",
		"completed",
		"cancelled"
	];
	const statusOptions = useMemo<FilterOption[]>(() => {
		const unique = new Set<string>();
		for (const job of jobs) if (job.status) unique.add(job.status);
		return Array.from(unique)
			.sort((a, b) => statusOrder.indexOf(a) - statusOrder.indexOf(b))
			.map((value) => ({ value, label: value.replace(/_/g, " ") }));
	}, [jobs]);

	const jobTypeOptions = useMemo<FilterOption[]>(() => {
		const unique = new Set<string>();
		for (const job of jobs) if (job.jobType) unique.add(job.jobType);
		return Array.from(unique)
			.sort()
			.map((value) => ({ value, label: value.replace(/_/g, " ") }));
	}, [jobs]);

	const toggleSelection = (
		value: string,
		selected: string[],
		setSelected: (next: string[]) => void
	) => {
		setSelected(
			selected.includes(value)
				? selected.filter((item) => item !== value)
				: [...selected, value]
		);
	};

	const filteredJobs = useMemo(() => {
		return jobs.filter((job) => {
			if (selectedEmployees.length > 0) {
				const techId = job.assignedTechId
					? String(job.assignedTechId)
					: "unassigned";
				if (!selectedEmployees.includes(techId)) return false;
			}
			if (
				selectedPriorities.length > 0 &&
				!selectedPriorities.includes(job.priority ?? "")
			)
				return false;
			if (
				selectedStatuses.length > 0 &&
				!selectedStatuses.includes(job.status ?? "")
			)
				return false;
			if (
				selectedJobTypes.length > 0 &&
				!selectedJobTypes.includes(job.jobType ?? "")
			)
				return false;
			return true;
		});
	}, [
		jobs,
		selectedEmployees,
		selectedPriorities,
		selectedStatuses,
		selectedJobTypes
	]);

	const activeFilterCount =
		selectedEmployees.length +
		selectedPriorities.length +
		selectedStatuses.length +
		selectedJobTypes.length;

	const dayEvents = useMemo(
		() => mapJobsToDayEvents(filteredJobs),
		[filteredJobs]
	);

	const navigate = (delta: number) => {
		const d = new Date(currentDate);
		if (currentView === "day") d.setDate(d.getDate() + delta);
		else if (currentView === "week") d.setDate(d.getDate() + delta * 7);
		else d.setMonth(d.getMonth() + delta);
		setCurrentDate(d);
	};

	const viewLabel =
		currentView === "week"
			? `Week of ${getWeekDays(currentDate)[0].toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
			: currentView === "month"
				? currentDate.toLocaleDateString("en-US", {
						year: "numeric",
						month: "long"
					})
				: currentDate.toLocaleDateString("en-US", {
						weekday: "long",
						year: "numeric",
						month: "long",
						day: "numeric"
					});

	return (
		<MainContent>
			{/* Toolbar */}
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
					{/* Nav */}
					<button
						className="p-1.5 rounded-md border border-background-secondary/60 bg-background-primary/60 hover:bg-background-secondary transition-colors text-lg leading-none text-text-secondary"
						onClick={() => navigate(-1)}
					>
						‹
					</button>
					<span className="text-sm font-semibold text-text-main whitespace-nowrap">
						{viewLabel}
					</span>
					<button
						className="p-1.5 rounded-md border border-background-secondary/60 bg-background-primary/60 hover:bg-background-secondary transition-colors text-lg leading-none text-text-secondary"
						onClick={() => navigate(1)}
					>
						›
					</button>

					<FilterSearchBar
						filterOpen={filterOpen}
						onFilterOpenChange={setFilterOpen}
						activeFilterCount={activeFilterCount}
						onClearFilters={() => {
							setFilterQuery("");
							setSelectedEmployees([]);
							setSelectedPriorities([]);
							setSelectedStatuses([]);
							setSelectedJobTypes([]);
						}}
						filterQuery={filterQuery}
						onFilterQueryChange={setFilterQuery}
						filterPlaceholder="Search filters..."
						filterDropdown={
							<CalendarFilterDropdown
								searchQuery={filterQuery}
								employeeOptions={employeeOptions}
								priorityOptions={priorityOptions}
								statusOptions={statusOptions}
								jobTypeOptions={jobTypeOptions}
								selectedEmployees={selectedEmployees}
								selectedPriorities={selectedPriorities}
								selectedStatuses={selectedStatuses}
								selectedJobTypes={selectedJobTypes}
								onToggleEmployee={(value) =>
									toggleSelection(value, selectedEmployees, setSelectedEmployees)
								}
								onTogglePriority={(value) =>
									toggleSelection(value, selectedPriorities, setSelectedPriorities)
								}
								onToggleStatus={(value) =>
									toggleSelection(value, selectedStatuses, setSelectedStatuses)
								}
								onToggleJobType={(value) =>
									toggleSelection(value, selectedJobTypes, setSelectedJobTypes)
								}
							/>
						}
						className="w-full max-w-md"
					/>
				</div>

				{/* View switcher — desktop */}
				<div className="hidden items-center rounded-lg border border-background-secondary/60 bg-background-primary/60 overflow-hidden text-xs font-semibold sm:flex">
					{(["day", "week", "month"] as const).map((v) => (
						<button
							key={v}
							className={cn(
								"px-3 py-1.5 capitalize transition-colors",
								currentView === v
									? "bg-background-secondary/75 text-text-main shadow-sm"
									: "text-text-secondary hover:text-text-main"
							)}
							onClick={() => setCurrentView(v)}
						>
							{v}
						</button>
					))}
				</div>

				{/* View switcher — mobile */}
				<div className="relative sm:hidden">
					<button
						type="button"
						className="flex items-center gap-2 rounded-md border border-background-secondary/60 bg-background-primary/60 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-background-secondary"
						onClick={() => setViewOpen((o) => !o)}
					>
						<Eye className="h-4 w-4" />
						{currentView.charAt(0).toUpperCase() + currentView.slice(1)}
					</button>
					{viewOpen && (
						<div className="absolute right-0 z-30 mt-2 w-32 rounded-lg border border-background-secondary/60 bg-background-main p-1 shadow-lg">
							{(["day", "week", "month"] as const).map((v) => (
								<button
									key={v}
									className={cn(
										"flex w-full items-center rounded-md px-2 py-1 text-left text-xs capitalize",
										currentView === v
											? "bg-background-primary/60 text-text-main font-semibold"
											: "text-text-secondary hover:bg-background-primary/60"
									)}
									onClick={() => {
										setCurrentView(v);
										setViewOpen(false);
									}}
								>
									{v}
								</button>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Calendar area */}
			<div className="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
				{/* View content */}
				<div className="flex-1 overflow-hidden">
					{currentView === "week" && (
						<div className="grid h-full min-w-245 w-full grid-cols-7 overflow-x-auto">
							{getWeekDays(currentDate).map((date) => {
								const dayKey = date.toISOString().split("T")[0];
								const dayName = date.toLocaleDateString("en-US", {
									weekday: "short"
								});
								const isToday =
									date.toDateString() === new Date().toDateString();
								const events = dayEvents[dayKey] ?? [];
								return (
									<div
										key={dayKey}
										className="flex min-w-0 flex-col border-r border-accent-text/80 last:border-r-0"
									>
										<div
											className={cn(
												"border-b-2 sticky top-0 border-accent-text/80 bg-background-main/90 px-3 py-2",
												isToday && "border-b-accent-main/60"
											)}
										>
											<div className="flex items-center gap-1.5">
												<span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-text-dark-3">
													{dayName}
												</span>
												<span
													className={cn(
														"text-[10px] font-semibold leading-none",
														isToday
															? "flex size-4 items-center justify-center rounded-full bg-accent-main/20 text-accent-text"
															: "text-accent-text-dark-3"
													)}
												>
													{date.getDate()}
												</span>
											</div>
										</div>
										<FadeEnd
											prefix="after"
											orientation="vertical"
											sizeClass="h-12"
											fromColorClass="background-primary"
											className="h-[calc(100%-2.25rem)] overflow-y-auto p-2"
										>
											<div className="space-y-1.5">
												{events.length > 0 ? (
													events.map((event) => (
														<EventCard
															key={event.jobId}
															event={event}
															onSelect={handleSelectJob}
															selected={selectedJobId === event.jobId}
														/>
													))
												) : (
													<div className="py-4 text-center text-xs font-medium text-text-secondary/50">
														No jobs
													</div>
												)}
											</div>
										</FadeEnd>
									</div>
								);
							})}
						</div>
					)}

					{currentView === "month" && (
						<div className="h-full overflow-y-auto p-4">
							<div className="grid grid-cols-7 gap-1">
								{daysOfWeek.map((day) => (
									<div
										key={day}
										className="p-2 text-center text-xs font-semibold uppercase text-accent-text-dark-3"
									>
										{day}
									</div>
								))}
								{getMonthDays(currentDate).map((date) => {
									const dayKey = date.toISOString().split("T")[0];
									const isCurrentMonth =
										date.getMonth() === currentDate.getMonth();
									const isToday =
										date.toDateString() === new Date().toDateString();
									const events = dayEvents[dayKey] ?? [];
									return (
										<div
											key={dayKey}
											className={cn(
												"min-h-24 rounded-lg border border-accent-text/15 p-1.5",
												!isCurrentMonth &&
													"bg-background-secondary/20 opacity-60"
											)}
										>
											<div
												className={cn(
													"mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
													isToday
														? "bg-accent-main/20 text-accent-text"
														: "text-text-secondary"
												)}
											>
												{date.getDate()}
											</div>
											<div className="space-y-0.5">
												{events.slice(0, 3).map((event) => (
													<button
														key={event.jobId}
														type="button"
														onClick={() => handleSelectJob(event.jobId)}
														className={cn(
															"w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate transition-all",
															"hover:brightness-105 focus:outline-none",
															toneClasses[event.tone],
															selectedJobId === event.jobId &&
																"ring-1 ring-accent-main/60"
														)}
														title={event.title}
													>
														{event.title}
													</button>
												))}
												{events.length > 3 && (
													<p className="text-[11px] text-text-tertiary px-1">
														+{events.length - 3} more
													</p>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					)}

					{currentView === "day" && (
						<DayTimeGrid
							events={dayEvents[currentDate.toISOString().split("T")[0]] ?? []}
							onSelect={handleSelectJob}
							selectedJobId={selectedJobId}
						/>
					)}
				</div>
			</div>

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
		</MainContent>
	);
};

export default CalendarPage;
