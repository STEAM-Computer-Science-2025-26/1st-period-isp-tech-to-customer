"use client";

import { useState, useEffect, useRef } from "react";
import { fmt } from "@/lib/utils/formatCurrency";
import { Slider } from "@/components/resources/shared/Slider";

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
];
const WDAYS = [23, 20, 23, 22, 23, 22, 22, 22, 21, 23, 21, 21];
const SHAPE = [
	0.13, 0.16, 0.3, 0.52, 0.76, 0.94, 1.0, 0.97, 0.7, 0.44, 0.2, 0.11
];

interface MonthData {
	m: string;
	demand: number;
	overflow: number;
	lostJobs: number;
}

// ─── Hoisted outside component so React doesn't recreate it on every render ──

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
					TTC fills that gap automatically.
				</h3>
				<p className="text-[13px] text-white/40 max-w-sm leading-relaxed">
					Real-time dispatch, skill-matched routing, and live availability — so
					every peak week is covered.
				</p>
			</div>
			<button className="bg-accent-main text-white rounded-lg px-6 py-3 text-[14px] font-semibold shrink-0 hover:opacity-90 transition-opacity">
				Start Free Trial →
			</button>
		</div>
	);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SeasonalTool({ email: _ }: { email: string }) {
	const [techs, setTechs] = useState(8);
	const [jtd, setJtd] = useState(4);
	const [rev, setRev] = useState(320);
	const [winter, setWinter] = useState(60);
	const [summer, setSummer] = useState(140);
	const svgRef = useRef<SVGSVGElement>(null);

	const cap = techs * jtd;
	const winterD = winter / 5;
	const summerD = summer / 5;

	const data: MonthData[] = MONTHS.map((m, i) => {
		const demand = winterD + SHAPE[i] * (summerD - winterD);
		const overflow = Math.max(0, demand - cap);
		const lostJobs = overflow * WDAYS[i];
		return { m, demand, overflow, lostJobs };
	});

	const totalLost = data.reduce((s, d) => s + d.lostJobs, 0);
	const lostRev = totalLost * rev;
	const peakD = Math.max(...data.map((d) => d.demand));
	const techNeeded = Math.ceil(peakD / jtd);
	const overMonths = data.filter((d) => d.overflow > 0).length;
	const worst = data.reduce((a, b) => (b.overflow > a.overflow ? b : a));

	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const W = 880,
			H = 190,
			PT = 14,
			PB = 10,
			PL = 0,
			PR = 0;
		const plotW = W - PL - PR,
			plotH = H - PT - PB;
		const maxV = Math.max(...data.map((d) => d.demand), cap) * 1.18;
		const xp = (i: number) => PL + (i + 0.5) * (plotW / 12);
		const yp = (v: number) => PT + plotH - (v / maxV) * plotH;

		const overflow = data
			.map((d, i) => {
				if (d.overflow <= 0) return "";
				const x1 = PL + i * (plotW / 12),
					x2 = PL + (i + 1) * (plotW / 12);
				return `<rect x="${x1.toFixed(1)}" y="${yp(d.demand).toFixed(1)}" width="${(x2 - x1).toFixed(1)}" height="${Math.max(0, yp(cap) - yp(d.demand)).toFixed(1)}" fill="#c9184a" opacity="0.17"/>`;
			})
			.join("");

		const areaPath =
			`M ${xp(0).toFixed(1)} ${yp(data[0].demand).toFixed(1)} ` +
			data
				.slice(1)
				.map((d, i) => `L ${xp(i + 1).toFixed(1)} ${yp(d.demand).toFixed(1)}`)
				.join(" ") +
			` L ${xp(11).toFixed(1)} ${yp(0).toFixed(1)} L ${xp(0).toFixed(1)} ${yp(0).toFixed(1)} Z`;

		const capY = yp(cap).toFixed(1);
		const dots = data
			.map(
				(d, i) =>
					`<circle cx="${xp(i).toFixed(1)}" cy="${yp(d.demand).toFixed(1)}" r="3.8" fill="${d.overflow > 0 ? "#c9184a" : "#ffa200"}" stroke="#fff" stroke-width="1.5"/>`
			)
			.join("");

		svg.innerHTML = `
			<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#ffa200" stop-opacity="0.10"/>
				<stop offset="100%" stop-color="#ffa200" stop-opacity="0"/>
			</linearGradient></defs>
			<path d="${areaPath}" fill="url(#ag)"/>
			${overflow}
			<line x1="${PL}" y1="${capY}" x2="${W - PR}" y2="${capY}" stroke="#53abb1" stroke-width="2" stroke-dasharray="7 5" opacity="0.85"/>
			<text x="${W - PR - 6}" y="${+capY - 7}" font-family="'Geist Mono',monospace" font-size="9.5" fill="#53abb1" text-anchor="end" opacity="0.85">Capacity · ${Math.round(cap)}/day</text>
			<polyline points="${data.map((d, i) => `${xp(i).toFixed(1)},${yp(d.demand).toFixed(1)}`).join(" ")}" fill="none" stroke="#ffa200" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
			${dots}`;
	}, [data, cap]);

	return (
		<div className="max-w-[900px] mx-auto px-6 py-10 pb-16">
			<div className="mb-8">
				<div className="inline-flex items-center gap-1.5 bg-accent-main text-white font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded mb-4">
					<span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
					Seasonal Capacity Planner
				</div>
				<h1 className="text-3xl font-bold text-foreground tracking-tight leading-tight mb-2">
					Summer Is Coming.
					<br />
					<span className="text-accent-main">Is Your Team Ready?</span>
				</h1>
				<p className="text-[14px] text-text-secondary max-w-lg leading-relaxed">
					Tell us how busy you get in winter vs summer — we'll show exactly how
					many jobs you're losing when the heat hits.
				</p>
			</div>

			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">
				Your team
			</p>
			<div className="grid grid-cols-3 gap-3 mb-3">
				<Slider
					label="Technicians"
					question="How many techs on your team?"
					value={techs}
					min={1}
					max={40}
					step={1}
					onChange={setTechs}
					display={`${techs} techs`}
				/>
				<Slider
					label="Jobs Per Tech"
					question="Jobs one tech handles daily?"
					value={jtd}
					min={1}
					max={12}
					step={1}
					onChange={setJtd}
					display={`${jtd} jobs/day`}
				/>
				<Slider
					label="Avg Job Revenue"
					question="What does a single job bring in?"
					value={rev}
					min={100}
					max={1500}
					step={10}
					onChange={setRev}
					display={`$${rev.toLocaleString()}`}
				/>
			</div>

			<p className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary mb-2.5">
				Your demand
			</p>
			<div className="grid grid-cols-2 gap-3 mb-3">
				<Slider
					label="Winter Demand"
					question="In a slow winter week, how many jobs?"
					value={winter}
					min={5}
					max={400}
					step={5}
					onChange={setWinter}
					display={`${winter} jobs/wk`}
				/>
				<Slider
					label="Summer Peak"
					question="At your absolute busiest, jobs per week?"
					value={summer}
					min={5}
					max={800}
					step={5}
					onChange={setSummer}
					danger
					dangerColor="text-warning-foreground"
					display={`${summer} jobs/wk`}
				/>
			</div>

			{/* Chart */}
			<div className="bg-white border border-background-secondary rounded-xl p-6 mb-3">
				<div className="text-[13px] font-semibold text-foreground mb-1">
					Jobs Per Day — Demand vs. Capacity
				</div>
				<div className="text-[12px] text-text-tertiary mb-4">
					The gap between the lines is revenue walking out the door.
				</div>
				<div className="h-[196px]">
					<svg
						ref={svgRef}
						className="w-full h-full overflow-visible"
						viewBox="0 0 880 190"
						preserveAspectRatio="none"
					/>
				</div>
				<div className="grid grid-cols-12 mt-2">
					{MONTHS.map((m) => (
						<div
							key={m}
							className="font-mono text-[9px] text-text-tertiary text-center uppercase"
						>
							{m}
						</div>
					))}
				</div>
			</div>

			{/* Results */}
			<div className="bg-foreground rounded-xl p-6 mb-3">
				<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-4">
					Annual Impact
				</div>
				<div className="grid grid-cols-3 gap-6 mb-5">
					<KpiItem
						label="Jobs Lost / Year"
						value={Math.round(totalLost).toLocaleString()}
						color="text-[#f07090]"
						sub="jobs you had to turn away"
					/>
					<KpiItem
						label="Revenue Lost / Year"
						value={fmt(lostRev)}
						color="text-[#f07090]"
						sub="at your avg job revenue"
					/>
					<KpiItem
						label="Worst Month"
						value={
							worst.overflow > 0 ? `+${Math.round(worst.overflow)}/day` : "None"
						}
						color="text-warning-foreground"
						sub={
							worst.overflow > 0 ? `overflow in ${worst.m}` : "fully covered"
						}
					/>
				</div>
				<div className="border-t border-white/10 pt-5 grid grid-cols-3 gap-6">
					<KpiItem
						label="Peak Daily Demand"
						value={`${Math.round(peakD)}/day`}
						color="text-accent-main"
						sub="jobs at peak"
					/>
					<KpiItem
						label="Techs Needed"
						value={String(techNeeded)}
						color="text-white"
						sub={
							techNeeded > techs
								? `short ${techNeeded - techs} techs`
								: "team is enough"
						}
					/>
					<KpiItem
						label="Months Overloaded"
						value={String(overMonths)}
						color={
							overMonths >= 4
								? "text-[#f07090]"
								: overMonths >= 1
									? "text-warning-foreground"
									: "text-success-background"
						}
						sub="months turning work away"
					/>
				</div>
			</div>

			{/* Month breakdown */}
			<div className="bg-white border border-background-secondary rounded-xl overflow-hidden mb-3">
				<div className="px-5 py-3.5 border-b border-background-secondary text-[13px] font-semibold text-foreground">
					Month-by-Month
				</div>
				<div className="grid grid-cols-[72px_1fr_80px_88px] font-mono text-[10px] tracking-widest uppercase text-text-tertiary bg-background-main px-5 py-2.5 gap-3">
					<span>Month</span>
					<span>Load</span>
					<span className="text-right">Jobs/day</span>
					<span className="text-right">Status</span>
				</div>
				{data.map(({ m, demand, overflow }) => {
					const maxD = Math.max(...data.map((d) => d.demand));
					const pct = Math.min(100, (demand / (maxD * 1.08)) * 100);
					const isOver = overflow > 0;
					const isWarn = !isOver && demand / cap > 0.78;
					const barClr = isOver ? "#c9184a" : isWarn ? "#ffa200" : "#53abb1";
					return (
						<div
							key={m}
							className="grid grid-cols-[72px_1fr_80px_88px] items-center gap-3 px-5 py-2.5 border-b border-background-primary last:border-0 hover:bg-background-main transition-colors"
						>
							<span className="text-[13px] font-medium text-text-main">
								{m}
							</span>
							<div className="h-1.5 bg-background-primary rounded-full overflow-hidden">
								<div
									className="h-full rounded-full"
									style={{ width: `${pct}%`, background: barClr }}
								/>
							</div>
							<span className="font-mono text-[12px] text-text-secondary text-right">
								{Math.round(demand)}/day
							</span>
							<span
								className={`text-right font-mono text-[10px] tracking-wider uppercase font-semibold px-2 py-0.5 rounded-full ${isOver ? "bg-destructive-background/10 text-destructive-foreground" : isWarn ? "bg-warning-background/30 text-warning-text" : "bg-success-background/20 text-success-foreground"}`}
							>
								{isOver ? "Overflow" : isWarn ? "Near cap" : "On track"}
							</span>
						</div>
					);
				})}
			</div>

			<Cta />
		</div>
	);
}
