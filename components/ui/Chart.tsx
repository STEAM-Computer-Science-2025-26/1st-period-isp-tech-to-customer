import { useCallback, useEffect, useRef, useState } from "react"
import type { MouseEvent } from "react"
import type { BarChartColor, BarChartProps, LineGraphProps, LineType, Point } from "@/app/types/types"
import clsx from "clsx"
import regression from "regression"

const BAR_BG_CLASS: Record<BarChartColor, string> = {
	"blue-300": "bg-blue-300",
	"blue-400": "bg-blue-400",
	"blue-500": "bg-blue-500",
	"blue-600": "bg-blue-600",
	"blue-700": "bg-blue-700",
	"emerald-500": "bg-emerald-500",
	"green-500": "bg-green-500",
	"yellow-500": "bg-yellow-500",
	"orange-500": "bg-orange-500",
	"red-500": "bg-red-500",
	"purple-500": "bg-purple-500",
	"pink-500": "bg-pink-500",
	"slate-500": "bg-slate-500",
	"gray-500": "bg-gray-500",
	"zinc-500": "bg-zinc-500",
	"neutral-500": "bg-neutral-500",
	"stone-500": "bg-stone-500",
	"black": "bg-black",
	"white": "bg-white",
}


export function BarChart({ yAxisLabel, bars }: BarChartProps) {
	const values = bars.map((b) => b.data)
	const maxValue = Math.max(...(values.length ? values : [0]))
	const safeMax = Math.max(1, maxValue)

	return (
		<div className="pl-6 pb-8 pr-2 pt-2">
			<div
				className="border-l-2 border-b-2 border-background-tertiary rounded-bl-md relative flex flex-col justify-end"
				aria-label={yAxisLabel}
			>
				<label className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 -rotate-90 h-4">{yAxisLabel}</label>
				<div className="px-3 absolute h-full w-full flex">
					{bars.map((bar, index: number) => {
						const heightPercent = (Math.max(0, bar.data) / safeMax) * 100
						const bgClass = BAR_BG_CLASS[bar.color]

						return (
							<div
								key={index}
								className={clsx(
									"relative min-w-4 mx-1 mb-0.5 flex-1 self-end rounded-t-md rounded-b-sm",
									bgClass
								)}
								style={{ height: `${heightPercent}%` }}
							>
								<label className="absolute -top-5 left-1/2 text-text-secondary -translate-x-1/2 text-xs">
									{bar.data}
								</label>
							</div>
						)
					})}
				</div>
				
				<div className="px-3 absolute bottom-0 left-0 right-0 translate-y-full flex">
					{bars.map((bar) => {
						return (
							<div key={bar.label} className="flex-1 text-center">
								<label className="whitespace-nowrap">{bar.label}</label>
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}


export function LineGraph({
	points,
	lineType = "connect",
	showEma = false,
	emaAlpha = 0.2,
	step,
	labelStep,
	minHeight,
	view,
	style,
	yAxisLabel,
	xAxisLabel
}: LineGraphProps) {
	const AXIS_LEFT_GUTTER = 32;
	const AXIS_BOTTOM_GUTTER = 20;
	const plotObserverRef = useRef<ResizeObserver | null>(null);
	const [plotSize, setPlotSize] = useState({ width: 0, height: 0 });
	const minH = Math.max(80, Math.floor(minHeight ?? 220));
	const plotWidth = Math.max(0, plotSize.width);
	const plotHeight = Math.max(0, plotSize.height);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const interactiveCanvasRef = useRef<HTMLCanvasElement>(null);
	const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
	const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
	const renderCacheRef = useRef<
		| {
			visible: Point[]
			scaledPoints: Point[]
			padding: number
			width: number
			height: number
		}
		| null
	>(null);

	const setPlotEl = useCallback((el: HTMLDivElement | null) => {
		if (plotObserverRef.current) {
			plotObserverRef.current.disconnect();
			plotObserverRef.current = null;
		}

		if (!el) return;
		const rect = el.getBoundingClientRect();
		setPlotSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });

		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			setPlotSize({
				width: Math.floor(entry.contentRect.width),
				height: Math.floor(entry.contentRect.height),
			});
		});
		ro.observe(el);
		plotObserverRef.current = ro;
	}, []);

	useEffect(() => {
		return () => {
			if (plotObserverRef.current) {
				plotObserverRef.current.disconnect();
				plotObserverRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (plotWidth <= 0 || plotHeight <= 0) return;
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const neededW = Math.floor(plotWidth * dpr);
		const neededH = Math.floor(plotHeight * dpr);
		if (canvas.width !== neededW) canvas.width = neededW;
		if (canvas.height !== neededH) canvas.height = neededH;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		// Clear canvas
		ctx.clearRect(0, 0, plotWidth, plotHeight);
		if (style?.backgroundColor) {
			ctx.save();
			ctx.fillStyle = style.backgroundColor;
			ctx.fillRect(0, 0, plotWidth, plotHeight);
			ctx.restore();
		}

		if (points.length === 0) return;

		const allSorted = [...points].sort((a, b) => a.x - b.x);
		const visible = applyView(allSorted, view);
		if (visible.length === 0) return;

		const padding = normalizePadding(style?.padding);
		const scaleTo = style?.scaleTo ?? "view";
		const scaleBase = scaleTo === "all" ? allSorted : visible;
		const scaleOptions = {
			padding,
			xDomain: style?.xDomain ?? getDomainFromPoints(scaleBase, "x"),
			yDomain: style?.yDomain ?? getDomainFromPoints(scaleBase, "y"),
		};

		if (style?.showGrid) {
			drawGrid(ctx, plotWidth, plotHeight, {
				padding,
				divisions: style.gridDivisions,
				color: style.gridColor,
				lineWidth: style.gridLineWidth,
			});
		}

		const displayStep = step === undefined ? getAutoDisplayStep(visible.length) : normalizeStep(step);
		const effectiveLabelStep = normalizeLabelStep(labelStep);
		const displayPoints = downsamplePoints(visible, displayStep);
		
		// Scale points to canvas
		const scaledPoints = scalePoints(visible, plotWidth, plotHeight, scaleOptions);
		const scaledDisplayPoints = scalePoints(displayPoints, plotWidth, plotHeight, scaleOptions);
		const alpha = clampAlpha(emaAlpha);
		const curveResolution = normalizeCurveResolution(style?.curveResolution);

		const showPoints = style?.showPoints ?? true;
		const showLabelsLocal = style?.showLabels ?? true;

		renderCacheRef.current = {
			visible,
			scaledPoints,
			padding,
			width: plotWidth,
			height: plotHeight,
		};

		if (lineType === "connect") {
			drawConnectedLine(ctx, scaledPoints, {
				strokeStyle: style?.lineColor ?? '#3b82f6',
				lineWidth: style?.lineWidth ?? 2,
			});
			if (showPoints) {
				drawPointMarkers(ctx, scaledDisplayPoints, {
					radius: style?.pointRadius,
					fill: style?.pointFill,
					stroke: style?.pointStroke,
					strokeWidth: style?.pointStrokeWidth,
				});
			}
			if (showLabelsLocal) {
				drawPointLabels(ctx, scaledDisplayPoints, displayPoints, effectiveLabelStep, {
					color: style?.labelColor,
					font: style?.labelFont,
					offsetY: style?.labelOffsetY,
				});
			}
			return;
		}

		if (lineType === "ema") {
			const showRawLine = style?.showRawLine ?? true;
			if (showRawLine) {
				drawConnectedLine(ctx, scaledPoints, {
					strokeStyle: style?.rawLineColor ?? '#93c5fd',
					lineWidth: style?.rawLineWidth ?? 1,
				});
			}

			const emaPoints = calculateEMA(visible, alpha);
			const scaledEma = scalePoints(emaPoints, plotWidth, plotHeight, scaleOptions);
			drawConnectedLine(ctx, scaledEma, {
				strokeStyle: style?.emaColor ?? '#f97316',
				lineWidth: style?.emaWidth ?? 2,
			});
			if (showPoints) {
				drawPointMarkers(ctx, scaledDisplayPoints, {
					radius: style?.pointRadius,
					fill: style?.pointFill,
					stroke: style?.pointStroke,
					strokeWidth: style?.pointStrokeWidth,
				});
			}
			if (showLabelsLocal) {
				drawPointLabels(ctx, scaledDisplayPoints, displayPoints, effectiveLabelStep, {
					color: style?.labelColor,
					font: style?.labelFont,
					offsetY: style?.labelOffsetY,
				});
			}
			return;
		}

		const coefficients = performRegression(visible, lineType);
		if (!coefficients) {
			drawConnectedLine(ctx, scaledPoints, {
				strokeStyle: style?.lineColor ?? '#3b82f6',
				lineWidth: style?.lineWidth ?? 2,
			});
			if (showPoints) {
				drawPointMarkers(ctx, scaledDisplayPoints, {
					radius: style?.pointRadius,
					fill: style?.pointFill,
					stroke: style?.pointStroke,
					strokeWidth: style?.pointStrokeWidth,
				});
			}
			if (showLabelsLocal) {
				drawPointLabels(ctx, scaledDisplayPoints, displayPoints, effectiveLabelStep, {
					color: style?.labelColor,
					font: style?.labelFont,
					offsetY: style?.labelOffsetY,
				});
			}
			return;
		}

		drawRegressionCurve(ctx, visible, coefficients, lineType, plotWidth, plotHeight, scaleOptions, {
			strokeStyle: style?.regressionColor ?? '#3b82f6',
			lineWidth: style?.regressionWidth ?? 2,
			steps: curveResolution,
		});
		if (showEma) {
			const emaPoints = calculateEMA(visible, alpha);
			const scaledEma = scalePoints(emaPoints, plotWidth, plotHeight, scaleOptions);
			drawConnectedLine(ctx, scaledEma, {
				strokeStyle: style?.emaColor ?? '#f97316',
				lineWidth: style?.emaWidth ?? 2,
			});
		}
		if (showPoints) {
			drawPointMarkers(ctx, scaledDisplayPoints, {
				radius: style?.pointRadius,
				fill: style?.pointFill,
				stroke: style?.pointStroke,
				strokeWidth: style?.pointStrokeWidth,
			});
		}
		if (showLabelsLocal) {
			drawPointLabels(ctx, scaledDisplayPoints, displayPoints, effectiveLabelStep, {
				color: style?.labelColor,
				font: style?.labelFont,
				offsetY: style?.labelOffsetY,
			});
		}
	}, [points, lineType, showEma, emaAlpha, step, labelStep, view, style, plotWidth, plotHeight]);

	useEffect(() => {
		if (plotWidth <= 0 || plotHeight <= 0) return;
		const canvas = interactiveCanvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const neededW = Math.floor(plotWidth * dpr);
		const neededH = Math.floor(plotHeight * dpr);
		if (canvas.width !== neededW) canvas.width = neededW;
		if (canvas.height !== neededH) canvas.height = neededH;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		// Clear previous
		ctx.clearRect(0, 0, plotWidth, plotHeight);
		if (hoverPos === null) return;

		if (points.length === 0) return;

		const allSorted = [...points].sort((a, b) => a.x - b.x);
		const visible = applyView(allSorted, view);
		if (visible.length === 0) return;

		const padding = normalizePadding(style?.padding);
		const scaleTo = style?.scaleTo ?? "view";
		const scaleBase = scaleTo === "all" ? allSorted : visible;
		const scaleOptions = {
			padding,
			xDomain: style?.xDomain ?? getDomainFromPoints(scaleBase, "x"),
			yDomain: style?.yDomain ?? getDomainFromPoints(scaleBase, "y"),
		};

		const scaledPoints = scalePoints(visible, plotWidth, plotHeight, scaleOptions);
		const nearest = findNearestPoint(hoverPos.x, scaledPoints, visible);
		
		if (!nearest) return;

		// Draw vertical line
		ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)'; // light gray
		ctx.lineWidth = 1;
		ctx.setLineDash([5, 5]);
		ctx.beginPath();
		ctx.moveTo(nearest.scaled.x, padding);
		ctx.lineTo(nearest.scaled.x, plotHeight - padding);
		ctx.stroke();
		ctx.setLineDash([]);

		// Highlight point (even if normally hidden)
		ctx.fillStyle = '#ef4444';
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(nearest.scaled.x, nearest.scaled.y, 5, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();

	}, [hoverPos, points, view, style, plotWidth, plotHeight]);

	const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const x = Math.max(0, Math.min(plotWidth, e.clientX - rect.left));
		const y = Math.max(0, Math.min(plotHeight, e.clientY - rect.top));
		setHoverPos({ x, y });

		const cache = renderCacheRef.current;
		if (!cache || cache.width !== plotWidth || cache.height !== plotHeight) {
			setHoverTooltip(null);
			return;
		}

		const nearest = findNearestPoint(x, cache.scaledPoints, cache.visible);
		if (!nearest) {
			setHoverTooltip(null);
			return;
		}

		const dx = x - nearest.scaled.x;
		const dy = y - nearest.scaled.y;
		const dist = Math.hypot(dx, dy);
		const markerRadius = 5;
		const hoverRadius = markerRadius + 2;

		if (dist <= hoverRadius) {
			setHoverTooltip({
				x,
				y,
				text: `x: ${formatNumber(nearest.original.x)}  y: ${formatNumber(nearest.original.y)}`,
			});
		} else {
			setHoverTooltip(null);
		}
	};

	const handleMouseLeave = () => {
		setHoverPos(null);
		setHoverTooltip(null);
		const canvas = interactiveCanvasRef.current;
		if (canvas) {
			const ctx = canvas.getContext('2d');
			if (ctx) ctx.clearRect(0, 0, plotWidth, plotHeight);
		}
	};

	return (
		<div
			className="w-full h-full py-2"
			style={{
				minHeight: minH,
				width: "100%",
				height: "100%",
			}}
		>
			<div
				className="grid w-full h-full"
				style={{
					gridTemplateColumns: `${AXIS_LEFT_GUTTER}px 1fr`,
					gridTemplateRows: `1fr ${AXIS_BOTTOM_GUTTER}px`,
				}}
			>
				<div className="flex items-center justify-center">
					{yAxisLabel ? (
						<div className="-rotate-90 whitespace-nowrap translate-x-1/5 text-xs text-text-secondary">
							{yAxisLabel}
						</div>
					) : null}
				</div>

					<div className="relative">
						<div className="relative w-full h-full">
							<div className="absolute inset-0 border-l-2 border-b-2 border-background-tertiary rounded-bl-md overflow-hidden">
								<div ref={setPlotEl} className="absolute inset-0">
									<canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
									<canvas ref={interactiveCanvasRef} className="absolute inset-0 w-full h-full" />
									<div
										className="absolute inset-0"
										onMouseMove={handleMouseMove}
										onMouseLeave={handleMouseLeave}
									/>
								</div>
							</div>

						{hoverTooltip ? (
							<div
								className={clsx(
									"pointer-events-none absolute z-10 rounded-md border px-2 py-1 text-xs whitespace-nowrap",
									"bg-slate-900/90 text-white border-white/20"
								)}
								style={{
									left: hoverTooltip.x,
									top: hoverTooltip.y,
									transform: "translate(12px, -32px)",
								}}
							>
								{hoverTooltip.text}
							</div>
						) : null}
					</div>
				</div>

				<div className="col-start-2 flex items-center justify-center">
					{xAxisLabel ? (
						<div className="text-xs text-text-secondary whitespace-nowrap">{xAxisLabel}</div>
					) : null}
				</div>
			</div>
		</div>
	);
}


function scalePoints(
	points: Point[],
	width: number,
	height: number,
	options?: { padding?: number; xDomain?: { min: number; max: number } | null; yDomain?: { min: number; max: number } | null }
): Point[] {
	if (points.length === 0) return [];

	const padding = normalizePadding(options?.padding);
	const xDomain = options?.xDomain ?? getDomainFromPoints(points, "x");
	const yDomain = options?.yDomain ?? getDomainFromPoints(points, "y");
	if (!xDomain || !yDomain) return [];

	const minX = xDomain.min;
	const maxX = xDomain.max;
	const minY = yDomain.min;
	const maxY = yDomain.max;

	const denomX = maxX - minX;
	const denomY = maxY - minY;

	return points.map((p) => ({
		x:
			padding +
			(denomX === 0 ? 0.5 : (p.x - minX) / denomX) * (width - 2 * padding),
		y:
			height -
			padding -
			(denomY === 0 ? 0.5 : (p.y - minY) / denomY) * (height - 2 * padding),
	}));
}

function drawConnectedLine(
	ctx: CanvasRenderingContext2D,
	points: Point[],
	options?: { strokeStyle?: string; lineWidth?: number }
) {
	if (points.length === 0) return;
	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);

	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i].x, points[i].y);
	}

	ctx.strokeStyle = options?.strokeStyle ?? '#3b82f6';
	ctx.lineWidth = options?.lineWidth ?? 2;
	ctx.stroke();
}

