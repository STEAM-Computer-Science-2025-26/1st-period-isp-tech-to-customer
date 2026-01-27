"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

export function useStackedPanels(activeIndex: number, enabled: boolean) {
	const panelsRef = useRef<Array<HTMLDivElement | null>>([]);
	const [panelHeights, setPanelHeights] = useState<number[]>([]);

	useLayoutEffect(() => {
		if (!enabled) return;

		const elements = panelsRef.current.filter(
			(el): el is HTMLDivElement => el !== null
		);
		if (elements.length === 0) return;

		const update = () => {
			setPanelHeights(
				panelsRef.current.map((el) => el?.getBoundingClientRect().height ?? 0)
			);
		};

		requestAnimationFrame(update);
		if (typeof ResizeObserver === "undefined") {
			return;
		}
		const ro = new ResizeObserver(update);
		elements.forEach((el) => ro.observe(el));
		return () => ro.disconnect();
	}, [enabled]);

	const panelOffsets = useMemo(() => {
		const offsets: number[] = [];
		let acc = 0;
		for (let i = 0; i < panelHeights.length; i += 1) {
			offsets.push(acc);
			acc += panelHeights[i] ?? 0;
		}
		return offsets;
	}, [panelHeights]);

	const containerHeight = panelHeights[activeIndex] ?? 0;
	const translateY = -(panelOffsets[activeIndex] ?? 0);

	return { panelsRef, containerHeight, translateY };
}
