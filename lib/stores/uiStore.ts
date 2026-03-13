"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiDefaults = {
	sidebarAutoCollapse?: boolean;
};

type UiState = {
	sidebarAutoCollapse: boolean;
	sidebarIsStrip: boolean;
	mobileSidebarOpen: boolean;
	sidePanelOpen: boolean;
	initialized: boolean;
	initialize: (defaults?: UiDefaults) => void;
	setSidebarAutoCollapse: (value: boolean) => void;
	setSidebarIsStrip: (value: boolean) => void;
	setMobileSidebarOpen: (value: boolean) => void;
	setSidePanelOpen: (value: boolean) => void;
};

export const useUiStore = create<UiState>()(
	persist(
		(set) => ({
			sidebarAutoCollapse: true,
			sidebarIsStrip: false,
			mobileSidebarOpen: false,
			sidePanelOpen: false,
			initialized: false,
			initialize: (defaults) =>
				set((state) => {
					if (state.initialized) return state;
					return {
						initialized: true,
						sidebarAutoCollapse:
							defaults?.sidebarAutoCollapse ?? state.sidebarAutoCollapse,
						sidebarIsStrip: state.sidebarIsStrip,
						mobileSidebarOpen: state.mobileSidebarOpen,
						sidePanelOpen: state.sidePanelOpen
					};
				}),
			setSidebarAutoCollapse: (value) => set({ sidebarAutoCollapse: value }),
			setSidebarIsStrip: (value) => set({ sidebarIsStrip: value }),
			setMobileSidebarOpen: (value) => set({ mobileSidebarOpen: value }),
			setSidePanelOpen: (value) => set({ sidePanelOpen: value })
		}),
		{
			name: "ui-state",
			partialize: (state) => ({
				sidebarAutoCollapse: state.sidebarAutoCollapse,
				sidePanelOpen: state.sidePanelOpen
			})
		}
	)
);
