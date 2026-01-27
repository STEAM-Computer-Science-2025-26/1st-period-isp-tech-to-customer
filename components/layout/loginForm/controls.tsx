"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type FormButtonProps = {
	text: string;
	onClick?: () => void;
	disabled?: boolean;
	isLoading?: boolean;
	type?: "button" | "submit";
};

export function FormButton({
	text,
	onClick,
	disabled,
	isLoading,
	type = "button"
}: FormButtonProps) {
	const isDisabled = Boolean(disabled || isLoading);

	return (
		<button
			type={type}
			onClick={onClick}
			disabled={isDisabled}
			aria-busy={isLoading ? true : undefined}
			className={clsx(
				"h-10 w-full max-w-84 rounded-lg bg-accent-main text-background-primary font-semibold transition-opacity flex items-center justify-center",
				isDisabled && "opacity-60 cursor-not-allowed"
			)}
		>
			{isLoading ? (
				<>
					<Loader2 className="animate-spin" size={18} />
					<span className="sr-only">{text}</span>
				</>
			) : (
				text
			)}
		</button>
	);
}

type FormInputType = "text" | "email" | "password" | "verification-code";

type FormInputBaseProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	isInvalid?: boolean;
	error?: string;
	readOnly?: boolean;
};

type VerificationCodeInputProps = FormInputBaseProps & {
	type: "verification-code";
};

type StandardFormInputProps = FormInputBaseProps & {
	type: "text" | "email" | "password";
	passwordShown?: boolean;
};

function VerificationCodeInput({
	label,
	value,
	onChange,
	isInvalid,
	error,
	readOnly
}: VerificationCodeInputProps) {
	const length = 6;
	const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
	const digits = useMemo(() => {
		const onlyDigits = value.replace(/\D/g, "").slice(0, length);
		return Array.from({ length }, (_, i) => onlyDigits[i] ?? "");
	}, [value]);

	const focusIndex = (index: number) => {
		const el = inputsRef.current[index];
		el?.focus();
		el?.select();
	};

	const setDigitAt = (index: number, nextDigit: string) => {
		const nextDigits = [...digits];
		nextDigits[index] = nextDigit;
		onChange(nextDigits.join(""));
	};

	const applyPaste = (startIndex: number, pasted: string) => {
		const incoming = pasted.replace(/\D/g, "").slice(0, length);
		if (!incoming) return;
		const nextDigits = [...digits];
		let writeIndex = startIndex;
		for (const ch of incoming) {
			if (writeIndex >= length) break;
			nextDigits[writeIndex] = ch;
			writeIndex += 1;
		}
		onChange(nextDigits.join(""));
		focusIndex(Math.min(writeIndex, length - 1));
	};

	return (
		<div
			className={clsx(
				"relative w-full max-w-84 ease duration-200",
				isInvalid && "mb-4"
			)}
		>
			<label
				className={clsx(
					"block text-sm mb-2",
					isInvalid ? "text-destructive-text" : "text-accent-text"
				)}
			>
				{label}
			</label>
			<div className="flex w-full justify-between gap-2">
				{digits.map((digit, index) => (
					<input
						key={index}
						ref={(el) => {
							inputsRef.current[index] = el;
						}}
						className={clsx(
							"transition-colors duration-200 border-2 rounded-lg text-accent-text/80 w-10 h-10 outline-none bg-transparent text-center text-lg",
							!readOnly && "focus:text-text-secondary",
							isInvalid
								? "border-destructive-foreground text-destructive-text/70"
								: "border-accent-text/70"
						)}
						type="text"
						inputMode="numeric"
						pattern="[0-9]*"
						autoComplete={index === 0 ? "one-time-code" : "off"}
						maxLength={1}
						value={digit}
						readOnly={readOnly}
						aria-label={`${label} digit ${index + 1} of ${length}`}
						aria-invalid={isInvalid ? true : undefined}
						onFocus={(e) => e.currentTarget.select()}
						onPaste={(e) => {
							if (readOnly) return;
							e.preventDefault();
							applyPaste(index, e.clipboardData.getData("text"));
						}}
						onChange={(e) => {
							if (readOnly) return;
							const nextRaw = e.target.value;
							if (!nextRaw) {
								setDigitAt(index, "");
								return;
							}

							const last = nextRaw.slice(-1);
							if (!/\d/.test(last)) return;
							setDigitAt(index, last);
							if (index < length - 1) focusIndex(index + 1);
						}}
						onKeyDown={(e) => {
							if (readOnly) return;
							if (e.key === "ArrowLeft") {
								e.preventDefault();
								focusIndex(Math.max(0, index - 1));
								return;
							}
							if (e.key === "ArrowRight") {
								e.preventDefault();
								focusIndex(Math.min(length - 1, index + 1));
								return;
							}
							if (e.key === "Backspace") {
								e.preventDefault();
								if (digits[index]) {
									setDigitAt(index, "");
									return;
								}
								if (index > 0) {
									setDigitAt(index - 1, "");
									focusIndex(index - 1);
								}
								return;
							}
							if (e.key === "Delete") {
								e.preventDefault();
								setDigitAt(index, "");
								return;
							}
						}}
					/>
				))}
			</div>
			{isInvalid && error ? (
				<p className="absolute -bottom-4 text-xs text-destructive-text max-w-84">
					{error}
				</p>
			) : null}
		</div>
	);
}

