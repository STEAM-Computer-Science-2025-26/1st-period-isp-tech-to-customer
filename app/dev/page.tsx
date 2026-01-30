"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/sidebar/Sidebar";
import Header from "@/components/layout/Header";
import { defaultSidebarItems } from "@/components/layout/sidebar/SidebarItems";
import MainContent from "@/components/layout/MainContent";
import { DevDbTools } from "@/components/dev/db/DevDbTools";

export default function DevPage() {
	const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
	const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
	return (
		<>
			<Header
				sidebarAutoCollapse={sidebarAutoCollapse}
				sidebarIsStrip={sidebarIsStrip}
			/>
			<MainContent
				sidebarAutoCollapse={sidebarAutoCollapse}
				sidebarIsStrip={sidebarIsStrip}
			>
				<DevDbTools />
			</MainContent>
			<Sidebar
				title="Tech to Customer"
				autoCollapse={false}
				items={defaultSidebarItems}
				onFlagsChange={({ autoCollapse, isStrip }) => {
					setSidebarAutoCollapse(autoCollapse);
					setSidebarIsStrip(isStrip);
				}}
			/>
		</>
	);
}
