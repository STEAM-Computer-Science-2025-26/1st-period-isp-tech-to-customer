"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/index";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import type { JobDTO } from "@/app/types/types";
import Fab from "@/components/ui/Fab"
import { useBreakpoints } from "../hooks/useBreakpoints";
import { ClassValue } from "clsx";

// Types
type EventTone = "urgent" | "normal" | "info";


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
	urgent: "border-l-destructive-background bg-destructive-background/10 text-destructive-text",
	normal: "border-l-success-foreground bg-success-background/10 text-success-text",
	info: "border-l-info-foreground bg-info-background/10 text-info-text"
};

// Helpers
const toHours = (d: Date) => d.getHours() + d.getMinutes() / 60;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const emptyDays = () => Object.fromEntries(DAYS.map((d) => [d, []])) as Record<string, CalendarEvent[]>;

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

		grouped[day].push({
			id: String(j.id),
			title: getTitle(j),
			duration: j.jobType.replace("_", " "),
			tech: j.assignedTechId ? `Tech #${j.assignedTechId}` : "Unassigned",
			window: fmtTime(j.scheduledTime),
			tone: getTone(j),
			startTime: start,
			endTime: new Date(start.getTime() + (DURATIONS[j.jobType.toLowerCase()] ?? 1) * 3.6e6)
		});
	}

	// Sort each day's events by start time
	DAYS.forEach((d) => grouped[d].sort((a, b) => a.startTime.getTime() - b.startTime.getTime()));
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


	return (
		<MainContent className={cn(`flex flex-col gap-4`)}>
			<CalendarToolbar sideOpen={sideOpen} setSideOpen={setSideOpen} />
			<Calendar sideOpen={sideOpen} setSideOpen={setSideOpen} height="h-[calc(100vh-12rem)]"/>
			<Fab 
				size={lgUp ? "md" : "lg"}
				icon="plus"
				className={cn("bottom-4 right-4")}
				title="Add New Customer"
			/>
			<SidePanel isOpen={sideOpen} onOpenChange={setSideOpen} />
		</MainContent>
	);
}

const CalendarToolbar = ({ sideOpen, setSideOpen }: { sideOpen: boolean; setSideOpen: (open: boolean) => void; }) => {
	return(
		<div className={cn(`h-12 dev w-full flex flex-row items-center`)}>
			This will be a toolbar just dont have time rn to add the stuff
		</div>
	)
}

const Calendar = ({ sideOpen, setSideOpen, height }: { sideOpen: boolean; setSideOpen: (open: boolean) => void; height: ClassValue }) => {
	const [dayEvents, setDayEvents] = useState(emptyDays);
	const [timeY, setTimeY] = useState(() => getCurrentTimeY(PX_PER_HOUR));
	const [timeLabel, setTimeLabel] = useState(getCurrentTimeLabel);
	const [gridHeight, setGridHeight] = useState(0);
	const gridRef = useRef<HTMLDivElement | null>(null);

	// Fetch jobs on mount
	useEffect(() => {
		let mounted = true;
		fetch("/api/jobs")
			.then((r) => (r.ok ? r.json() : { jobs: [] }))
			.then((p: { jobs?: JobDTO[] }) => mounted && setDayEvents(mapJobs(p.jobs ?? [])))
			.catch(() => mounted && setDayEvents(emptyDays()));
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
							{DAYS.map((d) => (
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
									{DAYS.map((d, i) => (
										<DayColumn key={d} events={dayEvents[d]} isLast={i === 6} pxPerHour={pxPerHour} totalHeight={totalHeight} />
									))}
								</div>
							</div>
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
