"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption<T extends string> = {
	value: T;
	label: string;
	icon?: React.ReactNode;
};

export type CustomSelectProps<T extends string> = {
	value: T;
	options: SelectOption<T>[];
	onChange: (value: T) => void;
	className?: string;
	buttonClassName?: string;
	menuClassName?: string;
};

export default function CustomSelect<T extends string>({
	value,
	options,
	onChange,
	className,
	buttonClassName,
	menuClassName
}: CustomSelectProps<T>) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const selected = options.find((option) => option.value === value);

	useEffect(() => {
		const handleClick = (event: MouseEvent) => {
			if (!wrapperRef.current) return;
			if (!wrapperRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, []);

	return (
		<div ref={wrapperRef} className={cn("relative", className)}>
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className={cn(
					"inline-flex items-center gap-2 rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-xs text-text-main backdrop-blur-md transition-colors hover:bg-background-secondary/60",
					buttonClassName
				)}
			>
				{selected?.icon ? (
					<span className="text-text-tertiary">{selected.icon}</span>
				) : null}
				<span className="capitalize">{selected?.label ?? value}</span>
				<ChevronDown className="w-3 h-3 text-text-tertiary" />
			</button>
			{open ? (
				<div
					className={cn(
						"absolute left-0 top-full z-30 mt-1 min-w-full rounded-lg border border-background-secondary bg-background-primary overflow-hidden shadow-lg",
						menuClassName
					)}
				>
					{options.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => {
								onChange(option.value);
								setOpen(false);
							}}
							className={cn(
								"flex w-full items-center gap-2 px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-background-secondary/70 hover:text-text-main",
								option.value === value &&
									"bg-background-secondary/50 text-text-main"
							)}
						>
							{option.icon ? (
								<span className="text-text-tertiary">{option.icon}</span>
							) : null}
							<span className="capitalize">{option.label}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
