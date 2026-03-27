"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

type Preset = "all" | "today" | "tomorrow" | "week" | "custom";

type Props = {
	onChange: (after: string | undefined, before: string | undefined) => void;
};

function dayRange(offset: number): [string, string] {
	const d = new Date();
	d.setDate(d.getDate() + offset);
	const start = new Date(d);
	start.setHours(0, 0, 0, 0);
	const end = new Date(d);
	end.setHours(23, 59, 59, 999);
	return [start.toISOString(), end.toISOString()];
}

const PRESETS: { label: string; value: Preset }[] = [
	{ label: "All", value: "all" },
	{ label: "Today", value: "today" },
	{ label: "Tomorrow", value: "tomorrow" },
	{ label: "This Week", value: "week" },
	{ label: "Custom", value: "custom" }
];

export default function TimelineFilter({ onChange }: Props) {
	const [active, setActive] = useState<Preset>("all");
	const [customAfter, setCustomAfter] = useState("");
	const [customBefore, setCustomBefore] = useState("");

	function apply(preset: Preset) {
		setActive(preset);
		if (preset === "all") {
			onChange(undefined, undefined);
		} else if (preset === "today") {
			const [a, b] = dayRange(0);
			onChange(a, b);
		} else if (preset === "tomorrow") {
			const [a, b] = dayRange(1);
			onChange(a, b);
		} else if (preset === "week") {
			const now = new Date();
			now.setHours(0, 0, 0, 0);
			const end = new Date(now);
			end.setDate(end.getDate() + 7);
			end.setHours(23, 59, 59, 999);
			onChange(now.toISOString(), end.toISOString());
		}
		// "custom" is applied via the inputs below
	}

	function applyCustom() {
		onChange(
			customAfter ? new Date(customAfter).toISOString() : undefined,
			customBefore ? new Date(customBefore).toISOString() : undefined
		);
	}

	return (
		<div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background-secondary/80 backdrop-blur-md border border-accent-text/30 rounded-2xl px-3 py-2 shadow-lg">
			<CalendarDays className="size-4 text-text-secondary shrink-0" />
			<div className="flex items-center gap-1">
				{PRESETS.map((p) => (
					<button
						key={p.value}
						onClick={() => apply(p.value)}
						className={cn(
							"px-3 py-1 rounded-xl text-xs font-medium transition-colors",
							active === p.value
								? "bg-primary text-primary-foreground"
								: "text-text-secondary hover:text-text-primary hover:bg-background-primary/50"
						)}
					>
						{p.label}
					</button>
				))}
			</div>

			{active === "custom" && (
				<div className="flex items-center gap-1 ml-2 border-l border-accent-text/30 pl-2">
					<input
						type="datetime-local"
						value={customAfter}
						onChange={(e) => setCustomAfter(e.target.value)}
						className="bg-transparent text-xs text-text-primary border border-accent-text/30 rounded-lg px-2 py-1 w-40"
					/>
					<span className="text-text-tertiary text-xs">–</span>
					<input
						type="datetime-local"
						value={customBefore}
						onChange={(e) => setCustomBefore(e.target.value)}
						className="bg-transparent text-xs text-text-primary border border-accent-text/30 rounded-lg px-2 py-1 w-40"
					/>
					<button
						onClick={applyCustom}
						className="px-3 py-1 rounded-xl text-xs font-medium bg-primary text-primary-foreground"
					>
						Apply
					</button>
				</div>
			)}
		</div>
	);
}
