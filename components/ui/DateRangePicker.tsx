"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

type DateSelection = {
	start?: string;
	end?: string;
};

type SelectionMode = "single" | "range" | "either";
type InteractionMode = "single" | "range";

type Props = {
	mode?: SelectionMode;
	defaultInteractionMode?: InteractionMode;
	title?: string;
	description?: string;
	showHeader?: boolean;
	selection: DateSelection;
	onChange: (selection: DateSelection) => void;
	onClear?: () => void;
	className?: string;
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toLocalDate(value?: string): Date | undefined {
	if (!value) return undefined;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return undefined;
	return startOfDay(date);
}

function startOfDay(date: Date): Date {
	const result = new Date(date);
	result.setHours(0, 0, 0, 0);
	return result;
}

function startOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, amount: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + amount);
	return startOfDay(result);
}

function addMonths(date: Date, amount: number): Date {
	return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function sameDay(left?: Date, right?: Date): boolean {
	if (!left || !right) return false;
	return left.getTime() === right.getTime();
}

function minDate(left: Date, right: Date): Date {
	return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date): Date {
	return left.getTime() >= right.getTime() ? left : right;
}

function formatDisplayDate(value?: Date): string {
	if (!value) return "Any date";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric"
	}).format(value);
}

function formatMonthLabel(value: Date): string {
	return new Intl.DateTimeFormat(undefined, {
		month: "long",
		year: "numeric"
	}).format(value);
}

function toStartOfDayIso(value: Date): string {
	return startOfDay(value).toISOString();
}

function toEndOfDayIso(value: Date): string {
	const result = startOfDay(value);
	result.setHours(23, 59, 59, 999);
	return result.toISOString();
}

