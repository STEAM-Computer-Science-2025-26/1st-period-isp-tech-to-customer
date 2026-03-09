"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/index";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import type { JobDTO } from "@/app/types/types";
import { useBreakpoints } from "../hooks/useBreakpoints";
import { ClassValue } from "clsx";
import { Filter, Settings } from "lucide-react";

// Types
type EventTone = "urgent" | "normal" | "info";

type CalendarView = "day" | "week" | "month";


type CalendarEvent = {
	id: string;
	title: string;
	duration: string;
	tech: string;
	window: string;
	tone: EventTone;
	startTime: Date;
	endTime: Date;
};

type EventLayout = CalendarEvent & {
	top: number;
	height: number;
	left: string;
	width: string;
	zIndex: number;
};

// Constants
const [START_HOUR, END_HOUR, PX_PER_HOUR, MIN_HEIGHT] = [6, 22, 60, 40];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Default job durations in hours by type
const DURATIONS: Record<string, number> = {
	install: 2,
	repair: 1.5,
	maintenance: 1,
	inspection: 0.5
};

// Generate 2-hour interval labels (6 AM, 8 AM, ... 10 PM)
const TIME_LABELS = Array.from({ length: (END_HOUR - START_HOUR) / 2 + 1 }, (_, i) => {
	const h = START_HOUR + i * 2;
	return { hour: h, label: `${h > 12 ? h - 12 : h || 12} ${h >= 12 ? "PM" : "AM"}` };
});

// Tone-based classes
const toneClasses: Record<EventTone, string> = {
	urgent: "border-l-destructive-background bg-red-300 text-destructive-text",
	normal: "border-l-success-foreground bg-green-300 text-success-text",
	info: "border-l-info-foreground bg-blue-300 text-info-text"
};

// Helpers
const toHours = (d: Date) => d.getHours() + d.getMinutes() / 60;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const emptyDays = () => Object.fromEntries(DAYS.map((d) => [d, []])) as Record<string, CalendarEvent[]>;

const toDateKey = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const getTitle = (j: JobDTO) =>
	(j as JobDTO & { title?: string }).title?.trim() || j.address?.trim() || j.customerName?.trim() || "Untitled Job";

const getTone = (j: JobDTO): EventTone =>
	j.priority === "emergency" || j.priority === "high" ? "urgent" : j.priority === "medium" ? "normal" : "info";

const fmtTime = (iso?: string) =>
	iso && !Number.isNaN(new Date(iso).getTime())
		? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
		: "Unscheduled";

// Data Transformation

/** Convert jobs from API into calendar events grouped by day of week */
const mapJobs = (jobs: JobDTO[]): Record<string, CalendarEvent[]> => {
	const grouped = emptyDays();

	for (const j of jobs) {
		const start = new Date(j.scheduledTime ?? j.createdAt ?? "");
		if (Number.isNaN(start.getTime())) continue;

		const day = start.toLocaleDateString("en-US", { weekday: "short" });
		if (!(day in grouped)) continue;

		const jobType = j.jobType ?? "general";

		grouped[day].push({
			id: String(j.id),
			title: getTitle(j),
			duration: jobType.replace("_", " "),
			tech: j.assignedTechId ? `Tech #${j.assignedTechId}` : "Unassigned",
			window: fmtTime(j.scheduledTime),
			tone: getTone(j),
			startTime: start,
			endTime: new Date(start.getTime() + (DURATIONS[jobType.toLowerCase()] ?? 1) * 3.6e6)
		});
	}

	// Sort each day's events by start time
	DAYS.forEach((d) => grouped[d].sort((a, b) => a.startTime.getTime() - b.startTime.getTime()));
	return grouped;
};

/** Convert jobs from API into calendar events grouped by date key (YYYY-MM-DD) */
const mapJobsByDate = (jobs: JobDTO[]): Record<string, CalendarEvent[]> => {
	const grouped: Record<string, CalendarEvent[]> = {};

	for (const j of jobs) {
		const start = new Date(j.scheduledTime ?? j.createdAt ?? "");
		if (Number.isNaN(start.getTime())) continue;

		const key = toDateKey(start);
		if (!grouped[key]) grouped[key] = [];

		const jobType = j.jobType ?? "general";

		grouped[key].push({
			id: String(j.id),
			title: getTitle(j),
			duration: jobType.replace("_", " "),
			tech: j.assignedTechId ? `Tech #${j.assignedTechId}` : "Unassigned",
			window: fmtTime(j.scheduledTime),
			tone: getTone(j),
			startTime: start,
			endTime: new Date(start.getTime() + (DURATIONS[jobType.toLowerCase()] ?? 1) * 3.6e6)
		});
	}

	Object.values(grouped).forEach((dayEvents) =>
		dayEvents.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
	);

	return grouped;
};

