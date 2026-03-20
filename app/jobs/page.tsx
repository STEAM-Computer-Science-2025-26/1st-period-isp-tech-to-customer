"use client";

import MainContent from "@/components/layout/MainContent";
import { cn } from "@/lib/utils/index";
import { KpiCard } from "@/components/ui/Card";
import { JobDTO } from "@/app/types/types";
import ListPanel from "@/components/ui/ListPanel";
import FadeEnd from "@/components/ui/FadeEnd";
import { useBreakpoints } from "../hooks/useBreakpoints";
import { useJobs } from "@/lib/hooks/useJobs";

const JobsPage = () => {
	const {
		data: jobs = [],
		isLoading: jobsLoading,
		error: jobsError
	} = useJobs();
	useBreakpoints();

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
					data={(Array.isArray(jobs) ? jobs : jobs ? [jobs] : []) as JobDTO[]}
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
					<p className={cn("mx-2 text-sm text-red-600")}>{jobsError.message}</p>
				)}
			</MainContent>
		</>
	);
};

export default JobsPage;
