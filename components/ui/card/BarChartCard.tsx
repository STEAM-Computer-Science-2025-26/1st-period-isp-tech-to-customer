"use client";

import { BarChart } from "@/components/ui/Chart";

import { CardShell } from "./CardShell";
import type { BarChartCardComponentProps, BarChartCardProps } from "./types";

export function BarChartCardInner(props: BarChartCardProps) {
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
			<BarChartBody {...props} />
		</CardShell>
	);
}

export function BarChartCard(props: BarChartCardComponentProps) {
	return <BarChartCardInner {...props} type="barChart" />;
}

function BarChartBody(props: BarChartCardProps) {
	const { toolbar, children, data } = props;

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
				<BarChart {...data} />
			</div>
		</div>
	);
}
