"use client";

import clsx from "clsx";
import { useEffect } from "react";
import { useBreakpoints } from "@/app/hooks/useBreakpoints";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/sidebar/Sidebar";
import { defaultSidebarItems } from "@/components/layout/sidebar/SidebarItems";
import type { SidebarFlags } from "@/components/layout/sidebar/Sidebar";
import type { SidebarItemParams } from "@/app/types/types";
import Fab from "../ui/Fab";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/uiStore";

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
	showFab?: boolean;
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
	onSidebarFlagsChange,
	showFab = true
}: MainContentProps) {
	const { lgUp } = useBreakpoints();
	const initializeUi = useUiStore((state) => state.initialize);
	const sidebarAutoCollapseState = useUiStore(
		(state) => state.sidebarAutoCollapse
	);
	const sidebarIsStripState = useUiStore((state) => state.sidebarIsStrip);
	const mobileSidebarOpen = useUiStore((state) => state.mobileSidebarOpen);
	const setSidebarAutoCollapse = useUiStore(
		(state) => state.setSidebarAutoCollapse
	);
	const setSidebarIsStrip = useUiStore((state) => state.setSidebarIsStrip);
	const setMobileSidebarOpen = useUiStore(
		(state) => state.setMobileSidebarOpen
	);

	const shouldSyncAutoCollapse = sidebarAutoCollapse === undefined;
	const shouldSyncStrip = sidebarIsStrip === undefined;
	const effectiveSidebarAutoCollapse =
		sidebarAutoCollapse ?? sidebarAutoCollapseState;
	const effectiveSidebarIsStrip = sidebarIsStrip ?? sidebarIsStripState;
	const desktopPaddingLeft = effectiveSidebarAutoCollapse
		? "calc(4.5rem + 1rem)"
		: "calc(var(--sidebar-desktop-width) + 1rem)";
	const mobilePaddingLeft = effectiveSidebarIsStrip ? "5.5rem" : "2rem";

	useEffect(() => {
		initializeUi({ sidebarAutoCollapse: sidebarAutoCollapseDefault });
	}, [initializeUi, sidebarAutoCollapseDefault]);

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
					onMobileMenuClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
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
			{showFab && (
				<Fab
					size={lgUp ? "md" : "lg"}
					icon="plus"
					className={cn("bottom-4 right-4")}
					title="Add New Customer"
				/>
			)}
			{showSidebar ? (
				<Sidebar
					title={sidebarTitle}
					autoCollapse={effectiveSidebarAutoCollapse}
					items={sidebarItems}
					mobileOpen={mobileSidebarOpen}
					onMobileOpenChange={setMobileSidebarOpen}
					hideMobileToggleButton={hideMobileToggleButton}
					onFlagsChange={({ autoCollapse, isStrip, desktopExpanded }) => {
						if (shouldSyncAutoCollapse) {
							setSidebarAutoCollapse(autoCollapse);
						}
						if (shouldSyncStrip) {
							setSidebarIsStrip(isStrip);
						}
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
