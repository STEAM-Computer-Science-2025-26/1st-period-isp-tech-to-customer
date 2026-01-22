import { useEffect, useRef } from "react"
import regression from "regression"

type BarChartProps = {
	yAxisLabel: string
	Groups: string[]
	GroupsData?: number[]
}


export function BarChart({ yAxisLabel, Groups, GroupsData }: BarChartProps) {
	const groupsData = GroupsData ?? []
	const maxValue = Math.max(...(groupsData.length ? groupsData : [0]))
	const safeMax = Math.max(1, maxValue)

	return (
		<div
			className="border-l-2 border-b-2 border-background-tertiary rounded-bl-md relative min-h-40 w-72 mb-8 flex flex-col justify-end"
			aria-label={yAxisLabel}
		>
			<div className="px-3 absolute h-full w-full flex">
				{groupsData.map((data: number, index: number) => {
					const heightPercent = (Math.max(0, data) / safeMax) * 100

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
				{Groups.map((group) => {
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

type LineType = "connect" | "x" | "x^2" | "log" | "b^x";

interface Point {
	x: number;
	y: number;
}

interface LineGraphProps {
	points: Point[];
	lineType?: LineType;
	width?: number;
	height?: number;
}

export function LineGraph({
	points,
	lineType = "connect",
	width = 500,
	height = 300
}: LineGraphProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Clear canvas
		ctx.clearRect(0, 0, width, height);

		if (points.length === 0) return;

		// Scale points to canvas
		const scaledPoints = scalePoints(points, width, height);

		if (lineType === "connect") {
			drawConnectedLine(ctx, scaledPoints);
			return;
		}

		const coefficients = performRegression(points, lineType);
		if (!coefficients) {
			drawConnectedLine(ctx, scaledPoints);
			return;
		}

		drawRegressionCurve(ctx, points, coefficients, lineType, width, height);
	}, [points, lineType, width, height]);

	return (
		<div style={{ position: 'relative', width, height }}>
			<canvas
				ref={canvasRef}
				width={width}
				height={height}
				style={{ position: 'absolute', top: 0, left: 0 }}
			/>

		</div>
	);
}

function scalePoints(points: Point[], width: number, height: number): Point[] {
	// Find min/max for scaling
	const xs = points.map(p => p.x);
	const ys = points.map(p => p.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);

	// Add padding
	const padding = 20;
	const denomX = maxX - minX;
	const denomY = maxY - minY;

	return points.map(p => ({
		x:
			padding +
			(denomX === 0 ? 0.5 : (p.x - minX) / denomX) * (width - 2 * padding),
		y:
			height -
			padding -
			(denomY === 0 ? 0.5 : (p.y - minY) / denomY) * (height - 2 * padding),
	}));
}

function drawConnectedLine(ctx: CanvasRenderingContext2D, points: Point[]) {
	if (points.length === 0) return;
	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);

	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i].x, points[i].y);
	}

	ctx.strokeStyle = '#3b82f6';
	ctx.lineWidth = 2;
	ctx.stroke();
}

function performRegression(points: Point[], type: Exclude<LineType, "connect">): number[] | null {
	const filtered = points.filter((p) => {
		if (type === "log") return p.x > 0
		if (type === "b^x") return p.y > 0
		return true
	})

	if (filtered.length < 2) return null
	const data: [number, number][] = filtered.map((p) => [p.x, p.y])

	try {
		switch (type) {
			case "x":
				return regression.linear(data).equation
			case "x^2":
				return regression.polynomial(data, { order: 2 }).equation
			case "log":
				return regression.logarithmic(data).equation
			case "b^x":
				return regression.exponential(data).equation
		}
	} catch {
		return null
	}
}

function drawRegressionCurve(
	ctx: CanvasRenderingContext2D,
	originalPoints: Point[],
	coefficients: number[],
	type: LineType,
	width: number,
	height: number
) {
	// Get x range from original points
	const xs = originalPoints.map(p => p.x);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);

	// Generate many points along the curve
	const curvePoints: Point[] = [];
	const steps = 200;

	for (let i = 0; i <= steps; i++) {
		const x = minX + (i / steps) * (maxX - minX);
		const y = evaluateFunction(x, coefficients, type);
		curvePoints.push({ x, y });
	}

	// Scale and draw
	const scaled = scalePoints(curvePoints, width, height);
	drawConnectedLine(ctx, scaled);
}

function evaluateFunction(x: number, coef: number[], type: LineType): number {
	const c0 = coef[0] ?? 0
	const c1 = coef[1] ?? 0
	const c2 = coef[2] ?? 0
	switch (type) {
		case "x":
			return c0 * x + c1; // mx + b
		case "x^2":
			return c0 * x * x + c1 * x + c2; // ax² + bx + c
		case "log":
			if (x <= 0) return NaN
			return c0 * Math.log(x) + c1; // a*ln(x) + b
		case "b^x":
			return c0 * Math.exp(c1 * x); // a*e^(bx)
		default:
			return 0;
	}
}