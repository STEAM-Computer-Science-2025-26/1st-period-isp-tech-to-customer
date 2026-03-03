"use client";

import { useState } from "react";
import ScorecardTool from "../../../components/resources/scorecardTool";
import RevenueleakTool from "../../../components/resources/revenueleakTool";
import CallbackTool from "../../../components/resources/callbackTool";
import SeasonalTool from "../../../components/resources/seasonalTool";
import RoiTool from "../../../components/resources/roiTool";
import HiringTool from "../../../components/resources/hiringTool";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolId =
	| "scorecard"
	| "revenue-leak"
	| "callback"
	| "seasonal"
	| "roi"
	| "hiring";

interface Tool {
	id: ToolId;
	name: string;
	icon: string;
	tag: string;
	tagColor: string;
	desc: string;
	component: React.FC<{ email: string }>;
}

// ─── Tool registry ────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
	{
		id: "scorecard",
		name: "Business Health Scorecard",
		icon: "📋",
		tag: "Diagnostic",
		tagColor: "bg-success-background/20 text-success-foreground",
		desc: "25 questions across 5 categories. Grade, breakdown, and custom action plan.",
		component: ScorecardTool
	},
	{
		id: "revenue-leak",
		name: "Revenue Leak Calculator",
		icon: "💧",
		tag: "Calculator",
		tagColor: "bg-destructive-background/10 text-destructive-foreground",
		desc: "How much are callbacks, missed reviews, and lapsed agreements costing you?",
		component: RevenueleakTool
	},
	{
		id: "callback",
		name: "Callback Cost Calculator",
		icon: "🔁",
		tag: "Calculator",
		tagColor: "bg-destructive-background/10 text-destructive-foreground",
		desc: "Labor, margin erosion, and churned customers — the real bill per return visit.",
		component: CallbackTool
	},
	{
		id: "seasonal",
		name: "Seasonal Capacity Planner",
		icon: "☀️",
		tag: "Planner",
		tagColor: "bg-warning-background/30 text-warning-foreground",
		desc: "How many jobs are you losing when summer hits? Find out before it does.",
		component: SeasonalTool
	},
	{
		id: "roi",
		name: "ROI Calculator",
		icon: "📈",
		tag: "Calculator",
		tagColor: "bg-accent-main/10 text-accent-text-dark",
		desc: "What does TTC actually return on your investment? See your payback period.",
		component: RoiTool
	},
	{
		id: "hiring",
		name: "Hiring vs. Software ROI",
		icon: "⚖️",
		tag: "Decision Tool",
		tagColor: "bg-accent-main/10 text-accent-text-dark",
		desc: "About to hire another tech? Run these numbers first.",
		component: HiringTool
	}
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResourceHubPage() {
	const [email, setEmail] = useState("");
	const [emailInput, setEmailInput] = useState("");
	const [emailError, setEmailError] = useState(false);
	const [activeTool, setActiveTool] = useState<ToolId | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const unlocked = !!email;
	const currentTool = TOOLS.find((t) => t.id === activeTool) ?? null;
	const ToolComponent = currentTool?.component ?? null;

	async function handleUnlock() {
		const val = emailInput.trim().toLowerCase();
		if (!val || !val.includes("@")) {
			setEmailError(true);
			return;
		}
		setEmailError(false);
		setSubmitting(true);

		try {
			await fetch("/api/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: val, source: "resource_hub" })
			});
		} catch {
			// fail silently — still unlock
		}

		setEmail(val);
		setSubmitting(false);
	}

	function handleToolClick(id: ToolId) {
		if (!unlocked) {
			// Scroll sidebar gate into view (mobile workaround)
			document.getElementById("gate-input")?.focus();
			return;
		}
		setActiveTool(id);
	}

	return (
		<div className="flex h-screen overflow-hidden bg-background-main">
			{/* ── Sidebar ── */}
			<aside className="w-70 shrink-0 flex flex-col bg-foreground overflow-hidden border-r border-foreground">
				{/* Logo + kit label */}
				<div className="px-5 pt-7 pb-5 border-b border-white/5">
					<div className="flex items-center gap-2.5 mb-5">
						<div className="w-8 h-8 rounded-lg bg-accent-main flex items-center justify-center text-white font-bold text-sm font-mono shrink-0">
							TC
						</div>
						<div>
							<div className="text-sm font-semibold text-white leading-tight">
								Tech to Customer
							</div>
							<div className="text-[10px] text-white/30 font-mono tracking-widest uppercase">
								HVAC Management
							</div>
						</div>
					</div>
					<div className="text-[9px] font-mono tracking-widest uppercase text-white/20 mb-1">
						Free Resource Kit
					</div>
					<div className="text-[13px] font-semibold text-white leading-snug">
						HVAC Business Growth Toolkit
					</div>
				</div>

				{/* Email gate */}
				<div className="px-5 py-4 border-b border-white/5">
					{!unlocked ? (
						<>
							<p className="text-[12px] text-white/30 mb-3 leading-relaxed">
								Enter your email to{" "}
								<span className="text-white/60 font-medium">
									unlock all 6 tools
								</span>{" "}
								instantly.
							</p>
							<input
								id="gate-input"
								type="email"
								value={emailInput}
								onChange={(e) => {
									setEmailInput(e.target.value);
									setEmailError(false);
								}}
								onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
								placeholder="you@yourbusiness.com"
								className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-white/20 outline-none mb-2 transition-colors ${
									emailError
										? "border-destructive-background"
										: "border-white/10 focus:border-accent-main"
								}`}
							/>
							<button
								onClick={handleUnlock}
								disabled={submitting}
								className="w-full bg-accent-main text-white rounded-lg py-2 text-[13px] font-mono font-semibold tracking-tight cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
							>
								{submitting ? "Unlocking…" : "Unlock Free Access →"}
							</button>
						</>
					) : (
						<div className="flex items-center gap-2 bg-success-background/10 border border-success-background/20 rounded-lg px-3 py-2.5">
							<span className="text-success-foreground text-sm">✓</span>
							<span className="text-[12px] text-success-foreground font-medium">
								Unlocked — all tools are yours
							</span>
						</div>
					)}
				</div>

				{/* Nav */}
				<nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
					<div className="px-5 mb-2 mt-1">
						<span className="text-[9px] font-mono tracking-widest uppercase text-white/20">
							Diagnostic
						</span>
					</div>
					<NavItem
						tool={TOOLS[0]}
						active={activeTool === TOOLS[0].id}
						locked={!unlocked}
						onClick={() => handleToolClick(TOOLS[0].id)}
					/>

					<div className="px-5 mb-2 mt-3">
						<span className="text-[9px] font-mono tracking-widest uppercase text-white/20">
							Calculators
						</span>
					</div>
					{TOOLS.slice(1).map((tool) => (
						<NavItem
							key={tool.id}
							tool={tool}
							active={activeTool === tool.id}
							locked={!unlocked}
							onClick={() => handleToolClick(tool.id)}
						/>
					))}
				</nav>

				{/* Footer CTAs */}
				<div className="px-5 py-4 border-t border-white/5">
					<button className="w-full bg-accent-main text-white rounded-lg py-2.5 text-[13px] font-semibold mb-2 hover:opacity-90 transition-opacity">
						Start Free Trial →
					</button>
					<button className="w-full bg-transparent text-white/30 border border-white/10 rounded-lg py-2 text-[12px] font-medium hover:border-white/25 hover:text-white/60 transition-all">
						Book a 20-min Demo
					</button>
				</div>
			</aside>

			{/* ── Main ── */}
			<main className="flex-1 overflow-hidden flex flex-col">
				{/* Hero — shown when no tool active */}
				{!activeTool && (
					<div className="flex-1 overflow-y-auto px-12 py-14">
						<div className="max-w-3xl">
							<div className="inline-flex items-center gap-2 bg-accent-main/10 border border-accent-main/20 text-accent-main font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full mb-6">
								<span className="w-1.5 h-1.5 rounded-full bg-accent-main animate-pulse" />
								Free · No Credit Card · Instant Access
							</div>

							<h1 className="text-5xl font-bold text-foreground tracking-tight leading-[1.08] mb-4">
								Stop Running Your
								<br />
								HVAC Business <span className="text-accent-main">Blind.</span>
							</h1>

							<p className="text-[16px] text-text-secondary max-w-lg leading-relaxed mb-10">
								Six free tools that show you exactly where your business is
								leaking money, losing customers, and leaving capacity on the
								table.
							</p>

							{/* Tool grid */}
							<div className="grid grid-cols-3 gap-3 mb-12">
								{TOOLS.map((tool, i) => (
									<ToolCard
										key={tool.id}
										tool={tool}
										locked={!unlocked}
										onClick={() => handleToolClick(tool.id)}
										delay={i * 0.05}
									/>
								))}
							</div>

							{/* Stats */}
							<div className="flex gap-8 flex-wrap pt-8 border-t border-background-secondary">
								{[
									{ val: "6", label: "Free tools, no paywall" },
									{ val: "5 min", label: "To complete the scorecard" },
									{ val: "$0", label: "Cost to access everything" },
									{ val: "CSV", label: "Export your full report" }
								].map((s) => (
									<div key={s.label}>
										<div className="text-2xl font-bold text-foreground tracking-tight">
											<span className="text-accent-main">{s.val}</span>
										</div>
										<div className="text-[12px] text-text-tertiary mt-0.5">
											{s.label}
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				)}

				{/* Tool view — shown when a tool is active */}
				{activeTool && ToolComponent && (
					<div className="flex-1 flex flex-col overflow-hidden">
						{/* Topbar */}
						<div className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-background-secondary shrink-0">
							<div className="flex items-center gap-2.5">
								<span className="text-lg">{currentTool?.icon}</span>
								<span className="text-[14px] font-semibold text-foreground tracking-tight">
									{currentTool?.name}
								</span>
								<span
									className={`font-mono text-[9px] tracking-widest uppercase px-2 py-0.5 rounded ${currentTool?.tagColor}`}
								>
									{currentTool?.tag}
								</span>
							</div>
							<button
								onClick={() => setActiveTool(null)}
								className="text-[12px] text-text-tertiary hover:text-text-main flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-background-primary transition-all"
							>
								← All Tools
							</button>
						</div>

						{/* Tool content */}
						<div className="flex-1 overflow-y-auto">
							<ToolComponent email={email} />
						</div>
					</div>
				)}
			</main>
		</div>
	);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavItem({
	tool,
	active,
	locked,
	onClick
}: {
	tool: Tool;
	active: boolean;
	locked: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-left transition-colors relative ${
				active
					? "bg-accent-main/10"
					: locked
						? "opacity-40 cursor-default"
						: "hover:bg-white/[0.03] cursor-pointer"
			}`}
		>
			{active && (
				<span className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-main rounded-r" />
			)}
			<span className="text-sm shrink-0">{tool.icon}</span>
			<div className="flex-1 min-w-0">
				<div
					className={`text-[12px] font-medium leading-tight truncate ${active ? "text-accent-main" : "text-white/60"}`}
				>
					{tool.name}
				</div>
				<div className="text-[10px] text-white/20 mt-0.5 truncate">
					{tool.desc.split(".")[0]}
				</div>
			</div>
			{locked && <span className="text-[10px] text-white/20 shrink-0">🔒</span>}
		</button>
	);
}

