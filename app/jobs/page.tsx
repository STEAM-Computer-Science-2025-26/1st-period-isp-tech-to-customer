"use client";

import { DevDbTools } from "@/components/dev/db/DevDbTools";
import Header from "@/components/layout/Header";
import MainContent from "@/components/layout/MainContent";
import Sidebar from "@/components/layout/sidebar/Sidebar";
import { defaultSidebarItems } from "@/components/layout/sidebar/SidebarItems";
import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils/index";
import {
	Card,
	KpiCard,
	LineGraphCard,
	ListCard,
	TableCard
} from "@/components/ui/Card";
import { JobDTO } from "@/app/types/types";
import ListPanel from "@/components/ui/ListPanel";
import FadeEnd from "@/components/ui/FadeEnd";
const FASTIFY_BASE_URL =
	process.env.NEXT_PUBLIC_FASTIFY_URL ?? "http://localhost:3001";
const FASTIFY_JOBS_URL = `${FASTIFY_BASE_URL}/jobs`;

const JobsPage = () => {
	const [jobs, setJobs] = useState<JobDTO[]>([]);
	const [jobsLoading, setJobsLoading] = useState(false);
	const [jobsError, setJobsError] = useState<string | null>(null);
	const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
	const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

	useEffect(() => {
		let isMounted = true;

		const loadJobs = async () => {
			setJobsLoading(true);
			setJobsError(null);

			try {
				const token =
					localStorage.getItem("authToken") ??
					localStorage.getItem("token") ??
					localStorage.getItem("jwt");

				const headers: HeadersInit = {};
				if (token) {
					headers.Authorization = `Bearer ${token}`;
				}

				const response = await fetch(FASTIFY_JOBS_URL, {
					method: "GET",
					mode: "cors",
					headers
				});
				if (!response.ok) {
					if (response.status === 401 && !token) {
						throw new Error("Missing auth token for Fastify jobs.");
					}
					throw new Error(`Failed to load jobs (${response.status})`);
				}
				const data = (await response.json()) as { jobs?: JobDTO[] };
				if (isMounted) {
					setJobs(data.jobs ?? []);
				}
			} catch (error) {
				if (isMounted) {
					const message =
						error instanceof Error ? error.message : "Failed to load jobs";
					setJobsError(message);
					setJobs([]);
				}
			} finally {
				if (isMounted) {
					setJobsLoading(false);
				}
			}
		};

		void loadJobs();

		return () => {
			isMounted = false;
		};
	}, []);
	return (
		<>
			<Header
				sidebarAutoCollapse={sidebarAutoCollapse}
				sidebarIsStrip={sidebarIsStrip}
				onMobileMenuClick={() => setMobileSidebarOpen((open) => !open)}
				mobileMenuOpen={mobileSidebarOpen}
			/>
			<MainContent
				sidebarAutoCollapse={sidebarAutoCollapse}
				sidebarIsStrip={sidebarIsStrip}
				className={cn(`flex flex-col gap-4`)}
			>
				<FadeEnd
					className={cn("h-48 w-full overflow-hidden")}
					orientation="horizontal"
					prefix="both"
					fromColorClass="from-background-main"
					sizeClass="w-8"
					wrapperClassName="flex px-2 flex-row h-full w-full overflow-x-auto no-scrollbar gap-3 bg-transparent"
				>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Total Jobs Today"
						value="27"
						className={cn("w-xs shrink-0")}
					/>
				</FadeEnd>
				<ListPanel<JobDTO>
					columns={[
						"Customer",
						"Address",
						"Type",
						"Status",
						"Priority",
						"Scheduled"
					]}
					columnKeys={[
						"customerName",
						"address",
						"jobType",
						"status",
						"priority",
						"scheduledTime"
					]}
					data={jobs}
					className={cn("mx-2")}
				/>
				{jobsLoading && (
					<p className={cn("mx-2 text-sm text-muted-foreground")}>
						Loading jobs...
					</p>
				)}
				{jobsError && (
					<p className={cn("mx-2 text-sm text-red-600")}>{jobsError}</p>
				)}
			</MainContent>
			<Sidebar
				title="Tech to Customer"
				autoCollapse={false}
				items={defaultSidebarItems}
				mobileOpen={mobileSidebarOpen}
				onMobileOpenChange={setMobileSidebarOpen}
				hideMobileToggleButton
				onFlagsChange={({ autoCollapse, isStrip }) => {
					setSidebarAutoCollapse(autoCollapse);
					setSidebarIsStrip(isStrip);
				}}
			/>
		</>
	);
};

export default JobsPage;