function clampAlpha(alpha: number) {
	if (!Number.isFinite(alpha)) return 0.2;
	return Math.min(1, Math.max(0.0001, alpha));
}

function normalizeStep(step?: number) {
	if (step === undefined) return 1;
	if (!Number.isFinite(step)) return 1;
	return Math.max(1, Math.floor(step));
}

function normalizeLabelStep(step?: number) {
	if (step === undefined) return 1;
	if (!Number.isFinite(step)) return 1;
	return Math.max(1, Math.floor(step));
}

function normalizePadding(padding?: number) {
	if (padding === undefined) return 20;
	if (!Number.isFinite(padding)) return 20;
	return Math.max(0, Math.floor(padding));
}

function normalizeCurveResolution(steps?: number) {
	if (steps === undefined) return 200;
	if (!Number.isFinite(steps)) return 200;
	return Math.max(20, Math.floor(steps));
}

function getDomainFromPoints(points: Point[], axis: "x" | "y") {
	if (points.length === 0) return null;
	const values = points.map((p) => (axis === "x" ? p.x : p.y)).filter(Number.isFinite);
	if (values.length === 0) return null;
	return { min: Math.min(...values), max: Math.max(...values) };
}

function applyView(points: Point[], view?: { startIndex?: number; endIndex?: number; xMin?: number; xMax?: number }) {
	let result = points;

	if (view?.startIndex !== undefined || view?.endIndex !== undefined) {
		const start = Math.max(0, Math.floor(view.startIndex ?? 0));
		const endExclusive = Math.min(points.length, Math.floor(view.endIndex ?? points.length));
		result = result.slice(start, Math.max(start, endExclusive));
	}

	if (view?.xMin !== undefined || view?.xMax !== undefined) {
		const xMin = view.xMin ?? -Infinity;
		const xMax = view.xMax ?? Infinity;
		result = result.filter((p) => p.x >= xMin && p.x <= xMax);
	}

	return result;
}

