"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/index";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import FadeEnd from "@/components/ui/FadeEnd";
import type { JobDTO } from "@/app/types/types";
import { useUiStore } from "@/lib/stores/uiStore";
import { Eye, Settings, Filter } from "lucide-react";

type EventTone = "urgent" | "normal" | "info";

type CalendarEvent = {
	id: string;
	title: string;
	duration: string;
	tech: string;
	window: string;
	tone: EventTone;
};

type FilterOption = { value: string; label: string };

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const createEmptyDayEvents = (): Record<string, CalendarEvent[]> => ({
	Sun: [],
	Mon: [],
	Tue: [],
	Wed: [],
	Thu: [],
	Fri: [],
	Sat: []
});

const getJobTitle = (job: JobDTO): string => {
	const explicitTitle = (job as JobDTO & { title?: string }).title?.trim();
	if (explicitTitle) return explicitTitle;
	if (job.address?.trim()) return job.address.trim();
	if (job.customerName?.trim()) return job.customerName.trim();
	return "Untitled Job";
};

const toEventTone = (job: JobDTO): EventTone => {
	if (job.priority === "emergency" || job.priority === "high") return "urgent";
	if (job.priority === "medium") return "normal";
	return "info";
};

const formatWindow = (iso?: string): string => {
	if (!iso) return "Unscheduled";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "Unscheduled";
	return date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit"
	});
};

