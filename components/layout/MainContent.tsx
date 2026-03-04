"use client";

import clsx from "clsx";
import { useState } from "react";
import { useBreakpoints } from "@/app/hooks/useBreakpoints";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/sidebar/Sidebar";
import { defaultSidebarItems } from "@/components/layout/sidebar/SidebarItems";
import type { SidebarItemParams } from "@/app/types/types";

type MainContentProps = {
	children: React.ReactNode;
	className?: string;
	headerTitle?: string;
	sidebarTitle?: string;
	sidebarItems?: SidebarItemParams[];
	sidebarAutoCollapseDefault?: boolean;
	hideMobileToggleButton?: boolean;
	showHeader?: boolean;
	showSidebar?: boolean;
};

export default function MainContent({
	children,
	className,
	headerTitle = "Dashboard",
	sidebarTitle = "Tech to Customer",
	sidebarItems = defaultSidebarItems,
	sidebarAutoCollapseDefault = false,
	hideMobileToggleButton = true,
	showHeader = true,
	showSidebar = true
}: MainContentProps) {
	const { lgUp } = useBreakpoints();
	const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(
		sidebarAutoCollapseDefault
	);
	const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	return (
		<>
			{showHeader ? (
				<Header
					sidebarAutoCollapse={sidebarAutoCollapse}
					sidebarIsStrip={sidebarIsStrip}
					onMobileMenuClick={() => setMobileSidebarOpen((open) => !open)}
					mobileMenuOpen={mobileSidebarOpen}
					title={headerTitle}
				/>
			) : null}
			<main
				className={clsx(
					className,
					"bg-background-main text-text-main w-full max-w-full min-h-screen py-4 pt-24 transition-[padding] duration-300 absolute mb-6 px-6 overflow-x-hidden",
					lgUp
						? sidebarAutoCollapse
							? "pl-6"
							: "pl-[calc(var(--sidebar-desktop-width)-var(--sidebar-main-gap))]"
						: sidebarIsStrip
							? "pl-22"
							: "pl-8"
				)}
			>
				{children}
			</main>
			{showSidebar ? (
				<Sidebar
					title={sidebarTitle}
					autoCollapse={sidebarAutoCollapse}
					items={sidebarItems}
					mobileOpen={mobileSidebarOpen}
					onMobileOpenChange={setMobileSidebarOpen}
					hideMobileToggleButton={hideMobileToggleButton}
					onFlagsChange={({ autoCollapse, isStrip }) => {
						setSidebarAutoCollapse(autoCollapse);
						setSidebarIsStrip(isStrip);
					}}
				/>
			) : null}
		</>
	);
}
