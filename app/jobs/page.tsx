"use client";

import MainContent from "@/components/layout/MainContent";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/index";
import { KpiCard } from "@/components/ui/Card";
import { JobDTO } from "@/app/types/types";
import ListPanel from "@/components/ui/ListPanel";
import FadeEnd from "@/components/ui/FadeEnd";
import Fab from "@/components/ui/Fab";
import { useBreakpoints } from "../hooks/useBreakpoints";
const FASTIFY_BASE_URL =
	process.env.NEXT_PUBLIC_FASTIFY_URL ?? "http://localhost:3001";
const FASTIFY_JOBS_URL = `${FASTIFY_BASE_URL}/jobs`;

const JobsPage = () => {
	const [jobs, setJobs] = useState<JobDTO[]>([]);

	const [jobsLoading, setJobsLoading] = useState(false);

	const [jobsError, setJobsError] = useState<string | null>(null);
	const { lgUp } = useBreakpoints();

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
			<MainContent className={cn(`flex flex-col gap-4`)}>
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
				>
					{jobsLoading ? (
						<p className={cn("grid-cols-full text-xs text-text-tertiary")}>
							Loading jobs...
						</p>
					) : jobs.length === 0 && !jobsLoading ? (
						<p className={cn("grid-cols-full text-xs text-text-tertiary")}>
							No jobs found. Create one using the plus button below!
						</p>
					) : null}
				</ListPanel>
				{jobsError && (
					<p className={cn("mx-2 text-sm text-red-600")}>{jobsError}</p>
				)}
				<Fab
					size={lgUp ? "md" : "sm"}
					icon="plus"
					className={cn("bottom-4 right-4")}
					title="Add New Job"
					onClick={() => console.log("Fab clicked!")}
				/>
			</MainContent>
		</>
	);
};

export default JobsPage;
