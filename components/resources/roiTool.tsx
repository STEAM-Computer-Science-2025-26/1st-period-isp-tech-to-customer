"use client";

import { useState } from "react";

function fmt(n: number) {
	if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
	if (n >= 1_000)     return "$" + Math.round(n / 1_000) + "k";
	return "$" + Math.round(n).toLocaleString();
}

function ttcPrice(t: number) { return t <= 3 ? 149 : t <= 6 ? 199 : t <= 10 ? 299 : 399; }

function Slider({ label, question, sub, value, min, max, step, onChange, display }: {
	label: string; question: string; sub?: string; value: number; min: number; max: number;
	step: number; onChange: (v: number) => void; display: string;
}) {
	return (
		<div className="bg-white border border-background-secondary rounded-xl p-5">
			<div className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-1">{label}</div>
			<div className="text-[13px] font-medium text-text-primary mb-0.5 leading-snug">{question}</div>
			{sub && <div className="text-[11px] text-text-tertiary mb-1">{sub}</div>}
			<div className="text-[28px] font-bold text-accent-main tracking-tight mb-2.5 leading-none mt-2">{display}</div>
			<input type="range" min={min} max={max} step={step} value={value}
				onChange={e => onChange(+e.target.value)}
				className="w-full h-1 rounded-full outline-none cursor-pointer accent-accent-main"
			/>
			<div className="flex justify-between mt-1.5 font-mono text-[10px] text-text-tertiary">
				<span>{min}</span><span>{max}</span>
			</div>
		</div>
	);
}