function getAutoDisplayStep(pointCount: number) {
	if (pointCount >= 100) return 10;
	if (pointCount > 50) return 5;
	if (pointCount > 20) return 2;
	return 1;
}

function downsamplePoints(points: Point[], step: number) {
	if (points.length <= 1) return points;
	if (step <= 1) return points;

	const sampled = points.filter((_, index) => index % step === 0);
	const last = points[points.length - 1];
	if (sampled[sampled.length - 1] !== last) sampled.push(last);
	return sampled;
}

function drawPointMarkers(
	ctx: CanvasRenderingContext2D,
	points: Point[],
	options?: { radius?: number; fill?: string; stroke?: string; strokeWidth?: number }
) {
	const radius = options?.radius ?? 3;
	const fill = options?.fill ?? '#3b82f6';
	const stroke = options?.stroke ?? '#ffffff';
	const strokeWidth = options?.strokeWidth ?? 1.5;

	ctx.save();
	ctx.fillStyle = fill;
	ctx.strokeStyle = stroke;
	ctx.lineWidth = strokeWidth;

	for (const p of points) {
		if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
		ctx.beginPath();
		ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
	}

	ctx.restore();
}

function drawPointLabels(
	ctx: CanvasRenderingContext2D,
	scaledPoints: Point[],
	originalPoints: Point[],
	labelEvery: number,
	options?: { color?: string; font?: string; offsetY?: number }
) {
	if (scaledPoints.length === 0) return;
	if (labelEvery <= 0) return;

	ctx.save();
	ctx.fillStyle = options?.color ?? '#6b7280';
	ctx.font = options?.font ?? '10px sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	const offsetY = options?.offsetY ?? 6;

	for (let i = 0; i < scaledPoints.length; i++) {
		if (i % labelEvery !== 0 && i !== scaledPoints.length - 1) continue;
		const sp = scaledPoints[i];
		const op = originalPoints[i];
		if (!sp || !op) continue;
		if (!Number.isFinite(sp.x) || !Number.isFinite(sp.y)) continue;
		const label = formatNumber(op.y);
		ctx.fillText(label, sp.x, sp.y - offsetY);
	}

	ctx.restore();
}

