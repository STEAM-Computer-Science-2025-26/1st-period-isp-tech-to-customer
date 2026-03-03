"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils/index";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
4;
import FadeEnd from "@/components/ui/FadeEnd";

const CalendarPage = () => {
	const mainContentWidth =
		typeof window !== "undefined" ? window.innerWidth : 0;
	const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return (
		<MainContent>
			<div className={cn(`w-full overflow-x-auto h-[calc(100vh-8rem)]`)}>
				<div
					className={cn(
						`w-[calc(${mainContentWidth}-1rem)] h-full grid grid-cols-7`
					)}
				>
					{daysOfWeek.map((day, index) => (
						<div
							key={index}
							className={cn(`h-full not-last:border-r border-accent-main`)}
						>
							<div
								className={cn(
									`border-b border-accent-main h-10 flex flex-row items-center justify-center`
								)}
							>
								{day}
							</div>
							<FadeEnd
								prefix="after"
								orientation="vertical"
								sizeClass="w-full"
								fromColorClass="background-main"
								className={cn(`flex flex-row h-[calc(100%-2.5rem)]`)}
							></FadeEnd>
						</div>
					))}
				</div>
			</div>
			<SidePanel />
		</MainContent>
	);
};

export default CalendarPage;
