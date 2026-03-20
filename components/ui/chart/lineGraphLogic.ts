import type { LineType, Point } from "@/app/types/types";
import regression from "regression";

export function resolveCanvasColor(
	value: string | undefined,
	fallback: string
) {
	const raw = (value ?? fallback).trim();
	if (!raw.startsWith("var(")) return raw;

	const inside = raw.slice(4, -1);
	const [name, inlineFallback] = inside.split(",").map((s) => s.trim());
	if (!name) return inlineFallback || fallback || raw;
	if (typeof window === "undefined") return inlineFallback || fallback || raw;

	const resolved = getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	return resolved || inlineFallback || fallback || raw;
}

export function fillAreaUnderLine(
	ctx: CanvasRenderingContext2D,
	points: Point[],
	baselineY: number,
	fillStyle: CanvasFillStrokeStyles["fillStyle"]
) {
	if (points.length < 2) return;
	const first = points[0];
	const last = points[points.length - 1];
	if (!first || !last) return;

	ctx.save();
	ctx.fillStyle = fillStyle;
	ctx.beginPath();
	ctx.moveTo(first.x, baselineY);
	ctx.lineTo(first.x, first.y);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i].x, points[i].y);
	}
	ctx.lineTo(last.x, baselineY);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

export function easeOutCubic(t: number) {
	const clamped = Math.min(1, Math.max(0, t));
	return 1 - Math.pow(1 - clamped, 3);
}

export function tweenPointsFromBaseline(
	points: Point[],
	baselineY: number,
	t: number
) {
	if (points.length === 0) return points;
	const clamped = Math.min(1, Math.max(0, t));
	if (clamped === 1) return points;
	return points.map((p) => ({
		x: p.x,
		y: baselineY + (p.y - baselineY) * clamped
	}));
}

export function scalePoints(
	points: Point[],
	width: number,
	height: number,
	options?: {
		padding?: number;
		xDomain?: { min: number; max: number } | null;
		yDomain?: { min: number; max: number } | null;
	}
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
			(denomY === 0 ? 0.5 : (p.y - minY) / denomY) * (height - 2 * padding)
	}));
}

export function drawConnectedLine(
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

	ctx.strokeStyle = options?.strokeStyle ?? "#3b82f6";
	ctx.lineWidth = options?.lineWidth ?? 2;
	ctx.stroke();
}

export function clampAlpha(alpha: number) {
	if (!Number.isFinite(alpha)) return 0.2;
	return Math.min(1, Math.max(0.0001, alpha));
}

export function normalizeStep(step?: number) {
	if (step === undefined) return 1;
	if (!Number.isFinite(step)) return 1;
	return Math.max(1, Math.floor(step));
}

export function normalizeLabelStep(step?: number) {
	if (step === undefined) return 1;
	if (!Number.isFinite(step)) return 1;
	return Math.max(1, Math.floor(step));
}

export function normalizePadding(padding?: number) {
	if (padding === undefined) return 20;
	if (!Number.isFinite(padding)) return 20;
	return Math.max(0, Math.floor(padding));
}

export function normalizeCurveResolution(steps?: number) {
	if (steps === undefined) return 200;
	if (!Number.isFinite(steps)) return 200;
	return Math.max(20, Math.floor(steps));
}

export function getDomainFromPoints(points: Point[], axis: "x" | "y") {
	if (points.length === 0) return null;
	const values = points
		.map((p) => (axis === "x" ? p.x : p.y))
		.filter(Number.isFinite);
	if (values.length === 0) return null;
	return { min: Math.min(...values), max: Math.max(...values) };
}

export function applyView(
	points: Point[],
	view?: {
		startIndex?: number;
		endIndex?: number;
		xMin?: number;
		xMax?: number;
	}
) {
	let result = points;

	if (view?.startIndex !== undefined || view?.endIndex !== undefined) {
		const start = Math.max(0, Math.floor(view.startIndex ?? 0));
		const endExclusive = Math.min(
			points.length,
			Math.floor(view.endIndex ?? points.length)
		);
		result = result.slice(start, Math.max(start, endExclusive));
	}

	if (view?.xMin !== undefined || view?.xMax !== undefined) {
		const xMin = view.xMin ?? -Infinity;
		const xMax = view.xMax ?? Infinity;
		result = result.filter((p) => p.x >= xMin && p.x <= xMax);
	}

	return result;
}

