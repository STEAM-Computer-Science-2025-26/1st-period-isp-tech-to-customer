"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/index";

type ShowcaseCard = {
	id: string;
	title: string;
	imageSrc: string;
	imageAlt: string;
	fallbackTintClassName: string;
};

type LandingScreenshotStackProps = {
	headingFontClassName: string;
};

const CARD_ADVANCE_MS = 4200;
const EXIT_DURATION_MS = 720;
const REINSERT_DURATION_MS = 560;

const showcaseCards: ShowcaseCard[] = [
	{
		id: "dispatch-board",
		title: "Dispatch board",
		imageSrc: "/marketing/dispatch-board.jpg",
		imageAlt: "Dispatch board screenshot",
		fallbackTintClassName: "from-[#6ea8b0] via-[#35525a] to-[#1b2a2f]"
	},
	{
		id: "job-detail",
		title: "Job detail drawer",
		imageSrc: "/marketing/job-detail-drawer.jpg",
		imageAlt: "Job detail drawer screenshot",
		fallbackTintClassName: "from-[#80a290] via-[#3f564c] to-[#1f2c27]"
	},
	{
		id: "map-routing",
		title: "Map + routing",
		imageSrc: "/marketing/map-routing.jpg",
		imageAlt: "Map and routing screenshot",
		fallbackTintClassName: "from-[#6d96a8] via-[#3a4f5f] to-[#1f2b35]"
	},
	{
		id: "customer-profile",
		title: "Customer profile",
		imageSrc: "/marketing/customer-profile.jpg",
		imageAlt: "Customer profile screenshot",
		fallbackTintClassName: "from-[#9d8b75] via-[#5a4b3f] to-[#2d2520]"
	}
];

const stackIds = showcaseCards.map((card) => card.id);

function getBaseCardStyle(position: number) {
	if (position === 0) {
		return {
			transform: "translate3d(18%, 0px, 0) scale(1)",
			opacity: 1,
			zIndex: 60
		};
	}

	if (position === 1) {
		return {
			transform: "translate3d(12%, 18px, 0) scale(0.964)",
			zIndex: 50
		};
	}

	if (position === 2) {
		return {
			transform: "translate3d(6%, 34px, 0) scale(0.93)",
			zIndex: 40
		};
	}

	return {
		transform: "translate3d(0%, 48px, 0) scale(0.89)",
		zIndex: 30
	};
}

