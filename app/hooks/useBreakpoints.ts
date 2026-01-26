"use client";

import { useEffect, useMemo, useState } from "react";

export type BreakpointKey = "sm" | "md" | "lg" | "xl" | "2xl";

export type BreakpointMap = Record<BreakpointKey, number>;

const TAILWIND_DEFAULT_BREAKPOINTS_PX: BreakpointMap = {
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
	"2xl": 1536
};

function parseCssSizeToPx(
	value: string,
	rootFontSizePx: number
): number | undefined {
	const raw = value.trim();
	if (!raw) return undefined;

	const numeric = Number.parseFloat(raw);
	if (!Number.isFinite(numeric)) return undefined;

	if (raw.endsWith("px")) return numeric;
	if (raw.endsWith("rem") || raw.endsWith("em"))
		return numeric * rootFontSizePx;

	// If unit-less, assume px
	return numeric;
}

function readBreakpointsFromCss(): Partial<BreakpointMap> {
	if (typeof window === "undefined") return {};

	const styles = getComputedStyle(document.documentElement);
	const rootFontSize = Number.parseFloat(styles.fontSize || "16") || 16;

	const result: Partial<BreakpointMap> = {};
	const keys: BreakpointKey[] = ["sm", "md", "lg", "xl", "2xl"];

	for (const key of keys) {
		const cssVar = styles.getPropertyValue(`--breakpoint-${key}`);
		const px = parseCssSizeToPx(cssVar, rootFontSize);
		if (px) result[key] = px;
	}

	return result;
}

export type UseBreakpointsResult = {
	ready: boolean;
	width: number;
	breakpoints: BreakpointMap;

	sxDown: boolean;
	smUp: boolean;
	mdUp: boolean;
	lgUp: boolean;
	xlUp: boolean;
	"2xlUp": boolean;

	sx: boolean;
	isSm: boolean;
	isMd: boolean;
	isLg: boolean;
	isXl: boolean;
	is2xl: boolean;

	smDown: boolean;
	mdDown: boolean;
	lgDown: boolean;
	xlDown: boolean;

	up: (bp: BreakpointKey) => boolean;
	down: (bp: BreakpointKey) => boolean;
	between: (min: BreakpointKey, maxExclusive?: BreakpointKey) => boolean;

	query: (mediaQuery: string) => boolean;
};

/**
 * Tailwind-like breakpoint booleans.
 *
 * Reads breakpoint sizes from CSS vars if present:
 *   --breakpoint-sm, --breakpoint-md, --breakpoint-lg, --breakpoint-xl, --breakpoint-2xl
 *
 * Falls back to Tailwind defaults if not present.
 */
export function useBreakpoints(): UseBreakpointsResult {
	const isClient = typeof window !== "undefined";
	// IMPORTANT: keep the initial render identical between SSR and client hydration.
	// If we read `window.innerWidth` during the first client render, the computed
	// breakpoint booleans (and any className branches) can differ from SSR output,
	// causing React hydration warnings.
	const [ready, setReady] = useState(false);
	const [width, setWidth] = useState(0);
	const [breakpoints] = useState<BreakpointMap>(() => ({
		...TAILWIND_DEFAULT_BREAKPOINTS_PX,
		...readBreakpointsFromCss()
	}));

	useEffect(() => {
		if (!isClient) return;

		// eslint-disable-next-line react-hooks/set-state-in-effect
		setReady(true);
		setWidth(window.innerWidth);

		let raf = 0;
		const update = () => setWidth(window.innerWidth);
		const onResize = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(update);
		};

		window.addEventListener("resize", onResize);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", onResize);
		};
	}, [isClient]);

	return useMemo(() => {
		const up = (bp: BreakpointKey) => width >= breakpoints[bp];
		const down = (bp: BreakpointKey) => width < breakpoints[bp];
		const between = (min: BreakpointKey, maxExclusive?: BreakpointKey) => {
			const minOk = width >= breakpoints[min];
			if (!maxExclusive) return minOk;
			return minOk && width < breakpoints[maxExclusive];
		};

		const query = (mediaQuery: string) => {
			if (typeof window === "undefined") return false;
			return window.matchMedia(mediaQuery).matches;
		};

		const smUp = up("sm");
		const mdUp = up("md");
		const lgUp = up("lg");
		const xlUp = up("xl");
		const twoXlUp = up("2xl");

		const smDown = down("sm");
		const mdDown = down("md");
		const lgDown = down("lg");
		const xlDown = down("xl");

		const xs = width < breakpoints.sm;
		const isSm = between("sm", "md");
		const isMd = between("md", "lg");
		const isLg = between("lg", "xl");
		const isXl = between("xl", "2xl");
		const is2xl = twoXlUp;

		return {
			ready,
			width,
			breakpoints,

			sxDown: !smUp,
			smUp,
			mdUp,
			lgUp,
			xlUp,
			"2xlUp": twoXlUp,

			sx: xs,
			isSm,
			isMd,
			isLg,
			isXl,
			is2xl,

			smDown,
			mdDown,
			lgDown,
			xlDown,

			up,
			down,
			between,
			query
		};
	}, [breakpoints, ready, width]);
}

/** Convenience helper for a single boolean, e.g. useBreakpoint("md", "up") */
export function useBreakpoint(
	bp: BreakpointKey,
	direction: "up" | "down" | "only" = "up"
) {
	const { up, down, between } = useBreakpoints();

	if (direction === "down") return down(bp);
	if (direction === "only") {
		switch (bp) {
			case "sm":
				return between("sm", "md");
			case "md":
				return between("md", "lg");
			case "lg":
				return between("lg", "xl");
			case "xl":
				return between("xl", "2xl");
			case "2xl":
				return up("2xl");
		}
	}

	return up(bp);
}
