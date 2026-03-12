"use client";

import { useState } from "react";
import ScorecardTool from "../../components/resources/scorecardTool";
import RevenueleakTool from "../../components/resources/revenueleakTool";
import CallbackTool from "../../components/resources/callbackTool";
import SeasonalTool from "../../components/resources/seasonalTool";
import RoiTool from "../../components/resources/roiTool";
import HiringTool from "../../components/resources/hiringTool";

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

interface LeadForm {
	firstName: string;
	lastName: string;
	email: string;
	businessName: string;
	phone: string;
	techCount: string;
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

// ─── Shared input styles ──────────────────────────────────────────────────────

function inputCls(hasError: boolean) {
	return [
		"w-full bg-white/5 border rounded-xl px-4 py-2.5 text-[14px] text-white",
		"placeholder:text-white/20 outline-none transition-colors",
		hasError
			? "border-destructive-background focus:border-destructive-background"
			: "border-white/10 focus:border-accent-main"
	].join(" ");
}

function selectCls(hasError: boolean) {
	return [
		"w-full bg-white/5 border rounded-xl px-4 py-2.5 text-[14px] text-white",
		"outline-none transition-colors cursor-pointer",
		hasError
			? "border-destructive-background"
			: "border-white/10 focus:border-accent-main"
	].join(" ");
}

function Field({
	label,
	hint,
	error,
	children
}: {
	label: string;
	hint?: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="flex items-center justify-between mb-1.5">
				<label className="text-[12px] font-medium text-white/50">{label}</label>
				{hint && <span className="text-[11px] text-white/25">{hint}</span>}
				{error && (
					<span className="text-[11px] text-destructive-foreground">
						{error}
					</span>
				)}
			</div>
			{children}
		</div>
	);
}

// ─── Full-page lead gate ──────────────────────────────────────────────────────

function LeadGate({ onUnlock }: { onUnlock: (email: string) => void }) {
	const [form, setForm] = useState<LeadForm>({
		firstName: "",
		lastName: "",
		email: "",
		businessName: "",
		phone: "",
		techCount: ""
	});
	const [errors, setErrors] = useState<Partial<Record<keyof LeadForm, string>>>(
		{}
	);
	const [submitting, setSubmitting] = useState(false);

	function set(key: keyof LeadForm) {
		return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
			setForm((f) => ({ ...f, [key]: e.target.value }));
			setErrors((prev) => ({ ...prev, [key]: undefined }));
		};
	}

