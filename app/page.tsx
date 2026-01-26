"use client";

import clsx from "clsx";
import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { SidebarItemParams, Point } from "@/app/types/types";
import {
	Calendar,
	Headset,
	History,
	Home as HomeIcon,
	Settings,
	Wrench,
	BarChart3,
	ArrowUpRight,
	ChevronRight,
	TrendingUp
} from "lucide-react";
import {
	Card,
	KpiCard,
	DataCard,
	ListCard,
	TableCard
} from "@/components/ui/Card";
import { useBreakpoints } from "@/app/hooks/useBreakpoints";
import Header from "@/components/layout/Header";

const lineData: Point[] = [
	{ x: 0, y: 42 },
	{ x: 1, y: 44 },
	{ x: 2, y: 43 },
	{ x: 3, y: 45 },
	{ x: 4, y: 47 },
	{ x: 5, y: 46 },
	{ x: 6, y: 48 },
	{ x: 7, y: 50 },
	{ x: 8, y: 49 },
	{ x: 9, y: 51 },
	{ x: 10, y: 53 },
	{ x: 11, y: 52 },

	{ x: 12, y: 54 },
	{ x: 13, y: 55 },
	{ x: 14, y: 56 },
	{ x: 15, y: 55 },
	{ x: 16, y: 57 },
	{ x: 17, y: 58 },
	{ x: 18, y: 59 },
	{ x: 19, y: 60 },

	{ x: 20, y: 61 },
	{ x: 21, y: 62 },
	{ x: 22, y: 61 },
	{ x: 23, y: 63 },
	{ x: 24, y: 64 },
	{ x: 25, y: 65 },
	{ x: 26, y: 66 },
	{ x: 27, y: 65 },

	{ x: 28, y: 64 },
	{ x: 29, y: 63 },
	{ x: 30, y: 61 },
	{ x: 31, y: 60 },
	{ x: 32, y: 58 },
	{ x: 33, y: 56 },
	{ x: 34, y: 55 },
	{ x: 35, y: 54 },

	{ x: 36, y: 53 },
	{ x: 37, y: 52 },
	{ x: 38, y: 51 },
	{ x: 39, y: 50 },
	{ x: 40, y: 49 },
	{ x: 41, y: 48 },
	{ x: 42, y: 47 },
	{ x: 43, y: 46 },

	{ x: 44, y: 47 },
	{ x: 45, y: 48 },
	{ x: 46, y: 49 },
	{ x: 47, y: 50 },
	{ x: 48, y: 51 },
	{ x: 49, y: 52 },
	{ x: 50, y: 54 },
	{ x: 51, y: 55 },

	{ x: 52, y: 56 },
	{ x: 53, y: 57 },
	{ x: 54, y: 59 },
	{ x: 55, y: 60 },
	{ x: 56, y: 61 },
	{ x: 57, y: 62 },
	{ x: 58, y: 64 },
	{ x: 59, y: 65 },

	{ x: 60, y: 66 },
	{ x: 61, y: 67 },
	{ x: 62, y: 68 },
	{ x: 63, y: 69 },
	{ x: 64, y: 70 },
	{ x: 65, y: 71 },
	{ x: 66, y: 72 },
	{ x: 67, y: 73 },

	{ x: 68, y: 74 },
	{ x: 69, y: 75 },
	{ x: 70, y: 76 },
	{ x: 71, y: 77 },
	{ x: 72, y: 78 },
	{ x: 73, y: 79 },
	{ x: 74, y: 80 },
	{ x: 75, y: 81 },

	{ x: 76, y: 82 },
	{ x: 77, y: 83 },
	{ x: 78, y: 84 },
	{ x: 79, y: 85 },
	{ x: 80, y: 86 },
	{ x: 81, y: 87 },
	{ x: 82, y: 88 },
	{ x: 83, y: 89 },

	{ x: 84, y: 90 },
	{ x: 85, y: 91 },
	{ x: 86, y: 92 },
	{ x: 87, y: 93 },
	{ x: 88, y: 94 },
	{ x: 89, y: 95 },
	{ x: 90, y: 96 },
	{ x: 91, y: 97 },

	{ x: 92, y: 98 },
	{ x: 93, y: 99 },
	{ x: 94, y: 100 },
	{ x: 95, y: 101 },
	{ x: 96, y: 102 },
	{ x: 97, y: 103 },
	{ x: 98, y: 104 },
	{ x: 99, y: 105 }
];