export default function RoiTool({ email: _ }: { email: string }) {
	const [trucks,  setTrucks]  = useState(6);
	const [jobs,    setJobs]    = useState(220);
	const [rev,     setRev]     = useState(330);
	const [cbrate,  setCbrate]  = useState(14);
	const [agmPct,  setAgmPct]  = useState(18);
	const [utilPct, setUtilPct] = useState(68);

	const monthlyTTC  = ttcPrice(trucks);
	const ttcAnnual   = monthlyTTC * 12;
	const monthlyRev  = jobs * rev;

	// Dispatch gain: better routing → +12% job throughput
	const dispatchGain  = monthlyRev * 0.12;

	// Callback reduction: 35% fewer callbacks, each callback costs ~$180
	const cbCount       = jobs * cbrate / 100;
	const cbSaved       = cbCount * 0.35 * 180;

	// Agreement uplift: close 8pp of gap toward 30% benchmark
	const agmGapClose   = Math.max(0, 0.30 - agmPct / 100) * 0.25; // recover 25% of gap
	const agmRevGain    = jobs * agmGapClose * 220 / 12; // monthly

	// Utilization improvement: each 1pp utilization gain ≈ 0.5 extra job/tech/mo
	const utilGain      = Math.max(0, 80 - utilPct) * trucks * 0.5 * rev / 100;

	const totalMonthly  = dispatchGain + cbSaved + agmRevGain + utilGain;
	const totalAnnual   = totalMonthly * 12;
	const netAnnual     = totalAnnual - ttcAnnual;
	const roiX          = ttcAnnual > 0 ? +(totalAnnual / ttcAnnual).toFixed(1) : 0;
	const paybackDays   = totalMonthly > 0 ? Math.round((monthlyTTC / (totalMonthly / 30))) : 0;

	const gains = [
		{ label: "Dispatch Efficiency", val: dispatchGain, desc: "+12% job throughput from skill-matched routing", color: "#53abb1" },
		{ label: "Callback Reduction", val: cbSaved, desc: "35% fewer callbacks at ~$180 cost each", color: "#ffa200" },
		{ label: "Agreement Recovery", val: agmRevGain, desc: "Closing 25% of your gap to 30% benchmark", color: "#52b788" },
		{ label: "Utilization Uplift", val: utilGain, desc: `Improving from ${utilPct}% toward 80% team utilization`, color: "#a8dadc" },
	];

	const maxGain = Math.max(...gains.map(g => g.val), 1);

	return (
		<div className="max-w-[900px] mx-auto px-6 py-10 pb-16">
			<div className="mb-8">
				<div className="inline-flex items-center gap-1.5 bg-accent-main text-white font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded mb-4">
					<span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
					ROI Calculator
				</div>
				<h1 className="text-3xl font-bold text-foreground tracking-tight leading-tight mb-2">
					What Does TTC Actually<br /><span className="text-accent-main">Return on Your Investment?</span>
				</h1>
				<p className="text-[14px] text-text-secondary max-w-lg leading-relaxed">
					No fluff. Enter your real numbers and see what the platform pays back across dispatch, callbacks, agreements, and utilization.
				</p>
			</div>

			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">Your operation</p>
			<div className="grid grid-cols-3 gap-3 mb-3">
				<Slider label="Trucks / Techs" question="How many trucks are you running?" value={trucks} min={1} max={30} step={1} onChange={setTrucks} display={`${trucks} trucks`} />
				<Slider label="Monthly Jobs" question="Total jobs completed per month" value={jobs} min={10} max={1000} step={10} onChange={setJobs} display={`${jobs.toLocaleString()} jobs`} />
				<Slider label="Avg Job Revenue" question="Revenue per completed job" value={rev} min={100} max={1500} step={10} onChange={setRev} display={`$${rev.toLocaleString()}`} />
			</div>
			<div className="grid grid-cols-3 gap-3 mb-5">
				<Slider label="Callback Rate" question="% of jobs that result in a return visit" sub="Benchmark: under 10%" value={cbrate} min={1} max={50} step={1} onChange={setCbrate} display={`${cbrate}%`} />
				<Slider label="Agreement Penetration" question="% of customers with active agreements" sub="Benchmark: 25–40%" value={agmPct} min={0} max={60} step={1} onChange={setAgmPct} display={`${agmPct}%`} />
				<Slider label="Team Utilization" question="% of possible job slots actually filled" sub="Benchmark: 75–80%" value={utilPct} min={30} max={100} step={1} onChange={setUtilPct} display={`${utilPct}%`} />
			</div>

			{/* Gain breakdown */}
			<div className="bg-white border border-background-secondary rounded-xl overflow-hidden mb-3">
				<div className="px-5 py-3.5 border-b border-background-secondary flex items-center justify-between">
					<span className="text-[13px] font-semibold text-foreground">Monthly Value Created by TTC</span>
					<span className="inline-flex items-center gap-2 bg-accent-main/10 border border-accent-main/20 text-accent-main font-mono text-[11px] px-2.5 py-1 rounded">
						Your plan: <span className="font-bold">${monthlyTTC}/mo</span>
					</span>
				</div>
				{gains.map(g => (
					<div key={g.label} className="px-5 py-4 border-b border-background-primary last:border-0 hover:bg-background-main transition-colors flex items-center gap-4">
						<div className="flex-1">
							<div className="text-[13px] font-medium text-text-main mb-1">{g.label}</div>
							<div className="text-[11px] text-text-tertiary mb-2">{g.desc}</div>
							<div className="h-1.5 bg-background-primary rounded-full overflow-hidden">
								<div className="h-full rounded-full transition-all duration-500" style={{ width: `${g.val / maxGain * 100}%`, background: g.color }} />
							</div>
						</div>
						<div className="font-mono text-[14px] font-semibold text-accent-main shrink-0 w-24 text-right">
							{fmt(g.val)}/mo
						</div>
					</div>
				))}
			</div>

			{/* ROI results */}
			<div className="bg-foreground rounded-xl p-6 mb-3">
				<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-4">Your ROI</div>
				<div className="grid grid-cols-2 gap-8 mb-5">
					<div>
						<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-2">Monthly Return</div>
						<div className="text-[52px] font-bold text-success-background tracking-tight leading-none mb-1">{fmt(totalMonthly)}</div>
						<div className="text-[12px] text-white/30">vs {fmt(monthlyTTC)}/mo TTC cost</div>
					</div>
					<div>
						<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-2">Annual Return</div>
						<div className="text-[52px] font-bold text-success-background tracking-tight leading-none mb-1">{fmt(totalAnnual)}</div>
						<div className="text-[12px] text-white/30">net {fmt(netAnnual)} after TTC cost</div>
					</div>
				</div>
				<div className="border-t border-white/10 pt-5 flex gap-10 flex-wrap">
					{[
						{ label: "Return Multiple", val: `${roiX}×`, sub: "return on TTC spend", color: "text-accent-main" },
						{ label: "Payback Period", val: `${paybackDays} days`, sub: "until TTC pays for itself", color: "text-success-background" },
						{ label: "Net Gain / Year", val: fmt(netAnnual), sub: "after platform cost", color: "text-white" },
					].map(k => (
						<div key={k.label}>
							<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-1">{k.label}</div>
							<div className={`text-[24px] font-bold tracking-tight ${k.color}`}>{k.val}</div>
							<div className="text-[11px] text-white/30">{k.sub}</div>
						</div>
					))}
				</div>
			</div>

			<div className="rounded-xl p-8 flex items-center justify-between gap-6 flex-wrap" style={{ background: "linear-gradient(135deg, #42585e 0%, #1b3235 100%)" }}>
				<div>
					<h3 className="text-[17px] font-bold text-white mb-1.5 tracking-tight">These numbers are conservative.</h3>
					<p className="text-[13px] text-white/40 max-w-sm leading-relaxed">
						Most TTC customers see results faster than this model projects. Start free and track your actual ROI from day one.
					</p>
				</div>
				<button className="bg-accent-main text-white rounded-lg px-6 py-3 text-[14px] font-semibold shrink-0 hover:opacity-90 transition-opacity">
					Start Free Trial →
				</button>
			</div>
		</div>
	);
}