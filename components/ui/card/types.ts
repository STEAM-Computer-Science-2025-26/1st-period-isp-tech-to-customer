import type { ReactNode } from "react";
import type { BarChartProps, LineGraphProps } from "@/app/types/types";

export type CardTone =
	| "neutral"
	| "success"
	| "info"
	| "warning"
	| "destructive";

export type BaseCardProps = {
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
			chartAnimateOnLoad?: boolean;
			chartAnimateDurationMs?: number;
			data: LineGraphProps;
	  })
	| (BaseCardProps & {
			type: "data";
			toolbar?: ReactNode;
			dataType: "graph";
			chartAnimateOnLoad?: boolean;
			chartAnimateDurationMs?: number;
			data: LineGraphProps;
	  });

export type DataCardComponentProps =
	| Omit<Extract<DataCardProps, { dataType: "bar" }>, "type">
	| Omit<Extract<DataCardProps, { dataType: "line" }>, "type">
	| Omit<Extract<DataCardProps, { dataType: "graph" }>, "type">;

export type LineGraphCardProps = BaseCardProps & {
	type: "lineGraph";
	toolbar?: ReactNode;
	chartAnimateOnLoad?: boolean;
	chartAnimateDurationMs?: number;
	data: LineGraphProps;
};

export type LineGraphCardComponentProps = Omit<LineGraphCardProps, "type">;

export type BarChartCardProps = BaseCardProps & {
	type: "barChart";
	toolbar?: ReactNode;
	data: BarChartProps;
};

export type BarChartCardComponentProps = Omit<BarChartCardProps, "type">;

export type TableColumn<
	Row extends Record<string, unknown> = Record<string, unknown>
> = {
	key: keyof Row & string;
	header: ReactNode;
	align?: "left" | "center" | "right";
	className?: string;
	headerClassName?: string;
	cell?: (row: Row, rowIndex: number) => ReactNode;
};

export type TableCardProps<
	Row extends Record<string, unknown> = Record<string, unknown>
> = BaseCardProps & {
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
	| LineGraphCardProps
	| BarChartCardProps
	| ListCardProps
	| TableCardProps<Record<string, unknown>>;
