"use client";

import { useState } from "react";

function fmt(n: number) {
	if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
	if (n >= 1_000) return "$" + Math.round(n / 1_000) + "k";
	return "$" + Math.round(n).toLocaleString();
}

function ttcPrice(t: number) {
	return t <= 3 ? 149 : t <= 6 ? 199 : t <= 10 ? 299 : 399;
}

function Slider({
	label,
	question,
	value,
	min,
	max,
	step,
	onChange,
	display
}: {
	label: string;
	question: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	display: string;
}) {
	return (
		<div className="bg-white border border-background-secondary rounded-xl p-5">
			<div className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-1">
				{label}
			</div>
			<div className="text-[13px] font-medium text-text-primary mb-3 leading-snug">
				{question}
			</div>
			<div className="text-[28px] font-bold text-accent-main tracking-tight mb-2.5 leading-none">
				{display}
			</div>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(+e.target.value)}
				className="w-full h-1 rounded-full outline-none cursor-pointer accent-accent-main"
			/>
			<div className="flex justify-between mt-1.5 font-mono text-[10px] text-text-tertiary">
				<span>{min}</span>
				<span>{max}</span>
			</div>
		</div>
	);
}

export default function HiringTool({ email: _ }: { email: string }) {
	const [trucks, setTrucks] = useState(6);
	const [rev, setRev] = useState(340);
	const [jtd, setJtd] = useState(35); // /10 = 3.5
	const [salary, setSalary] = useState(52); // *1000
	const [burden, setBurden] = useState(28);
	const [onboard, setOnboard] = useState(4); // *1000
	const [ramp, setRamp] = useState(3);
	const [truck, setTruck] = useState(28); // *1000

	const WORK_DAYS = 250;
	const jtdVal = jtd / 10;
	const totalComp = salary * 1000 * (1 + burden / 100);
	const rampLoss = (totalComp / 12) * ramp * 0.4;
	const hireYear1 = totalComp + onboard * 1000 + truck * 1000 + rampLoss;
	const rampDays = (ramp / 12) * WORK_DAYS;
	const fullDays = WORK_DAYS - rampDays;
	const revHire = rampDays * jtdVal * 0.6 * rev + fullDays * jtdVal * rev;
	const monthlyTTC = ttcPrice(trucks);
	const ttcYear1 = monthlyTTC * 12;
	const currentRev = trucks * jtdVal * WORK_DAYS * rev;
	const dispGain = currentRev * 0.15;
	const cbSave = currentRev * 0.03;
	const revTTC = dispGain + cbSave;
	const netHire = hireYear1 - revHire;
	const netTTC = ttcYear1 - revTTC;
	const saved = netHire - netTTC;
	const payback = Math.round(ttcYear1 / (revTTC / 365));
	const roi = Math.round(((revTTC - ttcYear1) / ttcYear1) * 100);
	const maxBar = Math.max(hireYear1, ttcYear1, 1);

	const desc =
		saved > 0
			? `Hiring costs <strong>${fmt(hireYear1)}</strong> in Year 1 — salary, burden, truck, onboarding, and ${ramp} months of ramp at partial output. TTC costs <strong>${fmt(ttcYear1)}</strong> and unlocks <strong>${fmt(revTTC)}</strong> from your existing team. Gap in your favor: <strong>${fmt(saved)}</strong>.`
			: `At your team size and revenue, hiring generates more net revenue in Year 1. But TTC still costs <strong>${fmt(ttcYear1)}</strong> vs <strong>${fmt(hireYear1)}</strong> for the hire — and software doesn't ask for PTO, call out sick, or quit after 8 months. Most operators run both.`;

	return (
		<div className="max-w-[900px] mx-auto px-6 py-10 pb-16">
			<div className="mb-8">
				<div className="inline-flex items-center gap-1.5 bg-success-foreground text-white font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded mb-4">
					<span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
					Final Decision Tool
				</div>
				<h1 className="text-3xl font-bold text-foreground tracking-tight leading-tight mb-2">
					New Tech or <span className="text-accent-main">Smarter Software</span>
					?<br />
					See the Real Numbers.
				</h1>
				<p className="text-[14px] text-text-secondary max-w-lg leading-relaxed">
					Before you sign an offer letter, run these numbers. The answer might
					surprise you.
				</p>
			</div>

			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">
				Your business today
			</p>
			<div className="grid grid-cols-3 gap-3 mb-3">
				<Slider
					label="Trucks / Techs"
					question="How many trucks currently running?"
					value={trucks}
					min={1}
					max={30}
					step={1}
					onChange={setTrucks}
					display={`${trucks} trucks`}
				/>
				<Slider
					label="Avg Job Revenue"
					question="Revenue per completed job"
					value={rev}
					min={100}
					max={1500}
					step={10}
					onChange={setRev}
					display={`$${rev.toLocaleString()}`}
				/>
				<Slider
					label="Jobs / Tech / Day"
					question="Jobs one tech completes daily"
					value={jtd}
					min={10}
					max={100}
					step={5}
					onChange={setJtd}
					display={`${jtdVal.toFixed(1)} jobs`}
				/>
			</div>

			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">
				The hire you're considering
			</p>
			<div className="grid grid-cols-2 gap-3 mb-3">
				<Slider
					label="Annual Salary"
					question="Base salary for the tech you'd hire"
					value={salary}
					min={30}
					max={100}
					step={1}
					onChange={setSalary}
					display={`$${salary}k/yr`}
				/>
				<Slider
					label="Burden Rate"
					question="Benefits, payroll tax, insurance on top of salary"
					value={burden}
					min={15}
					max={50}
					step={1}
					onChange={setBurden}
					display={`${burden}%`}
				/>
			</div>
			<div className="grid grid-cols-3 gap-3 mb-3">
				<Slider
					label="Onboarding"
					question="One-time cost to get them up to speed"
					value={onboard}
					min={0}
					max={20}
					step={1}
					onChange={setOnboard}
					display={`$${onboard}k`}
				/>
				<Slider
					label="Ramp Time"
					question="Months until fully productive"
					value={ramp}
					min={1}
					max={9}
					step={1}
					onChange={setRamp}
					display={`${ramp} mo`}
				/>
				<Slider
					label="Truck + Equipment"
					question="Vehicle, tools, and gear"
					value={truck}
					min={0}
					max={80}
					step={2}
					onChange={setTruck}
					display={`$${truck}k`}
				/>
			</div>

			{/* Head-to-head */}
			<div className="grid grid-cols-2 gap-3 mb-3">
				{/* Hiring */}
				<div className="bg-white border-2 border-background-secondary rounded-xl p-6">
					<div className="inline-flex font-mono text-[10px] tracking-widest uppercase bg-background-primary text-text-tertiary px-2.5 py-1 rounded mb-3">
						Option A
					</div>
					<div className="text-[15px] font-bold text-foreground mb-1.5 tracking-tight">
						Hire a New Tech
					</div>
					<div className="text-[36px] font-bold text-destructive-background tracking-tight leading-none mb-1">
						{fmt(hireYear1)}
					</div>
					<div className="font-mono text-[11px] text-text-tertiary mb-5">
						Year 1 all-in cost
					</div>
					<div className="border-t border-background-primary pt-4 space-y-2.5">
						{[
							{ icon: "💸", text: `Salary + burden: ${fmt(totalComp)}/yr` },
							{ icon: "⏳", text: `Ramp: ${ramp} months at ~60% output` },
							{
								icon: "🚛",
								text: `Truck + equipment: ${fmt(truck * 1000)} upfront`
							},
							{
								icon: "📋",
								text: `Onboarding: ${fmt(onboard * 1000)} one-time`
							},
							{ icon: "📈", text: `Revenue added in Year 1: ${fmt(revHire)}` }
						].map((r) => (
							<div
								key={r.icon}
								className="flex items-start gap-2.5 text-[12px] text-text-secondary"
							>
								<span>{r.icon}</span>
								<span>{r.text}</span>
							</div>
						))}
					</div>
				</div>

				{/* TTC */}
				<div
					className="border-2 border-accent-main rounded-xl p-6"
					style={{
						background: "linear-gradient(135deg, #1e3a3f 0%, #0f2124 100%)"
					}}
				>
					<div className="inline-flex font-mono text-[10px] tracking-widest uppercase bg-accent-main/20 text-accent-main px-2.5 py-1 rounded mb-3">
						Option B
					</div>
					<div className="text-[15px] font-bold text-white mb-1.5 tracking-tight">
						Get TTC
					</div>
					<div className="text-[36px] font-bold text-accent-main tracking-tight leading-none mb-1">
						{fmt(ttcYear1)}
					</div>
					<div className="font-mono text-[11px] text-white/30 mb-5">
						Year 1 total cost
					</div>
					<div className="border-t border-white/10 pt-4 space-y-2.5">
						{[
							{ icon: "⚡", text: "+15–25% more jobs/day from dispatch" },
							{ icon: "🔁", text: "30–50% fewer callbacks" },
							{ icon: "📋", text: "Auto-renewal alerts on agreements" },
							{ icon: "📊", text: "Live in days, not months" },
							{ icon: "📈", text: `Revenue unlocked in Year 1: ${fmt(revTTC)}` }
						].map((r) => (
							<div
								key={r.icon}
								className="flex items-start gap-2.5 text-[12px] text-white/50"
							>
								<span>{r.icon}</span>
								<span>{r.text}</span>
							</div>
						))}
					</div>
					<div className="mt-4 inline-flex items-center gap-2 bg-accent-main/15 border border-accent-main/25 rounded-lg px-3 py-1.5 font-mono text-[12px] text-accent-main">
						Your plan:{" "}
						<span className="font-bold text-[15px]">${monthlyTTC}/mo</span>
					</div>
				</div>
			</div>

			{/* Verdict */}
			<div className="bg-foreground rounded-xl p-6 mb-3">
				<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-3">
					The Verdict
				</div>
				<div className="flex items-baseline gap-3 flex-wrap mb-2">
					<span className="text-[48px] font-bold text-success-background tracking-tight leading-none">
						{fmt(Math.abs(saved))}
					</span>
					<span className="text-[15px] text-white/40">
						saved in Year 1 by choosing TTC over hiring
					</span>
				</div>
				<div
					className="text-[13px] text-white/50 leading-relaxed mb-5 max-w-2xl"
					dangerouslySetInnerHTML={{ __html: desc }}
				/>
				<div className="border-t border-white/10 pt-5 flex gap-8 flex-wrap">
					{[
						{
							label: "TTC Pays for Itself In",
							val: `${payback} days`,
							color: "text-success-background"
						},
						{
							label: "Revenue Unlocked / Year",
							val: fmt(revTTC),
							color: "text-accent-main"
						},
						{
							label: "Net ROI on TTC",
							val: `${roi}×`,
							color: "text-accent-main"
						}
					].map((k) => (
						<div key={k.label}>
							<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-1">
								{k.label}
							</div>
							<div
								className={`text-[22px] font-bold tracking-tight ${k.color}`}
							>
								{k.val}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Timeline */}
			<div className="bg-white border border-background-secondary rounded-xl p-6 mb-3">
				<div className="text-[13px] font-semibold text-foreground mb-1">
					12-Month Cost Comparison
				</div>
				<div className="text-[12px] text-text-tertiary mb-5">
					What you spend each route, annualized
				</div>
				{[
					{ label: "Hiring — Year 1 all-in", amt: hireYear1, color: "#c9184a" },
					{
						label: "TTC — Year 1 subscription",
						amt: ttcYear1,
						color: "#53abb1"
					}
				].map((row) => (
					<div key={row.label} className="mb-4">
						<div className="flex justify-between mb-1.5">
							<span className="text-[12px] font-medium text-text-main">
								{row.label}
							</span>
							<span className="font-mono text-[12px] text-text-secondary">
								{fmt(row.amt)}
							</span>
						</div>
						<div className="h-2.5 bg-background-primary rounded-full overflow-hidden">
							<div
								className="h-full rounded-full transition-all duration-500"
								style={{
									width: `${Math.min(100, (row.amt / maxBar) * 100)}%`,
									background: row.color
								}}
							/>
						</div>
					</div>
				))}
				<div className="grid grid-cols-12 mt-1">
					{["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map(
						(m, i) => (
							<div
								key={i}
								className="font-mono text-[8px] text-text-tertiary text-center"
							>
								{m}
							</div>
						)
					)}
				</div>
			</div>

			{/* Final CTA */}
			<div
				className="rounded-xl p-10 text-center"
				style={{
					background: "linear-gradient(135deg, #42585e 0%, #152427 100%)"
				}}
			>
				<div className="font-mono text-[10px] tracking-widest uppercase text-white/20 mb-3">
					You've seen the numbers. Now act on them.
				</div>
				<h2 className="text-[28px] font-bold text-white tracking-tight leading-tight mb-3">
					Get the results of a new hire
					<br />
					<span className="text-accent-main">without the $60k price tag.</span>
				</h2>
				<p className="text-[14px] text-white/35 max-w-md mx-auto leading-relaxed mb-7">
					TTC gives your existing team the dispatch intelligence to outperform a
					team twice their size. Start free. No credit card. No contracts.
				</p>
				<div className="flex items-center justify-center gap-3 flex-wrap mb-4">
					<button className="bg-accent-main text-white rounded-lg px-7 py-3 text-[15px] font-semibold hover:opacity-90 transition-opacity">
						Start Free Trial →
					</button>
					<button className="bg-transparent text-white/40 border border-white/15 rounded-lg px-6 py-3 text-[15px] font-medium hover:border-white/30 hover:text-white/70 transition-all">
						Book a Demo
					</button>
				</div>
				<div className="text-[12px] text-white/20">
					No setup fees · Cancel anytime · Live in under 48 hours
				</div>
			</div>
		</div>
	);
}
