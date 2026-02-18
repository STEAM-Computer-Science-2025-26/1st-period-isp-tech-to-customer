"use client";

import { SidebarItemParams, SidebarParams } from "@/app/types/types";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

import {
	BarChart3,
	Calendar,
	ChevronLeft,
	ChevronRight,
	Headset,
	History,
	Home,
	PanelLeft,
	PanelLeftOpen,
	Settings,
	User,
	Wrench,
	Code,
	Briefcase
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useBreakpoints } from "@/app/hooks/useBreakpoints";
import { defaultSidebarItems } from "./SidebarItems";

export type SidebarFlags = {
	autoCollapse: boolean;
	isStrip: boolean;
};

export default function Sidebar({
	autoCollapse = true,
	mobile,
	title = "Tech to Customer",
	items = defaultSidebarItems,
	mobileOpen,
	onMobileOpenChange,
	hideMobileToggleButton,
	onFlagsChange
}: SidebarParams & { onFlagsChange?: (flags: SidebarFlags) => void } = {}) {
	const [isAutoCollapse, setIsAutoCollapse] = useState(autoCollapse);

	useEffect(() => {
		setIsAutoCollapse(autoCollapse);
	}, [autoCollapse]);

	const sidebarItems = useMemo(() => {
		return items.map((item) => ({
			...item,
			icon: resolveIcon(item.icon)
		}));
	}, [items]);

	const { lgUp } = useBreakpoints();
	const activeVariant =
		mobile === true
			? "mobile"
			: mobile === false
				? "desktop"
				: lgUp
					? "desktop"
					: "mobile";
	const showMobile = mobile !== false;
	const showDesktop = mobile !== true;
	const mobileVisibilityClass = mobile === true ? "" : "lg:hidden";
	const desktopVisibilityClass = mobile === false ? "" : "hidden lg:block";

	useEffect(() => {
		if (activeVariant !== "desktop") return;
		onFlagsChange?.({ autoCollapse: isAutoCollapse, isStrip: false });
	}, [activeVariant, isAutoCollapse, onFlagsChange]);

	return (
		<>
			{showMobile ? (
				<MobileSidebar
					visibilityClass={mobileVisibilityClass}
					title={title}
					items={sidebarItems}
					isAutoCollapse={isAutoCollapse}
					setIsAutoCollapse={setIsAutoCollapse}
					onFlagsChange={onFlagsChange}
					isActive={activeVariant === "mobile"}
					mobileOpen={mobileOpen}
					onMobileOpenChange={onMobileOpenChange}
					hideToggleButton={hideMobileToggleButton}
				/>
			) : null}

			{showDesktop ? (
				<DesktopSidebar
					visibilityClass={desktopVisibilityClass}
					title={title}
					items={sidebarItems}
					isAutoCollapse={isAutoCollapse}
					setIsAutoCollapse={setIsAutoCollapse}
				/>
			) : null}
		</>
	);
}

