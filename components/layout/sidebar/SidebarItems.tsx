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
	{
		id: 2,
		title: "Developer Tools",
		icon: "code",
		onClick: () => {
			window.location.href = "/dev";
		}
	},
	{
		id: 3,
		title: "Jobs",
		icon: "briefcase",
		onClick: () => {
			window.location.href = "/jobs";
		}
	},
	{ id: 4, title: "Customers", icon: "users", onClick: () => {
		window.location.href = "/customers";
	} },
	{
		id: 5,
		title: "Calendar",
		icon: "calendar",
		onClick: () => {
			window.location.href = "/calendar";
		}
	}
];
