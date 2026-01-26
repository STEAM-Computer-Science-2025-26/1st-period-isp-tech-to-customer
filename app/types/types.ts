import type { LucideIcon } from "lucide-react";

export type SidebarItemParams = {
	id: number;
	title: string;
	icon: string | LucideIcon;
	onClick?: () => void;
};

export type SidebarParams = {
	autoCollapse?: boolean;
	mobile?: boolean;
	title?: string;
	items?: SidebarItemParams[];
};

export type BarChartColor =
	| "blue-300"
	| "blue-400"
	| "blue-500"
	| "blue-600"
	| "blue-700"
	| "emerald-500"
	| "green-500"
	| "yellow-500"
	| "orange-500"
	| "red-500"
	| "purple-500"
	| "pink-500"
	| "slate-500"
	| "gray-500"
	| "zinc-500"
	| "neutral-500"
	| "stone-500"
	| "black"
	| "white";

export type BarChartDatum = {
	label: string;
	data: number;
	color: BarChartColor;
};

export type BarChartProps = {
	yAxisLabel: string;
	bars: BarChartDatum[];
};

export type LineType = "connect" | "ema" | "x" | "x^2" | "log" | "b^x";

export interface Point {
	x: number;
	y: number;
}

export interface LineGraphProps {
	points: Point[];
	lineType?: LineType;
	showEma?: boolean;
	emaAlpha?: number;
	step?: number;
	labelStep?: number;
	minHeight?: number;
	view?: {
		startIndex?: number;
		endIndex?: number;
		xMin?: number;
		xMax?: number;
	};
	style?: {
		backgroundColor?: string;
		padding?: number;
		scaleTo?: "view" | "all";
		xDomain?: { min: number; max: number };
		yDomain?: { min: number; max: number };

		lineColor?: string;
		lineWidth?: number;

		regressionColor?: string;
		regressionWidth?: number;

		emaColor?: string;
		emaWidth?: number;
		showRawLine?: boolean;
		rawLineColor?: string;
		rawLineWidth?: number;

		showPoints?: boolean;
		pointRadius?: number;
		pointFill?: string;
		pointStroke?: string;
		pointStrokeWidth?: number;

		showLabels?: boolean;
		labelColor?: string;
		labelFont?: string;
		labelOffsetY?: number;

		showGrid?: boolean;
		gridColor?: string;
		gridLineWidth?: number;
		gridDivisions?: number;

		curveResolution?: number;
	};
	width?: number;
	height?: number;
	yAxisLabel?: string;
	xAxisLabel?: string;
}
