"use client";

import { useMemo, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
	CUSTOMER_TYPE_OPTIONS,
	CUSTOMER_STATUS_OPTIONS,
	toggleSet,
	type CustomersFilter
} from "./customersFilterUtils";
import { Check } from "lucide-react";

type Props = {
	value: CustomersFilter;
	searchQuery: string;
	onChange: (next: CustomersFilter) => void;
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
	onToggle
}: {
	options: { value: T; label: string }[];
	selected: Set<T>;
	onToggle: (value: T) => void;
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

export default function CustomersFilterDropdown({
	value,
	searchQuery,
	onChange,
	onClear,
	className
}: Props) {
	const normalizedQuery = searchQuery.trim().toLowerCase();

	const filteredTypeOptions = useMemo(
		() =>
			CUSTOMER_TYPE_OPTIONS.filter((o) =>
				o.label.toLowerCase().includes(normalizedQuery)
			),
		[normalizedQuery]
	);

	const filteredStatusOptions = useMemo(
		() =>
			CUSTOMER_STATUS_OPTIONS.filter((o) =>
				o.label.toLowerCase().includes(normalizedQuery)
			),
		[normalizedQuery]
	);

	const hasMatches =
		filteredTypeOptions.length > 0 || filteredStatusOptions.length > 0;

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
				<Section title="Type">
					{filteredTypeOptions.length > 0 ? (
						<OptionList
							options={filteredTypeOptions}
							selected={value.types}
							onToggle={(type) =>
								onChange({ ...value, types: toggleSet(value.types, type) })
							}
						/>
					) : (
						<p className="text-xs text-text-tertiary">No matching filters.</p>
					)}
				</Section>

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

				{!hasMatches && (
					<p className="px-1 py-2 text-xs text-text-tertiary">
						No filters match your search.
					</p>
				)}
			</div>
		</div>
	);
}
