"use client";

import clsx from "clsx";

import { CardShell } from "./CardShell";
import type { CardTone, KpiCardProps } from "./types";

export function KpiCardInner(props: KpiCardProps) {
	const { title, subtitle, actions, className, bodyClassName, footer } = props;
	return (
		<CardShell
			title={title}
			subtitle={subtitle}
			actions={actions}
			className={className}
			bodyClassName={bodyClassName}
			footer={footer}
		>
			<KpiBody {...props} />
		</CardShell>
	);
}

export function KpiCard(props: Omit<KpiCardProps, "type">) {
	return <KpiCardInner {...props} type="kpi" />;
}

function KpiBody({ value, meta, trend, icon }: KpiCardProps) {
	return (
		<div className="flex items-start gap-3">
			<div className="min-w-0">
				<div className="flex flex-row items-center">
					<div className="text-3xl font-semibold leading-none text-text-main">
						{value}
					</div>
					{icon ? (
						<div className="shrink-0 p-1.5 h-full aspect-square">{icon}</div>
					) : null}
				</div>

				<div className="mt-2 flex items-center gap-2">
					{trend ? (
						<span
							className={clsx(
								"inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
								toneChipClasses(trend.tone ?? "neutral")
							)}
						>
							{trend.value}
						</span>
					) : null}
					{meta ? (
						<span className="text-xs text-text-secondary">{meta}</span>
					) : null}
				</div>
			</div>
		</div>
	);
}

function toneChipClasses(tone: CardTone) {
	switch (tone) {
		case "success":
			return "bg-success-background/20 text-success-text border border-success-foreground/30";
		case "info":
			return "bg-info-background/15 text-info-text border border-info-foreground/30";
		case "warning":
			return "bg-warning-background/25 text-warning-text border border-warning-foreground/30";
		case "destructive":
			return "bg-destructive-background/15 text-destructive-text border border-destructive-foreground/30";
		default:
			return "bg-background-primary/50 text-text-secondary border border-background-secondary/60";
	}
}
