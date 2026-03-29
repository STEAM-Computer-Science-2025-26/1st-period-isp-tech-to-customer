"use client";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState
} from "react";
import { createPortal } from "react-dom";
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

			{/* Month navigation */}
			<div className="mt-4 flex items-center justify-between gap-3">
				<button
					type="button"
					onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
					className="grid size-8 place-items-center rounded-full text-text-secondary transition-colors hover:bg-background-primary/60 hover:text-text-primary"
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
					className="grid size-8 place-items-center rounded-full text-text-secondary transition-colors hover:bg-background-primary/60 hover:text-text-primary"
					aria-label="Next month"
				>
					<ChevronRight className="size-4" />
				</button>
			</div>

			{/* Weekday labels */}
			<div className="mt-3 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-text-tertiary">
				{WEEKDAY_LABELS.map((day) => (
					<span key={day}>{day}</span>
				))}
			</div>

			{/* Calendar grid — no horizontal gap so range bands flow continuously */}
			<div
				className="mt-1 grid grid-cols-7 gap-y-0.5"
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
								"relative grid h-9 place-items-center text-xs font-medium transition-colors",
								inCurrentMonth
									? "text-text-secondary"
									: "text-text-tertiary/40",
								// Continuous range band
								isInRange && !isRangeStart && !isRangeEnd && "bg-primary/10",
								isInRange &&
									isRangeStart &&
									!isRangeEnd &&
									"rounded-l-full bg-primary/10",
								isInRange &&
									isRangeEnd &&
									!isRangeStart &&
									"rounded-r-full bg-primary/10"
							)}
						>
							<span
								className={cn(
									"relative z-10 grid size-8 place-items-center rounded-full transition-colors",
									(isSelectedSingle || isRangeEndpoint) &&
										"bg-primary text-primary-foreground shadow-sm shadow-primary/25",
									isInRange &&
										!isRangeEndpoint &&
										"text-text-primary font-semibold",
									!isInRange &&
										!isSelectedSingle &&
										"hover:bg-background-primary/60 hover:text-text-primary",
									isToday &&
										!isSelectedSingle &&
										!isRangeEndpoint &&
										"ring-1 ring-primary/40"
								)}
							>
								{day.getDate()}
							</span>
						</button>
					);
				})}
			</div>

			{/* Footer */}
			<div className="mt-4 flex items-center justify-between gap-3 border-t border-accent-text/15 pt-3">
				<p className="text-xs text-text-tertiary">
					{activeMode === "single"
						? "Click a day to select it."
						: "Click to set start, click again for end."}
				</p>
				{onClear ? (
					<button
						type="button"
						onClick={handleClear}
						className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
					>
						<X className="size-3" />
						Clear
					</button>
				) : null}
			</div>
		</div>
	);
}

// ─── Popover wrapper — renders DateRangePicker through a portal ─────────────

export function PopoverDatePicker({
	open,
	onOpenChange,
	anchorEl,
	...pickerProps
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	anchorEl: HTMLElement | null;
} & Omit<Props, "className">) {
	const pickerRef = useRef<HTMLDivElement>(null);
	const [placement, setPlacement] = useState({
		top: -9999,
		left: -9999,
		ready: false
	});

	// Position relative to anchor, choosing direction based on viewport space
	useLayoutEffect(() => {
		if (!open || !anchorEl) {
			setPlacement({ top: -9999, left: -9999, ready: false });
			return;
		}
		const pickerEl = pickerRef.current;
		if (!pickerEl) return;

		const triggerRect = anchorEl.getBoundingClientRect();
		const pickerRect = pickerEl.getBoundingClientRect();
		const vh = window.innerHeight;
		const vw = window.innerWidth;

		// Vertical — prefer below, flip above if not enough space
		const spaceBelow = vh - triggerRect.bottom;
		const spaceAbove = triggerRect.top;
		let top: number;
		if (spaceBelow >= pickerRect.height + 8 || spaceBelow >= spaceAbove) {
			top = triggerRect.bottom + 8;
		} else {
			top = triggerRect.top - pickerRect.height - 8;
		}

		// Horizontal — prefer left-aligned with trigger, flip if overflows
		let left: number;
		if (triggerRect.left + pickerRect.width <= vw - 8) {
			left = triggerRect.left;
		} else {
			left = triggerRect.right - pickerRect.width;
		}

		// Clamp to viewport edges
		top = Math.max(8, Math.min(top, vh - pickerRect.height - 8));
		left = Math.max(8, Math.min(left, vw - pickerRect.width - 8));

		setPlacement({ top, left, ready: true });
	}, [open, anchorEl]);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		function handleMouseDown(e: MouseEvent) {
			const target = e.target as Node;
			if (
				pickerRef.current &&
				!pickerRef.current.contains(target) &&
				(!anchorEl || !anchorEl.contains(target))
			) {
				onOpenChange(false);
			}
		}
		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [open, anchorEl, onOpenChange]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onOpenChange(false);
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onOpenChange]);

	if (!open) return null;

	return createPortal(
		<div
			ref={pickerRef}
			className="fixed z-100"
			style={{
				top: placement.top,
				left: placement.left,
				opacity: placement.ready ? 1 : 0,
				transition: "opacity 150ms ease-out"
			}}
		>
			<DateRangePicker {...pickerProps} className="w-72" />
		</div>,
		document.body
	);
}
