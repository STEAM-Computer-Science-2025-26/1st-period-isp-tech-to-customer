"use client";

import {
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactNode
} from "react";
import { cn } from "@/lib/utils";
import { PopoverDatePicker } from "@/components/ui/DateRangePicker";
import {
	STATUS_OPTIONS,
	PRIORITY_OPTIONS,
	JOB_TYPE_OPTIONS,
	countActiveFilters,
	toggleSet,
	type PanelFilter
} from "./mapFilterUtils";
import { CalendarDays, Check } from "lucide-react";

type Props = {
	value: PanelFilter;
	searchQuery: string;
	onChange: (next: PanelFilter) => void;
	onClear: () => void;
	className?: string;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section>
			<p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-text-tertiary">
				{title}
			</p>
			{children}
		</section>
	);
}

function OptionList<T extends string>({
	options,
	selected,
	onToggle,
	selectedClassName
}: {
	options: { value: T; label: string; cls?: string }[];
	selected: Set<T>;
	onToggle: (value: T) => void;
	selectedClassName?: (value: T) => string;
}) {
	return (
		<div className="flex flex-col">
			{options.map((option) => {
				const isActive = selected.has(option.value);
				return (
					<button
						key={option.value}
						type="button"
						data-filter-item="true"
						onClick={() => onToggle(option.value)}
						className={cn(
							"-mx-4 flex items-center justify-between px-6 py-1 text-sm font-medium transition-colors hover:bg-background-secondary/70",
							isActive
								? cn(
										"border-primary/30 text-text-primary",
										selectedClassName?.(option.value) ?? option.cls
									)
								: "border-accent-text/20 text-text-secondary hover:border-accent-text/30 hover:text-text-primary"
						)}
					>
						<span>{option.label}</span>
						<span
							className={cn(
								"grid size-5 place-items-center rounded-full transition-colors",
								isActive ? "text-primary-foreground" : "text-transparent"
							)}
						>
							<Check className="size-3.5" />
						</span>
					</button>
				);
			})}
		</div>
	);
}

function formatSelectionSummary(start?: string, end?: string): string {
	const startDate = start ? new Date(start) : undefined;
	const endDate = end ? new Date(end) : undefined;
	const formatter = new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric"
	});

	if (startDate && endDate) {
		return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
	}
	if (startDate) return formatter.format(startDate);
	if (endDate) return formatter.format(endDate);
	return "Any date";
}

