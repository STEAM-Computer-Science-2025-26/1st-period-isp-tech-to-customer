"use client";

import { useState } from "react";
import { fmt } from "@/lib/utils/formatCurrency";
import { Slider } from "@/components/resources/shared/Slider";

export default function RevenueleakTool({ email: _ }: { email: string }) {
	const [jobs, setJobs] = useState(200);
	const [rev, setRev] = useState(320);
	const [cbrate, setCbrate] = useState(15);
	const [cbcost, setCbcost] = useState(180);
	const [missed, setMissed] = useState(40);
	const [agmPct, setAgmPct] = useState(18);
	const [agmTarget, setAgmTarget] = useState(30);
	const [agmRev, setAgmRev] = useState(220);

	// Callback leak
	const callbacks = Math.round((jobs * cbrate) / 100);
	const cbLoss = callbacks * cbcost;

	// Review leak — missed reviews reduce avg rating, lower rating hits conversion
	// Assume each 10% of missed reviews = 0.2 star drop, each 0.1 star drop = 2% fewer bookings
	const ratingDrop = (missed / 10) * 0.2;
	const convDrop = (ratingDrop * (2 / 0.1)) / 100;
	const reviewLoss = jobs * rev * convDrop;

	// Agreement gap
	const currentAgms = Math.round((jobs * agmPct) / 100);
	const targetAgms = Math.round((jobs * agmTarget) / 100);
	const agmGap = Math.max(0, targetAgms - currentAgms);
	const agmLoss = agmGap * agmRev;

	const totalLeak = cbLoss + reviewLoss + agmLoss;
	const annualLeak = totalLeak * 12;
	const leakPct = (totalLeak / (jobs * rev)) * 100;

	const maxLeak = Math.max(cbLoss, reviewLoss, agmLoss, 1);

	return (
		<div className="max-w-[900px] mx-auto px-6 py-10 pb-16">
			<div className="mb-8">
				<div className="inline-flex items-center gap-1.5 bg-destructive-background text-white font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded mb-4">
					<span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
					Revenue Leak Calculator
				</div>
				<h1 className="text-3xl font-bold text-foreground tracking-tight leading-tight mb-2">
					Your Business Has a{" "}
					<span className="text-destructive-background">Leak.</span>
					<br />
					Here's Exactly Where.
				</h1>
				<p className="text-[14px] text-text-secondary max-w-lg leading-relaxed">
					Three sources silently drain HVAC businesses every month. Callbacks,
					missed reviews, and lapsed agreements. Set your numbers and see the
					real damage.
				</p>
			</div>

			{/* Callbacks */}
			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">
				Callback leak
			</p>
			<div className="grid grid-cols-3 gap-3 mb-3">
				<Slider
					label="Monthly Jobs"
					question="Jobs completed per month"
					value={jobs}
					min={10}
					max={1000}
					step={10}
					onChange={setJobs}
					display={`${jobs.toLocaleString()}`}
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
					label="Callback Rate"
					question="% of jobs that result in a return visit"
					sub="Benchmark: under 10%"
					value={cbrate}
					min={1}
					max={50}
					step={1}
					onChange={setCbrate}
					danger
					display={`${cbrate}%`}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3 mb-5">
				<Slider
					label="Cost Per Callback"
					question="All-in cost of each return visit (labor + drive time)"
					value={cbcost}
					min={50}
					max={800}
					step={10}
					onChange={setCbcost}
					danger
					display={`$${cbcost}`}
				/>
				<LeakMeter
					label="Callback leak / month"
					value={cbLoss}
					pct={(cbLoss / maxLeak) * 100}
					color="#c9184a"
					sub={`${callbacks} callbacks × $${cbcost} each`}
				/>
			</div>

			{/* Reviews */}
			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">
				Review leak
			</p>
			<div className="grid grid-cols-2 gap-3 mb-5">
				<Slider
					label="Missed Review Requests"
					question="What % of completed jobs don't get a review ask?"
					sub="Industry standard: ask after every job"
					value={missed}
					min={0}
					max={100}
					step={5}
					onChange={setMissed}
					danger
					display={`${missed}%`}
				/>
				<LeakMeter
					label="Review leak / month"
					value={reviewLoss}
					pct={(reviewLoss / maxLeak) * 100}
					color="#f07090"
					sub={`Rating drop → ~${(convDrop * 100).toFixed(1)}% fewer bookings`}
				/>
			</div>

			{/* Agreements */}
			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">
				Agreement leak
			</p>
			<div className="grid grid-cols-3 gap-3 mb-5">
				<Slider
					label="Current Agreement %"
					question="What % of customers have active agreements?"
					sub="Benchmark: 25–40%"
					value={agmPct}
					min={0}
					max={60}
					step={1}
					onChange={setAgmPct}
					danger
					display={`${agmPct}%`}
				/>
				<Slider
					label="Target Agreement %"
					question="Where could you realistically get to?"
					value={agmTarget}
					min={5}
					max={60}
					step={1}
					onChange={setAgmTarget}
					display={`${agmTarget}%`}
				/>
				<Slider
					label="Annual Agreement Value"
					question="Revenue per agreement per year"
					value={agmRev}
					min={100}
					max={1200}
					step={10}
					onChange={setAgmRev}
					display={`$${agmRev}`}
				/>
			</div>
			<div className="mb-5">
				<LeakMeter
					label="Agreement leak / month"
					value={agmLoss}
					pct={(agmLoss / maxLeak) * 100}
					color="#ffa200"
					sub={`${agmGap} agreements short of target`}
				/>
			</div>

			{/* Total */}
			<div className="bg-foreground rounded-xl p-6 mb-3">
				<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-4">
					Total Revenue Leak
				</div>
				<div className="grid grid-cols-3 gap-6 mb-5">
					<div>
						<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-1">
							Leaking / Month
						</div>
						<div className="text-[40px] font-bold text-[#f07090] tracking-tight leading-none">
							{fmt(totalLeak)}
						</div>
					</div>
					<div>
						<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-1">
							Leaking / Year
						</div>
						<div className="text-[40px] font-bold text-[#f07090] tracking-tight leading-none">
							{fmt(annualLeak)}
						</div>
					</div>
					<div>
						<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-1">
							% of Revenue
						</div>
						<div className="text-[40px] font-bold text-warning-foreground tracking-tight leading-none">
							{leakPct.toFixed(1)}%
						</div>
					</div>
				</div>
				<div className="border-t border-white/10 pt-5 space-y-3">
					{[
						{
							label: "Callbacks",
							val: cbLoss,
							pct: (cbLoss / totalLeak) * 100,
							color: "#c9184a"
						},
						{
							label: "Missed Reviews",
							val: reviewLoss,
							pct: (reviewLoss / totalLeak) * 100,
							color: "#f07090"
						},
						{
							label: "Agreement Gap",
							val: agmLoss,
							pct: (agmLoss / totalLeak) * 100,
							color: "#ffa200"
						}
					].map((row) => (
						<div key={row.label} className="flex items-center gap-4">
							<span className="font-mono text-[10px] tracking-widest uppercase text-white/30 w-32 shrink-0">
								{row.label}
							</span>
							<div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
								<div
									className="h-full rounded-full transition-all duration-500"
									style={{ width: `${row.pct}%`, background: row.color }}
								/>
							</div>
							<span className="font-mono text-[12px] font-semibold text-white/60 w-16 text-right">
								{fmt(row.val)}/mo
							</span>
						</div>
					))}
				</div>
			</div>

			<div
				className="rounded-xl p-8 flex items-center justify-between gap-6 flex-wrap"
				style={{
					background: "linear-gradient(135deg, #42585e 0%, #1b3235 100%)"
				}}
			>
				<div>
					<h3 className="text-[17px] font-bold text-white mb-1.5 tracking-tight">
						TTC plugs all three leaks.
					</h3>
					<p className="text-[13px] text-white/40 max-w-sm leading-relaxed">
						Dispatch intelligence cuts callbacks. Automated review requests fill
						your pipeline. Agreement tracking recovers lapsed contracts.
					</p>
				</div>
				<button className="bg-accent-main text-white rounded-lg px-6 py-3 text-[14px] font-semibold shrink-0 hover:opacity-90 transition-opacity">
					Start Free Trial →
				</button>
			</div>
		</div>
	);
}

function LeakMeter({
	label,
	value,
	pct,
	color,
	sub
}: {
	label: string;
	value: number;
	pct: number;
	color: string;
	sub: string;
}) {
	return (
		<div className="bg-white border border-background-secondary rounded-xl p-5 flex flex-col justify-between">
			<div>
				<div className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-1">
					{label}
				</div>
				<div
					className="text-[32px] font-bold tracking-tight leading-none mb-1.5"
					style={{ color }}
				>
					{fmt(value)}
				</div>
				<div className="text-[11px] text-text-tertiary mb-4">{sub}</div>
			</div>
			<div className="h-2 bg-background-primary rounded-full overflow-hidden">
				<div
					className="h-full rounded-full transition-all duration-500"
					style={{ width: `${Math.min(100, pct)}%`, background: color }}
				/>
			</div>
		</div>
	);
}
