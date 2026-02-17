import { DevDbTools } from '@/components/dev/db/DevDbTools';
import Header from '@/components/layout/Header';
import MainContent from '@/components/layout/MainContent';
import Sidebar from '@/components/layout/sidebar/Sidebar';
import { defaultSidebarItems } from '@/components/layout/sidebar/SidebarItems';
import React, { useState } from 'react'
import { cn } from '@/lib/utils/index';

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
			>
				<div className={cn('flex flex-row h-64 overflow-x-auto no-scrollbar gap-3 bg-transparent')}></div>
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