// Layout Calcs

// calc pixel position and height for an event 
const getPos = (e: CalendarEvent, pxPerHour: number) => {
	const top = (clamp(toHours(e.startTime), START_HOUR, END_HOUR) - START_HOUR) * pxPerHour;
	const height = Math.max(
		(clamp(toHours(e.endTime), START_HOUR, END_HOUR) - clamp(toHours(e.startTime), START_HOUR, END_HOUR)) * pxPerHour,
		MIN_HEIGHT
	);
	return { top, height };
};

/*
	calc layout for overlapping events:
	Later events get higher z-index
	Same-start events are staggered horizontally
*/

const layoutEvents = (events: CalendarEvent[], pxPerHour: number): EventLayout[] => {
	if (!events.length) return [];

	const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
	const layouts: EventLayout[] = [];
	const active: { end: number; col: number }[] = [];

	for (const [i, ev] of sorted.entries()) {
		const { top, height } = getPos(ev, pxPerHour);
		const end = top + height;

		// Remove expired events from active list
		while (active.length && active[0].end <= top) active.shift();

		// Count events with same start time (for horizontal stagger)
		const sameStart = sorted.filter((e, j) => j < i && e.startTime.getTime() === ev.startTime.getTime()).length;
		const offset = sameStart * 20;

		layouts.push({
			...ev,
			top,
			height,
			left: `${4 + offset}px`,
			width: `calc(100% - ${8 + offset}px)`,
			zIndex: 10 + i // Later events appear on top
		});

		active.push({ end, col: sameStart });
		active.sort((a, b) => a.end - b.end);
	}

	return layouts;
};

// Get Y position for current time indicator, or null if outside visible hours
const getCurrentTimeY = (pxPerHour: number) => {
	const h = toHours(new Date());
	return h >= START_HOUR && h <= END_HOUR ? (h - START_HOUR) * pxPerHour : null;
};

const getCurrentTimeLabel = () =>
	new Date()
		.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true
		})
		.replace(/\s?[AP]M$/i, "");

// Components

const CalendarPage = () => {
	const { lgUp } = useBreakpoints();
	const [sideOpen, setSideOpen] = useState(false);
	const [view, setView] = useState<CalendarView>("week");


	return (
		<MainContent className={cn(`flex flex-col gap-4 pb-0`)}>
			<CalendarToolbar sideOpen={sideOpen} setSideOpen={setSideOpen} view={view} setView={setView} />
			<Calendar sideOpen={sideOpen} setSideOpen={setSideOpen} view={view} height="h-[calc(100vh-9.5rem)]"/>
			<SidePanel isOpen={sideOpen} onOpenChange={setSideOpen} />
		</MainContent>
	);
}

const CalendarToolbar = ({
	sideOpen,
	setSideOpen,
	view,
	setView
}: {
	sideOpen: boolean;
	setSideOpen: (open: boolean) => void;
	view: CalendarView;
	setView: (view: CalendarView) => void;
}) => {
	const viewClasses = (key: CalendarView) =>
		cn(
			"hover:bg-background-secondary/50 flex items-center justify-center px-3 pt-0.5 transition-colors",
			view === key && "bg-background-secondary/70"
		);

	return(
		<div className={cn(`h-8 w-full flex flex-row items-center px-2 `)}>
			<button className={cn(`size-8 border rounded-lg bg-background-primary border-text-tertiary hover:bg-background-secondary/50 p-1.75 transition-colors`)}>
				<Filter size={16} />
			</button>
			<button className={cn(`size-8 border rounded-lg bg-background-primary border-text-tertiary hover:bg-background-secondary/50 p-1.75 ml-2 transition-colors`)}>
				<Settings size={16} />
			</button>
			<div className={cn(`h-8 ml-auto bg-background-primary flex flex-row overflow-hidden rounded-lg divide-x divide-background-secondary border border-text-tertiary`)}>
				<button className={viewClasses("day")} onClick={() => setView("day")}>Day</button>
				<button className={viewClasses("week")} onClick={() => setView("week")}>Week</button>
				<button className={viewClasses("month")} onClick={() => setView("month")}>Month</button>
			</div>
		</div>
	)
}

