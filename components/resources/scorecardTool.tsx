"use client";

import { useState } from "react";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface YNQuestion {
	id: string;
	type: "yn";
	text: string;
	sub?: string;
	scores: { yes: number; no: number };
}
interface MCQuestion {
	id: string;
	type: "mc";
	text: string;
	sub?: string;
	options: string[];
	scores: number[];
}
type Question = YNQuestion | MCQuestion;

interface Category {
	id: string;
	name: string;
	icon: string;
	label: string;
	benchmark: number;
	questions: Question[];
}

const CATEGORIES: Category[] = [
	{
		id: "dispatch",
		name: "Dispatch",
		icon: "⚡",
		label: "Dispatch Efficiency",
		benchmark: 78,
		questions: [
			{
				id: "ftf",
				type: "mc",
				text: "What's your first-time fix rate?",
				sub: "Benchmark: 75%+",
				options: ["Below 60%", "60–70%", "70–80%", "80%+"],
				scores: [0, 1, 2, 3]
			},
			{
				id: "callback",
				type: "mc",
				text: "How often do techs return for the same job within 30 days?",
				sub: "Benchmark: under 10%",
				options: ["30%+ of jobs", "20–30%", "10–20%", "Under 10%"],
				scores: [0, 1, 2, 3]
			},
			{
				id: "assign_speed",
				type: "mc",
				text: "How fast do you assign a tech after a job is booked?",
				options: [
					"Same day, manually",
					"Within the hour",
					"Under 15 minutes",
					"Instantly / automated"
				],
				scores: [0, 1, 2, 3]
			},
			{
				id: "skill_match",
				type: "yn",
				text: "Do you match technicians to jobs based on skills and certifications?",
				scores: { yes: 3, no: 0 }
			},
			{
				id: "routing",
				type: "yn",
				text: "Does your dispatch factor in real-time tech location and drive time?",
				scores: { yes: 3, no: 0 }
			}
		]
	},
	{
		id: "utilization",
		name: "Utilization",
		icon: "📊",
		label: "Team Utilization",
		benchmark: 70,
		questions: [
			{
				id: "jobs_per_tech",
				type: "mc",
				text: "On average, how many jobs does each tech complete per day?",
				sub: "Benchmark: 4–6 jobs/day",
				options: ["1–2 jobs", "2–3 jobs", "3–5 jobs", "5+ jobs"],
				scores: [0, 1, 2, 3]
			},
			{
				id: "idle_time",
				type: "mc",
				text: "How much idle time does a typical tech have daily?",
				options: ["3+ hours", "2–3 hours", "1–2 hours", "Under 1 hour"],
				scores: [0, 1, 2, 3]
			},
			{
				id: "avail_tracking",
				type: "yn",
				text: "Do you track technician availability in real time?",
				scores: { yes: 3, no: 0 }
			},
			{
				id: "multi_job",
				type: "yn",
				text: "Can techs handle multiple jobs per day without manual re-scheduling?",
				scores: { yes: 3, no: 0 }
			},
			{
				id: "peak_plan",
				type: "mc",
				text: "How do you handle capacity during peak season?",
				options: [
					"We get overwhelmed",
					"Hire seasonal workers",
					"We turn jobs away",
					"We plan ahead with data"
				],
				scores: [0, 1, 1, 3]
			}
		]
	},
	{
		id: "revenue",
		name: "Revenue",
		icon: "💰",
		label: "Revenue & Growth",
		benchmark: 65,
		questions: [
			{
				id: "agreements",
				type: "mc",
				text: "What % of customers have active maintenance agreements?",
				sub: "Benchmark: 25–40%",
				options: ["Under 10%", "10–20%", "20–35%", "35%+"],
				scores: [0, 1, 2, 3]
			},
			{
				id: "renewal_rate",
				type: "mc",
				text: "What's your agreement renewal rate?",
				sub: "Benchmark: 65%+",
				options: ["Under 40%", "40–55%", "55–70%", "70%+"],
				scores: [0, 1, 2, 3]
			},
			{
				id: "pricing_review",
				type: "mc",
				text: "How often do you review and update your pricing?",
				options: [
					"Never / rarely",
					"Every few years",
					"Annually",
					"Quarterly or more"
				],
				scores: [0, 1, 2, 3]
			},
			{
				id: "upsell",
				type: "yn",
				text: "Do you have a formal process for techs to offer upgrades or add-ons on-site?",
				scores: { yes: 3, no: 0 }
			},
			{
				id: "invoice_speed",
				type: "mc",
				text: "When do customers typically receive their invoice?",
				options: [
					"Days after the job",
					"End of week",
					"Same day",
					"Instantly after completion"
				],
				scores: [0, 1, 2, 3]
			}
		]
	},
	{
		id: "customer",
		name: "Customer",
		icon: "⭐",
		label: "Customer Satisfaction",
		benchmark: 72,
		questions: [
			{
				id: "avg_rating",
				type: "mc",
				text: "What's your average online review rating?",
				sub: "Benchmark: 4.5+",
				options: ["Under 3.5", "3.5–4.0", "4.0–4.5", "4.5+"],
				scores: [0, 1, 2, 3]
			},
			{
				id: "review_ask",
				type: "yn",
				text: "Do you systematically ask customers to leave a review after each job?",
				scores: { yes: 3, no: 0 }
			},
			{
				id: "no_shows",
				type: "mc",
				text: "What's your tech no-show or late arrival rate?",
				sub: "Benchmark: under 5%",
				options: ["20%+", "10–20%", "5–10%", "Under 5%"],
				scores: [0, 1, 2, 3]
			},
			{
				id: "comm",
				type: "mc",
				text: "How do customers receive job status updates?",
				options: [
					"They have to call us",
					"We call them manually",
					"Automated texts/emails",
					"Real-time app updates"
				],
				scores: [0, 1, 2, 3]
			},
			{
				id: "retention",
				type: "mc",
				text: "What's your customer retention rate year-over-year?",
				sub: "Benchmark: 70%+",
				options: ["Under 50%", "50–65%", "65–75%", "75%+"],
				scores: [0, 1, 2, 3]
			}
		]
	},
	{
		id: "ops",
		name: "Operations",
		icon: "🔧",
		label: "Operations & Tech",
		benchmark: 60,
		questions: [
			{
				id: "software",
				type: "mc",
				text: "How do you currently manage jobs and dispatching?",
				options: [
					"Whiteboard / paper",
					"Spreadsheets",
					"Basic software",
					"Purpose-built field service software"
				],
				scores: [0, 1, 2, 3]
			},
			{
				id: "reporting",
				type: "yn",
				text: "Do you have a dashboard showing business performance weekly?",
				scores: { yes: 3, no: 0 }
			},
			{
				id: "mobile",
				type: "yn",
				text: "Can techs view job details and update status from their phone?",
				scores: { yes: 3, no: 0 }
			},
			{
				id: "multi_branch",
				type: "mc",
				text: "If you have multiple locations, how do you coordinate?",
				options: [
					"We don't coordinate",
					"Phone calls",
					"Shared spreadsheet",
					"Centralized software"
				],
				scores: [0, 1, 2, 3]
			},
			{
				id: "data",
				type: "mc",
				text: "When making business decisions, what do you base them on?",
				options: [
					"Gut feel",
					"Past experience",
					"Some data",
					"Real-time data & reports"
				],
				scores: [0, 1, 2, 3]
			}
		]
	}
];