function DesktopSidebar({
	visibilityClass,
	title,
	items,
	isAutoCollapse,
	setIsAutoCollapse
}: {
	visibilityClass: string;
	title: string;
	items: Array<SidebarItemParams & { icon: LucideIcon }>;
	isAutoCollapse: boolean;
	setIsAutoCollapse: React.Dispatch<React.SetStateAction<boolean>>;
}) {
	return (
		<aside
			className={clsx(
				"z-50 w-(--sidebar-desktop-width) fixed inset-y-0 left-0 px-4 pr-8 py-4 pointer-events-auto",
				visibilityClass,
				isAutoCollapse
					? "pointer-events-auto -translate-x-[calc(100%-1rem)] hover:translate-x-0 transition-transform duration-300"
					: ""
			)}
		>
			<div className="shadow-md w-full h-full bg-background-secondary/50 rounded-xl backdrop-blur-md pointer-events-auto flex flex-col gap-3 px-1.5 py-2">
				<div className="flex items-center gap-1 px-2 pt-1">
					<button
						type="button"
						onClick={() => setIsAutoCollapse((v) => !v)}
						className="h-8 w-8 grid place-items-center text-accent-text-dark-3 rounded-md hover:bg-background-secondary/50 transition-colors duration-200"
						aria-label="Toggle sidebar"
						title={isAutoCollapse ? "Pin sidebar open" : "Enable auto-collapse"}
					>
						{isAutoCollapse ? (
							<PanelLeftOpen className="h-5 w-5" />
						) : (
							<PanelLeft className="h-5 w-5" />
						)}
					</button>
					<div className="flex items-center min-w-0">
						<h2 className="text-sm text-accent-text-dark-3 font-semibold tracking-wide opacity-90 truncate">
							{title}
						</h2>
					</div>
				</div>

				<ul className="grid grid-cols-[2rem_1fr] gap-2 w-full px-1">
					{items.map((item) => (
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

function MobileSidebar({
	visibilityClass,
	title,
	items,
	isAutoCollapse,
	setIsAutoCollapse,
	onFlagsChange,
	isActive,
	mobileOpen,
	onMobileOpenChange,
	hideToggleButton
}: {
	visibilityClass: string;
	title: string;
	items: Array<SidebarItemParams & { icon: LucideIcon }>;
	isAutoCollapse: boolean;
	setIsAutoCollapse: React.Dispatch<React.SetStateAction<boolean>>;
	onFlagsChange?: (flags: SidebarFlags) => void;
	isActive: boolean;
	mobileOpen?: boolean;
	onMobileOpenChange?: (open: boolean) => void;
	hideToggleButton?: boolean;
}) {
	const [isExpandedInternal, setIsExpandedInternal] = useState(false);
	const { lgDown } = useBreakpoints();
	const isControlled = mobileOpen !== undefined;
	const isExpanded = isControlled ? mobileOpen : isExpandedInternal;
	const setExpanded = (next: boolean) => {
		if (!isControlled) setIsExpandedInternal(next);
		onMobileOpenChange?.(next);
	};

	const isMobileStripMode = lgDown ? false : !isAutoCollapse;
	const isMobileDrawerMode = lgDown ? true : isAutoCollapse;
	const showLabels = isExpanded;
	const isStripCollapsed = isMobileStripMode && !isExpanded;

	useEffect(() => {
		if (!isActive) return;
		onFlagsChange?.({
			autoCollapse: isAutoCollapse,
			isStrip: isStripCollapsed
		});
	}, [isActive, isAutoCollapse, isStripCollapsed, onFlagsChange]);

	const toggleExpanded = () => setExpanded(!isExpanded);
	const toggleAutoCollapse = () => {
		setIsAutoCollapse((v) => !v);
		setExpanded(false);
	};

	return (
		<>
			{isMobileDrawerMode && !lgDown && !hideToggleButton ? (
				<button
					type="button"
					onClick={toggleExpanded}
					className={clsx(
						"fixed top-5 z-50 left-4 h-8 w-8 grid place-items-center rounded-md backdrop-blur-md border cursor-pointer transition-colors duration-200",
						visibilityClass,
						isExpanded
							? "bg-transparent border-transparent hover:bg-background-secondary/50"
							: "bg-background-secondary/70 border-background-secondary/70 hover:bg-background-secondary"
					)}
					aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
					title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
				>
					{isExpanded ? (
						<ChevronLeft className="h-5 w-5" />
					) : (
						<ChevronRight className="h-5 w-5" />
					)}
				</button>
			) : null}

			<aside
				className={clsx(
					"inset-y-0 left-0 pointer-events-auto z-50 fixed ease duration-300",
					visibilityClass,
					isStripCollapsed ? "w-16 p-2" : "p-2 w-full",
					isMobileDrawerMode
						? clsx(
								"transition-transform duration-300",
								isExpanded ? "translate-x-0" : "-translate-x-full"
							)
						: ""
				)}
			>
				<div
					className={clsx(
						"shadow-md w-full h-full bg-background-secondary/50 rounded-xl backdrop-blur-md pointer-events-auto flex flex-col gap-3",
						isStripCollapsed ? "px-1 py-2" : "px-1.5 py-2"
					)}
				>
					<div
						className={clsx(
							"flex items-center pb-2 gap-0 border-b border-background-secondary/50",
							isStripCollapsed ? "flex-col px-1 pt-1" : "px-1 pt-1",
							isMobileDrawerMode ? "" : ""
						)}
					>
						{lgDown ? (
							<button
								type="button"
								onClick={() => setExpanded(false)}
								className="h-8 w-8 grid place-items-center rounded-md hover:bg-background-secondary/50 transition-colors duration-200"
								aria-label="Collapse sidebar"
								title="Collapse sidebar"
							>
								<ChevronLeft className="h-5 w-5" />
							</button>
						) : null}

						{isMobileStripMode ? (
							<button
								type="button"
								onClick={toggleExpanded}
								className={clsx(
									isExpanded ? "w-5" : "w-8",
									"h-8 grid z-50 place-items-center rounded-md hover:bg-background-secondary/50 transition-colors duration-200"
								)}
								aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
								title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
							>
								{isExpanded ? (
									<ChevronLeft className="h-5 w-5" />
								) : (
									<ChevronRight className="h-5 w-5" />
								)}
							</button>
						) : null}

						{lgDown ? null : (
							<button
								type="button"
								onClick={toggleAutoCollapse}
								className="h-8 w-8 cursor-pointer grid place-items-center rounded-md hover:bg-background-secondary/50 transition-colors duration-200"
								aria-label="Toggle auto-collapse"
								title={
									isAutoCollapse
										? "Disable auto-collapse"
										: "Enable auto-collapse"
								}
							>
								{isAutoCollapse ? (
									<PanelLeftOpen className="h-5 w-5" />
								) : (
									<PanelLeft className="h-5 w-5" />
								)}
							</button>
						)}

						{showLabels ? (
							<div className="flex items-center min-w-0 ml-1 flex-1 justify-between">
								<h2 className="text-sm font-semibold tracking-wide opacity-90 truncate">
									{title}
								</h2>
							</div>
						) : null}
					</div>

					<ul
						className={clsx(
							"w-full px-1",
							showLabels
								? "grid grid-cols-[2rem_1fr] gap-2"
								: "flex flex-col gap-2"
						)}
					>
						{items.map((item) => (
							<SidebarItem
								id={item.id}
								key={item.id}
								title={item.title}
								icon={item.icon}
								onClick={item.onClick}
								showLabel={showLabels}
							/>
						))}
					</ul>

					<div className="mt-auto px-1">
						<div className="h-px w-full bg-background-secondary/50 my-2" />
						<AccountItem showLabel={showLabels} />
					</div>
				</div>
			</aside>
		</>
	);
}

function AccountItem({ showLabel = true }: { showLabel?: boolean }) {
	return (
		<div
			className={clsx(
				"group w-full h-12 items-center rounded-md px-2 hover:bg-background-secondary/50 transition-colors duration-200 cursor-pointer",
				showLabel ? "grid grid-cols-[2rem_1fr] gap-2" : "flex justify-center"
			)}
			title={!showLabel ? "Account" : undefined}
			aria-label={!showLabel ? "Account" : undefined}
		>
			<div className="grid place-items-center">
				<div className="h-7 w-7 rounded-full group-hover:bg-background-tertiary/50 bg-background-secondary/60 border group-hover:border-background-tertiary/70 ease duration-300 border-background-secondary/80" />
			</div>
			{showLabel ? (
				<div className="flex flex-col leading-tight">
					<span className="text-sm font-medium">Account</span>
					<span className="text-xs opacity-70">Profile & settings</span>
				</div>
			) : null}
		</div>
	);
}

function SidebarItem({
	title,
	icon: Icon,
	onClick,
	showLabel = true
}: SidebarItemParams & { showLabel?: boolean }) {
	return (
		<li
			onClick={onClick}
			className={clsx(
				"cursor-pointer group overflow-hidden relative hover:bg-accent-text/10 w-full transition-colors duration-200 h-9 items-center rounded-md px-2",
				showLabel ? "grid col-span-2 grid-cols-subgrid" : "flex justify-center"
			)}
			title={!showLabel ? title : undefined}
			aria-label={!showLabel ? title : undefined}
		>
			<span className="w-1 h-full absolute left-0 inset-y-0 bg-transparent transition-colors duration-200 group-hover:bg-accent-main/70" />
			<div className="grid group-hover:text-accent-text-dark place-items-center text-text-primary">
				{Icon ? <Icon className="h-5 w-5" /> : null}
			</div>
			{showLabel ? (
				<p className="text-sm text-text-primary group-hover:text-accent-text-dark">
					{title}
				</p>
			) : null}
		</li>
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
		code: Code,
		briefcase: Briefcase
	};

	return map[key] ?? User;
}
