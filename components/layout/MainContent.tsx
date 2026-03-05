"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { useBreakpoints } from "@/app/hooks/useBreakpoints";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/sidebar/Sidebar";
import { defaultSidebarItems } from "@/components/layout/sidebar/SidebarItems";
import type { SidebarFlags } from "@/components/layout/sidebar/Sidebar";
import type { SidebarItemParams } from "@/app/types/types";

type MainContentProps = {
	children: React.ReactNode;
	className?: string;
	headerTitle?: string;
	sidebarTitle?: string;
	sidebarItems?: SidebarItemParams[];
	sidebarAutoCollapseDefault?: boolean;
	sidebarAutoCollapse?: boolean;
	sidebarIsStrip?: boolean;
	hideMobileToggleButton?: boolean;
	showHeader?: boolean;
	showSidebar?: boolean;
	onSidebarFlagsChange?: (flags: SidebarFlags) => void;
};

export default function MainContent({
	children,
	className,
	headerTitle = "Dashboard",
	sidebarTitle = "Tech to Customer",
	sidebarItems = defaultSidebarItems,
	sidebarAutoCollapseDefault = true,
	sidebarAutoCollapse,
	sidebarIsStrip,
	hideMobileToggleButton = true,
	showHeader = true,
	showSidebar = true,
	onSidebarFlagsChange
}: MainContentProps) {
	const { lgUp } = useBreakpoints();
	const [sidebarAutoCollapseState, setSidebarAutoCollapse] = useState(
		sidebarAutoCollapseDefault
	);
	const [sidebarIsStripState, setSidebarIsStrip] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const effectiveSidebarAutoCollapse =
		sidebarAutoCollapse ?? sidebarAutoCollapseState;
	const effectiveSidebarIsStrip = sidebarIsStrip ?? sidebarIsStripState;
	const desktopPaddingLeft = effectiveSidebarAutoCollapse
		? "calc(4.5rem + 1rem)"
		: "calc(var(--sidebar-desktop-width) + 1rem)";
	const mobilePaddingLeft = effectiveSidebarIsStrip ? "5.5rem" : "2rem";

	useEffect(() => {
		onSidebarFlagsChange?.({
			autoCollapse: effectiveSidebarAutoCollapse,
			isStrip: effectiveSidebarIsStrip,
			desktopExpanded: false
		});
	}, [
		effectiveSidebarAutoCollapse,
		effectiveSidebarIsStrip,
		onSidebarFlagsChange
	]);

	return (
		<>
			{showHeader ? (
				<Header
					sidebarAutoCollapse={effectiveSidebarAutoCollapse}
					sidebarIsStrip={effectiveSidebarIsStrip}
					onMobileMenuClick={() => setMobileSidebarOpen((open) => !open)}
					mobileMenuOpen={mobileSidebarOpen}
					title={headerTitle}
				/>
			) : null}
			<main
				className={clsx(
					className,
					"bg-background-main text-text-main w-full max-w-full min-h-screen py-4 pt-26 transition-[padding] duration-300 absolute mb-6 px-6 overflow-x-hidden"
				)}
				style={{
					paddingLeft: lgUp ? desktopPaddingLeft : mobilePaddingLeft
				}}
			>
				{children}
			</main>
			{showSidebar ? (
				<Sidebar
					title={sidebarTitle}
					autoCollapse={effectiveSidebarAutoCollapse}
					items={sidebarItems}
					mobileOpen={mobileSidebarOpen}
					onMobileOpenChange={setMobileSidebarOpen}
					hideMobileToggleButton={hideMobileToggleButton}
					onFlagsChange={({ autoCollapse, isStrip, desktopExpanded }) => {
						setSidebarAutoCollapse(autoCollapse);
						setSidebarIsStrip(isStrip);
						onSidebarFlagsChange?.({
							autoCollapse,
							isStrip,
							desktopExpanded
						});
					}}
				/>
			) : null}
		</>
	);
}