const TOTAL_QS = CATEGORIES.reduce((s, c) => s + c.questions.length, 0);

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function scoreCategory(cat: Category, answers: Record<string, unknown>) {
	let earned = 0;
	cat.questions.forEach((q) => {
		const ans = answers[q.id];
		if (q.type === "yn")
			earned += ans === "yes" ? q.scores.yes : ans === "no" ? q.scores.no : 0;
		else if (typeof ans === "number") earned += q.scores[ans] ?? 0;
	});
	return { pct: Math.round((earned / (cat.questions.length * 3)) * 100) };
}

function getGrade(score: number) {
	if (score >= 90)
		return {
			letter: "A",
			color: "#52b788",
			desc: "Exceptional. Your operation is running at a level most HVAC businesses never reach."
		};
	if (score >= 80)
		return {
			letter: "B",
			color: "#53abb1",
			desc: "Strong. A few blind spots are holding you back from elite performance."
		};
	if (score >= 65)
		return {
			letter: "C",
			color: "#ffa200",
			desc: "Average. You're functional, but leaving real money on the table every month."
		};
	if (score >= 50)
		return {
			letter: "D",
			color: "#f07090",
			desc: "Struggling. Good technicians, bad systems. This is fixable and the ROI is immediate."
		};
	return {
		letter: "F",
		color: "#c9184a",
		desc: "Critical. Running on manual effort alone. One bad season away from serious problems."
	};
}