function formatNumber(value: number) {
	if (!Number.isFinite(value)) return String(value);
	// Keep integers clean; otherwise show up to 2 decimals.
	if (Number.isInteger(value)) return String(value);
	return Number(value.toFixed(2)).toString();
}

function performRegression(
	points: Point[],
	type: Exclude<LineType, "connect" | "ema">
): number[] | null {
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
			default:
				return null
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
	height: number,
	scaleOptions: { padding?: number; xDomain?: { min: number; max: number } | null; yDomain?: { min: number; max: number } | null },
	lineOptions?: { strokeStyle?: string; lineWidth?: number; steps?: number }
) {
	// Get x range from original points
	const xs = originalPoints.map(p => p.x);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);

	// Generate many points along the curve
	const curvePoints: Point[] = [];
	const steps = lineOptions?.steps ?? 200;

	for (let i = 0; i <= steps; i++) {
		const x = minX + (i / steps) * (maxX - minX);
		const y = evaluateFunction(x, coefficients, type);
		curvePoints.push({ x, y });
	}

	// Scale and draw
	const scaled = scalePoints(curvePoints, width, height, scaleOptions);
	drawConnectedLine(ctx, scaled, { strokeStyle: lineOptions?.strokeStyle, lineWidth: lineOptions?.lineWidth });
}

