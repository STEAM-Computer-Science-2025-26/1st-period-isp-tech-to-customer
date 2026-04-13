"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils/index";
import type React from "react";

type FilterSearchBarProps = {
	/**
	 * When true: the input has dual mode.
	 *   filterOpen=false → searches data (searchQuery / onSearchChange / searchPlaceholder)
	 *   filterOpen=true  → searches filters (filterQuery / onFilterQueryChange)
	 * When false: the input always searches filters; clicking it opens the dropdown.
	 */
	doubleSearch?: boolean;

	// ── Data search (only used when doubleSearch=true) ──
	searchQuery?: string;
	onSearchChange?: (q: string) => void;
	searchPlaceholder?: string;

	// ── Filter state ──
	filterOpen: boolean;
	onFilterOpenChange: (open: boolean) => void;
	activeFilterCount?: number;
	/** Called when the clear-X button is clicked (shown only when dropdown is open) */
	onClearFilters?: () => void;

	// ── Filter query ──
	filterQuery: string;
	onFilterQueryChange: (q: string) => void;
	filterPlaceholder?: string;
	/** Called with current filterQuery when Enter is pressed in filter mode */
	onFilterQuerySubmit?: (q: string) => void;

	// ── Dropdown ──
	filterDropdown?: React.ReactNode;
	filterDropdownClassName?: string;

	className?: string;
};

export function FilterSearchBar({
	doubleSearch = false,
	searchQuery = "",
	onSearchChange,
	searchPlaceholder = "Search...",
	filterOpen,
	onFilterOpenChange,
	activeFilterCount = 0,
	onClearFilters,
	filterQuery,
	onFilterQueryChange,
	filterPlaceholder = "Search filters...",
	onFilterQuerySubmit,
	filterDropdown,
	filterDropdownClassName,
	className
}: FilterSearchBarProps) {
	const inFilterMode = filterOpen;

	const inputValue = doubleSearch
		? inFilterMode
			? filterQuery
			: searchQuery
		: filterQuery;

	const inputPlaceholder = doubleSearch
		? inFilterMode
			? filterPlaceholder
			: searchPlaceholder
		: filterPlaceholder;

	const handleChange = (value: string) => {
		if (doubleSearch) {
			if (inFilterMode) onFilterQueryChange(value);
			else onSearchChange?.(value);
		} else {
			onFilterQueryChange(value);
			if (!filterOpen) onFilterOpenChange(true);
		}
	};

	const handleInputClick = () => {
		if (!doubleSearch && !filterOpen) {
			onFilterOpenChange(true);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onFilterOpenChange(false);
			return;
		}
		if (inFilterMode && e.key === "Enter") {
			e.preventDefault();
			onFilterQuerySubmit?.(filterQuery);
		}
	};

	return (
		<div className={cn("relative flex items-center gap-2", className)}>
			<div className=" z-30 relative flex-1">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
				<input
					type="text"
					value={inputValue}
					onChange={(e) => handleChange(e.target.value)}
					onKeyDown={handleKeyDown}
					onClick={handleInputClick}
					placeholder={inputPlaceholder}
					className={cn(
						"w-full rounded-lg border border-background-secondary bg-background-primary py-2 pl-9 pr-3 text-sm text-text-main placeholder:text-text-tertiary transition-colors focus:outline-none focus:border-accent-main/50",
						((doubleSearch && inFilterMode) || (!doubleSearch && filterOpen)) &&
							"bg-transparent border-transparent focus:border-transparent",
						!doubleSearch && "cursor-pointer"
					)}
				/>
			</div>

			{filterOpen && onClearFilters && (
				<button
					type="button"
					onClick={onClearFilters}
					className="flex z-30 -mr-4 size-9 shrink-0 items-center justify-center  text-text-secondary transition-colors hover:text-text-primary"
					title="Clear all filters"
				>
					<X className="size-4" />
				</button>
			)}

			<button
				type="button"
				onClick={() => onFilterOpenChange(!filterOpen)}
				onKeyDown={(e) => e.key === "Escape" && onFilterOpenChange(false)}
				className={cn(
					"relative z-30 flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
					filterOpen
						? "border-transparent bg-primary text-primary-foreground"
						: "border border-accent-text/30 bg-background-primary text-text-secondary backdrop-blur-md hover:bg-background-secondary/50 hover:text-text-primary"
				)}
				title="Toggle filters"
			>
				<SlidersHorizontal className="size-4" />
				{activeFilterCount > 0 && !filterOpen && (
					<span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-background-secondary bg-accent-main/50 text-[10px] font-bold text-primary-foreground">
						{activeFilterCount}
					</span>
				)}
			</button>

			{filterDropdown && filterOpen && (
				<div
					className={cn(
						"absolute left-0 top-[calc(100%+0.5rem)] z-20 w-full",
						filterDropdownClassName
					)}
				>
					{filterDropdown}
				</div>
			)}
		</div>
	);
}
