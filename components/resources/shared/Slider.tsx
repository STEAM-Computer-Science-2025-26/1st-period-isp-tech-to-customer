"use client";

export function Slider({
	label,
	question,
	sub,
	value,
	min,
	max,
	step,
	onChange,
	danger,
	dangerColor = "text-destructive-background",
	display
}: {
	label: string;
	question: string;
	sub?: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	danger?: boolean;
	dangerColor?: string;
	display: string;
}) {
	return (
		<div className="bg-white border border-background-secondary rounded-xl p-5">
			<div className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-1">
				{label}
			</div>
			<div
				className={`text-[13px] font-medium text-text-primary leading-snug ${sub ? "mb-0.5" : "mb-3"}`}
			>
				{question}
			</div>
			{sub && (
				<div className="text-[11px] text-text-tertiary mb-2.5">{sub}</div>
			)}
			<div
				className={`text-[28px] font-bold tracking-tight mb-2.5 leading-none ${sub ? "mt-2" : ""} ${danger ? dangerColor : "text-accent-main"}`}
			>
				{display}
			</div>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(+e.target.value)}
				className="w-full h-1 rounded-full outline-none cursor-pointer accent-accent-main"
			/>
			<div className="flex justify-between mt-1.5 font-mono text-[10px] text-text-tertiary">
				<span>{min}</span>
				<span>{max}</span>
			</div>
		</div>
	);
}
