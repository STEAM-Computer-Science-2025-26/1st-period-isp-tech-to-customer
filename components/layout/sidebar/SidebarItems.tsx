import { SidebarItemParams } from "@/app/types/types";

/**
 * Shared sidebar item data.
 *
 * Keep icons as strings so the sidebar can resolve them internally
 * (see resolveIcon in Sidebar.tsx).
 */
export const defaultSidebarItems: SidebarItemParams[] = [
	{
		id: 1,
		title: "Home",
		icon: "home",
		onClick: () => {
			window.location.href = "/";
		}
	},
	{ id: 2, title: "Settings", icon: "settings" },
	{ id: 3, title: "Statistics", icon: "statistics" },
	{ id: 4, title: "Work History", icon: "history" },
	{ id: 5, title: "Calendar", icon: "calendar" },
	{ id: 6, title: "Tools", icon: "tools" },
	{ id: 7, title: "Dispatch", icon: "dispatch" },
	{
		id: 8,
		title: "Developer Tools",
		icon: "code",
		onClick: () => {
			window.location.href = "/dev";
		}
	},
	{ id: 9, title: "Jobs", icon: "briefcase", onClick: () => { window.location.href = "/jobs"; } },
];
