"use client";

import { LineGraph } from "@/components/ui/Chart";

import { CardShell } from "./CardShell";
import type { LineGraphCardComponentProps, LineGraphCardProps } from "./types";

export function LineGraphCardInner(props: LineGraphCardProps) {
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
			<LineGraphBody {...props} />
		</CardShell>
	);
}

export function LineGraphCard(props: LineGraphCardComponentProps) {
	return <LineGraphCardInner {...props} type="lineGraph" />;
}

function LineGraphBody(props: LineGraphCardProps) {
	const {
		toolbar,
		children,
		data,
		chartAnimateOnLoad,
		chartAnimateDurationMs
	} = props;

	const mergedLineStyle = {
		...data.style,
		...(chartAnimateOnLoad !== undefined
			? { animateOnLoad: chartAnimateOnLoad }
			: null),
		...(chartAnimateDurationMs !== undefined
			? { animateDurationMs: chartAnimateDurationMs }
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
		<div className="flex flex-col h-full gap-3">
			{toolbar ? (
				<div className="flex items-center h-full justify-between gap-2">{toolbar}</div>
			) : null}
			<div className="rounded-lg bg-background-primary/50 h-full border border-background-secondary/50 p-1.5">
				<div className="h-full w-full min-h-50 aspect-video">
					<LineGraph {...data} style={mergedLineStyle} />
				</div>
			</div>
		</div>
	);
}