export default function LandingScreenshotStack({
	headingFontClassName
}: LandingScreenshotStackProps) {
	const [cardOrder, setCardOrder] = useState<string[]>(stackIds);
	const [exitingCardId, setExitingCardId] = useState<string | null>(null);
	const [reinsertingCardId, setReinsertingCardId] = useState<string | null>(null);
	const [isCycling, setIsCycling] = useState(false);
	const [paused, setPaused] = useState(false);
	const [reduceMotion, setReduceMotion] = useState(false);
	const [imageLoadFailedById, setImageLoadFailedById] = useState<
		Record<string, boolean>
	>({});
	const exitTimeoutRef = useRef<number | null>(null);
	const settleTimeoutRef = useRef<number | null>(null);
	const frameRef = useRef<number | null>(null);

	const cardsById = useMemo(
		() => Object.fromEntries(showcaseCards.map((card) => [card.id, card] as const)),
		[]
	);

	const clearCycleTimers = useCallback(() => {
		if (exitTimeoutRef.current !== null) {
			window.clearTimeout(exitTimeoutRef.current);
			exitTimeoutRef.current = null;
		}

		if (settleTimeoutRef.current !== null) {
			window.clearTimeout(settleTimeoutRef.current);
			settleTimeoutRef.current = null;
		}

		if (frameRef.current !== null) {
			window.cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		}
	}, []);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const updateMotionPreference = () => setReduceMotion(mediaQuery.matches);

		updateMotionPreference();
		mediaQuery.addEventListener("change", updateMotionPreference);

		return () => {
			mediaQuery.removeEventListener("change", updateMotionPreference);
		};
	}, []);

	useEffect(
		() => () => {
			clearCycleTimers();
		},
		[clearCycleTimers]
	);

	const cycleCards = useCallback(() => {
		if (isCycling || cardOrder.length < 2) {
			return;
		}

		const frontCardId = cardOrder[0];
		setIsCycling(true);
		setExitingCardId(frontCardId);

		exitTimeoutRef.current = window.setTimeout(() => {
			setExitingCardId(null);

			setCardOrder((current) => [...current.slice(1), current[0]]);
			setReinsertingCardId(frontCardId);

			frameRef.current = window.requestAnimationFrame(() => {
				setReinsertingCardId(null);
				frameRef.current = null;
			});

			settleTimeoutRef.current = window.setTimeout(() => {
				setIsCycling(false);
				settleTimeoutRef.current = null;
			}, reduceMotion ? 0 : REINSERT_DURATION_MS);

			exitTimeoutRef.current = null;
		}, reduceMotion ? 0 : EXIT_DURATION_MS);
	}, [cardOrder, isCycling, reduceMotion]);

	useEffect(() => {
		if (paused || reduceMotion || isCycling || cardOrder.length < 2) {
			return;
		}

		const autoplayTimer = window.setTimeout(() => {
			cycleCards();
		}, CARD_ADVANCE_MS);

		return () => window.clearTimeout(autoplayTimer);
	}, [cardOrder.length, cycleCards, isCycling, paused, reduceMotion]);

	const activeCardId = cardOrder[0];

	const markImageAsFailed = (id: string) => {
		setImageLoadFailedById((current) => {
			if (current[id]) {
				return current;
			}

			return {
				...current,
				[id]: true
			};
		});
	};

	return (
		<div
			className="absolute right-0 w-[calc(50%-3rem)] h-[calc(100%-11rem)]"
			onMouseEnter={() => setPaused(true)}
			onMouseLeave={() => setPaused(false)}
			onFocusCapture={() => setPaused(true)}
			onBlurCapture={() => setPaused(false)}
		>
			<div className="pointer-events-none absolute h-full -inset-x-7 -bottom-7 -top-4 rounded-4xl bg-linear-to-b from-accent-main/12 via-transparent to-background-main blur-2xl" />

			<div className={`relative h-[calc(100%-(4rem))] rounded-l-4xl`}>
				{cardOrder.map((cardId, index) => {
					const card = cardsById[cardId];
					const isExiting = exitingCardId === cardId;
					const isReinserting = reinsertingCardId === cardId;
					const isFrontCard = index === 0 && !isExiting;
					const showFallback = imageLoadFailedById[card.id];
					const baseStyle = getBaseCardStyle(index);

					const cardStyle = isExiting
						? {
							transform: "translate3d(168%, -4px, 0) scale(0.96)",
							opacity: 0,
							zIndex: 90,
							width: "124%"
						}
						: isReinserting
							? {
								transform: "translate3d(118%, 54px, 0) scale(0.86)",
								opacity: 0.32,
								zIndex: 15,
								width: "124%"
							}
							: {
								...baseStyle,
								width: "124%"
							};

					return (
						<article
							key={card.id}
							className={cn(
								"absolute inset-y-0 left-0 overflow-hidden rounded-4xl border border-accent-text/20 bg-background-main/92",
								reduceMotion
									? "transition-none"
									: "transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
								!isFrontCard && "pointer-events-none"
							)}
							style={cardStyle}
							aria-hidden={!isFrontCard}
						>
							<span className="absolute right-4 top-4 z-20 rounded-full border border-white/35 bg-black/45 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
								{card.title}
							</span>

							<div className="relative h-full w-full">
								{showFallback ? (
									<div
										className={cn(
											"flex h-full w-full flex-col justify-between bg-linear-to-br px-6 pb-8 pt-7 text-white",
											card.fallbackTintClassName
										)}
									>
										<div>
											<p className="text-[11px] uppercase tracking-[0.16em] text-white/75">
												Preview placeholder
											</p>
											<p className={cn(headingFontClassName, "mt-4 max-w-xs text-3xl leading-tight")}>
												App screenshot
											</p>
										</div>

										<p className="max-w-xs text-sm leading-relaxed text-white/88">
											Add image at {card.imageSrc} to replace.
										</p>
									</div>
								) : (
									<Image
										src={card.imageSrc}
										alt={card.imageAlt}
										fill
										sizes="(max-width: 768px) 92vw, 520px"
										className="object-cover"
										onError={() => markImageAsFailed(card.id)}
										priority={isFrontCard}
									/>
								)}

								<div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-black/55 to-transparent" />
							</div>
						</article>
					);
				})}
			</div>

			<div className="mt-8 flex items-center justify-between gap-4 px-2 ml-20">
			

				<div className="flex items-center gap-2">
					{showcaseCards.map((card) => (
						<button
							type="button"
							key={card.id}
							onClick={() => {
								if (isCycling || card.id === activeCardId) {
									return;
								}

								setCardOrder((current) => {
									const targetIndex = current.indexOf(card.id);

									if (targetIndex <= 0) {
										return current;
									}

									return [
										...current.slice(targetIndex),
										...current.slice(0, targetIndex)
									];
								});
							}}
							className={cn(
								"h-2.5 rounded-full transition-all duration-300",
								card.id === activeCardId
									? "w-9 bg-accent-main"
									: "w-2.5 bg-accent-text/75 hover:bg-accent-text"
							)}
							aria-label={`Show ${card.title}`}
							aria-pressed={card.id === activeCardId}
						/>
					))}
				</div>
			</div>

			{reduceMotion ? (
				<p className="mt-2 px-2 text-xs text-text-secondary/90">
					Autoplay is paused because reduced motion is enabled.
				</p>
			) : null}
		</div>
	);
}