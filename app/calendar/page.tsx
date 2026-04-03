"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import MainContent from "@/components/layout/MainContent";
import type { JobDTO } from "@/app/types/types";
import { apiFetch } from "@/lib/api";
import { useOpenToJob } from "@/lib/hooks/useOpenTo";
import { cn } from "@/lib/utils/index";
import SidePanel from "@/components/layout/SidePanel";
import { useUiStore } from "@/lib/stores/uiStore";
import FadeEnd from "@/components/ui/FadeEnd";
import { FilterSearchBar } from "@/components/ui/FilterSearchBar";
import CalendarFilterDropdown from "@/app/calendar/components/CalendarFilterDropdown";
import { Eye, SlidersHorizontal } from "lucide-react";
import { JobDetailPanel } from "@/components/panels/JobDetailPanel";

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

const formatWeekRange = (date: Date): string => {
	const [start, , , , , , end] = getWeekDays(date);
	if (!start || !end) return "";
	const startLabel = start.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric"
	});
	const endLabel = end.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric"
	});
	return `${startLabel}-${endLabel}`;
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

const toneBarClasses: Record<EventTone, string> = {
	urgent: "border-destructive-background bg-destructive-background/30",
	normal: "border-success-foreground bg-success-background/30",
	info: "border-info-foreground bg-info-background/30"
};