	function validate(): boolean {
		const next: Partial<Record<keyof LeadForm, string>> = {};
		if (!form.firstName.trim()) next.firstName = "Required";
		if (!form.lastName.trim()) next.lastName = "Required";
		if (!form.email.trim() || !form.email.includes("@"))
			next.email = "Valid email required";
		if (!form.businessName.trim()) next.businessName = "Required";
		if (
			!form.techCount.trim() ||
			isNaN(Number(form.techCount)) ||
			Number(form.techCount) < 0
		)
			next.techCount = "Select one";
		setErrors(next);
		return Object.keys(next).length === 0;
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!validate()) return;
		setSubmitting(true);
		try {
			await fetch("/api/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: form.email.trim().toLowerCase(),
					firstName: form.firstName.trim(),
					lastName: form.lastName.trim(),
					businessName: form.businessName.trim(),
					phone: form.phone.trim() || undefined,
					techCount: Number(form.techCount),
					source: "resource_hub"
				})
			});
		} catch {
			// fail silently — still unlock
		}
		onUnlock(form.email.trim().toLowerCase());
	}

	return (
		<div className="min-h-screen bg-background-main flex">
			{/* ── Left: branding + tool preview ── */}
			<div className="hidden lg:flex flex-col justify-between w-[460px] shrink-0 bg-foreground px-14 py-16">
				<div>
					{/* Logo */}
					<div className="flex items-center gap-3 mb-16">
						<div className="w-9 h-9 rounded-xl bg-accent-main flex items-center justify-center text-white font-bold text-sm font-mono shrink-0">
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

					{/* Badge */}
					<div className="inline-flex items-center gap-2 bg-accent-main/10 border border-accent-main/20 text-accent-main font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full mb-8">
						<span className="w-1.5 h-1.5 rounded-full bg-accent-main animate-pulse" />
						Free · No credit card · Instant access
					</div>

					<h1 className="text-4xl font-bold text-white tracking-tight leading-[1.1] mb-5">
						Stop running your
						<br />
						HVAC business <span className="text-accent-main">blind.</span>
					</h1>

					<p className="text-[15px] text-white/40 leading-relaxed mb-10">
						Six free tools that show you exactly where your business is leaking
						money, losing customers, and leaving capacity on the table.
					</p>

					{/* Tool list preview */}
					<div className="space-y-3.5">
						{TOOLS.map((tool) => (
							<div key={tool.id} className="flex items-center gap-3">
								<span className="text-base">{tool.icon}</span>
								<span className="text-[13px] text-white/50 flex-1">
									{tool.name}
								</span>
								<span
									className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${tool.tagColor}`}
								>
									{tool.tag}
								</span>
							</div>
						))}
					</div>
				</div>

				<p className="text-[11px] text-white/15">
					No spam. No credit card. Built for HVAC operators.
				</p>
			</div>

			{/* ── Right: form ── */}
			<div className="flex-1 flex items-center justify-center px-6 py-12">
				<div className="w-full max-w-md">
					{/* Mobile logo */}
					<div className="flex items-center gap-3 mb-10 lg:hidden">
						<div className="w-9 h-9 rounded-xl bg-accent-main flex items-center justify-center text-white font-bold text-sm font-mono shrink-0">
							TC
						</div>
						<div>
							<div className="text-sm font-semibold text-white">
								Tech to Customer
							</div>
							<div className="text-[10px] text-white/30 font-mono tracking-widest uppercase">
								Free Resource Kit
							</div>
						</div>
					</div>

					<h2 className="text-2xl font-bold text-white tracking-tight mb-1">
						Get free access
					</h2>
					<p className="text-[14px] text-white/40 mb-8">
						Tell us about your business — takes 30 seconds.
					</p>

					<form onSubmit={handleSubmit} className="space-y-4" noValidate>
						<div className="grid grid-cols-2 gap-3">
							<Field label="First name" error={errors.firstName}>
								<input
									type="text"
									placeholder="Jane"
									value={form.firstName}
									onChange={set("firstName")}
									className={inputCls(!!errors.firstName)}
								/>
							</Field>
							<Field label="Last name" error={errors.lastName}>
								<input
									type="text"
									placeholder="Smith"
									value={form.lastName}
									onChange={set("lastName")}
									className={inputCls(!!errors.lastName)}
								/>
							</Field>
						</div>

						<Field label="Work email" error={errors.email}>
							<input
								type="email"
								placeholder="jane@acmehvac.com"
								value={form.email}
								onChange={set("email")}
								className={inputCls(!!errors.email)}
							/>
						</Field>

						<Field label="Business name" error={errors.businessName}>
							<input
								type="text"
								placeholder="Acme HVAC & Cooling"
								value={form.businessName}
								onChange={set("businessName")}
								className={inputCls(!!errors.businessName)}
							/>
						</Field>

						<Field label="Phone number" hint="Optional">
							<input
								type="tel"
								placeholder="(555) 000-0000"
								value={form.phone}
								onChange={set("phone")}
								className={inputCls(false)}
							/>
						</Field>

						<Field label="How many techs do you have?" error={errors.techCount}>
							<select
								value={form.techCount}
								onChange={set("techCount")}
								className={selectCls(!!errors.techCount)}
							>
								<option value="">Select range…</option>
								<option value="1">Just me</option>
								<option value="2">2–4 techs</option>
								<option value="5">5–9 techs</option>
								<option value="10">10–24 techs</option>
								<option value="25">25–49 techs</option>
								<option value="50">50+ techs</option>
							</select>
						</Field>

						<button
							type="submit"
							disabled={submitting}
							className="w-full bg-accent-main text-white rounded-xl py-3 text-[14px] font-semibold font-mono tracking-tight hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
						>
							{submitting ? "One moment…" : "Unlock All 6 Tools →"}
						</button>

						<p className="text-center text-[11px] text-white/20 pt-1">
							No spam, ever. Unsubscribe anytime.
						</p>
					</form>
				</div>
			</div>
		</div>
	);
}

// ─── Post-unlock: sidebar nav item ───────────────────────────────────────────

function NavItem({
	tool,
	active,
	onClick
}: {
	tool: Tool;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-left transition-colors relative ${
				active ? "bg-accent-main/10" : "hover:bg-white/5"
			}`}
		>
			{active && (
				<span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent-main rounded-r-full" />
			)}
			<span className="text-base shrink-0">{tool.icon}</span>
			<span
				className={`text-[13px] font-medium truncate ${
					active ? "text-white" : "text-white/50"
				}`}
			>
				{tool.name}
			</span>
		</button>
	);
}

// ─── Post-unlock: tool card in hero grid ─────────────────────────────────────

function ToolCard({ tool, onClick }: { tool: Tool; onClick: () => void }) {
	return (
		<button
			onClick={onClick}
			className="group text-left bg-white rounded-2xl p-5 border border-background-secondary hover:border-accent-main/30 hover:shadow-lg transition-all"
		>
			<div className="flex items-start justify-between mb-3">
				<span className="text-2xl">{tool.icon}</span>
				<span
					className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${tool.tagColor}`}
				>
					{tool.tag}
				</span>
			</div>
			<div className="text-[13px] font-semibold text-foreground mb-1 leading-snug">
				{tool.name}
			</div>
			<p className="text-[12px] text-text-tertiary leading-snug">{tool.desc}</p>
		</button>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResourceHubPage() {
	const [email, setEmail] = useState("");
	const [activeTool, setActiveTool] = useState<ToolId | null>(null);

	const currentTool = TOOLS.find((t) => t.id === activeTool) ?? null;
	const ToolComponent = currentTool?.component ?? null;

	// Full-page gate — replaces entire screen until submitted
	if (!email) {
		return <LeadGate onUnlock={setEmail} />;
	}

	// Post-unlock: sidebar + main tool layout
	return (
		<div className="flex h-screen overflow-hidden bg-background-main">
			{/* ── Sidebar ── */}
			<aside className="w-70 shrink-0 flex flex-col bg-foreground overflow-hidden border-r border-foreground">
				{/* Logo */}
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

				{/* Unlocked badge */}
				<div className="px-5 py-3 border-b border-white/5">
					<div className="flex items-center gap-2 bg-success-background/10 border border-success-background/20 rounded-lg px-3 py-2">
						<span className="text-success-foreground text-sm">✓</span>
						<span className="text-[12px] text-success-foreground font-medium truncate">
							{email}
						</span>
					</div>
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
						onClick={() => setActiveTool(TOOLS[0].id)}
					/>

					<div className="px-5 mb-2 mt-3">
						<span className="text-[9px] font-mono tracking-widest uppercase text-white/20">
							Calculators & Planners
						</span>
					</div>
					{TOOLS.slice(1).map((tool) => (
						<NavItem
							key={tool.id}
							tool={tool}
							active={activeTool === tool.id}
							onClick={() => setActiveTool(tool.id)}
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
				{!activeTool ? (
					/* Hero + tool grid */
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

							<div className="grid grid-cols-3 gap-3 mb-12">
								{TOOLS.map((tool) => (
									<ToolCard
										key={tool.id}
										tool={tool}
										onClick={() => setActiveTool(tool.id)}
									/>
								))}
							</div>

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
				) : (
					/* Active tool view */
					<div className="flex-1 flex flex-col overflow-hidden">
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
						<div className="flex-1 overflow-y-auto">
							{ToolComponent && <ToolComponent email={email} />}
						</div>
					</div>
				)}
			</main>
		</div>
	);
}