const Calendar = ({
	sideOpen,
	setSideOpen,
	view,
	height
}: {
	sideOpen: boolean;
	setSideOpen: (open: boolean) => void;
	view: CalendarView;
	height: ClassValue;
}) => {
	const [jobs, setJobs] = useState<JobDTO[]>([]);
	const [timeY, setTimeY] = useState(() => getCurrentTimeY(PX_PER_HOUR));
	const [timeLabel, setTimeLabel] = useState(getCurrentTimeLabel);
	const [gridHeight, setGridHeight] = useState(0);
	const gridRef = useRef<HTMLDivElement | null>(null);
	const todayLabel = useMemo(
		() => new Date().toLocaleDateString("en-US", { weekday: "short" }),
		[]
	);
	const dayEvents = useMemo(() => mapJobs(jobs), [jobs]);
	const monthEvents = useMemo(() => mapJobsByDate(jobs), [jobs]);

	// Fetch jobs on mount
	useEffect(() => {
		let mounted = true;
		fetch("/api/jobs")
			.then((r) => (r.ok ? r.json() : { jobs: [] }))
			.then((p: { jobs?: JobDTO[] }) => mounted && setJobs(p.jobs ?? []))
			.catch(() => mounted && setJobs([]));
		return () => { mounted = false; };
	}, []);

	const pxPerHour = useMemo(() => {
		if (!gridHeight) return PX_PER_HOUR;
		const stretch = gridHeight / (END_HOUR - START_HOUR);
		return Math.max(PX_PER_HOUR, stretch);
	}, [gridHeight]);

	const totalHeight = useMemo(
		() => (END_HOUR - START_HOUR) * pxPerHour,
		[pxPerHour]
	);

	// Track grid viewport height
	useEffect(() => {
		const el = gridRef.current;
		if (!el) return;
		const update = () => setGridHeight(el.clientHeight);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// Update current time indicator every minute
	useEffect(() => {
		const id = setInterval(() => {
			setTimeY(getCurrentTimeY(pxPerHour));
			setTimeLabel(getCurrentTimeLabel());
		}, 60000);
		return () => clearInterval(id);
	}, [pxPerHour]);

	useEffect(() => {
		setTimeY(getCurrentTimeY(pxPerHour));
	}, [pxPerHour]);

	if (view === "month") {
		return (
			<div className={cn("relative", height)}>
				<MonthView
					monthEvents={monthEvents}
					sideOpen={sideOpen}
					height={height}
				/>
			</div>
		);
	}

	const visibleDays = view === "day" ? [todayLabel] : DAYS;

	return (
		<div className={cn("relative", height)}>
			{/* Outer wrapper - shrinks when sidebar opens, allows horizontal scroll */}
			<div
				className="h-full overflow-x-auto no-scrollbar -ml-4 transition-all duration-300"
				style={sideOpen ? { width: "calc(100% - 15rem)" } : {}}
			>
				{/* Grid container - fixed width based on viewport */}
				<div className="w-[calc(100vw-7rem)] px-4 h-full transition-all">
					{/* Header row */}
					<div className="flex border-b-2 border-accent-text/80 bg-background-main/90">
						<div className="w-16 shrink-0 border-r border-accent-text/80 px-2 py-2">
							<p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text-dark-3">Time</p>
						</div>
						{visibleDays.map((d) => (
							<div key={d} className="flex-1 border-r border-accent-text/80 last:border-r-0 px-3 py-2">
								<p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text-dark-3">{d}</p>
							</div>
						))}
					</div>

					{/* Scrollable grid area (vertical only) */}
					<div ref={gridRef} className="relative no-scrollbar h-[calc(100%-2.25rem)] overflow-y-auto">
						<div className="relative flex" style={{ height: totalHeight, minHeight: gridHeight }}>
							{/* Time labels column */}
							<div className="w-16 shrink-0 border-r border-accent-text/80 relative">
								{TIME_LABELS.map(({ hour, label }) => (
									<span
										key={hour}
										className="absolute left-2 text-[10px] font-medium text-text-secondary"
										style={{ top: (hour - START_HOUR) * pxPerHour }}
									>
										{label}
									</span>
								))}
							</div>

							<div
								className="flex flex-1 relative"
								style={{ height: "100%", minHeight: totalHeight }}
							>
								{/* Dashed 2-hour interval lines */}
								{TIME_LABELS.map(({ hour }) => (
									<div
										key={`line-${hour}`}
										className="absolute inset-x-0 border-t border-dashed border-accent-text/30 pointer-events-none"
										style={{ top: (hour - START_HOUR) * pxPerHour }}
									/>
								))}

								{/* Current time indicator */}
								{timeY !== null && (
									<div
										className="absolute inset-x-0 border-t-2 border-red-500 z-50 pointer-events-none"
										style={{ top: timeY }}
									>
										<div className="absolute -left-6 -top-1.5 h-3 w-7 rounded bg-red-500">
											<span className="text-[0.5rem] absolute top-0 left-1 text-white">{timeLabel}</span>
										</div>
									</div>
								)}

								{/* Day columns */}
								{visibleDays.map((d, i) => (
									<DayColumn
										key={d}
										events={dayEvents[d] ?? []}
										isLast={i === visibleDays.length - 1}
										pxPerHour={pxPerHour}
										totalHeight={totalHeight}
									/>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

const MonthView = ({
	monthEvents,
	sideOpen,
	height
}: {
	monthEvents: Record<string, CalendarEvent[]>;
	sideOpen: boolean;
	height: ClassValue;
}) => {
	const [now] = useState(() => new Date());
	const monthLabel = useMemo(
		() => now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
		[now]
	);

	const cells = useMemo(() => {
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		const startOffset = start.getDay();
		const grid: { date: Date; inMonth: boolean; key: string }[] = [];
		const firstCell = new Date(start);
		firstCell.setDate(start.getDate() - startOffset);

		for (let i = 0; i < 42; i += 1) {
			const date = new Date(firstCell);
			date.setDate(firstCell.getDate() + i);
			const inMonth = date.getMonth() === now.getMonth();
			grid.push({ date, inMonth, key: toDateKey(date) });
		}

		return { grid };
	}, [now]);

	return (
		<div className={cn("relative", height)}>
			<div
				className="h-full overflow-x-auto no-scrollbar -ml-4 transition-all duration-300"
				style={sideOpen ? { width: "calc(100% - 15rem)" } : {}}
			>
				<div className="w-[calc(100vw-7rem)] px-4 h-full transition-all">
					<div className="flex items-center border-b-2 border-accent-text/80 bg-background-main/90 px-3 py-2">
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text-dark-3">{monthLabel}</p>
					</div>
					<div className="grid grid-cols-7 border-b border-accent-text/80 bg-background-main/70">
						{DAYS.map((d) => (
							<div key={d} className="border-r border-accent-text/80 px-3 py-2 last:border-r-0">
								<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-text-dark-3">{d}</p>
							</div>
						))}
					</div>
					<div className="grid grid-cols-7 grid-rows-6 border border-accent-text/80 border-t-0 h-[calc(100%-4.25rem)]">
						{cells.grid.map((cell) => {
							const events = monthEvents[cell.key] ?? [];
							const visible = events.slice(0, 2);
							const extra = events.length - visible.length;

							return (
								<div
									key={cell.key}
									className={cn(
										"border-r border-b border-accent-text/80 p-2 last:border-r-0",
										!cell.inMonth && "bg-background-secondary/30 text-text-tertiary"
									)}
								>
									<div className="flex items-center justify-between">
										<span className="text-[10px] font-semibold text-text-secondary">
											{cell.date.getDate()}
										</span>
									</div>
									<div className="mt-1 flex flex-col gap-1">
										{visible.map((ev) => (
											<div
												key={ev.id}
												className={cn(
													"rounded border border-accent-main/20 px-2 py-1 text-[9px] font-semibold",
													toneClasses[ev.tone]
												)}
											>
												<span className="block truncate">{ev.title}</span>
											</div>
										))}
										{extra > 0 && (
											<span className="text-[9px] font-semibold text-text-secondary">+{extra}</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
};

const DayColumn = ({
	events,
	isLast,
	pxPerHour,
	totalHeight
}: {
	events: CalendarEvent[];
	isLast: boolean;
	pxPerHour: number;
	totalHeight: number;
}) => {
	const layouts = useMemo(() => layoutEvents(events, pxPerHour), [events, pxPerHour]);

	return (
		<div
			className={cn("flex-1 relative", !isLast && "border-r border-accent-text/80")}
			style={{ height: totalHeight, minHeight: "100%" }}
		>
			{layouts.length ? (
				layouts.map((l) => <EventCard key={l.id} layout={l} />)
			) : (
				<div className="absolute inset-x-0 top-4 text-center text-xs font-medium text-text-secondary">
					No events
				</div>
			)}
		</div>
	);
};

const EventCard = ({ layout }: { layout: EventLayout }) => {
	const [hovered, setHovered] = useState(false);

	return (
		<div
			className={cn(
				"absolute rounded-r-lg border border-accent-main/20 border-l-2 px-2 py-1",
				"hover:shadow-lg transition-shadow cursor-pointer overflow-hidden",
				toneClasses[layout.tone]
			)}
			style={{
				top: layout.top,
				height: layout.height,
				left: layout.left,
				width: layout.width,
				zIndex: hovered ? 100 : layout.zIndex
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<div className="flex min-w-0 items-start gap-1">
				<p className="min-w-0 flex-1 truncate text-xs font-semibold leading-4">{layout.title}</p>
				{layout.height >= 50 && (
					<span className="shrink-0 rounded bg-background-main/80 px-1 py-0.5 text-[9px] font-semibold text-text-primary">
						{layout.duration}
					</span>
				)}
			</div>

			{layout.height >= 60 && (
				<div className="mt-1 flex min-w-0 items-center justify-between gap-1 text-[9px] text-text-secondary">
					<span className="min-w-0 truncate">{layout.tech}</span>
					<span className="shrink-0 whitespace-nowrap">{layout.window}</span>
				</div>
			)}
		</div>
	);
};

export default CalendarPage;
