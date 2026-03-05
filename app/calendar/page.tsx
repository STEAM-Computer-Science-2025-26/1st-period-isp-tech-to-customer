"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/index";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import FadeEnd from "@/components/ui/FadeEnd";

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

const dayEvents: Record<string, CalendarEvent[]> = {
	Sun: [
		{
			id: "sun-1",
			title: "Emergency Furnace No-Heat",
			duration: "45m",
			tech: "A. Rivera",
			window: "8:00 AM - 8:45 AM",
			tone: "urgent"
		}
	],
	Mon: [
		{
			id: "mon-1",
			title: "Seasonal HVAC Tune-Up",
			duration: "30m",
			tech: "T. Nguyen",
			window: "9:00 AM - 9:30 AM",
			tone: "normal"
		},
		{
			id: "mon-2",
			title: "Leaking Water Heater Inspection",
			duration: "60m",
			tech: "M. Patel",
			window: "1:00 PM - 2:00 PM",
			tone: "info"
		}
	],
	Tue: [],
	Wed: [
		{
			id: "wed-1",
			title: "New Thermostat Install",
			duration: "75m",
			tech: "J. Martinez",
			window: "11:15 AM - 12:30 PM",
			tone: "normal"
		}
	],
	Thu: [
		{
			id: "thu-1",
			title: "After-Hours Electrical Safety Check",
			duration: "40m",
			tech: "D. Kim",
			window: "5:30 PM - 6:10 PM",
			tone: "urgent"
		}
	],
	Fri: [
		{
			id: "fri-1",
			title: "Drain Line Clean + Flow Test",
			duration: "35m",
			tech: "K. Lee",
			window: "2:30 PM - 3:05 PM",
			tone: "info"
		}
	],
	Sat: []
};

const toneClasses: Record<EventTone, string> = {
	urgent:
		"border-l-destructive-background bg-destructive-background/10 text-destructive-text",
	normal:
		"border-l-success-foreground bg-success-background/10 text-success-text",
	info: "border-l-info-foreground bg-info-background/10 text-info-text"
};

const CalendarPage = () => {
	const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
	const rightPanelOffset = isSidePanelOpen ? "16rem" : "0px";

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
			<SidePanel isOpen={isSidePanelOpen} onOpenChange={setIsSidePanelOpen} />
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
