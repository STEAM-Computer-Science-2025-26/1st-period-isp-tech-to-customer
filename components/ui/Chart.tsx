import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type {
	BarChartColor,
	BarChartProps,
	LineGraphProps,
	Point
} from "@/app/types/types";
import clsx from "clsx";
import {
	applyView,
	calculateEMA,
	clampAlpha,
	downsamplePoints,
	drawConnectedLine,
	drawGrid,
	drawPointLabels,
	drawPointMarkers,
	drawRegressionCurve,
	easeOutCubic,
	fillAreaUnderLine,
	findNearestPoint,
	formatNumber,
	getAutoDisplayStep,
	getDomainFromPoints,
	normalizeCurveResolution,
	normalizeLabelStep,
	normalizePadding,
	normalizeStep,
	performRegression,
	resolveCanvasColor,
	scalePoints,
	tweenPointsFromBaseline
} from "@/components/ui/chart/lineGraphLogic";

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
	black: "bg-black",
	white: "bg-white"
};

export function BarChart({ yAxisLabel, bars }: BarChartProps) {
	const values = bars.map((b) => b.data);
	const maxValue = Math.max(...(values.length ? values : [0]));
	const safeMax = Math.max(1, maxValue);

	return (
		<div className="pl-6 pb-8 pr-2 pt-2 max-w-full overflow-x-hidden">
			<div
				className="border-l-2 border-b-2 border-background-tertiary rounded-bl-md relative flex flex-col justify-end"
				aria-label={yAxisLabel}
			>
				<label className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 -rotate-90 h-4">
					{yAxisLabel}
				</label>
				<div className="px-3 absolute h-full w-full flex">
					{bars.map((bar, index: number) => {
						const heightPercent = (Math.max(0, bar.data) / safeMax) * 100;
						const bgClass = BAR_BG_CLASS[bar.color];

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
						);
					})}
				</div>

				<div className="px-3 absolute bottom-0 left-0 right-0 translate-y-full flex">
					{bars.map((bar) => {
						return (
							<div key={bar.label} className="flex-1 text-center">
								<label className="whitespace-nowrap">{bar.label}</label>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
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
	const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
		null
	);
	const [hoverTooltip, setHoverTooltip] = useState<{
		x: number;
		y: number;
		text: string;
	} | null>(null);
	const renderCacheRef = useRef<{
		visible: Point[];
		scaledPoints: Point[];
		padding: number;
		width: number;
		height: number;
	} | null>(null);
	const didAnimateRef = useRef(false);
	const animationFrameRef = useRef<number | null>(null);

	const setPlotEl = useCallback((el: HTMLDivElement | null) => {
		if (plotObserverRef.current) {
			plotObserverRef.current.disconnect();
			plotObserverRef.current = null;
		}

		if (!el) return;
		const rect = el.getBoundingClientRect();
		setPlotSize({
			width: Math.floor(rect.width),
			height: Math.floor(rect.height)
		});

		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			setPlotSize({
				width: Math.floor(entry.contentRect.width),
				height: Math.floor(entry.contentRect.height)
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

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const neededW = Math.floor(plotWidth * dpr);
		const neededH = Math.floor(plotHeight * dpr);
		if (canvas.width !== neededW) canvas.width = neededW;
		if (canvas.height !== neededH) canvas.height = neededH;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}

		ctx.clearRect(0, 0, plotWidth, plotHeight);
		if (style?.backgroundColor) {
			ctx.save();
			ctx.fillStyle = resolveCanvasColor(
				style.backgroundColor,
				style.backgroundColor
			);
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
			yDomain: style?.yDomain ?? getDomainFromPoints(scaleBase, "y")
		};

		if (style?.showGrid) {
			drawGrid(ctx, plotWidth, plotHeight, {
				padding,
				divisions: style.gridDivisions,
				color: style?.gridColor
					? resolveCanvasColor(style.gridColor, style.gridColor)
					: undefined,
				lineWidth: style.gridLineWidth
			});
		}

		const displayStep =
			step === undefined
				? getAutoDisplayStep(visible.length)
				: normalizeStep(step);
		const effectiveLabelStep = normalizeLabelStep(labelStep);
		const displayPoints = downsamplePoints(visible, displayStep);

		const baselineY = plotHeight - padding;

		// Scale points to canvas
		const scaledPointsFinal = scalePoints(
			visible,
			plotWidth,
			plotHeight,
			scaleOptions
		);
		const scaledDisplayPointsFinal = scalePoints(
			displayPoints,
			plotWidth,
			plotHeight,
			scaleOptions
		);
		const alpha = clampAlpha(emaAlpha);
		const curveResolution = normalizeCurveResolution(style?.curveResolution);

		const showPoints = style?.showPoints ?? true;
		const showLabelsLocal = style?.showLabels ?? true;

		const resolvedRawStroke = resolveCanvasColor(
			style?.rawLineColor ?? style?.lineColor,
			"var(--accent-text-dark)"
		);
		const rawLineWidth = style?.rawLineWidth ?? 1;

		const drawAtProgress = (progress: number) => {
			ctx.clearRect(0, 0, plotWidth, plotHeight);
			if (style?.backgroundColor) {
				ctx.save();
				ctx.fillStyle = resolveCanvasColor(
					style.backgroundColor,
					style.backgroundColor
				);
				ctx.fillRect(0, 0, plotWidth, plotHeight);
				ctx.restore();
			}

			if (style?.showGrid) {
				drawGrid(ctx, plotWidth, plotHeight, {
					padding,
					divisions: style.gridDivisions,
					color: style?.gridColor
						? resolveCanvasColor(style.gridColor, style.gridColor)
						: undefined,
					lineWidth: style.gridLineWidth
				});
			}

			const scaledPoints = tweenPointsFromBaseline(
				scaledPointsFinal,
				baselineY,
				progress
			);
			const scaledDisplayPoints = tweenPointsFromBaseline(
				scaledDisplayPointsFinal,
				baselineY,
				progress
			);

			renderCacheRef.current = {
				visible,
				scaledPoints,
				padding,
				width: plotWidth,
				height: plotHeight
			};

			if (style?.fillUnderLine !== false) {
				const gradient = ctx.createLinearGradient(0, padding, 0, baselineY);
				gradient.addColorStop(
					0,
					resolveCanvasColor(
						style?.fillUnderLineFrom ?? style?.rawLineColor ?? style?.lineColor,
						resolvedRawStroke
					)
				);
				gradient.addColorStop(1, "transparent");
				ctx.save();
				ctx.globalAlpha = 0.5;
				fillAreaUnderLine(ctx, scaledPoints, baselineY, gradient);
				ctx.restore();
			}

			drawConnectedLine(ctx, scaledPoints, {
				strokeStyle: resolvedRawStroke,
				lineWidth: rawLineWidth
			});

			if (lineType === "connect") {
				if (showPoints) {
					drawPointMarkers(ctx, scaledDisplayPoints, {
						radius: style?.pointRadius,
						fill: style?.pointFill
							? resolveCanvasColor(style.pointFill, style.pointFill)
							: undefined,
						stroke: style?.pointStroke
							? resolveCanvasColor(style.pointStroke, style.pointStroke)
							: undefined,
						strokeWidth: style?.pointStrokeWidth
					});
				}
				if (showLabelsLocal) {
					drawPointLabels(
						ctx,
						scaledDisplayPoints,
						displayPoints,
						effectiveLabelStep,
						{
							color: style?.labelColor
								? resolveCanvasColor(style.labelColor, style.labelColor)
								: undefined,
							font: style?.labelFont,
							offsetY: style?.labelOffsetY
						}
					);
				}
				return;
			}

			if (lineType === "ema") {
				const emaPoints = calculateEMA(visible, alpha);
				const scaledEmaFinal = scalePoints(
					emaPoints,
					plotWidth,
					plotHeight,
					scaleOptions
				);
				const scaledEma = tweenPointsFromBaseline(
					scaledEmaFinal,
					baselineY,
					progress
				);
				drawConnectedLine(ctx, scaledEma, {
					strokeStyle: resolveCanvasColor(
						style?.emaColor,
						"var(--accent-text-dark-2)"
					),
					lineWidth: style?.emaWidth ?? 2
				});
				if (showPoints) {
					drawPointMarkers(ctx, scaledDisplayPoints, {
						radius: style?.pointRadius,
						fill: style?.pointFill
							? resolveCanvasColor(style.pointFill, style.pointFill)
							: undefined,
						stroke: style?.pointStroke
							? resolveCanvasColor(style.pointStroke, style.pointStroke)
							: undefined,
						strokeWidth: style?.pointStrokeWidth
					});
				}
				if (showLabelsLocal) {
					drawPointLabels(
						ctx,
						scaledDisplayPoints,
						displayPoints,
						effectiveLabelStep,
						{
							color: style?.labelColor
								? resolveCanvasColor(style.labelColor, style.labelColor)
								: undefined,
							font: style?.labelFont,
							offsetY: style?.labelOffsetY
						}
					);
				}
				return;
			}

			const coefficients = performRegression(visible, lineType);
			if (!coefficients) {
				if (showPoints) {
					drawPointMarkers(ctx, scaledDisplayPoints, {
						radius: style?.pointRadius,
						fill: style?.pointFill
							? resolveCanvasColor(style.pointFill, style.pointFill)
							: undefined,
						stroke: style?.pointStroke
							? resolveCanvasColor(style.pointStroke, style.pointStroke)
							: undefined,
						strokeWidth: style?.pointStrokeWidth
					});
				}
				if (showLabelsLocal) {
					drawPointLabels(
						ctx,
						scaledDisplayPoints,
						displayPoints,
						effectiveLabelStep,
						{
							color: style?.labelColor
								? resolveCanvasColor(style.labelColor, style.labelColor)
								: undefined,
							font: style?.labelFont,
							offsetY: style?.labelOffsetY
						}
					);
				}
				return;
			}

			drawRegressionCurve(
				ctx,
				visible,
				coefficients,
				lineType,
				plotWidth,
				plotHeight,
				scaleOptions,
				{
					strokeStyle: resolveCanvasColor(style?.regressionColor, "#3b82f6"),
					lineWidth: style?.regressionWidth ?? 2,
					steps: curveResolution
				},
				{ baselineY, progress }
			);
			if (showEma) {
				const emaPoints = calculateEMA(visible, alpha);
				const scaledEmaFinal = scalePoints(
					emaPoints,
					plotWidth,
					plotHeight,
					scaleOptions
				);
				const scaledEma = tweenPointsFromBaseline(
					scaledEmaFinal,
					baselineY,
					progress
				);
				drawConnectedLine(ctx, scaledEma, {
					strokeStyle: resolveCanvasColor(style?.emaColor, "#f97316"),
					lineWidth: style?.emaWidth ?? 2
				});
			}
			if (showPoints) {
				drawPointMarkers(ctx, scaledDisplayPoints, {
					radius: style?.pointRadius,
					fill: style?.pointFill
						? resolveCanvasColor(style.pointFill, style.pointFill)
						: undefined,
					stroke: style?.pointStroke
						? resolveCanvasColor(style.pointStroke, style.pointStroke)
						: undefined,
					strokeWidth: style?.pointStrokeWidth
				});
			}
			if (showLabelsLocal) {
				drawPointLabels(
					ctx,
					scaledDisplayPoints,
					displayPoints,
					effectiveLabelStep,
					{
						color: style?.labelColor
							? resolveCanvasColor(style.labelColor, style.labelColor)
							: undefined,
						font: style?.labelFont,
						offsetY: style?.labelOffsetY
					}
				);
			}
		};

		const animateOnLoad = style?.animateOnLoad ?? false;
		const shouldAnimate = animateOnLoad && !didAnimateRef.current;
		const durationMs = Math.max(0, Math.floor(style?.animateDurationMs ?? 700));
		let cancelled = false;
		const start = performance.now();

		const tick = (now: number) => {
			if (cancelled) return;
			const t = durationMs === 0 ? 1 : Math.min(1, (now - start) / durationMs);
			drawAtProgress(easeOutCubic(t));
			if (t < 1) {
				animationFrameRef.current = requestAnimationFrame(tick);
			} else {
				didAnimateRef.current = true;
				animationFrameRef.current = null;
			}
		};

		if (shouldAnimate) {
			tick(start);
		} else {
			drawAtProgress(1);
		}

		return () => {
			cancelled = true;
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
		};
	}, [
		points,
		lineType,
		showEma,
		emaAlpha,
		step,
		labelStep,
		view,
		style,
		plotWidth,
		plotHeight
	]);

	useEffect(() => {
		if (plotWidth <= 0 || plotHeight <= 0) return;
		const canvas = interactiveCanvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
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

		const cache = renderCacheRef.current;
		if (!cache || cache.width !== plotWidth || cache.height !== plotHeight)
			return;
		const nearest = findNearestPoint(
			hoverPos.x,
			cache.scaledPoints,
			cache.visible
		);

		if (!nearest) return;

		// Draw vertical line
		ctx.strokeStyle = "rgba(156, 163, 175, 0.5)"; // light gray
		ctx.lineWidth = 1;
		ctx.setLineDash([5, 5]);
		ctx.beginPath();
		ctx.moveTo(nearest.scaled.x, cache.padding);
		ctx.lineTo(nearest.scaled.x, plotHeight - cache.padding);
		ctx.stroke();
		ctx.setLineDash([]);

		// Highlight point (even if normally hidden)
		ctx.fillStyle = resolveCanvasColor(style?.pointFill, "var(--accent-main)");
		ctx.strokeStyle = "#ffffff";
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
				text: `x: ${formatNumber(nearest.original.x)}  y: ${formatNumber(nearest.original.y)}`
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
			const ctx = canvas.getContext("2d");
			if (ctx) ctx.clearRect(0, 0, plotWidth, plotHeight);
		}
	};

	return (
		<div
			className="w-full max-w-full h-full py-2 overflow-x-hidden"
			style={{
				minHeight: minH,
				width: "100%",
				height: "100%"
			}}
		>
			<div
				className="grid w-full h-full"
				style={{
					gridTemplateColumns: `${AXIS_LEFT_GUTTER}px 1fr`,
					gridTemplateRows: `1fr ${AXIS_BOTTOM_GUTTER}px`
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
								<canvas
									ref={canvasRef}
									className="absolute inset-0 w-full h-full"
								/>
								<canvas
									ref={interactiveCanvasRef}
									className="absolute inset-0 w-full h-full"
								/>
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
									transform: "translate(12px, -32px)"
								}}
							>
								{hoverTooltip.text}
							</div>
						) : null}
					</div>
				</div>

				<div className="col-start-2 flex items-center justify-center">
					{xAxisLabel ? (
						<div className="text-xs text-text-secondary whitespace-nowrap">
							{xAxisLabel}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
