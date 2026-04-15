"use client";
import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";
import styles from "./page.module.css";
import WindFieldBackground from "@/components/marketing/WindFieldBackground";
import LandingFloatingHeader from "@/components/marketing/LandingFloatingHeader";
import LandingScreenshotStack from "@/components/marketing/LandingScreenshotStack";
import { cn } from "@/lib/utils/index";
import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stage } from '@react-three/drei'
import { Model } from '@/components/Small-air-conditioner-unit'

const headingFont = Space_Grotesk({
	subsets: ["latin"],
	weight: ["500", "700"]
});

const bodyFont = Manrope({
	subsets: ["latin"],
	weight: ["400", "500", "600"]
});

export default function LandingPage() {
	const [isAirFlowActive, setIsAirFlowActive] = useState(false);

	return (
		<main
			className={`${bodyFont.className} relative isolate min-h-screen overflow-hidden bg-background-main text-text-main`}
		>
			<LandingFloatingHeader
				targetId="landing-caldius-brand"
				onStateChange={setIsAirFlowActive}
			/>

			<div
				data-particle-spawn-zone
				aria-hidden="true"
				className="pointer-events-none absolute left-0 top-0 h-[30vh] w-[22vw]"
			/>

			<div
				className={cn(
					`pointer-events-none z-10 absolute top-0 inset-x-0 h-30 bg-linear-to-b from-background-main to-transparent`
				)}
			></div>
			<div
				className={cn(
					`pointer-events-none z-10 absolute left-0 inset-y-0 w-30 bg-linear-to-r from-background-main to-transparent`
				)}
			></div>
			<div
				className={cn(
					`pointer-events-none z-10 absolute right-0 inset-y-0 w-30 bg-linear-to-l from-background-main to-transparent`
				)}
			></div>
			<WindFieldBackground
				interactionCoefficient={0.88}
				interactionRadius={190}
				flowActive={isAirFlowActive}
				spawnZoneSelector="[data-particle-spawn-zone]"
				intakeSelector="[data-particle-intake]"
				outletSelector="[data-particle-outlet]"
			/>

			<div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(56rem_56rem_at_95%_-12%,rgba(83,171,177,0.26),transparent_62%),radial-gradient(42rem_42rem_at_-12%_28%,rgba(98,133,141,0.16),transparent_58%)]" />

			<div className="relative z-20 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-20 pt-8 md:px-10 lg:px-14">
				<div
					id="landing-caldius-brand"
					aria-hidden="true"
					className="h-px w-full"
				/>

				<section className="mt-10 grid flex-1 items-start gap-16 lg:mt-16 lg:grid-cols-[1.15fr_0.85fr]">
					<div className="space-y-10">
						<p
							className={`${styles.heroEnter} ${styles.delay1} inline-flex rounded-full border border-accent-text/30 px-4 py-1 text-xs uppercase tracking-[0.14em] text-accent-text-dark bg-background-main`}
						>
							Low friction by design
						</p>

						<h1
							className={`${headingFont.className} ${styles.heroEnter} ${styles.delay2} max-w-4xl text-5xl leading-[1.1] bg-radial-[closest-side] from-background-main from-80% to-transparent md:text-6xl md:leading-[1.08] lg:text-7xl lg:leading-[1.05]`}
						>
							Schedule, Dispatch, then move on.{" "}
							<br className="hidden md:block" />
							No extra clicks.
						</h1>

						<p
							className={`${styles.heroEnter} ${styles.delay3} max-w-2xl text-base leading-relaxed text-text-secondary md:text-lg bg-radial-[closest-side] from-background-main from-50% to-transparent`}
						>
							Caldius keeps scheduling, customers, and field status in one flow
							so your team can finish work faster with less admin drag.
						</p>

						<div
							className={`${styles.heroEnter} ${styles.delay4} flex flex-wrap items-center gap-3`}
						>
							<Link
								href="/login"
								className="rounded-xl bg-accent-main px-5 py-3 text-sm font-semibold text-white shadow-sm transition-[transform,opacity] duration-200 hover:opacity-95 hover:-translate-y-px"
							>
								Start in seconds
							</Link>
							<Link
								href="/dashboard"
								className="rounded-xl bg-background-main border border-accent-text/35 px-5 py-3 text-sm font-semibold text-text-main transition-colors duration-200 hover:bg-background-primary"
							>
								See demo dashboard
							</Link>
						</div>
					</div>

					<div className={cn(` h-full`)}>
						<LandingScreenshotStack
							headingFontClassName={headingFont.className}
						/>
					</div>
				</section>
			</div>
			<div className={cn(`w-full relative h-88`)}>
			<div data-particle-intake className={cn(`w-88 dev top-28 h-36 absolute right-1/2 translate-x-1/2`)} /> {/* this red box represents the area of the 3d airconditioning model. i want particles to go towrards the top of this box. */}
			<div data-particle-outlet className={cn(`w-68 bg-blue-300/20 top-56 h-6 absolute right-1/2 translate-x-1/2`)} /> {/* this box represents where the output of the air conditioning vent is. i want particles to be emitted from this box. */}
				<Canvas className={cn(`h-full`)} shadows camera={{ position: [5, 5, 5], fov: 45 }}>
					<Suspense fallback={null}>
						<Stage environment="city" intensity={0.5}>
							<Model rotation={[-Math.PI / 5, Math.PI / 4, 0]} rotation-order="YXZ"
							/>
						</Stage>
					</Suspense>
				</Canvas>
			</div>
			<div className={cn(`h-screen`)}></div>
		</main>
	);
}