function drawGrid(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	options?: { padding?: number; divisions?: number; color?: string; lineWidth?: number }
) {
	const padding = normalizePadding(options?.padding);
	const divisions = Math.max(2, Math.floor(options?.divisions ?? 5));
	const color = options?.color ?? 'rgba(107, 114, 128, 0.25)';
	const lineWidth = options?.lineWidth ?? 1;

	const left = padding;
	const right = width - padding;
	const top = padding;
	const bottom = height - padding;
	const w = right - left;
	const h = bottom - top;

	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;

	for (let i = 0; i <= divisions; i++) {
		const t = i / divisions;
		const x = left + t * w;
		ctx.beginPath();
		ctx.moveTo(x, top);
		ctx.lineTo(x, bottom);
		ctx.stroke();
	}

	for (let i = 0; i <= divisions; i++) {
		const t = i / divisions;
		const y = top + t * h;
		ctx.beginPath();
		ctx.moveTo(left, y);
		ctx.lineTo(right, y);
		ctx.stroke();
	}

	ctx.restore();
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

function calculateEMA(points: Point[], alpha: number): Point[] {
	if (points.length === 0) return [];

	const safeAlpha = clampAlpha(alpha);
	const emaPoints: Point[] = [];
	let ema = points[0].y;

	for (const point of points) {
		ema = safeAlpha * point.y + (1 - safeAlpha) * ema;
		emaPoints.push({ x: point.x, y: ema });
	}

	return emaPoints;
}

function findNearestPoint(
	mouseX: number,
	scaledPoints: Point[],
	originalPoints: Point[]
): { scaled: Point; original: Point } | null {
	let nearestIndex = -1;
	let minDist = Infinity;

	for (let i = 0; i < scaledPoints.length; i++) {
		const dist = Math.abs(scaledPoints[i].x - mouseX);
		if (dist < minDist) {
			minDist = dist;
			nearestIndex = i;
		}
	}

	if (nearestIndex === -1) return null;

	return {
		scaled: scaledPoints[nearestIndex],
		original: originalPoints[nearestIndex]
	};
}