export default function MapFilterDropdown({
	value,
	searchQuery,
	onChange,
	onClear,
	className
}: Props) {
	const activeCount = countActiveFilters(value);
	const [scheduledOpen, setScheduledOpen] = useState(
		Boolean(value.dateAfter || value.dateBefore)
	);
	const scheduledBtnRef = useRef<HTMLButtonElement>(null);

	const normalizedQuery = searchQuery.trim().toLowerCase();
	const filteredStatusOptions = useMemo(
		() =>
			STATUS_OPTIONS.filter((option) =>
				option.label.toLowerCase().includes(normalizedQuery)
			),
		[normalizedQuery]
	);
	const filteredPriorityOptions = useMemo(
		() =>
			PRIORITY_OPTIONS.filter((option) =>
				option.label.toLowerCase().includes(normalizedQuery)
			),
		[normalizedQuery]
	);
	const filteredJobTypeOptions = useMemo(
		() =>
			JOB_TYPE_OPTIONS.filter((option) =>
				option.label.toLowerCase().includes(normalizedQuery)
			),
		[normalizedQuery]
	);
	const showLocation =
		!normalizedQuery ||
		"location".includes(normalizedQuery) ||
		"zip code".includes(normalizedQuery);
	const showScheduled =
		!normalizedQuery ||
		"scheduled window".includes(normalizedQuery) ||
		"date".includes(normalizedQuery) ||
		"calendar".includes(normalizedQuery);

	const hasMatches =
		filteredStatusOptions.length > 0 ||
		filteredPriorityOptions.length > 0 ||
		filteredJobTypeOptions.length > 0 ||
		showLocation ||
		showScheduled;

	function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (
			event.key !== "ArrowDown" &&
			event.key !== "ArrowUp" &&
			event.key !== "Home" &&
			event.key !== "End"
		) {
			return;
		}

		if (!(event.target instanceof HTMLButtonElement)) return;

		const items = Array.from(
			event.currentTarget.querySelectorAll<HTMLButtonElement>(
				"[data-filter-item='true']"
			)
		);
		if (items.length === 0) return;

		event.preventDefault();
		const currentIndex = items.indexOf(event.target);
		if (currentIndex === -1) return;

		let nextIndex = currentIndex;
		if (event.key === "ArrowDown")
			nextIndex = (currentIndex + 1) % items.length;
		if (event.key === "ArrowUp")
			nextIndex = (currentIndex - 1 + items.length) % items.length;
		if (event.key === "Home") nextIndex = 0;
		if (event.key === "End") nextIndex = items.length - 1;

		items[nextIndex]?.focus();
	}

	return (
		<div
			className={cn(
				"z-20 -mt-12 pt-10 rounded-lg border border-accent-text/20 bg-background-secondary/50 shadow-2xl shadow-black/15 ring-1 ring-black/5 backdrop-blur-md",
				className
			)}
			onKeyDown={handleMenuKeyDown}
		>
			<div className="scrollbar-thumb-only max-h-48 border-t border-text-secondary/20 space-y-3 overflow-x-hidden overflow-y-auto p-4">
				<Section title="Status">
					{filteredStatusOptions.length > 0 ? (
						<OptionList
							options={filteredStatusOptions}
							selected={value.statuses}
							onToggle={(status) =>
								onChange({
									...value,
									statuses: toggleSet(value.statuses, status)
								})
							}
						/>
					) : (
						<p className="text-xs text-text-tertiary">No matching filters.</p>
					)}
				</Section>

				<Section title="Priority">
					{filteredPriorityOptions.length > 0 ? (
						<OptionList
							options={filteredPriorityOptions}
							selected={value.priorities}
							onToggle={(priority) =>
								onChange({
									...value,
									priorities: toggleSet(value.priorities, priority)
								})
							}
						/>
					) : (
						<p className="text-xs text-text-tertiary">No matching filters.</p>
					)}
				</Section>

				<Section title="Job type">
					{filteredJobTypeOptions.length > 0 ? (
						<OptionList
							options={filteredJobTypeOptions}
							selected={value.jobTypes}
							onToggle={(jobType) =>
								onChange({
									...value,
									jobTypes: toggleSet(value.jobTypes, jobType)
								})
							}
						/>
					) : (
						<p className="text-xs text-text-tertiary">No matching filters.</p>
					)}
				</Section>

				{showLocation || showScheduled ? (
					<Section title="Other">
						<div className="">
							{showLocation ? (
								<div className="-mx-4 flex items-center justify-between gap-3 px-6 py-1 text-sm font-medium text-text-secondary transition-colors hover:bg-background-secondary/70 hover:text-text-primary">
									<span className="text-text-primary">ZIP code</span>
									<input
										type="text"
										value={value.zipCode}
										onChange={(event) =>
											onChange({
												...value,
												zipCode: event.target.value
													.replace(/\D/g, "")
													.slice(0, 5)
											})
										}
										placeholder="30301"
										className="w-14 rounded-md border border-accent-text/20 bg-background-secondary/80 px-1.5 py-px text-center text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary/50"
									/>
								</div>
							) : null}

							{showScheduled ? (
								<button
									ref={scheduledBtnRef}
									type="button"
									data-filter-item="true"
									onClick={() => setScheduledOpen((current) => !current)}
									className="-mx-4 w-[calc(100%+3rem)] pr-10 flex items-center justify-between px-6 py-1 text-sm font-medium text-text-secondary transition-colors hover:bg-background-secondary/70 hover:text-text-primary"
									title="Pick scheduled window"
								>
									<span className="text-text-primary">Scheduled window</span>
									<div className="flex items-center gap-2 text-xs text-text-tertiary">
										<span>
											{formatSelectionSummary(
												value.dateAfter,
												value.dateBefore
											)}
										</span>
										<span className="grid size-5 place-items-center rounded-full text-text-secondary">
											<CalendarDays className="size-3.5" />
										</span>
									</div>
								</button>
							) : null}
						</div>
					</Section>
				) : null}

				{!hasMatches ? (
					<p className="px-1 py-2 text-xs text-text-tertiary">
						No filters match your search.
					</p>
				) : null}
			</div>

			<PopoverDatePicker
				open={scheduledOpen}
				onOpenChange={setScheduledOpen}
				anchorEl={scheduledBtnRef.current}
				mode="range"
				showHeader={false}
				selection={{
					start: value.dateAfter,
					end: value.dateBefore
				}}
				onChange={({ start, end }) =>
					onChange({
						...value,
						dateAfter: start ?? "",
						dateBefore: end ?? ""
					})
				}
				onClear={() =>
					onChange({
						...value,
						dateAfter: "",
						dateBefore: ""
					})
				}
			/>
		</div>
	);
}