const sidebarItems: SidebarItemParams[] = [
	{ id: 1, title: "Home", icon: HomeIcon },
	{ id: 2, title: "Settings", icon: Settings },
	{ id: 3, title: "Statistics", icon: BarChart3 },
	{ id: 4, title: "Work History", icon: History },
	{ id: 5, title: "Calendar", icon: Calendar },
	{ id: 6, title: "Tools", icon: Wrench },
	{ id: 7, title: "Dispatch", icon: Headset }
];

const openJobsColumns = [
	{ key: "id", header: "ID" },
	{ key: "customer", header: "Customer" },
	{ key: "status", header: "Status" }
] as const;

const openJobsRows = [
	{ id: "1042", customer: "Acme", status: "Open" },
	{ id: "1043", customer: "Globex", status: "In progress" }
];

export default function Home() {
	const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
	const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
	const { lgUp } = useBreakpoints();

	return (
		<>
			<Header
				sidebarAutoCollapse={sidebarAutoCollapse}
				sidebarIsStrip={sidebarIsStrip}
			/>
			<main
				className={clsx(
					"bg-background-main text-text-main w-full min-h-screen py-4 pt-24 transition-[padding] duration-300 absolute mb-6 px-6",
					lgUp
						? sidebarAutoCollapse
							? "pl-6"
							: "pl-[calc(var(--sidebar-desktop-width)-var(--sidebar-main-gap))]"
						: sidebarIsStrip
							? "pl-20"
							: "pl-6"
				)}
			>
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 mx-auto">
					<Card
						type="kpi"
						title="Total Jobs Today"
						value="27"
						trend={{ value: "+12%", tone: "success" }}
						meta="vs yesterday"
						icon={<TrendingUp className="h-5 w-5 text-text-secondary" />}
						actions={
							<button className="text-xs text-text-secondary hover:text-text-main transition-colors">
								View
							</button>
						}
						footer="Updated 2 minutes ago"
					/>

					<KpiCard
						title="Avg. Response Time"
						subtitle="Last 7 days"
						value="14m"
						trend={{ value: "-3m", tone: "info" }}
						meta="median"
						icon={<ArrowUpRight className="h-5 w-5 text-text-secondary" />}
					/>

					<DataCard
						title="Weekly Volume"
						subtitle="Requests by day"
						toolbar={
							<div className="flex items-center gap-2">
								<button className="text-xs px-2 py-1 rounded-md bg-background-secondary/60 hover:bg-background-secondary transition-colors">
									7d
								</button>
								<button className="text-xs px-2 py-1 rounded-md bg-background-secondary/60 hover:bg-background-secondary transition-colors">
									30d
								</button>
							</div>
						}
						dataType="line"
						data={{
							points: lineData,
							lineType: "ema",
							width: 300,
							height: 150,
							yAxisLabel: "Y axis",
							xAxisLabel: "X axis"
						}}
					/>

					<TableCard
						title="Open Jobs Table"
						subtitle="Top 5 by priority"
						toolbar={
							<div className="text-xs text-text-secondary">Filter: All</div>
						}
						columns={[...openJobsColumns]}
						rows={[...openJobsRows]}
						getRowKey={(row) => row.id}
					/>

					<Card
						type="list"
						title="Quick Links"
						subtitle="Common pages"
						items={[
							{
								id: "customers",
								label: "Customers",
								description: "View and manage accounts",
								href: "/customers",
								right: <ChevronRight className="h-4 w-4" />
							},
							{
								id: "jobs",
								label: "Jobs",
								description: "Support requests and triage",
								href: "/jobs",
								right: <ChevronRight className="h-4 w-4" />
							}
						]}
					/>

					<ListCard
						title="Next Steps"
						subtitle="Do these in order"
						ordered
						items={[
							{
								label: "Verify customer info",
								description: "Confirm address and plan",
								onClick: () => console.log("verify"),
								right: <span className="text-xs">1 min</span>
							},
							{
								label: "Run line test",
								description: "Check signal + modem status",
								onClick: () => console.log("line test"),
								right: <span className="text-xs">3 min</span>
							},
							{
								label: "Schedule technician",
								description: "If issue persists",
								onClick: () => console.log("schedule"),
								right: <span className="text-xs">5 min</span>
							}
						]}
						footer="Tip: click an item to start the step"
					/>
				</div>
			</main>
			<Sidebar
				title="Tech to Customer"
				autoCollapse={false}
				items={sidebarItems}
				onFlagsChange={({ autoCollapse, isStrip }) => {
					setSidebarAutoCollapse(autoCollapse);
					setSidebarIsStrip(isStrip);
				}}
			/>
		</>
	);
}
