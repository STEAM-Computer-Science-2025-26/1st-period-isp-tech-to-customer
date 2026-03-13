"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/index";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import FadeEnd from "@/components/ui/FadeEnd";
import type { JobDTO } from "@/app/types/types";
import { useUiStore } from "@/lib/stores/uiStore";

type EventTone = "urgent" | "normal" | "info";

type CalendarEvent = {
	id: string;
	title: string;
	duration: string;
	tech: string;
	window: string;
	tone: EventTone;
};

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
	const [dayEvents, setDayEvents] = useState<Record<string, CalendarEvent[]>>(
		createEmptyDayEvents()
	);
	const rightPanelOffset = isSidePanelOpen ? "16rem" : "0px";

	useEffect(() => {
		let isMounted = true;

		const loadJobs = async () => {
			try {
				const response = await fetch("/api/jobs", { method: "GET" });
				if (!response.ok) {
					if (isMounted) setDayEvents(createEmptyDayEvents());
					return;
				}

				const payload = (await response.json()) as { jobs?: JobDTO[] };
				const jobs = payload.jobs ?? [];
				if (isMounted) setDayEvents(mapJobsToDayEvents(jobs));
			} catch {
				if (isMounted) setDayEvents(createEmptyDayEvents());
			}
		};

		void loadJobs();

		return () => {
			isMounted = false;
		};
	}, []);

	return (
		<MainContent>
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
