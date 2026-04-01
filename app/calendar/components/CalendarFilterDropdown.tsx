"use client";

import { useMemo, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterOption = { value: string; label: string };

type Props = {
	searchQuery: string;
	employeeOptions: FilterOption[];
	priorityOptions: FilterOption[];
	statusOptions: FilterOption[];
	jobTypeOptions: FilterOption[];
	selectedEmployees: string[];
	selectedPriorities: string[];
	selectedStatuses: string[];
	selectedJobTypes: string[];
	onToggleEmployee: (value: string) => void;
	onTogglePriority: (value: string) => void;
	onToggleStatus: (value: string) => void;
	onToggleJobType: (value: string) => void;
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

function OptionList({
	options,
	selected,
	onToggle
}: {
	options: FilterOption[];
	selected: Set<string>;
	onToggle: (value: string) => void;
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
								? "border-primary/30 text-text-primary"
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

export default function CalendarFilterDropdown({
	searchQuery,
	employeeOptions,
	priorityOptions,
	statusOptions,
	jobTypeOptions,
	selectedEmployees,
	selectedPriorities,
	selectedStatuses,
	selectedJobTypes,
	onToggleEmployee,
	onTogglePriority,
	onToggleStatus,
	onToggleJobType,
	className
}: Props) {
	const normalizedQuery = searchQuery.trim().toLowerCase();
	const filteredEmployeeOptions = useMemo(
		() =>
			employeeOptions.filter((option) =>
				option.label.toLowerCase().includes(normalizedQuery)
			),
		[employeeOptions, normalizedQuery]
	);
	const filteredPriorityOptions = useMemo(
		() =>
			priorityOptions.filter((option) =>
				option.label.toLowerCase().includes(normalizedQuery)
			),
		[priorityOptions, normalizedQuery]
	);
	const filteredStatusOptions = useMemo(
		() =>
			statusOptions.filter((option) =>
				option.label.toLowerCase().includes(normalizedQuery)
			),
		[statusOptions, normalizedQuery]
	);
	const filteredJobTypeOptions = useMemo(
		() =>
			jobTypeOptions.filter((option) =>
				option.label.toLowerCase().includes(normalizedQuery)
			),
		[jobTypeOptions, normalizedQuery]
	);

	const hasMatches =
		filteredEmployeeOptions.length > 0 ||
		filteredPriorityOptions.length > 0 ||
		filteredStatusOptions.length > 0 ||
		filteredJobTypeOptions.length > 0;

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
				<Section title="Employees">
					{filteredEmployeeOptions.length > 0 ? (
						<OptionList
							options={filteredEmployeeOptions}
							selected={new Set(selectedEmployees)}
							onToggle={onToggleEmployee}
						/>
					) : (
						<p className="text-xs text-text-tertiary">No matching filters.</p>
					)}
				</Section>

				<Section title="Priority">
					{filteredPriorityOptions.length > 0 ? (
						<OptionList
							options={filteredPriorityOptions}
							selected={new Set(selectedPriorities)}
							onToggle={onTogglePriority}
						/>
					) : (
						<p className="text-xs text-text-tertiary">No matching filters.</p>
					)}
				</Section>

				<Section title="Status">
					{filteredStatusOptions.length > 0 ? (
						<OptionList
							options={filteredStatusOptions}
							selected={new Set(selectedStatuses)}
							onToggle={onToggleStatus}
						/>
					) : (
						<p className="text-xs text-text-tertiary">No matching filters.</p>
					)}
				</Section>

				<Section title="Job type">
					{filteredJobTypeOptions.length > 0 ? (
						<OptionList
							options={filteredJobTypeOptions}
							selected={new Set(selectedJobTypes)}
							onToggle={onToggleJobType}
						/>
					) : (
						<p className="text-xs text-text-tertiary">No matching filters.</p>
					)}
				</Section>

				{!hasMatches ? (
					<p className="px-1 py-2 text-xs text-text-tertiary">
						No filters match your search.
					</p>
				) : null}
			</div>
		</div>
	);
}
