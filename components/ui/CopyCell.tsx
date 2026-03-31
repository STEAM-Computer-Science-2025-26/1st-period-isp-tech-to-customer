"use client";

import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/index";
import { Check, Copy } from "lucide-react";

type CopyCellProps = {
	value: string;
	copyText: string;
	className?: string;
	textClassName?: string;
	ariaLabel: string;
	onCopy: (text: string) => Promise<void>;
};

export function CopyCell({
	value,
	copyText,
	className,
	textClassName,
	ariaLabel,
	onCopy
}: CopyCellProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const timeoutRef = useRef<number | null>(null);
	const [isTight, setIsTight] = useState(false);
	const [copied, setCopied] = useState(false);

	useLayoutEffect(() => {
		const container = containerRef.current;
		const text = textRef.current;
		const button = buttonRef.current;
		if (!container || !text || !button) return;

		const measure = () => {
			const containerWidth = container.clientWidth;
			const textWidth = text.scrollWidth;
			const buttonWidth = button.offsetWidth;
			const requiredWidth = textWidth + buttonWidth + 8;
			const overflow = requiredWidth - containerWidth;
			setIsTight((prev) => (prev ? overflow > -8 : overflow > 0));
		};

		measure();

		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		return () => observer.disconnect();
	}, [value]);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				window.clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		await onCopy(copyText);
		setCopied(true);
		if (timeoutRef.current) {
			window.clearTimeout(timeoutRef.current);
		}
		timeoutRef.current = window.setTimeout(() => {
			setCopied(false);
		}, 1200);
	};

	return (
		<div
			ref={containerRef}
			role="cell"
			className={cn(
				"relative group flex flex-row justify-start items-center gap-1 min-w-0",
				isTight && "pr-6",
				className
			)}
		>
			<span ref={textRef} className={cn("truncate", textClassName)}>
				{value}
			</span>
			<button
				ref={buttonRef}
				type="button"
				onClick={handleCopy}
				className={cn(
					"shrink-0 opacity-0 mr-auto transition-opacity group-hover:opacity-100 text-text-tertiary hover:text-text-main",
					isTight ? "absolute right-1 top-1/2 -translate-y-1/2" : "relative"
				)}
				aria-label={ariaLabel}
			>
				{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
			</button>
		</div>
	);
}