function StandardFormInput({
	label,
	type,
	value,
	onChange,
	isInvalid,
	error,
	readOnly,
	passwordShown = false
}: StandardFormInputProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const selectionRef = useRef<{
		start: number | null;
		end: number | null;
		wasFocused: boolean;
	} | null>(null);

	const [shown, setShown] = useState(passwordShown);
	const effectiveType: "text" | "email" | "password" =
		type === "password" && shown ? "text" : type;

	useEffect(() => {
		if (type !== "password") return;
		const selection = selectionRef.current;
		if (!selection?.wasFocused) return;
		const input = inputRef.current;
		if (!input) return;

		requestAnimationFrame(() => {
			input.focus();
			if (selection.start !== null && selection.end !== null) {
				try {
					input.setSelectionRange(selection.start, selection.end);
				} catch {
					// Safe to ignore.
				}
			}
		});
	}, [shown, type]);

	return (
		<div
			className={clsx(
				"relative w-full max-w-84 ease duration-200",
				isInvalid && "mb-4"
			)}
		>
			<input
				ref={inputRef}
				className={clsx(
					"peer transition-colors duration-200 border-2 rounded-lg text-accent-text/80 w-full h-10 outline-none px-3 bg-transparent",
					!readOnly && "focus:text-text-secondary",
					isInvalid
						? "border-destructive-foreground text-destructive-text/70"
						: "border-accent-text/70",
					type === "password" && !shown && "tracking-[0.175rem]"
				)}
				type={effectiveType}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder=" "
				aria-label={label}
				aria-invalid={isInvalid ? true : undefined}
				readOnly={readOnly}
			/>
			{type === "password" ? (
				<button
					type="button"
					className="absolute bg-background-primary right-2 text-text-tertiary w-5 h-8 bottom-1/2 translate-y-1/2"
					aria-label={shown ? "Hide password" : "Show password"}
					onMouseDown={(e) => {
						// Prevents stealing focus from the input.
						e.preventDefault();
					}}
					onClick={(e) => {
						e.preventDefault();
						const input = inputRef.current;
						selectionRef.current = {
							start: input?.selectionStart ?? null,
							end: input?.selectionEnd ?? null,
							wasFocused: document.activeElement === input
						};
						setShown((prev) => !prev);
					}}
				>
					{shown ? <EyeOff size={20} /> : <Eye size={20} />}
				</button>
			) : null}
			<label
				className={clsx(
					"absolute left-2 top-0 px-1 ease duration-200 -translate-y-1/2 text-sm pointer-events-none bg-background-primary",
					isInvalid ? "text-destructive-text" : "text-accent-text",
					"peer-placeholder-shown:left-[calc((3*var(--spacing))+2px)] peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-base peer-placeholder-shown:px-0",
					isInvalid
						? "peer-placeholder-shown:text-destructive-text/70"
						: "peer-placeholder-shown:text-text-tertiary"
				)}
			>
				{label}
			</label>
			{isInvalid && error ? (
				<p className="absolute -bottom-4 text-xs text-destructive-text max-w-84">
					{error}
				</p>
			) : null}
		</div>
	);
}

type FormInputProps = (StandardFormInputProps | VerificationCodeInputProps) & {
	type: FormInputType;
};

export function FormInput(props: FormInputProps) {
	if (props.type === "verification-code") {
		return <VerificationCodeInput {...(props as VerificationCodeInputProps)} />;
	}
	return <StandardFormInput {...(props as StandardFormInputProps)} />;
}

export type { FormInputType, FormInputProps, FormInputBaseProps };

export type PanelProps = ComponentPropsWithoutRef<"div"> & { inert?: boolean };
