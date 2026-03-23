"use client";

// This is for the small components like the adress input, name, etc. that are used in the create form
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ClassValue } from "clsx";
import { ChevronDown } from "lucide-react";

type TextInputParams = {
	placeholder?: string; // the default text to display when the input is empty
	minLength?: number; // the minimum number of characters required for the input
	maxLength?: number; // the maximum number of characters allowed for the input
	regex?: string; // a pattern that the input value has to match for it to be considered valid
	value: string; // the current value of the input
	onChange: (value: string) => void; // callback function when the input value changes
	className?: ClassValue; // additional CSS classes to apply to the wrapper element
	inputClassname?: ClassValue; // additional CSS classes to apply to the input element
	children?: React.ReactNode; // any additional elements or components to be rendered inside the wrapper element
};

export const TextInput = ({
	placeholder,
	value,
	onChange,
	className,
	inputClassname,
	children,
}: TextInputParams) => {
	return (
		<div className={cn(`w-56 relative`, className)}>
			<input
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className={cn(`outline-none h-10 border border-black rounded-lg px-2 w-full`, inputClassname)}
			/>
			{children}
		</div>
	);
};

type DropdownOption = {
	label: string;
	value: string;
	disabled?: boolean;
	className?: ClassValue;
};

type DropdownParams = {
	options: DropdownOption[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: ClassValue;
	inputClassname?: ClassValue;
};

export const Dropdown = ({
	options,
	value,
	onChange,
	placeholder,
	className,
	inputClassname,
}: DropdownParams) => {
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const selectedLabel = useMemo(() => {
		const selected = options.find((option) => option.value === value);
		return selected ? selected.label : "";
	}, [options, value]);

	const enabledOptions = useMemo(
		() => options.filter((option) => !option.disabled),
		[options]
	);
	const activeValue = enabledOptions[activeIndex]?.value;

	const setInitialActive = () => {
		const selectedIndex = enabledOptions.findIndex((option) => option.value === value);
		setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
	};

	const moveActive = (direction: 1 | -1) => {
		if (enabledOptions.length === 0) return;
		setActiveIndex((prev) => {
			const next = (prev + direction + enabledOptions.length) % enabledOptions.length;
			return next;
		});
	};

	const displayLabel = selectedLabel || placeholder || "Select";

	return (
		<div className={cn("w-56 relative", className)}>
			<button
				type="button"
				onClick={() => {
					setIsOpen((prev) => {
						if (!prev) {
							setInitialActive();
						}
						return !prev;
					});
				}}
				onKeyDown={(event) => {
				if (event.key === "ArrowDown") {
					event.preventDefault();
					if (!isOpen) {
						setIsOpen(true);
						setInitialActive();
						return;
					}
					moveActive(1);
				}
				if (event.key === "ArrowUp") {
					event.preventDefault();
					if (!isOpen) {
						setIsOpen(true);
						setInitialActive();
						return;
					}
					moveActive(-1);
				}
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					if (!isOpen) {
						setIsOpen(true);
						setInitialActive();
						return;
					}
					const option = enabledOptions[activeIndex];
					if (option) {
						onChange(option.value);
						setIsOpen(false);
					}
				}
				if (event.key === "Escape") {
					setIsOpen(false);
				}
				if (event.key === "Home") {
					event.preventDefault();
					setActiveIndex(0);
				}
				if (event.key === "End") {
					event.preventDefault();
					setActiveIndex(Math.max(0, enabledOptions.length - 1));
				}
			}}
				onBlur={() => {
					setTimeout(() => setIsOpen(false), 100);
				}}
				className={cn(
					"outline-none h-10 border border-black rounded-lg px-2 w-full text-left flex items-center justify-between",
					inputClassname
				)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
			>
				<span className={cn(!selectedLabel && "text-gray-500")}>{displayLabel}</span>
				<ChevronDown className="w-4 h-4 ml-2" />
			</button>
			{isOpen && (
				<div
					className="absolute z-10 mt-1 bg-background-main w-full rounded-lg border border-black max-h-56 overflow-auto"
					role="listbox"
				>
					{options.map((option) => (
						<button
							key={option.value}
							type="button"
							onMouseDown={() => {
								if (option.disabled) return;
								onChange(option.value);
								setIsOpen(false);
							}}
							className={cn(
								"block w-full text-left px-2 py-2 text-sm hover:bg-background-primary",
								option.disabled && "cursor-not-allowed text-gray-400 ",
								(option.value === value || option.value === activeValue) && "bg-gray-100",
								option.className
							)}
							role="option"
							aria-selected={option.value === value}
						>
							{option.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
};

type NumInputParams = {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	min?: number;
	max?: number;
	step?: number;
	className?: ClassValue;
	inputClassname?: ClassValue;
};

export const NumInput = ({
	value,
	onChange,
	placeholder,
	min,
	max,
	step,
	className,
	inputClassname,
}: NumInputParams) => {
	return (
		<div className={cn("w-56 relative", className)}>
			<input
				type="number"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				min={min}
				max={max}
				step={step}
				className={cn("outline-none h-10 border border-black rounded-lg px-2 w-full", inputClassname)}
			/>
		</div>
	);
};

type SearchDropdownParams = {
	options: DropdownOption[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	noResultsText?: string;
	className?: ClassValue;
	inputClassname?: ClassValue;
};

export const SearchDropdown = ({
	options,
	value,
	onChange,
	placeholder,
	noResultsText = "No results",
	className,
	inputClassname,
}: SearchDropdownParams) => {
	const [query, setQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);

	const selectedLabel = useMemo(() => {
		const selected = options.find((option) => option.value === value);
		return selected ? selected.label : "";
	}, [options, value]);

	const filteredOptions = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) {
			return options;
		}
		return options.filter((option) => option.label.toLowerCase().includes(normalized));
	}, [options, query]);

	const enabledFilteredOptions = useMemo(
		() => filteredOptions.filter((option) => !option.disabled),
		[filteredOptions]
	);
	const activeValue = enabledFilteredOptions[activeIndex]?.value;

	const moveActive = (direction: 1 | -1) => {
		if (enabledFilteredOptions.length === 0) return;
		setActiveIndex((prev) => {
			const next = (prev + direction + enabledFilteredOptions.length) % enabledFilteredOptions.length;
			return next;
		});
	};

	const displayValue = isOpen ? query : selectedLabel;

	return (
		<div className={cn("w-56 relative", className)}>
			<input
				type="text"
				value={displayValue}
				onFocus={() => {
					setIsOpen(true);
					setQuery(selectedLabel);
					setActiveIndex(0);
				}}
				onChange={(e) => {
					setQuery(e.target.value);
					setIsOpen(true);
					setActiveIndex(0);
					if (!e.target.value) {
						onChange("");
					}
				}}
				onKeyDown={(event) => {
				if (event.key === "ArrowDown") {
					event.preventDefault();
					setIsOpen(true);
					moveActive(1);
				}
				if (event.key === "ArrowUp") {
					event.preventDefault();
					setIsOpen(true);
					moveActive(-1);
				}
				if (event.key === "Enter") {
					event.preventDefault();
					const option = enabledFilteredOptions[activeIndex];
					if (option) {
						onChange(option.value);
						setQuery(option.label);
						setIsOpen(false);
					}
				}
				if (event.key === "Escape") {
					setIsOpen(false);
				}
				if (event.key === "Home") {
					event.preventDefault();
					setActiveIndex(0);
				}
				if (event.key === "End") {
					event.preventDefault();
					setActiveIndex(Math.max(0, enabledFilteredOptions.length - 1));
				}
			}}
				onBlur={() => {
					setTimeout(() => setIsOpen(false), 100);
				}}
				placeholder={placeholder}
				className={cn(
					"outline-none h-10 border border-black rounded-lg px-2 w-full",
					inputClassname
				)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
			/>
			{isOpen && (
				<div
					className="absolute z-10 mt-1 w-full rounded-lg bg-background-main border border-black max-h-56 overflow-auto"
					role="listbox"
				>
					{filteredOptions.length === 0 ? (
						<div className="px-2 py-2 text-sm text-gray-500">{noResultsText}</div>
					) : (
						filteredOptions.map((option) => (
							<button
								key={option.value}
								type="button"
								onMouseDown={() => {
									if (option.disabled) return;
									onChange(option.value);
									setQuery(option.label);
									setIsOpen(false);
								}}
								className={cn(
									"block w-full text-left px-2 py-2 text-sm hover:bg-background-primary",
									option.disabled && "cursor-not-allowed text-gray-400 ",
									option.className,
									(option.value === value || option.value === activeValue) && "bg-gray-100"
								)}
								role="option"
								aria-selected={option.value === value}
							>
								{option.label}
							</button>
						))
					)}
				</div>
			)}
		</div>
	);
};

type AddressInputsValue = {
	line1: string;
	line2: string;
	city: string;
	state: string;
	postalCode: string;
};

type AddressInputsParams = {
	value: AddressInputsValue;
	onChange: (value: AddressInputsValue) => void;
	className?: ClassValue;
	inputClassname?: ClassValue;
};

export const AddressInputs = ({ value, onChange, className, inputClassname }: AddressInputsParams) => {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<TextInput
				placeholder="Address line 1"
				value={value.line1}
				onChange={(line1) => onChange({ ...value, line1 })}
				inputClassname={inputClassname}
			/>
			<TextInput
				placeholder="Address line 2"
				value={value.line2}
				onChange={(line2) => onChange({ ...value, line2 })}
				inputClassname={inputClassname}
			/>
			<div className="flex gap-2">
				<TextInput
					placeholder="City"
					value={value.city}
					onChange={(city) => onChange({ ...value, city })}
					inputClassname={inputClassname}
				/>
				<TextInput
					placeholder="State"
					value={value.state}
					onChange={(state) => onChange({ ...value, state })}
					inputClassname={inputClassname}
				/>
				<TextInput
					placeholder="Postal code"
					value={value.postalCode}
					onChange={(postalCode) => onChange({ ...value, postalCode })}
					inputClassname={inputClassname}
				/>
			</div>
		</div>
	);
};

type NameInputsValue = {
	first: string;
	last: string;
};

type NameInputsParams = {
	value: NameInputsValue;
	onChange: (value: NameInputsValue) => void;
	className?: ClassValue;
	inputClassname?: ClassValue;
};

export const NameInputs = ({ value, onChange, className, inputClassname }: NameInputsParams) => {
	return (
		<div className={cn("flex gap-2", className)}>
			<TextInput
				placeholder="First name"
				value={value.first}
				onChange={(first) => onChange({ ...value, first })}
				inputClassname={inputClassname}
			/>
			<TextInput
				placeholder="Last name"
				value={value.last}
				onChange={(last) => onChange({ ...value, last })}
				inputClassname={inputClassname}
			/>
		</div>
	);
};

type TagInputParams = {
	value: string[];
	onChange: (value: string[]) => void;
	placeholder?: string;
	className?: ClassValue;
	inputClassname?: ClassValue;
};

export const TagInput = ({ value, onChange, placeholder, className, inputClassname }: TagInputParams) => {
	const [draft, setDraft] = useState("");

	const addTag = (raw: string) => {
		const next = raw.trim();
		if (!next) return;
		if (value.includes(next)) {
			setDraft("");
			return;
		}
		onChange([...value, next]);
		setDraft("");
	};

	const removeTag = (tag: string) => {
		onChange(value.filter((item) => item !== tag));
	};

	return (
		<div className={cn("w-72", className)}>
			<div className="min-h-10 border border-black rounded-lg px-2 py-1 flex flex-wrap gap-2 items-center">
				{value.map((tag) => (
					<button
						key={tag}
						type="button"
						onClick={() => removeTag(tag)}
						className="px-2 py-1 text-xs border border-black rounded-full hover:bg-gray-100"
					>
						{tag} x
					</button>
				))}
				<input
					type="text"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === ",") {
							event.preventDefault();
							addTag(draft);
						}
						if (event.key === "Backspace" && !draft && value.length > 0) {
							removeTag(value[value.length - 1]);
						}
					}}
					placeholder={placeholder}
					className={cn("outline-none flex-1 min-w-[120px]", inputClassname)}
				/>
			</div>
		</div>
	);
};

type DateInputParams = {
	value: string;
	onChange: (value: string) => void;
	min?: string;
	max?: string;
	className?: ClassValue;
	inputClassname?: ClassValue;
};

export const DateInput = ({ value, onChange, min, max, className, inputClassname }: DateInputParams) => {
	return (
		<div className={cn("w-56 relative", className)}>
			<input
				type="date"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				min={min}
				max={max}
				className={cn("outline-none h-10 border border-black rounded-lg px-2 w-full", inputClassname)}
			/>
		</div>
	);
};