function buildMonthGrid(month: Date): Date[] {
	const firstOfMonth = startOfMonth(month);
	const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
	return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export default function DateRangePicker({
	mode = "range",
	defaultInteractionMode,
	title = "Scheduled date",
	description = "Pick one date or a date range.",
	showHeader = true,
	selection,
	onChange,
	onClear,
	className
}: Props) {
	const [interactionMode, setInteractionMode] = useState<InteractionMode>(
		() => {
			if (mode === "single") return "single";
			if (mode === "range") return "range";
			if (selection.start && selection.end) return "range";
			return defaultInteractionMode ?? "single";
		}
	);
	const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
		const anchor =
			toLocalDate(selection.start) ?? toLocalDate(selection.end) ?? new Date();
		return startOfMonth(anchor);
	});
	const [hoveredDay, setHoveredDay] = useState<Date | null>(null);

	const activeMode: InteractionMode =
		mode === "either" ? interactionMode : mode;
	const startDate = toLocalDate(selection.start);
	const endDate = toLocalDate(selection.end);
	const today = startOfDay(new Date());

	useEffect(() => {
		if (mode === "single" || mode === "range") {
			setInteractionMode(mode);
		}
	}, [mode]);

	useEffect(() => {
		const anchor = toLocalDate(selection.start) ?? toLocalDate(selection.end);
		if (anchor) {
			setVisibleMonth(startOfMonth(anchor));
		}
	}, [selection.start, selection.end]);

	const calendarDays = useMemo(
		() => buildMonthGrid(visibleMonth),
		[visibleMonth]
	);

	const committedRange =
		startDate && endDate
			? { start: minDate(startDate, endDate), end: maxDate(startDate, endDate) }
			: startDate
				? { start: startDate, end: startDate }
				: undefined;

	const previewRange =
		activeMode === "range" && startDate && !endDate && hoveredDay
			? {
					start: minDate(startDate, hoveredDay),
					end: maxDate(startDate, hoveredDay)
				}
			: undefined;

	const summary =
		activeMode === "single"
			? formatDisplayDate(startDate ?? endDate)
			: committedRange
				? committedRange.start.getTime() === committedRange.end.getTime()
					? formatDisplayDate(committedRange.start)
					: `${formatDisplayDate(committedRange.start)} to ${formatDisplayDate(committedRange.end)}`
				: previewRange
					? `${formatDisplayDate(previewRange.start)} to ${formatDisplayDate(previewRange.end)}`
					: "Any date range";

	function handleModeChange(nextMode: InteractionMode) {
		setInteractionMode(nextMode);

		if (nextMode === "single") {
			onChange({ start: selection.start ?? selection.end, end: undefined });
			return;
		}

		onChange({
			start: selection.start ?? selection.end,
			end: selection.start && selection.end ? selection.end : undefined
		});
	}

	function handleDayClick(day: Date) {
		if (activeMode === "single") {
			onChange({ start: toStartOfDayIso(day), end: undefined });
			return;
		}

		if (!startDate || endDate) {
			onChange({ start: toStartOfDayIso(day), end: undefined });
			return;
		}

		if (day.getTime() <= startDate.getTime()) {
			onChange({
				start: toStartOfDayIso(day),
				end: toEndOfDayIso(startDate)
			});
			return;
		}

		onChange({
			start: toStartOfDayIso(startDate),
			end: toEndOfDayIso(day)
		});
	}

	function handleClear() {
		onClear?.();
	}

	return (
		<div
			className={cn(
				"rounded-3xl border border-accent-text/20 bg-background-secondary/80 p-4 shadow-lg shadow-black/10 backdrop-blur-xl",
				className
			)}
		>
			{showHeader ? (
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary">
							<span className="inline-flex items-center gap-1.5">
								<CalendarDays className="size-3.5" />
								{title}
							</span>
						</p>
						{description ? (
							<p className="mt-1 text-sm text-text-secondary">{description}</p>
						) : null}
					</div>
					<div className="flex shrink-0 flex-col items-end gap-2">
						<div className="rounded-full border border-accent-text/20 bg-background-primary/60 px-3 py-1 text-xs text-text-secondary">
							{summary}
						</div>
						{mode === "either" ? (
							<div className="inline-flex rounded-full border border-accent-text/20 bg-background-primary/60 p-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
								<button
									type="button"
									onClick={() => handleModeChange("single")}
									className={cn(
										"rounded-full px-2.5 py-1 transition-colors",
										activeMode === "single"
											? "bg-primary text-primary-foreground"
											: "hover:text-text-primary"
									)}
								>
									Single
								</button>
								<button
									type="button"
									onClick={() => handleModeChange("range")}
									className={cn(
										"rounded-full px-2.5 py-1 transition-colors",
										activeMode === "range"
											? "bg-primary text-primary-foreground"
											: "hover:text-text-primary"
									)}
								>
									Range
								</button>
							</div>
						) : null}
					</div>
				</div>
			) : null}

			<div className="mt-4 flex items-center justify-between gap-3">
				<button
					type="button"
					onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
					className="grid size-8 place-items-center rounded-full border border-accent-text/20 bg-background-primary/60 text-text-secondary transition-colors hover:border-accent-text/30 hover:bg-background-primary/80 hover:text-text-primary"
					aria-label="Previous month"
				>
					<ChevronLeft className="size-4" />
				</button>
				<p className="text-sm font-semibold text-text-primary">
					{formatMonthLabel(visibleMonth)}
				</p>
				<button
					type="button"
					onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
					className="grid size-8 place-items-center rounded-full border border-accent-text/20 bg-background-primary/60 text-text-secondary transition-colors hover:border-accent-text/30 hover:bg-background-primary/80 hover:text-text-primary"
					aria-label="Next month"
				>
					<ChevronRight className="size-4" />
				</button>
			</div>

			<div className="mt-3 grid grid-cols-7 gap-1 px-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-text-tertiary">
				{WEEKDAY_LABELS.map((day) => (
					<span key={day}>{day}</span>
				))}
			</div>

			<div
				className="mt-2 grid grid-cols-7 gap-1"
				onMouseLeave={() => setHoveredDay(null)}
			>
				{calendarDays.map((day) => {
					const inCurrentMonth = day.getMonth() === visibleMonth.getMonth();
					const isSelectedSingle =
						activeMode === "single" && sameDay(day, startDate ?? endDate);
					const rangeStart = previewRange?.start ?? committedRange?.start;
					const rangeEnd = previewRange?.end ?? committedRange?.end;
					const isRangeStart = sameDay(day, rangeStart);
					const isRangeEnd = sameDay(day, rangeEnd);
					const isInRange =
						Boolean(rangeStart && rangeEnd) &&
						day.getTime() >= rangeStart!.getTime() &&
						day.getTime() <= rangeEnd!.getTime();
					const isToday = sameDay(day, today);
					const isRangeEndpoint = isRangeStart || isRangeEnd;

					return (
						<button
							key={day.toISOString()}
							type="button"
							onMouseEnter={() => setHoveredDay(day)}
							onClick={() => handleDayClick(day)}
							aria-label={formatDisplayDate(day)}
							className={cn(
								"relative grid h-9 w-9 place-items-center text-xs font-medium transition-all",
								inCurrentMonth
									? "text-text-secondary"
									: "text-text-tertiary/40",
								isInRange &&
									!isRangeEndpoint &&
									"rounded-md bg-primary/15 text-text-primary",
								isSelectedSingle &&
									"rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20",
								!isSelectedSingle &&
									isRangeEndpoint &&
									"rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20",
								!isInRange &&
									!isSelectedSingle &&
									"rounded-full hover:bg-background-primary/60 hover:text-text-primary",
								isToday &&
									!isSelectedSingle &&
									!isRangeEndpoint &&
									"ring-1 ring-primary/40"
							)}
						>
							<span className="relative z-10">{day.getDate()}</span>
						</button>
					);
				})}
			</div>

			<div className="mt-4 flex items-center justify-between gap-3 border-t border-accent-text/15 pt-3">
				<p className="text-xs text-text-tertiary">
					{activeMode === "single"
						? "Click one day to select it."
						: "Click once for a start date, then a second time for the end date."}
				</p>
				{onClear ? (
					<button
						type="button"
						onClick={handleClear}
						className="inline-flex items-center gap-1 rounded-xl border border-accent-text/20 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-background-primary/60 hover:text-text-primary"
					>
						<X className="size-3.5" />
						Clear
					</button>
				) : null}
			</div>
		</div>
	);
}
