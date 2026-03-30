"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, TrendingUp } from "lucide-react";
import {
	Card,
	KpiCard,
	LineGraphCard,
	ListCard,
	TableCard
} from "@/components/ui/Card";
import MainContent from "@/components/layout/MainContent";
import { apiFetch } from "@/lib/api";

const openJobsColumns = [
	{ key: "id", header: "ID" },
	{ key: "customer", header: "Customer" },
	{ key: "status", header: "Status" },
	{ key: "priority", header: "Priority" }
] as const;

type DashboardAnalyticsResponse = {
	days: number;
	jobsToday: number;
	jobsYesterday: number;
	jobsChangePct: number | null;
	avgResponseMinutes: number | null;
	avgResponseDeltaMinutes: number | null;
	jobVolume: { day: string; count: number }[];
	openJobs: {
		id: string;
		customer: string;
		status: string;
		priority: string;
	}[];
	counts: {
		customers: number;
		employees: number;
		openJobs: number;
	};
	statusCounts: {
		unassigned: number;
		inProgress: number;
		scheduledNext24: number;
	};
};

function formatMinutes(totalMinutes: number | null): string {
	if (totalMinutes == null || Number.isNaN(totalMinutes)) return "--";
	if (totalMinutes < 60) return `${Math.round(totalMinutes)}m`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = Math.round(totalMinutes % 60);
	return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDeltaMinutes(deltaMinutes: number | null): string {
	if (deltaMinutes == null || Number.isNaN(deltaMinutes)) return "--";
	const prefix = deltaMinutes > 0 ? "+" : "";
	return `${prefix}${Math.round(deltaMinutes)}m`;
}

function formatPct(value: number | null): string {
	if (value == null || Number.isNaN(value)) return "--";
	const prefix = value > 0 ? "+" : "";
	return `${prefix}${value}%`;
}

export default function Home() {
	const [rangeDays, setRangeDays] = useState(30);
	const { data, isLoading } = useQuery({
		queryKey: ["dashboard-analytics", rangeDays],
		queryFn: () =>
			apiFetch<DashboardAnalyticsResponse>(
				`/api/analytics/dashboard?days=${rangeDays}`
			)
	});

	const linePoints = useMemo(
		() =>
			(data?.jobVolume ?? []).map((row, index) => ({
				x: index,
				y: row.count
			})),
		[data]
	);

	const jobsTodayValue = data?.jobsToday ?? 0;
	const jobsTrendValue = formatPct(data?.jobsChangePct ?? null);
	const jobsTrendTone =
		data?.jobsChangePct == null
			? "neutral"
			: data.jobsChangePct >= 0
				? "success"
				: "warning";

	const avgResponseValue = formatMinutes(data?.avgResponseMinutes ?? null);
	const avgResponseDelta = formatDeltaMinutes(
		data?.avgResponseDeltaMinutes ?? null
	);
	const avgResponseTone =
		data?.avgResponseDeltaMinutes == null
			? "neutral"
			: data.avgResponseDeltaMinutes <= 0
				? "success"
				: "warning";

	const quickLinks = [
		{
			id: "customers",
			label: "Customers",
			description: `${data?.counts.customers ?? 0} total`,
			href: "/customers",
			right: <ChevronRight className="h-4 w-4" />
		},
		{
			id: "jobs",
			label: "Open Jobs",
			description: `${data?.counts.openJobs ?? 0} in queue`,
			href: "/jobs",
			right: <ChevronRight className="h-4 w-4" />
		},
		{
			id: "employees",
			label: "Technicians",
			description: `${data?.counts.employees ?? 0} active`,
			href: "/employees",
			right: <ChevronRight className="h-4 w-4" />
		}
	];

	const nextSteps = [
		{
			label: "Assign unassigned jobs",
			description: `${data?.statusCounts.unassigned ?? 0} waiting`,
			href: "/dispatch",
			right: <span className="text-xs">queue</span>
		},
		{
			label: "Monitor in-progress",
			description: `${data?.statusCounts.inProgress ?? 0} active`,
			href: "/jobs",
			right: <span className="text-xs">live</span>
		},
		{
			label: "Prep next 24h",
			description: `${data?.statusCounts.scheduledNext24 ?? 0} scheduled`,
			href: "/calendar",
			right: <span className="text-xs">calendar</span>
		}
	];

	return (
		<>
			<MainContent>
				<div className="grid w-full max-w-full gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 mx-auto">
					<Card
						type="kpi"
						title="Total Jobs Today"
						value={isLoading ? "--" : jobsTodayValue}
						trend={{ value: jobsTrendValue, tone: jobsTrendTone }}
						meta="vs yesterday"
						icon={<TrendingUp className="h-5 w-5 text-text-secondary" />}
						actions={
							<button className="text-xs text-text-secondary hover:text-text-main transition-colors">
								View
							</button>
						}
						footer={isLoading ? "Loading..." : `Last ${rangeDays} days`}
					/>

					<KpiCard
						title="Avg. Response Time"
						subtitle={`Last ${rangeDays} days`}
						value={isLoading ? "--" : avgResponseValue}
						trend={{ value: avgResponseDelta, tone: avgResponseTone }}
						meta="avg to first assignment"
					/>

					<LineGraphCard
						title="Weekly Volume"
						subtitle="Requests by day"
						toolbar={
							<div className="flex items-center gap-2">
								<button
									className={`text-xs px-2 py-1 rounded-md transition-colors ${
										rangeDays === 7
											? "bg-background-secondary"
											: "bg-background-secondary/60 hover:bg-background-secondary"
									}`}
									onClick={() => setRangeDays(7)}
								>
									7d
								</button>
								<button
									className={`text-xs px-2 py-1 rounded-md transition-colors ${
										rangeDays === 30
											? "bg-background-secondary"
											: "bg-background-secondary/60 hover:bg-background-secondary"
									}`}
									onClick={() => setRangeDays(30)}
								>
									30d
								</button>
							</div>
						}
						chartAnimateOnLoad
						chartAnimateDurationMs={900}
						data={{
							points: linePoints,
							lineType: "connect",
							width: 300,
							height: 150,
							yAxisLabel: "Jobs",
							xAxisLabel: "Days"
						}}
					/>

					<TableCard
						title="Open Jobs Table"
						subtitle="Top 5 by priority"
						toolbar={
							<div className="text-xs text-text-secondary">
								{isLoading ? "Loading..." : "Filter: Open"}
							</div>
						}
						columns={[...openJobsColumns]}
						rows={[...(data?.openJobs ?? [])]}
						getRowKey={(row) => row.id}
						emptyState={isLoading ? "Loading jobs..." : "No open jobs"}
					/>

					<Card
						type="list"
						title="Quick Links"
						subtitle="Common pages"
						items={quickLinks}
					/>

					<ListCard
						title="Next Steps"
						subtitle="Do these in order"
						ordered
						items={nextSteps}
						footer={
							isLoading ? "Loading priorities..." : "Based on live job queue"
						}
					/>
				</div>
			</MainContent>
		</>
	);
}
