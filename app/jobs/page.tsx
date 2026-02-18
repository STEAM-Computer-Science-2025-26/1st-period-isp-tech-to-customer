"use client";

import { DevDbTools } from '@/components/dev/db/DevDbTools';
import Header from '@/components/layout/Header';
import MainContent from '@/components/layout/MainContent';
import Sidebar from '@/components/layout/sidebar/Sidebar';
import { defaultSidebarItems } from '@/components/layout/sidebar/SidebarItems';
import React, { useState } from 'react'
import { cn } from '@/lib/utils/index';
import {
	Card,
	KpiCard,
	LineGraphCard,
	ListCard,
	TableCard
} from "@/components/ui/Card";
import { JobDTO } from '@/app/types/types';
import ListPanel from '@/components/ui/ListPanel';
import FadeEnd from '@/components/ui/FadeEnd';

const JobsPage = () => {
  const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
	const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
					className={cn('h-48 w-full overflow-hidden')}
					orientation="horizontal"
					prefix="both"
					fromColorClass="from-background-main"
					sizeClass="w-8"
					wrapperClassName="flex px-2 flex-row h-full w-full overflow-x-auto no-scrollbar gap-3 bg-transparent"
				>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
					<KpiCard 
						title="Total Jobs Today"
						value="27"
						className={cn('w-xs shrink-0')}
					/>
				</FadeEnd>
				<ListPanel<JobDTO>
					columns={['Customer', 'Address', 'Type', 'Status', 'Priority', 'Scheduled']}
  					columnKeys={['customerName', 'address', 'jobType', 'status', 'priority', 'scheduledTime']}
					data={[]}
				/>
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
}

export default JobsPage