import clsx from "clsx"

type LineChartDataPoint = {
	x: number | string
	y: number
}

type LineChartProps = {
	xAxis?: string
	yAxis?: string
	xAxisLabel: string
	yAxisLabel: string
	dataPoints?: LineChartDataPoint[]
}

type BarChartProps = {
	yAxis?: string
	yAxisLabel: string
	Groups: string[]
	GroupsData?: number[]
}

export default function Chart() {
	return null
}

export function BarChart({ yAxis, yAxisLabel, Groups, GroupsData }: BarChartProps) {
	return (
		<div className="border-l border-b rounded-bl-md relative">
			<label className={clsx("absolute bottom-0 translate-y-full", "left-0", `left-[${100 / Groups.length}%]`)}>{yAxisLabel}</label>
		</div>
	)
}

export function LineChart({ xAxis, yAxis, xAxisLabel, yAxisLabel, dataPoints }: LineChartProps) {
	return (
		<div>
			<div>LineChart</div>
			<div>xAxis: {xAxis ?? ""}</div>
			<div>yAxis: {yAxis ?? ""}</div>
			<div>xAxisLabel: {xAxisLabel ?? ""}</div>
			<div>yAxisLabel: {yAxisLabel ?? ""}</div>
			<div>dataPoints: {dataPoints?.length ?? 0}</div>
		</div>
	)
}