export function getAutoDisplayStep(pointCount: number) {
	if (pointCount >= 100) return 10;
	if (pointCount > 50) return 5;
	if (pointCount > 20) return 2;
	return 1;
}

export function downsamplePoints(points: Point[], step: number) {
	if (points.length <= 1) return points;
	if (step <= 1) return points;

	const sampled = points.filter((_, index) => index % step === 0);
	const last = points[points.length - 1];
	if (sampled[sampled.length - 1] !== last) sampled.push(last);
	return sampled;
}

export function drawPointMarkers(
	ctx: CanvasRenderingContext2D,
	points: Point[],
	options?: {
		radius?: number;
		fill?: string;
		stroke?: string;
		strokeWidth?: number;
	}
) {
	const radius = options?.radius ?? 3;
	const fill = options?.fill ?? "#3b82f6";
	const stroke = options?.stroke ?? "#ffffff";
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

export function drawPointLabels(
	ctx: CanvasRenderingContext2D,
	scaledPoints: Point[],
	originalPoints: Point[],
	labelEvery: number,
	options?: { color?: string; font?: string; offsetY?: number }
) {
	if (scaledPoints.length === 0) return;
	if (labelEvery <= 0) return;

	ctx.save();
	ctx.fillStyle = options?.color ?? "#6b7280";
	ctx.font = options?.font ?? "10px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "bottom";
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

export function formatNumber(value: number) {
	if (!Number.isFinite(value)) return String(value);
	if (Number.isInteger(value)) return String(value);
	return Number(value.toFixed(2)).toString();
}

export function performRegression(
	points: Point[],
	type: Exclude<LineType, "connect" | "ema">
): number[] | null {
	const filtered = points.filter((p) => {
		if (type === "log") return p.x > 0;
		if (type === "b^x") return p.y > 0;
		return true;
	});

	if (filtered.length < 2) return null;
	const data: [number, number][] = filtered.map((p) => [p.x, p.y]);

	try {
		switch (type) {
			case "x":
				return regression.linear(data).equation;
			case "x^2":
				return regression.polynomial(data, { order: 2 }).equation;
			case "log":
				return regression.logarithmic(data).equation;
			case "b^x":
				return regression.exponential(data).equation;
			default:
				return null;
		}
	} catch {
		return null;
	}
}

export function drawRegressionCurve(
	ctx: CanvasRenderingContext2D,
	originalPoints: Point[],
	coefficients: number[],
	type: LineType,
	width: number,
	height: number,
	scaleOptions: {
		padding?: number;
		xDomain?: { min: number; max: number } | null;
		yDomain?: { min: number; max: number } | null;
	},
	lineOptions?: { strokeStyle?: string; lineWidth?: number; steps?: number },
	animate?: { baselineY: number; progress: number }
) {
	const xs = originalPoints.map((p) => p.x);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);

	const curvePoints: Point[] = [];
	const steps = lineOptions?.steps ?? 200;

	for (let i = 0; i <= steps; i++) {
		const x = minX + (i / steps) * (maxX - minX);
		const y = evaluateFunction(x, coefficients, type);
		curvePoints.push({ x, y });
	}

	const scaledFinal = scalePoints(curvePoints, width, height, scaleOptions);
	const scaled = animate
		? tweenPointsFromBaseline(scaledFinal, animate.baselineY, animate.progress)
		: scaledFinal;
	drawConnectedLine(ctx, scaled, {
		strokeStyle: lineOptions?.strokeStyle,
		lineWidth: lineOptions?.lineWidth
	});
}

export function drawGrid(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	options?: {
		padding?: number;
		divisions?: number;
		color?: string;
		lineWidth?: number;
	}
) {
	const padding = normalizePadding(options?.padding);
	const divisions = Math.max(2, Math.floor(options?.divisions ?? 5));
	const color = options?.color ?? "rgba(107, 114, 128, 0.25)";
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

export function evaluateFunction(
	x: number,
	coef: number[],
	type: LineType
): number {
	const c0 = coef[0] ?? 0;
	const c1 = coef[1] ?? 0;
	const c2 = coef[2] ?? 0;
	switch (type) {
		case "x":
			return c0 * x + c1;
		case "x^2":
			return c0 * x * x + c1 * x + c2;
		case "log":
			if (x <= 0) return NaN;
			return c0 * Math.log(x) + c1;
		case "b^x":
			return c0 * Math.exp(c1 * x);
		default:
			return 0;
	}
}

export function calculateEMA(points: Point[], alpha: number): Point[] {
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

export function findNearestPoint(
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
