"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/index";

type LandingFloatingHeaderProps = {
	targetId: string;
};

export default function LandingFloatingHeader({
	targetId
}: LandingFloatingHeaderProps) {
	const [isScrolledPastBrand, setIsScrolledPastBrand] = useState(false);

	useEffect(() => {
		const target = document.getElementById(targetId);
		if (!target) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry) return;
				setIsScrolledPastBrand(
					!entry.isIntersecting && entry.boundingClientRect.top < 0
				);
			},
			{ threshold: 0 }
		);

		observer.observe(target);

		return () => {
			observer.disconnect();
		};
	}, [targetId]);

	return (
		<motion.div
			className={cn(
				"fixed inset-x-0 top-4 z-50 flex justify-center px-4"
			)}
			initial={false}
			animate={{
				y: isScrolledPastBrand ? 0 : -6,
				opacity: 1
			}}
			transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
		>
			<motion.div
				className="rounded-2xl border px-5 py-3 md:px-6"
				initial={false}
				animate={{
					backgroundColor: isScrolledPastBrand
						? "rgba(244, 244, 246, 0.88)"
						: "rgba(244, 244, 246, 0)",
					borderColor: isScrolledPastBrand
						? "rgba(98, 133, 141, 0.3)"
						: "rgba(98, 133, 141, 0)",
					width: isScrolledPastBrand
						? "min(calc(100vw - 2rem), 1120px)"
						: "min(calc(100vw - 2rem), 1168px)",
					backdropFilter: isScrolledPastBrand ? "blur(10px)" : "blur(0px)"
				}}
				transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
			>
				<div className="flex items-center gap-4">
					<p className="text-sm font-semibold tracking-[0.08em] text-accent-text-dark-2">
						Caldius
					</p>

					<div className="relative ml-auto flex h-8 min-w-[18rem] items-center justify-end">
						<motion.p
							className="absolute right-0 text-right text-sm text-text-secondary"
							initial={false}
							animate={{
								x: isScrolledPastBrand ? -156 : 0
							}}
							transition={{ duration: 0.35, ease: "easeOut" }}
						>
							Ease-first dispatch system
						</motion.p>

						<motion.nav
							className="absolute right-0 flex items-center gap-2"
							initial={false}
							animate={{
								opacity: isScrolledPastBrand ? 1 : 0,
								x: isScrolledPastBrand ? 0 : 12
							}}
							transition={{ duration: 0.35, ease: "easeOut" }}
							style={{ pointerEvents: isScrolledPastBrand ? "auto" : "none" }}
						>
							<Link
								href="/login"
								className="rounded-lg border border-accent-text/30 px-3 py-1.5 text-xs font-semibold text-text-main transition-colors duration-200 hover:bg-background-primary"
							>
								Sign in
							</Link>
							<Link
								href="/login?register=1"
								className="rounded-lg bg-accent-main px-3 py-1.5 text-xs font-semibold text-white transition-opacity duration-200 hover:opacity-90"
							>
								Sign up
							</Link>
						</motion.nav>
					</div>
				</div>
			</motion.div>
		</motion.div>
	);
}
