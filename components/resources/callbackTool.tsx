"use client";

import { useState } from "react";
import { fmt } from "@/lib/utils/formatCurrency";
import { Slider } from "@/components/resources/shared/Slider";

export default function CallbackTool({ email: _ }: { email: string }) {
	const [jobs, setJobs] = useState(280);
	const [rev, setRev] = useState(350);
	const [wage, setWage] = useState(42);
	const [cbrate, setCbrate] = useState(14);
	const [cbhrs, setCbhrs] = useState(2.5);
	const [churn, setChurn] = useState(22);
	const [ltv, setLtv] = useState(1800);

	const monthlyRev = jobs * rev;
	const callbacks = jobs * (cbrate / 100);
	const laborCost = callbacks * cbhrs * wage;
	const marginEros = callbacks * cbhrs * wage;
	const churned = callbacks * (churn / 100);
	const ltvLoss = churned * ltv;
	const totalMo = laborCost + ltvLoss;
	const totalAnnual = totalMo * 12;
	const perCb = callbacks > 0 ? totalMo / callbacks : 0;
	const pctRev = (totalMo / monthlyRev) * 100;
	const yearChurn = churned * 12;

	const maxBar = Math.max(laborCost, marginEros, ltvLoss, 1);

	let insight = "";
	if (pctRev >= 20) {
		insight = `Your callbacks are consuming <strong>${pctRev.toFixed(0)}% of monthly revenue</strong> — more than most businesses spend on marketing. At <strong>${fmt(totalAnnual)}/year</strong>, this isn't a service quality problem. It's an existential one.`;
	} else if (pctRev >= 10) {
		insight = `You're losing <strong>${fmt(totalAnnual)}</strong> a year to callbacks — <strong>${pctRev.toFixed(0)}% of revenue</strong> evaporating before it reaches profit. The invisible part is the <strong>${Math.round(yearChurn)} customers</strong> who quietly leave.`;
	} else {
		insight = `Your callback rate looks controlled, but still adds up to <strong>${fmt(totalAnnual)}/year</strong>. The real risk: <strong>${Math.round(yearChurn)} customers churning annually</strong>, each worth <strong>$${ltv.toLocaleString()}</strong> in lifetime value.`;
	}

	return (
		<div className="max-w-[900px] mx-auto px-6 py-10 pb-16">
			<div className="mb-8">
				<div className="inline-flex items-center gap-1.5 bg-destructive-background text-white font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded mb-4">
					<span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
					Callback Cost Calculator
				</div>
				<h1 className="text-3xl font-bold text-foreground tracking-tight leading-tight mb-2">
					Every Callback Costs You
					<br />
					<span className="text-destructive-background">
						More Than You Think.
					</span>
				</h1>
				<p className="text-[14px] text-text-secondary max-w-lg leading-relaxed">
					Wasted labor, crushed margin, and a customer who's quietly shopping
					your competitors. Set your numbers and see the real bill.
				</p>
			</div>

			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">
				Your operations
			</p>
			<div className="grid grid-cols-3 gap-3 mb-3">
				<Slider
					label="Monthly Jobs"
					question="Total jobs completed each month"
					value={jobs}
					min={20}
					max={1000}
					step={10}
					onChange={setJobs}
					display={`${jobs.toLocaleString()} jobs/mo`}
				/>
				<Slider
					label="Avg Job Revenue"
					question="What a single completed job brings in"
					value={rev}
					min={100}
					max={1500}
					step={10}
					onChange={setRev}
					display={`$${rev.toLocaleString()}`}
				/>
				<Slider
					label="Tech Hourly Cost"
					question="Fully-loaded cost per tech hour"
					value={wage}
					min={20}
					max={120}
					step={2}
					onChange={setWage}
					display={`$${wage}/hr`}
				/>
			</div>

			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">
				Your callback reality
			</p>
			<div className="grid grid-cols-2 gap-3 mb-3">
				<Slider
					label="Callback Rate"
					question="What % of jobs result in a callback within 30 days?"
					value={cbrate}
					min={1}
					max={50}
					step={1}
					onChange={setCbrate}
					danger
					display={`${cbrate}%`}
				/>
				<Slider
					label="Callback Duration"
					question="How long does a callback visit take, door to door?"
					value={cbhrs}
					min={0.5}
					max={6}
					step={0.5}
					onChange={setCbhrs}
					display={`${cbhrs}hrs`}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3 mb-3">
				<Slider
					label="Customer Churn"
					question="Of customers who get a callback, how many don't book again?"
					value={churn}
					min={1}
					max={70}
					step={1}
					onChange={setChurn}
					danger
					display={`${churn}%`}
				/>
				<Slider
					label="Avg Customer LTV"
					question="How much does a retained customer spend over their lifetime?"
					value={ltv}
					min={200}
					max={10000}
					step={100}
					onChange={setLtv}
					display={`$${ltv.toLocaleString()}`}
				/>
			</div>

			{/* Cost breakdown */}
			<div className="bg-white border border-background-secondary rounded-xl overflow-hidden mb-3">
				<div className="px-5 py-3.5 border-b border-background-secondary flex items-center justify-between">
					<span className="text-[13px] font-semibold text-foreground">
						Cost Breakdown — Per Month
					</span>
					<span className="text-[11px] text-text-tertiary">
						Three ways callbacks drain your business
					</span>
				</div>
				{[
					{
						name: "Direct Labor Cost",
						desc: "Tech hours dispatched to redo completed work",
						amount: laborCost,
						pct: (laborCost / maxBar) * 100,
						color: "#c9184a"
					},
					{
						name: "Margin Erosion",
						desc: "Original job revenue wiped by return trip labor",
						amount: marginEros,
						pct: (marginEros / maxBar) * 100,
						color: "#f07090"
					},
					{
						name: "Lost Customer LTV",
						desc: "Churned customers valued at full lifetime spend",
						amount: ltvLoss,
						pct: (ltvLoss / maxBar) * 100,
						color: "#ffa200"
					}
				].map((row) => (
					<div
						key={row.name}
						className="px-5 py-4 border-b border-background-primary last:border-0 hover:bg-background-main transition-colors flex items-center gap-4"
					>
						<div className="flex-1">
							<div className="text-[13px] font-medium text-text-main mb-1">
								{row.name}
							</div>
							<div className="text-[11px] text-text-tertiary mb-2">
								{row.desc}
							</div>
							<div className="h-1.5 bg-background-primary rounded-full overflow-hidden">
								<div
									className="h-full rounded-full transition-all duration-500"
									style={{ width: `${row.pct}%`, background: row.color }}
								/>
							</div>
						</div>
						<div className="font-mono text-[14px] font-semibold text-destructive-background shrink-0 w-24 text-right">
							{fmt(row.amount)}/mo
						</div>
					</div>
				))}
			</div>

			{/* Results */}
			<div className="bg-foreground rounded-xl p-6 mb-3">
				<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-4">
					Total Annual Impact
				</div>
				<div className="grid grid-cols-3 gap-6 mb-5">
					<KpiItem
						label="Callbacks / Month"
						value={Math.round(callbacks).toLocaleString()}
						color="text-[#f07090]"
						sub="jobs sent back out for free"
					/>
					<KpiItem
						label="Total Cost / Month"
						value={fmt(totalMo)}
						color="text-[#f07090]"
						sub="labor + margin + churn"
					/>
					<KpiItem
						label="Total Cost / Year"
						value={fmt(totalAnnual)}
						color="text-[#f07090]"
						sub="what callbacks actually cost"
					/>
				</div>
				<div className="border-t border-white/10 pt-5 grid grid-cols-3 gap-6">
					<KpiItem
						label="Cost Per Callback"
						value={fmt(perCb)}
						color="text-warning-foreground"
						sub="all-in cost of one return visit"
					/>
					<KpiItem
						label="% of Revenue Lost"
						value={pctRev.toFixed(1) + "%"}
						color="text-warning-foreground"
						sub="callbacks as share of revenue"
					/>
					<KpiItem
						label="Customers Lost / Year"
						value={Math.round(yearChurn).toLocaleString()}
						color="text-[#f07090]"
						sub="who won't book again"
					/>
				</div>
			</div>

			{/* Insight */}
			<div
				className="bg-white border border-l-4 border-background-secondary rounded-xl p-5 mb-3"
				style={{ borderLeftColor: "#c9184a" }}
			>
				<div className="font-mono text-[10px] tracking-widest uppercase text-destructive-foreground mb-2">
					⚠ What This Really Means
				</div>
				<div
					className="text-[14px] text-text-main leading-relaxed"
					dangerouslySetInnerHTML={{ __html: insight }}
				/>
			</div>

			<Cta />
		</div>
	);
}

function KpiItem({
	label,
	value,
	color,
	sub
}: {
	label: string;
	value: string;
	color: string;
	sub: string;
}) {
	return (
		<div>
			<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-1">
				{label}
			</div>
			<div
				className={`text-[28px] font-bold tracking-tight leading-none mb-1 ${color}`}
			>
				{value}
			</div>
			<div className="text-[11px] text-white/30">{sub}</div>
		</div>
	);
}

function Cta() {
	return (
		<div
			className="rounded-xl p-8 flex items-center justify-between gap-6 flex-wrap"
			style={{
				background: "linear-gradient(135deg, #42585e 0%, #1b3235 100%)"
			}}
		>
			<div>
				<h3 className="text-[17px] font-bold text-white mb-1.5 tracking-tight">
					TTC cuts callbacks at the source.
				</h3>
				<p className="text-[13px] text-white/40 max-w-sm leading-relaxed">
					Skill-matched dispatch means the right tech goes the first time. Most
					customers reduce callback rates 30–50% in 60 days.
				</p>
			</div>
			<button className="bg-accent-main text-white rounded-lg px-6 py-3 text-[14px] font-semibold shrink-0 hover:opacity-90 transition-opacity">
				Start Free Trial →
			</button>
		</div>
	);
}