// ─── Component ────────────────────────────────────────────────────────────────

type View = "intro" | "questions" | "results";

export default function ScorecardTool({ email }: { email: string }) {
	const [view, setView] = useState<View>("intro");
	const [section, setSection] = useState(0);
	const [answers, setAnswers] = useState<Record<string, unknown>>({});

	const answered = Object.keys(answers).length;
	const cat = CATEGORIES[section];
	const secAnswered = cat.questions.every((q) => answers[q.id] !== undefined);

	function answer(id: string, val: unknown) {
		setAnswers((prev) => ({ ...prev, [id]: val }));
	}

	function next() {
		if (section < CATEGORIES.length - 1) setSection((s) => s + 1);
		else setView("results");
	}

	function exportCSV() {
		const scores = CATEGORIES.map((c) => ({
			...c,
			...scoreCategory(c, answers)
		}));
		const overall = Math.round(
			scores.reduce((s, c) => s + c.pct, 0) / scores.length
		);
		const grade = getGrade(overall);
		const now = new Date().toLocaleDateString("en-US");

		const rows: string[][] = [
			["HVAC Business Health Scorecard — Full Report"],
			["Generated by", "Tech to Customer (TTC)"],
			["Date", now],
			["Email", email],
			[""],
			["OVERALL RESULTS"],
			["Score", `${overall} / 100`],
			["Grade", grade.letter],
			["Summary", grade.desc],
			[""],
			["CATEGORY BREAKDOWN"],
			["Category", "Your Score", "Industry Benchmark", "Gap", "Status"],
			...scores.map((c) => {
				const gap = c.pct - c.benchmark;
				return [
					c.label,
					`${c.pct}%`,
					`${c.benchmark}%`,
					`${gap >= 0 ? "+" : ""}${gap}%`,
					c.pct >= 75 ? "Strong" : c.pct >= 55 ? "Needs Work" : "Critical"
				];
			}),
			[""],
			["YOUR ANSWERS"],
			["Question", "Your Answer", "Category"],
			...CATEGORIES.flatMap((c) =>
				c.questions.map((q) => {
					const ans = answers[q.id];
					let a = "—";
					if (q.type === "yn") a = ans === "yes" ? "Yes" : "No";
					else if (typeof ans === "number") a = (q as MCQuestion).options[ans];
					return [q.text, a, c.label];
				})
			)
		];

		const csv = rows
			.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
			.join("\n");
		const blob = new Blob([csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `TTC_Scorecard_${now.replace(/\//g, "-")}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	if (view === "intro") return <Intro onStart={() => setView("questions")} />;
	if (view === "results")
		return <Results answers={answers} onExport={exportCSV} />;

	return (
		<div className="max-w-[720px] mx-auto px-6 py-10 pb-16">
			{/* Progress */}
			<div className="mb-6">
				<div className="flex justify-between items-center mb-2">
					<span className="font-mono text-[10px] tracking-widest uppercase text-text-tertiary">
						Progress
					</span>
					<span className="font-mono text-[11px] text-accent-main">
						{answered} / {TOTAL_QS} answered
					</span>
				</div>
				<div className="h-1 bg-background-secondary rounded-full overflow-hidden">
					<div
						className="h-full bg-accent-main rounded-full transition-all duration-300"
						style={{ width: `${(answered / TOTAL_QS) * 100}%` }}
					/>
				</div>
			</div>

			{/* Category tabs */}
			<div className="flex gap-2 flex-wrap mb-6">
				{CATEGORIES.map((c, i) => (
					<div
						key={c.id}
						className={`flex items-center gap-1.5 font-mono text-[9px] tracking-widest uppercase px-2.5 py-1.5 rounded-md border transition-all ${
							i === section
								? "bg-accent-main text-white border-accent-main"
								: i < section
									? "bg-background-primary text-accent-main border-accent-main/40"
									: "bg-white text-text-tertiary border-background-secondary"
						}`}
					>
						<span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
						{c.name}
					</div>
				))}
			</div>

			{/* Section card */}
			<div className="bg-white border border-background-secondary rounded-xl p-7 mb-4">
				<div className="font-mono text-[10px] tracking-widest uppercase text-accent-text mb-1">
					{cat.icon} Category {section + 1} of {CATEGORIES.length}
				</div>
				<div className="text-[17px] font-bold text-foreground mb-6 tracking-tight">
					{cat.label}
				</div>

				{cat.questions.map((q, qi) => (
					<div
						key={q.id}
						className={`mb-6 pb-6 border-b border-background-primary last:mb-0 last:pb-0 last:border-0`}
					>
						<div className="text-[14px] font-medium text-text-main mb-1 leading-snug">
							{q.text}
						</div>
						{q.sub && (
							<div className="text-[11px] text-text-tertiary mb-3">{q.sub}</div>
						)}

						{q.type === "yn" ? (
							<div className="flex gap-2">
								{(["yes", "no"] as const).map((v) => (
									<button
										key={v}
										onClick={() => answer(q.id, v)}
										className={`flex-1 py-2.5 rounded-lg border-[1.5px] text-[13px] font-medium transition-all ${
											answers[q.id] === v
												? v === "yes"
													? "bg-accent-main/10 border-accent-main text-accent-main"
													: "bg-destructive-background/10 border-destructive-background text-destructive-foreground"
												: "bg-background-main border-background-secondary text-text-secondary hover:border-accent-main hover:text-accent-main"
										}`}
									>
										{v === "yes" ? "✓ Yes" : "✗ No"}
									</button>
								))}
							</div>
						) : (
							<div className="flex flex-col gap-2">
								{(q as MCQuestion).options.map((opt, oi) => (
									<button
										key={oi}
										onClick={() => answer(q.id, oi)}
										className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border-[1.5px] text-[13px] text-left transition-all ${
											answers[q.id] === oi
												? "bg-accent-main/10 border-accent-main text-accent-main font-medium"
												: "bg-background-main border-background-secondary text-text-primary hover:border-accent-main hover:bg-white"
										}`}
									>
										<span
											className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-[9px] ${answers[q.id] === oi ? "bg-accent-main border-accent-main text-white" : "border-background-secondary"}`}
										>
											{answers[q.id] === oi ? "✓" : ""}
										</span>
										{opt}
									</button>
								))}
							</div>
						)}
					</div>
				))}
			</div>

			{/* Nav */}
			<div className="flex justify-between items-center">
				<button
					onClick={() => section > 0 && setSection((s) => s - 1)}
					className={`px-5 py-2.5 rounded-lg text-[13px] font-medium bg-background-primary text-text-secondary hover:bg-background-secondary transition-colors ${section === 0 ? "invisible" : ""}`}
				>
					← Back
				</button>
				<button
					onClick={next}
					disabled={!secAnswered}
					className="px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-accent-main text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
				>
					{section === CATEGORIES.length - 1 ? "Get My Results →" : "Next →"}
				</button>
			</div>
		</div>
	);
}

// ─── Intro ────────────────────────────────────────────────────────────────────

function Intro({ onStart }: { onStart: () => void }) {
	return (
		<div className="max-w-[600px] mx-auto px-6 py-14 text-center">
			<div className="inline-flex items-center gap-2 bg-accent-main/10 border border-accent-main/20 text-accent-main font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full mb-6">
				<span className="w-1.5 h-1.5 rounded-full bg-accent-main animate-pulse" />
				Free Business Health Scorecard
			</div>
			<h1 className="text-4xl font-bold text-foreground tracking-tight mb-4">
				How Healthy Is Your HVAC Business?
			</h1>
			<p className="text-[15px] text-text-secondary leading-relaxed mb-8 max-w-md mx-auto">
				25 questions. 5 categories. Get your grade, your category breakdown, and
				a custom action plan — in under 5 minutes.
			</p>
			<div className="grid grid-cols-3 gap-4 mb-8">
				{[
					{ val: "25", sub: "Questions across 5 categories" },
					{ val: "5 min", sub: "Average completion time" },
					{ val: "CSV", sub: "Full report export included" }
				].map((s) => (
					<div
						key={s.sub}
						className="bg-white border border-background-secondary rounded-xl p-4"
					>
						<div className="text-[22px] font-bold text-accent-main tracking-tight">
							{s.val}
						</div>
						<div className="text-[11px] text-text-tertiary mt-1 leading-snug">
							{s.sub}
						</div>
					</div>
				))}
			</div>
			<button
				onClick={onStart}
				className="bg-accent-main text-white rounded-lg px-8 py-3.5 text-[15px] font-semibold hover:opacity-90 transition-opacity"
			>
				Start Scorecard →
			</button>
		</div>
	);
}

// ─── Results ─────────────────────────────────────────────────────────────────

function Results({
	answers,
	onExport
}: {
	answers: Record<string, unknown>;
	onExport: () => void;
}) {
	const scores = CATEGORIES.map((c) => ({
		...c,
		...scoreCategory(c, answers)
	}));
	const overall = Math.round(
		scores.reduce((s, c) => s + c.pct, 0) / scores.length
	);
	const grade = getGrade(overall);

	const pillFor = (pct: number) =>
		pct >= 75
			? {
					cls: "bg-success-background/20 text-success-foreground",
					label: "Strong"
				}
			: pct >= 55
				? {
						cls: "bg-warning-background/30 text-warning-text",
						label: "Needs Work"
					}
				: {
						cls: "bg-destructive-background/10 text-destructive-foreground",
						label: "Critical"
					};

	const barFor = (pct: number) =>
		pct >= 75 ? "#52b788" : pct >= 55 ? "#ffa200" : "#c9184a";

	return (
		<div className="max-w-[720px] mx-auto px-6 py-10 pb-16">
			{/* Grade card */}
			<div className="bg-foreground rounded-xl p-8 text-center mb-3">
				<div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-4">
					Your Overall Score
				</div>
				<div
					className="text-[96px] font-bold leading-none tracking-tight mb-2"
					style={{ color: grade.color }}
				>
					{grade.letter}
				</div>
				<div className="font-mono text-[22px] font-semibold text-white/40 mb-3">
					{overall} / 100
				</div>
				<div className="text-[14px] text-white/50 max-w-sm mx-auto leading-relaxed">
					{grade.desc}
				</div>
			</div>

			{/* Breakdown */}
			<div className="bg-white border border-background-secondary rounded-xl p-6 mb-3">
				<div className="text-[13px] font-semibold text-foreground mb-5">
					Category Breakdown
				</div>
				{scores.map((cat) => {
					const pill = pillFor(cat.pct);
					return (
						<div key={cat.id} className="mb-4 last:mb-0">
							<div className="flex justify-between items-center mb-1.5">
								<span className="text-[13px] font-medium text-text-main flex items-center gap-2">
									{cat.icon} {cat.label}
									<span
										className={`font-mono text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-full ${pill.cls}`}
									>
										{pill.label}
									</span>
								</span>
								<span className="font-mono text-[12px] text-text-tertiary">
									{cat.pct}%{" "}
									<span className="text-text-tertiary/50 text-[10px]">
										/ bench {cat.benchmark}%
									</span>
								</span>
							</div>
							<div className="h-1.5 bg-background-primary rounded-full overflow-hidden">
								<div
									className="h-full rounded-full transition-all duration-700"
									style={{ width: `${cat.pct}%`, background: barFor(cat.pct) }}
								/>
							</div>
						</div>
					);
				})}
			</div>

			{/* Actions */}
			<div className="flex gap-3 mb-3">
				<button
					onClick={onExport}
					className="flex-1 py-3 rounded-lg border border-background-secondary bg-white text-[13px] font-semibold text-text-main hover:bg-background-primary transition-colors flex items-center justify-center gap-2"
				>
					⬇ Download Full Report (CSV)
				</button>
				<button className="flex-1 py-3 rounded-lg bg-accent-main text-white text-[13px] font-semibold hover:opacity-90 transition-opacity">
					Start Free Trial →
				</button>
			</div>

			<div
				className="rounded-xl p-8 flex items-center justify-between gap-6 flex-wrap"
				style={{
					background: "linear-gradient(135deg, #42585e 0%, #1b3235 100%)"
				}}
			>
				<div>
					<h3 className="text-[17px] font-bold text-white mb-1.5 tracking-tight">
						TTC fixes every red flag on your list.
					</h3>
					<p className="text-[13px] text-white/40 max-w-sm leading-relaxed">
						Dispatch intelligence, agreement tracking, utilization, customer
						records — everything your scorecard flagged, handled automatically.
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<button className="bg-accent-main text-white rounded-lg px-6 py-2.5 text-[13px] font-semibold hover:opacity-90 transition-opacity">
						Start Free Trial
					</button>
					<button className="bg-transparent text-white/40 border border-white/15 rounded-lg px-6 py-2.5 text-[13px] font-medium hover:border-white/30 transition-all">
						Book a Demo
					</button>
				</div>
			</div>
		</div>
	);
}