function ToolCard({
	tool,
	locked,
	onClick,
	delay
}: {
	tool: Tool;
	locked: boolean;
	onClick: () => void;
	delay: number;
}) {
	return (
		<div
			onClick={onClick}
			style={{ animationDelay: `${delay}s` }}
			className={`bg-white border border-background-secondary rounded-xl p-4 relative overflow-hidden transition-all ${
				locked
					? "cursor-pointer hover:border-accent-main/50"
					: "cursor-pointer hover:border-accent-main hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent-main/10"
			}`}
		>
			{locked && (
				<div className="absolute inset-0 bg-background-main/60 backdrop-blur-[2px] rounded-xl flex flex-col items-center justify-center gap-1 z-10">
					<span className="text-xl">🔒</span>
					<span className="font-mono text-[9px] tracking-widest uppercase text-text-tertiary">
						Unlock free
					</span>
				</div>
			)}
			<div className="text-2xl mb-3">{tool.icon}</div>
			<div className="text-[13px] font-semibold text-foreground mb-1.5 leading-snug">
				{tool.name}
			</div>
			<div className="text-[11px] text-text-tertiary leading-relaxed mb-3">
				{tool.desc}
			</div>
			<span
				className={`inline-flex font-mono text-[9px] tracking-widest uppercase px-2 py-1 rounded ${tool.tagColor}`}
			>
				{tool.tag}
			</span>
		</div>
	);
}
