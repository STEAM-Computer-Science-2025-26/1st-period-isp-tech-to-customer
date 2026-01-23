"use client";

import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";
import type { BarChartProps, LineGraphProps } from "@/app/types/types";
import { BarChart, LineGraph } from "@/components/ui/Chart";

type CardTone = "neutral" | "success" | "info" | "warning" | "destructive";

type BaseCardProps = {
	title: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	className?: string;
	bodyClassName?: string;
	footer?: ReactNode;
	children?: ReactNode;
};

export type KpiCardProps = BaseCardProps & {
	type: "kpi";
	value: ReactNode;
	meta?: ReactNode;
	trend?: {
		value: ReactNode;
		tone?: CardTone;
	};
	icon?: ReactNode;
};

export type DataCardProps =
	| (BaseCardProps & {
			type: "data";
			toolbar?: ReactNode;
			dataType: "bar";
			data: BarChartProps;
	  })
	| (BaseCardProps & {
			type: "data";
			toolbar?: ReactNode;
			dataType: "line";
			data: LineGraphProps;
	  })
	| (BaseCardProps & {
			type: "data";
			toolbar?: ReactNode;
			dataType: "graph";
			data: LineGraphProps;
	  });

export type TableColumn<Row extends Record<string, unknown> = Record<string, unknown>> = {
	key: keyof Row & string;
	header: ReactNode;
	align?: "left" | "center" | "right";
	className?: string;
	headerClassName?: string;
	cell?: (row: Row, rowIndex: number) => ReactNode;
};

export type TableCardProps<Row extends Record<string, unknown> = Record<string, unknown>> = BaseCardProps & {
	type: "table";
	toolbar?: ReactNode;
	columns: TableColumn<Row>[];
	rows: Row[];
	getRowKey?: (row: Row, rowIndex: number) => string | number;
	emptyState?: ReactNode;
};

export type ListCardItem = {
	id?: string | number;
	label: ReactNode;
	description?: ReactNode;
	right?: ReactNode;
	href?: string;
	onClick?: () => void;
};

export type ListCardProps = BaseCardProps & {
	type: "list";
	items?: ListCardItem[];
	ordered?: boolean;
	children?: ReactNode;
};

export type CardProps =
	| KpiCardProps
	| DataCardProps
	| ListCardProps
	| TableCardProps<Record<string, unknown>>;

export function Card(props: CardProps) {
	const { title, subtitle, actions, className, bodyClassName, footer } = props;

	return (
		<section
			className={clsx(
				"w-full rounded-xl bg-background-secondary/50 backdrop-blur-md border border-background-secondary/60",
				"shadow-sm",
				className
			)}
		>
			<header className="flex items-start justify-between gap-3 px-4 pt-4">
				<div className="min-w-0">
					<h3 className="text-sm font-semibold tracking-wide text-text-main truncate">{title}</h3>
					{subtitle ? <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p> : null}
				</div>
				{actions ? <div className="shrink-0">{actions}</div> : null}
			</header>

			<div className={clsx("px-4 pb-4 pt-3", bodyClassName)}>
				{props.type === "kpi" ? <KpiBody {...props} /> : null}
				{props.type === "data" ? <DataBody {...props} /> : null}
				{props.type === "list" ? <ListBody {...props} /> : null}
				{props.type === "table" ? <TableBody {...props} /> : null}
			</div>

			{footer ? (
				<footer className="px-4 pb-4 pt-0 text-xs text-text-secondary">{footer}</footer>
			) : null}
		</section>
	);
}

export function KpiCard(props: Omit<KpiCardProps, "type">) {
	return <Card {...props} type="kpi" />;
}

type DataCardComponentProps =
	| Omit<Extract<DataCardProps, { dataType: "bar" }>, "type">
	| Omit<Extract<DataCardProps, { dataType: "line" }>, "type">
	| Omit<Extract<DataCardProps, { dataType: "graph" }>, "type">;

export function DataCard(props: DataCardComponentProps) {
	if (props.dataType === "bar") {
		return <Card {...props} type="data" />;
	}
	if (props.dataType === "line") {
		return <Card {...props} type="data" />;
	}
	return <Card {...props} type="data" />;
}

export function ListCard(props: Omit<ListCardProps, "type">) {
	return <Card {...props} type="list" />;
}