const DayTimeGrid = ({
	events,
	onSelect,
	selectedJobId,
	showSelection
}: {
	events: CalendarEvent[];
	onSelect: (jobId: string) => void;
	selectedJobId: string | null;
	showSelection: boolean;
}) => {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const timer = setInterval(() => {
			setNow(new Date());
		}, 30000);
		return () => clearInterval(timer);
	}, []);

	const hours = Array.from(
		{ length: END_HOUR - START_HOUR + 1 },
		(_, i) => START_HOUR + i
	);
	const nowMinutes = now.getHours() * 60 + now.getMinutes();
	const dayStartMinutes = START_HOUR * 60;
	const dayEndMinutes = END_HOUR * 60;
	const showNowLine =
		nowMinutes >= dayStartMinutes && nowMinutes <= dayEndMinutes;
	const nowTop = ((nowMinutes - dayStartMinutes) / 60) * HOUR_HEIGHT - 12;
	const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

	const positioned = events.filter((event) => {
		if (!event.scheduledTime) return false;
		const d = new Date(event.scheduledTime);
		const h = d.getHours();
		return h >= START_HOUR && h < END_HOUR;
	});
	const unscheduled = events.filter((event) => {
		if (!event.scheduledTime) return true;
		const d = new Date(event.scheduledTime);
		const h = d.getHours();
		return h < START_HOUR || h >= END_HOUR;
	});

	return (
		<div className="flex h-full flex-col overflow-y-auto pt-3">
			{unscheduled.length > 0 && (
				<div className="border-b border-background-secondary/40 px-4 py-3">
					<p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
						Outside hours / Unscheduled
					</p>
					<div className="flex flex-col gap-1.5">
						{unscheduled.map((event) => (
							<EventCard
								key={event.jobId}
								event={event}
								onSelect={onSelect}
								selected={showSelection && selectedJobId === event.jobId}
								compact
							/>
						))}
					</div>
				</div>
			)}
			<div className="relative flex-1" style={{ minHeight: totalHeight }}>
				{showNowLine && (
					<div
						className="absolute inset-x-0 z-10 flex items-center"
						style={{ top: nowTop }}
					>
						<div className="w-14 pr-2 text-right">
							<span className="inline-flex items-center rounded bg-destructive-background px-1 py-0.5 text-[9px] font-semibold text-white">
								{formatEventTime(now.toISOString())}
							</span>
						</div>
						<div className="h-px flex-1 bg-destructive-foreground/80" />
					</div>
				)}
				{hours.map((hour) => (
					<div
						key={hour}
						className="pointer-events-none absolute inset-x-0 flex items-start"
						style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
					>
						<span className="-mt-2 w-14 shrink-0 select-none pr-2 text-right text-[11px] text-text-tertiary">
							{formatHour(hour)}
						</span>
						<div className="flex-1 border-t border-background-secondary/40" />
					</div>
				))}

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
									selected={showSelection && selectedJobId === event.jobId}
								/>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};

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
				"w-full cursor-pointer rounded-r-lg border border-accent-main/20 border-l-2 px-3 py-2 text-left transition-all",
				"hover:shadow-md hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-main/50",
				toneClasses[event.tone],
				selected && "ring-2 ring-accent-main/60 shadow-md"
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				<span
					className={cn("size-1.5 shrink-0 rounded-full", toneDotClasses[event.tone])}
				/>
				<p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5">
					{event.title}
				</p>
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
	const sidePanelOpen = useUiStore((state) => state.sidePanelOpen);
	const setSidePanelOpen = useUiStore((state) => state.setSidePanelOpen);

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
			? formatWeekRange(currentDate)
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
			<div
				className={cn(
					"relative h-[calc(100vh-8rem)] w-full transition-[padding] duration-300 ease-in-out",
					sidePanelOpen && "pr-[calc(max(30vw,20rem)-1.5rem)]"
				)}
			>
				<div className="flex h-full w-full flex-col overflow-hidden">
					<div className="flex absolute top-0 inset-x-0 flex-wrap items-center justify-between gap-3 pb-3">
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<button
								className="rounded-md border border-background-secondary/60 bg-background-primary/60 p-1.5 text-lg leading-none text-text-secondary transition-colors hover:bg-background-secondary"
								onClick={() => navigate(-1)}
							>
								‹
							</button>
							<span className="whitespace-nowrap text-sm font-semibold text-text-main">
								{viewLabel}
							</span>
							<button
								className="rounded-md border border-background-secondary/60 bg-background-primary/60 p-1.5 text-lg leading-none text-text-secondary transition-colors hover:bg-background-secondary"
								onClick={() => navigate(1)}
							>
								›
							</button>

							<div className="hidden lg:flex">
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
												toggleSelection(
													value,
													selectedEmployees,
													setSelectedEmployees
												)
											}
											onTogglePriority={(value) =>
												toggleSelection(
													value,
													selectedPriorities,
													setSelectedPriorities
												)
											}
											onToggleStatus={(value) =>
												toggleSelection(
													value,
													selectedStatuses,
													setSelectedStatuses
												)
											}
											onToggleJobType={(value) =>
												toggleSelection(
													value,
													selectedJobTypes,
													setSelectedJobTypes
												)
											}
									/>
								}
								className="w-full max-w-md"
							/>
							</div>

							<div className="relative lg:hidden">
								<button
									type="button"
									onClick={() => setFilterOpen((open) => !open)}
									className={cn(
										"relative flex size-9 items-center justify-center rounded-lg transition-colors",
										filterOpen
											? "border-transparent bg-primary text-primary-foreground"
											: "border border-accent-text/30 bg-background-primary text-text-secondary backdrop-blur-md hover:bg-background-secondary/50 hover:text-text-primary"
									)}
									title="Toggle filters"
								>
									<SlidersHorizontal className="size-4" />
									{activeFilterCount > 0 && !filterOpen && (
										<span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-background-secondary bg-accent-main/50 text-[10px] font-bold text-primary-foreground">
											{activeFilterCount}
										</span>
									)}
								</button>
								{filterOpen && (
									<div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 w-64">
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
												toggleSelection(
													value,
													selectedEmployees,
													setSelectedEmployees
												)
											}
											onTogglePriority={(value) =>
												toggleSelection(
													value,
													selectedPriorities,
													setSelectedPriorities
												)
											}
											onToggleStatus={(value) =>
												toggleSelection(
													value,
													selectedStatuses,
													setSelectedStatuses
												)
											}
											onToggleJobType={(value) =>
												toggleSelection(
													value,
													selectedJobTypes,
													setSelectedJobTypes
												)
											}
										/>
									</div>
								)}
							</div>
						</div>

						<div className="hidden items-center overflow-hidden rounded-lg border border-background-secondary/60 bg-background-primary/60 text-xs font-semibold sm:flex">
							{(["day", "week", "month"] as const).map((view) => (
								<button
									key={view}
									className={cn(
										"px-3 py-1.5 capitalize transition-colors",
										currentView === view
											? "bg-background-secondary/75 text-text-main shadow-sm"
											: "text-text-secondary hover:text-text-main"
									)}
								onClick={() => setCurrentView(view)}
								>
									{view}
								</button>
							))}
						</div>

						<div className="relative sm:hidden">
							<button
								type="button"
								className="flex items-center gap-2 rounded-md border border-background-secondary/60 bg-background-primary/60 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-background-secondary"
								onClick={() => setViewOpen((open) => !open)}
							>
								<Eye className="h-4 w-4" />
								{currentView.charAt(0).toUpperCase() + currentView.slice(1)}
							</button>
							{viewOpen && (
								<div className="absolute right-0 z-30 mt-2 w-32 rounded-lg border border-background-secondary/60 bg-background-main p-1 shadow-lg">
									{(["day", "week", "month"] as const).map((view) => (
										<button
											key={view}
											className={cn(
												"flex w-full items-center rounded-md px-2 py-1 text-left text-xs capitalize",
												currentView === view
													? "bg-background-primary/60 text-text-main font-semibold"
													: "text-text-secondary hover:bg-background-primary/60"
											)}
											onClick={() => {
												setCurrentView(view);
												setViewOpen(false);
											}}
										>
											{view}
										</button>
									))}
								</div>
							)}
						</div>
					</div>

					<div className="flex-1 mt-12 overflow-x-auto">
						{currentView === "week" && (
							<div className="grid h-full w-[calc(100vw-7rem)] grid-cols-7 overflow-x-auto">
								{getWeekDays(currentDate).map((date) => {
									const dayKey = date.toISOString().split("T")[0];
									const dayName = date.toLocaleDateString("en-US", {
										weekday: "short"
									});
									const isToday =
										date.toDateString() === new Date().toDateString();
										const events: CalendarEvent[] = dayEvents[dayKey] ?? [];
									return (
										<div
											key={dayKey}
											className="flex min-w-0 flex-col border-r border-accent-text/80 last:border-r-0"
										>
											<div
												className={cn(
													"sticky top-0 border-b-2 border-accent-text/80 bg-background-main/90 px-3 py-2", isToday && "bg-background-secondary/30"
												)}
											>
												<div className="flex items-center gap-1.5">
													<span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-text-dark-3">
														<span className="hidden md:inline">{dayName}</span>
														<span className="md:hidden">{dayName.charAt(0)}</span>
													</span>
													<span className="ml-auto text-[10px] font-semibold leading-none">
														{date.getDate()}
													</span>
												</div>
											</div>
											<FadeEnd
												prefix="after"
												orientation="vertical"
												sizeClass="h-12"
												fromColorClass="background-primary"
													className={cn(
														"h-[calc(100%-2.25rem)] overflow-y-auto p-2",
														isToday && "bg-background-secondary/30"
													)}
											>
												<div className="space-y-1.5">
														{events.length > 0 ? (
															events.map((event) => (
																<Fragment key={event.jobId}>
																	<div className="hidden md:block">
																		<EventCard
																			key={`${event.jobId}-card`}
																			event={event}
																			onSelect={handleSelectJob}
																			selected={sidePanelOpen && selectedJobId === event.jobId}
																			compact={false}
																		/>
																	</div>
																	<button
																		key={`${event.jobId}-bar`}
																		type="button"
																		onClick={() => handleSelectJob(event.jobId)}
																		className={cn(
																			"h-2 w-full rounded-full border md:hidden",
																			toneBarClasses[event.tone],
																			sidePanelOpen && selectedJobId === event.jobId &&
																				"ring-1 ring-accent-main/60"
																		)}
																		aria-label={event.title}
																		title={event.title}
																	/>
																</Fragment>
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
							<div className="h-full w-[calc(100vw-7rem)] overflow-y-auto p-4">
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
										const events: CalendarEvent[] = dayEvents[dayKey] ?? [];
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
														"mb-1 ml-auto inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
														isToday
															? "bg-accent-main/20 text-accent-text"
															: "text-text-secondary"
													)}
												>
													{date.getDate()}
												</div>
												<div className="space-y-px md:space-y-0.5">
													{events.slice(0, 3).map((event) => (
													<Fragment key={event.jobId}>
														<button
															key={`${event.jobId}-label`}
															type="button"
															onClick={() => handleSelectJob(event.jobId)}
															className={cn(
																"hidden w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] transition-all md:block",
																"hover:brightness-105 focus:outline-none",
																toneClasses[event.tone],
																	sidePanelOpen && selectedJobId === event.jobId &&
																	"ring-1 ring-accent-main/60"
															)}
															title={event.title}
														>
															{event.title}
														</button>
														<button
															key={`${event.jobId}-bar`}
															type="button"
															onClick={() => handleSelectJob(event.jobId)}
															className={cn(
																"h-2 w-full rounded-full border md:hidden",
																toneBarClasses[event.tone],
																	sidePanelOpen && selectedJobId === event.jobId &&
																		"ring-1 ring-accent-main/60"
															)}
															aria-label={event.title}
															title={event.title}
														/>
													</Fragment>
													))}
													{events.length > 3 && (
														<p className="px-1 text-[11px] text-text-tertiary">
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
									showSelection={sidePanelOpen}
							/>
						)}
					</div>
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