const mapJobsToDayEvents = (
	jobs: JobDTO[]
): Record<string, CalendarEvent[]> => {
	const grouped = createEmptyDayEvents();

	for (const job of jobs) {
		const sourceTime = job.scheduledTime ?? job.createdAt;
		const sourceDate = sourceTime ? new Date(sourceTime) : null;
		if (!sourceDate || Number.isNaN(sourceDate.getTime())) continue;

		const dayKey = sourceDate.toLocaleDateString("en-US", {
			weekday: "short"
		});
		if (!(dayKey in grouped)) continue;

		grouped[dayKey].push({
			id: String(job.id),
			title: getJobTitle(job),
			duration: job.jobType.replace("_", " "),
			tech: job.assignedTechId ? `Tech #${job.assignedTechId}` : "Unassigned",
			window: formatWindow(job.scheduledTime),
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

const CalendarPage = () => {
	const isSidePanelOpen = useUiStore((state) => state.sidePanelOpen);
	const setSidePanelOpen = useUiStore((state) => state.setSidePanelOpen);
	const [jobs, setJobs] = useState<JobDTO[]>([]);
	const [filterOpen, setFilterOpen] = useState(false);
	const [viewOpen, setViewOpen] = useState(false);
	const [filterQuery, setFilterQuery] = useState("");
	const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
	const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
	const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
	const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
	const rightPanelOffset = isSidePanelOpen ? "16rem" : "0px";

	useEffect(() => {
		let isMounted = true;

		const loadJobs = async () => {
			try {
				const response = await fetch("/api/jobs", { method: "GET" });
				if (!response.ok) {
					if (isMounted) setJobs([]);
					return;
				}

				const payload = (await response.json()) as { jobs?: JobDTO[] };
				const jobs = payload.jobs ?? [];
				if (isMounted) setJobs(jobs);
			} catch {
				if (isMounted) setJobs([]);
			}
		};

		void loadJobs();

		return () => {
			isMounted = false;
		};
	}, []);

	const employeeOptions = useMemo<FilterOption[]>(() => {
		const unique = new Map<string, string>();
		let hasUnassigned = false;

		for (const job of jobs) {
			if (job.assignedTechId) {
				const shortId = String(job.assignedTechId).slice(0, 8);
				unique.set(String(job.assignedTechId), `Tech #${shortId}`);
			} else {
				hasUnassigned = true;
			}
		}

		const options = Array.from(unique.entries())
			.map(([value, label]) => ({ value, label }))
			.sort((a, b) => a.label.localeCompare(b.label));

		if (hasUnassigned) {
			options.unshift({ value: "unassigned", label: "Unassigned" });
		}

		return options;
	}, [jobs]);

	const priorityOrder = ["emergency", "high", "medium", "low"];
	const priorityOptions = useMemo<FilterOption[]>(() => {
		const unique = new Set<string>();
		for (const job of jobs) {
			if (job.priority) unique.add(job.priority);
		}
		return Array.from(unique)
			.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b))
			.map((value) => ({
				value,
				label: value.replace(/_/g, " ")
			}));
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
		for (const job of jobs) {
			if (job.status) unique.add(job.status);
		}
		return Array.from(unique)
			.sort((a, b) => statusOrder.indexOf(a) - statusOrder.indexOf(b))
			.map((value) => ({
				value,
				label: value.replace(/_/g, " ")
			}));
	}, [jobs]);

	const jobTypeOptions = useMemo<FilterOption[]>(() => {
		const unique = new Set<string>();
		for (const job of jobs) {
			if (job.jobType) unique.add(job.jobType);
		}
		return Array.from(unique)
			.sort()
			.map((value) => ({
				value,
				label: value.replace(/_/g, " ")
			}));
	}, [jobs]);

	const normalizedQuery = filterQuery.trim().toLowerCase();
	const filterOptionsByQuery = (options: FilterOption[]) => {
		if (!normalizedQuery) return options;
		return options.filter((option) =>
			option.label.toLowerCase().includes(normalizedQuery)
		);
	};

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

			if (selectedPriorities.length > 0) {
				const priority = job.priority ?? "unknown";
				if (!selectedPriorities.includes(priority)) return false;
			}

			if (selectedStatuses.length > 0) {
				const status = job.status ?? "unknown";
				if (!selectedStatuses.includes(status)) return false;
			}

			if (selectedJobTypes.length > 0) {
				const jobType = job.jobType ?? "unknown";
				if (!selectedJobTypes.includes(jobType)) return false;
			}

			return true;
		});
	}, [
		jobs,
		selectedEmployees,
		selectedPriorities,
		selectedStatuses,
		selectedJobTypes
	]);

	const dayEvents = useMemo(
		() => mapJobsToDayEvents(filteredJobs),
		[filteredJobs]
	);

	return (
		<MainContent>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<div className="relative">
						<button
							type="button"
							className="rounded-md border border-background-secondary/60 bg-background-primary/60 px-1.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-background-secondary"
							onClick={() => setFilterOpen((open) => !open)}
						>
							<Filter className="h-4 w-4" />
						</button>
						{filterOpen ? (
							<div className="absolute left-0 z-30 mt-2 w-72 rounded-lg border border-background-secondary/60 bg-background-main p-3 shadow-lg">
								<input
									type="text"
									value={filterQuery}
									onChange={(event) => setFilterQuery(event.target.value)}
									placeholder="Search filters..."
									className="w-full rounded-md border border-background-secondary/60 bg-background-primary/60 px-2 py-1 text-xs text-text-main"
								/>

								<div className="mt-3 space-y-3 text-xs">
									<div>
										<p className="mb-1 text-[11px] font-semibold uppercase text-text-tertiary">
											Employees
										</p>
										<div className="space-y-1">
											{filterOptionsByQuery(employeeOptions).map((option) => (
												<label
													key={option.value}
													className="flex items-center gap-2 text-text-secondary"
												>
													<input
														type="checkbox"
														checked={selectedEmployees.includes(option.value)}
														onChange={() =>
															toggleSelection(
																option.value,
																selectedEmployees,
																setSelectedEmployees
															)
														}
													/>
													{option.label}
												</label>
											))}
										</div>
									</div>

									<div>
										<p className="mb-1 text-[11px] font-semibold uppercase text-text-tertiary">
											Priorities
										</p>
										<div className="space-y-1">
											{filterOptionsByQuery(priorityOptions).map((option) => (
												<label
													key={option.value}
													className="flex items-center gap-2 text-text-secondary"
												>
													<input
														type="checkbox"
														checked={selectedPriorities.includes(option.value)}
														onChange={() =>
															toggleSelection(
																option.value,
																selectedPriorities,
																setSelectedPriorities
															)
														}
													/>
													{option.label}
												</label>
											))}
										</div>
									</div>

									<div>
										<p className="mb-1 text-[11px] font-semibold uppercase text-text-tertiary">
											Status
										</p>
										<div className="space-y-1">
											{filterOptionsByQuery(statusOptions).map((option) => (
												<label
													key={option.value}
													className="flex items-center gap-2 text-text-secondary"
												>
													<input
														type="checkbox"
														checked={selectedStatuses.includes(option.value)}
														onChange={() =>
															toggleSelection(
																option.value,
																selectedStatuses,
																setSelectedStatuses
															)
														}
													/>
													{option.label}
												</label>
											))}
										</div>
									</div>

									<div>
										<p className="mb-1 text-[11px] font-semibold uppercase text-text-tertiary">
											Job Type
										</p>
										<div className="space-y-1">
											{filterOptionsByQuery(jobTypeOptions).map((option) => (
												<label
													key={option.value}
													className="flex items-center gap-2 text-text-secondary"
												>
													<input
														type="checkbox"
														checked={selectedJobTypes.includes(option.value)}
														onChange={() =>
															toggleSelection(
																option.value,
																selectedJobTypes,
																setSelectedJobTypes
															)
														}
													/>
													{option.label}
												</label>
											))}
										</div>
									</div>
								</div>
							</div>
						) : null}
					</div>
					<button className="rounded-md border border-background-secondary/60 bg-background-primary/60 px-1.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-background-secondary">
						<Settings className="h-4 w-4" />
					</button>
				</div>
				<div className="hidden items-center rounded-lg border border-background-secondary/60 bg-background-primary/60 overflow-hidden text-xs font-semibold sm:flex">
					<button className="px-3 py-1.5 text-text-secondary transition-colors hover:text-text-main">
						Day
					</button>
					<button className=" px-3 py-1.5 text-text-secondary transition-colors hover:text-text-main">
						Month
					</button>
					<button className="bg-background-secondary/75 px-3 py-1.5 text-text-main shadow-sm">
						Week
					</button>
				</div>
				<div className="relative sm:hidden">
					<button
						type="button"
						className="flex items-center gap-2 rounded-md border border-background-secondary/60 bg-background-primary/60 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-background-secondary"
						onClick={() => setViewOpen((open) => !open)}
					>
						<Eye className="h-4 w-4" />
						View
					</button>
					{viewOpen ? (
						<div className="absolute right-0 z-30 mt-2 w-32 rounded-lg border border-background-secondary/60 bg-background-main p-1 shadow-lg">
							<button className="flex w-full items-center rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-background-primary/60">
								Day
							</button>
							<button className="flex w-full items-center rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-background-primary/60">
								Month
							</button>
							<button className="flex w-full items-center rounded-md bg-background-primary/60 px-2 py-1 text-left text-xs font-semibold text-text-main">
								Week
							</button>
						</div>
					) : null}
				</div>
			</div>
			<div className="h-[calc(100vh-8rem)] overflow-hidden">
				<div
					className={cn(
						"h-full overflow-x-auto overflow-y-hidden transition-[width,padding] duration-300"
					)}
					style={
						isSidePanelOpen
							? {
									width: `calc(100% - ${rightPanelOffset})`,
									paddingRight: "1rem"
								}
							: { width: "100%", paddingRight: 0 }
					}
				>
					<div className="grid h-full min-w-245 w-[calc(100vw-7rem)] grid-cols-7">
						{daysOfWeek.map((day) => (
							<div
								key={day}
								className="flex min-w-0 flex-col border-r border-accent-text/80 last:border-r-0"
							>
								<div className="border-b-2 sticky top-0 border-accent-text/80 bg-background-main/90 px-3 py-2">
									<p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text-dark-3">
										{day}
									</p>
								</div>
								<FadeEnd
									prefix="after"
									orientation="vertical"
									sizeClass="h-12"
									fromColorClass="background-primary"
									className="h-[calc(100%-2.25rem)] overflow-y-auto p-2"
								>
									<div className="space-y-2">
										{(dayEvents[day] ?? []).length > 0 ? (
											(dayEvents[day] ?? []).map((event) => (
												<EventCard key={event.id} event={event} />
											))
										) : (
											<div className="py-4 text-center text-xs font-medium text-text-secondary">
												No events scheduled
											</div>
										)}
									</div>
								</FadeEnd>
							</div>
						))}
					</div>
				</div>
			</div>
			<SidePanel isOpen={isSidePanelOpen} onOpenChange={setSidePanelOpen} />
		</MainContent>
	);
};

const EventCard = ({ event }: { event: CalendarEvent }) => {
	return (
		<div
			className={cn(
				"group min-w-0 rounded-r-lg border border-accent-main/20 border-l-2 px-3 py-2 hover:shadow-md transition-shadow cursor-pointer",
				toneClasses[event.tone]
			)}
		>
			<div className="flex min-w-0 items-start gap-2">
				<p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5">
					{event.title}
				</p>
				<span className="shrink-0 rounded-md bg-background-main/80 px-1.5 py-0.5 text-[11px] font-semibold text-text-primary">
					{event.duration}
				</span>
			</div>
			<div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-[11px] text-text-secondary">
				<span className="min-w-0 truncate">{event.tech}</span>
				<span className="shrink-0 whitespace-nowrap">{event.window}</span>
			</div>
		</div>
	);
};

export default CalendarPage;