export function TableCard<Row extends Record<string, unknown>>(
	props: Omit<TableCardProps<Row>, "type">
) {
	return <Card {...(props as TableCardProps<Record<string, unknown>>)} type="table" />;
}

function KpiBody({ value, meta, trend, icon }: KpiCardProps) {
	return (
		<div className="flex items-start gap-3">
			<div className="min-w-0">
			<div className="flex flex-row items-center">
				<div className="text-3xl font-semibold leading-none text-text-main">{value}</div>
				{icon ? (
				<div className="shrink-0 p-1.5 h-full aspect-square">
					{icon}
				</div>
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
					{meta ? <span className="text-xs text-text-secondary">{meta}</span> : null}
				</div>
			</div>
		</div>
	);
}

function DataBody({ toolbar, children, dataType, data }: DataCardProps) {
	if (children) {
		return (
			<div className="flex flex-col gap-3">
				{toolbar ? <div className="flex items-center justify-between gap-2">{toolbar}</div> : null}
				<div className="rounded-lg bg-background-primary/50 border border-background-secondary/50 p-3">
					{children}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{toolbar ? <div className="flex items-center justify-between gap-2">{toolbar}</div> : null}
			<div className="rounded-lg bg-background-primary/50 border border-background-secondary/50 p-1.5">
				{dataType === "bar" ? (
					<BarChart {...data} />
				) : (
					<div className="w-full min-h-56 aspect-video">
						<LineGraph {...data} />
					</div>
				)}
			</div>
		</div>
	);
}

function TableBody<Row extends Record<string, unknown>>({
	toolbar,
	columns,
	rows,
	getRowKey,
	emptyState,
}: TableCardProps<Row>) {
	return (
		<div className="flex flex-col gap-3">
			{toolbar ? <div className="flex items-center justify-between gap-2">{toolbar}</div> : null}
			<div className="rounded-lg bg-background-primary/50 border border-background-secondary/50">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="text-text-secondary">
							<tr>
								{columns.map(col => (
									<th
										key={col.key}
										className={clsx(
											"py-2 px-3 font-medium",
											col.align === "center"
												? "text-center"
												: col.align === "right"
													? "text-right"
													: "text-left",
											col.headerClassName
										)}
									>
										{col.header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.length === 0 ? (
								<tr>
									<td
										colSpan={Math.max(columns.length, 1)}
										className="px-3 py-6 text-center text-text-tertiary"
									>
										{emptyState ?? "No rows"}
									</td>
								</tr>
							) : (
								rows.map((row, rowIndex) => (
									<tr
										key={getRowKey ? getRowKey(row, rowIndex) : rowIndex}
										className="border-t border-background-secondary/50"
									>
										{columns.map(col => (
											<td
												key={col.key}
												className={clsx(
													"py-2 px-3 text-text-main",
													col.align === "center"
														? "text-center"
														: col.align === "right"
															? "text-right"
															: "text-left",
													col.className
												)}
											>
												{col.cell ? col.cell(row, rowIndex) : (row[col.key] as ReactNode)}
											</td>
										))}
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}

function ListBody({ items, ordered = false, children }: ListCardProps) {
	if (children) return <div>{children}</div>;

	const ListTag = ordered ? "ol" : "ul";

	return (
		<ListTag className={clsx("flex flex-col gap-1", ordered ? "list-decimal pl-4" : "list-none")}
		>
			{(items ?? []).map((item, index) => {
				const key = item.id ?? index;
				const row = (
					<div
						className={clsx(
							"group w-full rounded-lg border border-transparent",
							"hover:bg-background-primary/50 hover:border-background-secondary/50",
							"transition-colors duration-200 px-3 py-2",
							"flex items-center justify-between gap-3"
						)}
					>
						<div className="min-w-0">
							<div className="text-sm text-text-main truncate">{item.label}</div>
							{item.description ? (
								<div className="text-xs text-text-secondary mt-0.5">{item.description}</div>
							) : null}
						</div>
						{item.right ? <div className="shrink-0 text-text-tertiary">{item.right}</div> : null}
					</div>
				);

				return (
					<li key={key}>
						{item.href ? (
							<Link href={item.href} className="block">
								{row}
							</Link>
						) : (
							<button
								type="button"
								onClick={item.onClick}
								className="block w-full text-left"
								disabled={!item.onClick}
							>
								{row}
							</button>
						)}
					</li>
				);
			})}
		</ListTag>
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

