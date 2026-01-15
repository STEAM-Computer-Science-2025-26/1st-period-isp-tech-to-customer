export type SidebarItemParams = {
	id: number;
	title: string;
	icon: string;
	onClick?: () => void;
}

export type SidebarParams =  {
	autoCollapse?: boolean;
	items?: SidebarItemParams[];
}