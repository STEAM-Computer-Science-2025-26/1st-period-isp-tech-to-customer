import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";
import styles from "./page.module.css";
import WindFieldBackground from "@/components/marketing/WindFieldBackground";
import LandingFloatingHeader from "@/components/marketing/LandingFloatingHeader";
import { cn } from "@/lib/utils/index";

const headingFont = Space_Grotesk({
	subsets: ["latin"],
	weight: ["500", "700"]
});

const bodyFont = Manrope({
	subsets: ["latin"],
	weight: ["400", "500", "600"]
});

const frictionPoints = [
	"Dispatching in fewer clicks",
	"Full employee and customer records",
	"Real-time visibility for the whole team"
];

const flowSteps = [
	{
		title: "Plan quickly",
		description: "See open work, urgency, and location in one calm view."
	},
	{
		title: "Assign once",
		description: "Match the right technician and move on without extra steps."
	},
	{
		title: "Stay in sync",
		description: "Everyone sees updates instantly, from office to field."
	}
];

export default function LandingPage() {
	return (
		<main
			className={`${bodyFont.className} relative isolate min-h-screen overflow-hidden bg-background-main text-text-main`}
		>
			<LandingFloatingHeader targetId="landing-caldius-brand" />

			<div className={cn(`absolute top-0 inset-x-0 h-30 bg-linear-to-b from-background-main to-transparent z-20`)}></div>
			<div className={cn(`absolute left-0 inset-y-0 w-30 bg-linear-to-r from-background-main to-transparent z-20`)}></div>
			<div className={cn(`absolute right-0 inset-y-0 w-30 bg-linear-to-l from-background-main to-transparent z-20`)}></div>
			<WindFieldBackground interactionCoefficient={0.88} interactionRadius={190} />

			<div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(56rem_56rem_at_95%_-12%,rgba(83,171,177,0.26),transparent_62%),radial-gradient(42rem_42rem_at_-12%_28%,rgba(98,133,141,0.16),transparent_58%)]" />

			<div className="relative z-20 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-20 pt-8 md:px-10 lg:px-14">
				<div id="landing-caldius-brand" aria-hidden="true" className="h-px w-full" />

				<section className="mt-10 grid flex-1 items-start gap-16 lg:mt-16 lg:grid-cols-[1.15fr_0.85fr]">
					<div className="space-y-10">
						<p
							className={`${styles.heroEnter} ${styles.delay1} inline-flex rounded-full border border-accent-text/30 px-4 py-1 text-xs uppercase tracking-[0.14em] text-accent-text-dark bg-background-main`}
						>
							Low friction by design
						</p>

						<h1
							className={`${headingFont.className} ${styles.heroEnter} ${styles.delay2} max-w-4xl text-5xl leading-[1.05] bg-radial from-background-main from-50% to-transparent md:text-6xl lg:text-7xl`}
						>
							Schedule, Dispatch, then move on.
							<br className="hidden md:block" />
							No extra clicks.
						</h1>

						<p
							className={`${styles.heroEnter} ${styles.delay3} max-w-2xl text-base leading-relaxed text-text-secondary md:text-lg bg-radial from-background-main from-50% to-transparent`}
						>
							Caldius keeps scheduling, customers, and field status in one
							flow so your team can finish work faster with less admin drag.
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
								See live dashboard
							</Link>
						</div>

						<div
							className={`${styles.heroEnter} ${styles.delay5} grid gap-5 pt-10 md:grid-cols-3`}
						>
							{frictionPoints.map((point) => (
								<p
									key={point}
									className="border-l border-accent-text/35 pl-4 text-sm leading-relaxed text-text-secondary"
								>
									{point}
								</p>
							))}
						</div>
					</div>

					<div className={`${styles.heroEnter} ${styles.delay4} relative lg:pt-16 bg-radial from-background-main from-50% to-transparent`}>
						<div className="absolute left-4 top-4 h-[calc(100%-2rem)] w-px bg-accent-text/25 " />
						<ol className="space-y-10 pl-11">
							{flowSteps.map((step, index) => (
								<li key={step.title} className="relative">
									<span className="absolute -left-9 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-main text-[11px] font-semibold text-white">
										{index + 1}
									</span>
									<h2 className={`${headingFont.className} text-2xl leading-tight`}>
										{step.title}
									</h2>
									<p className="mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
										{step.description}
									</p>
								</li>
							))}
						</ol>

						<p className="mt-12 border-l-2 border-accent-main pl-4 text-sm leading-relaxed text-text-secondary">
							Built for teams that want faster dispatch decisions with less
							interface friction.
						</p>
					</div>
				</section>

				<section
					className={`${styles.heroEnter} ${styles.delay6} mt-16 border-t border-accent-text/20 pt-12 lg:mt-10`}
				>
					<div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-end">
						<h2
							className={`${headingFont.className} max-w-3xl text-3xl leading-tight md:text-4xl`}
						>
							Everything in position so your team can act without hesitation.
						</h2>
						<p className="max-w-xl text-base leading-relaxed text-text-secondary">
							This page is intentionally lightweight and easy to edit. Swap copy,
							adjust sections, and tune the message without untangling a heavy UI.
						</p>
					</div>
				</section>

				<section className="mt-24 border-t border-accent-text/20 pt-14 md:pt-20">
					<div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
						<div className="space-y-6">
							<p className="inline-flex rounded-full border border-accent-text/30 px-4 py-1 text-xs uppercase tracking-[0.14em] text-accent-text-dark">
								Built For Low Friction
							</p>
							<h3
								className={`${headingFont.className} max-w-2xl text-3xl leading-tight md:text-4xl`}
							>
								A calmer operating flow from first call to finished job.
							</h3>
							<p className="max-w-xl text-base leading-relaxed text-text-secondary">
								Your dispatch board, customer timeline, and field updates stay in sync
								so teams can focus on decisions instead of status chasing.
							</p>
						</div>

						<div className="space-y-8">
							<div className="border-l border-accent-text/35 pl-5">
								<p className="text-xs uppercase tracking-[0.12em] text-text-tertiary">
									Dispatch
								</p>
								<p className="mt-2 text-sm leading-relaxed text-text-secondary">
									Priorities, tech availability, and route context in one fast view.
								</p>
							</div>
							<div className="border-l border-accent-text/35 pl-5">
								<p className="text-xs uppercase tracking-[0.12em] text-text-tertiary">
									Customer Context
								</p>
								<p className="mt-2 text-sm leading-relaxed text-text-secondary">
									Service history and notes stay attached to every job handoff.
								</p>
							</div>
							<div className="border-l border-accent-text/35 pl-5">
								<p className="text-xs uppercase tracking-[0.12em] text-text-tertiary">
									Field Visibility
								</p>
								<p className="mt-2 text-sm leading-relaxed text-text-secondary">
									Live progress keeps office and technicians aligned without extra calls.
								</p>
							</div>
						</div>
					</div>
				</section>
			</div>

		</main>
	);
}
