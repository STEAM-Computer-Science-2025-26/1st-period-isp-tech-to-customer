"use client";

import { SidebarItemParams, SidebarParams } from "@/app/types/types";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";


import {
	BarChart3,
	Calendar,
	Headset,
	History,
	Home,
	Pin,
	PinOff,
	Settings,
	User,
	Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

export default function Sidebar({
	autoCollapse = true,
	title = "Tech to Customer",
	items = [],
}: SidebarParams = {}) {
	const [isAutoCollapse, setIsAutoCollapse] = useState(autoCollapse);

	const sidebarItems = useMemo(() => {
		return items.map((item) => ({
			...item,
			icon: resolveIcon(item.icon),
		}));
	}, [items]);

	return (
		<aside
			className={clsx(
				"w-1/4 max-w-76 min-w-56 absolute inset-y-0 left-0 px-4 pr-8 py-4 pointer-events-auto",
				isAutoCollapse
					? "pointer-events-auto -translate-x-[calc(100%-1rem)] hover:translate-x-0 transition-transform duration-300"
					: ""
			)}
		>
			<div className="w-full h-full bg-background-secondary/50 rounded-xl backdrop-blur-md pointer-events-auto flex flex-col gap-3 px-1.5 py-2">
				<div className="flex items-center gap-2 px-2 pt-1">
					<button
						type="button"
						onClick={() => setIsAutoCollapse((v) => !v)}
						className="h-8 w-8 grid place-items-center rounded-md hover:bg-background-secondary/50 transition-colors duration-200"
						aria-label="Toggle sidebar"
						title={isAutoCollapse ? "Pin sidebar open" : "Enable auto-collapse"}
					>
						{isAutoCollapse ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />}
					</button>
					<div className="flex items-center gap-2 min-w-0">
						<div className="h-2 w-2 rounded-full bg-text-main/70" aria-hidden="true" />
						<h2 className="text-sm font-semibold tracking-wide opacity-90 truncate">{title}</h2>
					</div>
				</div>

				<ul className="grid grid-cols-[2rem_1fr] gap-2 w-full px-1">
					{sidebarItems.map((item) => (
						<SidebarItem
							id={item.id}
							key={item.id}
							title={item.title}
							icon={item.icon}
							onClick={item.onClick}
						/>
					))}
				</ul>

				<div className="mt-auto px-1">
					<div className="h-px w-full bg-background-secondary/50 my-2" />
					<AccountItem />
				</div>
			</div>
		</aside>
	);
}

function SidebarItem({ title, icon: Icon, onClick }: SidebarItemParams) {
	return (
		<li
			onClick={onClick}
			className={clsx(
				"grid col-span-2 grid-cols-subgrid w-full transition-colors duration-200 h-9 items-center rounded-md px-2",
				onClick ? "cursor-pointer hover:bg-background-secondary/50" : "opacity-80"
			)}
		>
			<div className="grid place-items-center">
				{/* lucide-react icons are forwardRef components, not always typeof === 'function' */}
				{Icon ? <Icon className="h-5 w-5" /> : null}
			</div>
			<p className="text-sm">{title}</p>
		</li>
	);
}

function AccountItem() {
	return (
		<div className="grid grid-cols-[2rem_1fr] gap-2 w-full h-10 items-center rounded-md px-2 hover:bg-background-secondary/50 transition-colors duration-200 cursor-pointer">
			<div className="grid place-items-center">
				<div className="h-7 w-7 rounded-full bg-background-secondary/60 border border-background-secondary/80" />
			</div>
			<div className="flex flex-col leading-tight">
				<span className="text-sm font-medium">Account</span>
				<span className="text-xs opacity-70">Profile & settings</span>
			</div>
		</div>
	);
}

function resolveIcon(icon: string | LucideIcon): LucideIcon {
	if (typeof icon !== "string") return icon;

	const key = icon.trim().toLowerCase();
	const map: Record<string, LucideIcon> = {
		home: Home,
		gear: Settings,
		settings: Settings,
		user: User,
		profile: User,
		history: History,
		calendar: Calendar,
		wrench: Wrench,
		tools: Wrench,
		headset: Headset,
		dispatch: Headset,
		stats: BarChart3,
		statistics: BarChart3,
	};

	return map[key] ?? User;
}