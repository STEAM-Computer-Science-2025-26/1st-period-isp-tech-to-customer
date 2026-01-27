"use client";

import { BarChart, LineGraph } from "@/components/ui/Chart";

import { CardShell } from "./CardShell";
import type { DataCardComponentProps, DataCardProps } from "./types";

export function DataCardInner(props: DataCardProps) {
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
			<DataBody {...props} />
		</CardShell>
	);
}

export function DataCard(props: DataCardComponentProps) {
	return <DataCardInner {...props} type="data" />;
}

function DataBody(props: DataCardProps) {
	const { toolbar, children, dataType, data } = props;
	const mergedLineStyle =
		dataType === "bar"
			? undefined
			: {
					...data.style,
					...(props.chartAnimateOnLoad !== undefined
						? { animateOnLoad: props.chartAnimateOnLoad }
						: null),
					...(props.chartAnimateDurationMs !== undefined
						? { animateDurationMs: props.chartAnimateDurationMs }
						: null)
				};

	if (children) {
		return (
			<div className="flex flex-col gap-3">
				{toolbar ? (
					<div className="flex items-center justify-between gap-2">
						{toolbar}
					</div>
				) : null}
				<div className="rounded-lg bg-background-primary/50 border border-background-secondary/50 p-3">
					{children}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{toolbar ? (
				<div className="flex items-center justify-between gap-2">{toolbar}</div>
			) : null}
			<div className="rounded-lg bg-background-primary/50 border border-background-secondary/50 p-1.5">
				{dataType === "bar" ? (
					<BarChart {...data} />
				) : (
					<div className="w-full min-h-56 aspect-video">
						<LineGraph {...data} style={mergedLineStyle} />
					</div>
				)}
			</div>
		</div>
	);
}
