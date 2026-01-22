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

export function BarChart({ yAxisLabel, Groups, GroupsData }: BarChartProps) {
	const groupsData = GroupsData ?? []
	const maxValue = Math.max(...(groupsData.length ? groupsData : [0]))
	const safeMax = maxValue || 1

	return (
		<div
			className="border-l-2 border-b-2 border-background-tertiary rounded-bl-md relative min-h-40 w-72 mb-8 flex flex-col justify-end"
			aria-label={yAxisLabel}
		>
			<div className="px-3 absolute h-full w-full flex">
				{groupsData.map((data: number, index: number) => {
					const heightPercent = (data / safeMax) * 100

					return (
						<div
							key={index}
							className="relative min-w-4 bg-blue-300 mx-1 mb-0.5 flex-1 self-end rounded-t-md rounded-b-sm"
							style={{ height: `${heightPercent}%` }}
						>
							<span className="absolute -top-5 left-1/2 text-text-secondary -translate-x-1/2 text-xs">
								{data}
							</span>
						</div>
					)
				})}
			</div>
			<div className="px-3 absolute bottom-0 left-0 right-0 translate-y-full flex">
				{Groups.map((group, index) => {
					const value = groupsData[index] ?? 0

					return (
						<div key={group} className="flex-1 text-center">
							<label className="whitespace-nowrap">{group}</label>
						</div>
					)
				})}
			</div>
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