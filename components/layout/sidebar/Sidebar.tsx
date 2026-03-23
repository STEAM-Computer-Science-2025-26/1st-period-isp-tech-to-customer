"use client";

import { SidebarItemParams, SidebarParams } from "@/app/types/types";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

import {
	BarChart3,
	Calendar,
	ChevronLeft,
	ChevronRight,
	X,
	Headset,
	History,
	Home,
	PanelLeft,
	PanelLeftOpen,
	Settings,
	User,
	Wrench,
	Code,
	Map,
	Briefcase
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useBreakpoints } from "@/app/hooks/useBreakpoints";
import { defaultSidebarItems } from "./SidebarItems";

export type SidebarFlags = {
	autoCollapse: boolean;
	isStrip: boolean;
	desktopExpanded: boolean;
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
	const [isDesktopExpanded, setIsDesktopExpanded] = useState(false);

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
		if (!isAutoCollapse) {
			setIsDesktopExpanded(false);
		}
	}, [isAutoCollapse]);

	useEffect(() => {
		if (activeVariant !== "desktop") return;
		onFlagsChange?.({
			autoCollapse: isAutoCollapse,
			isStrip: false,
			desktopExpanded: isDesktopExpanded
		});
	}, [activeVariant, isAutoCollapse, isDesktopExpanded, onFlagsChange]);

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
					onExpandedChange={setIsDesktopExpanded}
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
	setIsAutoCollapse,
	onExpandedChange
}: {
	visibilityClass: string;
	title: string;
	items: Array<SidebarItemParams & { icon: LucideIcon }>;
	isAutoCollapse: boolean;
	setIsAutoCollapse: React.Dispatch<React.SetStateAction<boolean>>;
	onExpandedChange?: (expanded: boolean) => void;
}) {
	const [isHovered, setIsHovered] = useState(false);
	const isStripMode = isAutoCollapse;
	const isExpanded = !isStripMode || isHovered;

	useEffect(() => {
		onExpandedChange?.(isStripMode && isHovered);
	}, [isHovered, isStripMode, onExpandedChange]);

	return (
		<aside
			className={clsx(
				"z-50 fixed inset-y-0 left-0 px-2 py-4 pointer-events-auto transition-[width] duration-300",
				visibilityClass
			)}
			style={{ width: isExpanded ? "var(--sidebar-desktop-width)" : "4.5rem" }}
			onMouseEnter={() => {
				setIsHovered(true);
			}}
			onMouseLeave={() => {
				setIsHovered(false);
			}}
		>
			<div className="border border-accent-text/50 shadow-md w-full h-full bg-background-secondary/50 rounded-xl backdrop-blur-md pointer-events-auto flex flex-col gap-3 px-1.5 py-2 overflow-hidden">
				<div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center px-2 pt-1">
					<div className="grid place-items-center">
						<button
							type="button"
							onClick={() => setIsAutoCollapse((v) => !v)}
							className="h-8 w-8 -ml-1.25 grid place-items-center text-accent-text-dark-3 rounded-md group transition-colors duration-200"
							aria-label="Toggle sidebar"
							title={
								isAutoCollapse ? "Pin sidebar open" : "Enable auto-collapse"
							}
						>
							{isAutoCollapse ? (
								<PanelLeftOpen className="h-5 w-5 text-text-tertiary group-hover:text-text-primary transition-colors" />
							) : (
								<PanelLeft className="h-5 w-5" />
							)}
						</button>
					</div>
					<div
						className={clsx(
							"min-w-0 overflow-hidden transition-[max-width,opacity] duration-200",
							isExpanded ? "max-w-full opacity-100" : "max-w-0 opacity-0"
						)}
					>
						<h2 className="text-sm text-accent-text-dark-3 font-semibold tracking-wide opacity-90 truncate whitespace-nowrap">
							{title}
						</h2>
					</div>
				</div>

				<ul
					className={clsx(
						"w-full px-1 grid grid-cols-[2rem_minmax(0,1fr)] -ml-0.75 gap-2"
					)}
				>
					{items.map((item) => (
						<SidebarItem
							id={item.id}
							key={item.id}
							title={item.title}
							icon={item.icon}
							onClick={item.onClick}
							showLabel={isExpanded}
						/>
					))}
				</ul>

				<div className="mt-auto">
					<div className="h-px w-full bg-background-secondary/50 my-2" />
					<AccountItem showLabel={isExpanded} />
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
			isStrip: isStripCollapsed,
			desktopExpanded: false
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
							<div className="w-full flex items-center justify-between px-2">
								<h2 className="text-sm font-semibold tracking-wide opacity-90 truncate whitespace-nowrap">
									{title}
								</h2>
								<button
									type="button"
									onClick={() => setExpanded(false)}
									className="h-8 w-8 grid place-items-center rounded-md hover:bg-background-secondary/50 transition-colors duration-200"
									aria-label="Close sidebar"
									title="Close sidebar"
								>
									<X className="h-5 w-5" />
								</button>
							</div>
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

						{showLabels && !lgDown ? (
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
				"group grid gap-0 grid-cols-[3rem_1fr] w-full h-12 items-center rounded-md px-2 hover:bg-background-secondary/50 transition-colors duration-200 cursor-pointer"
			)}
			title={!showLabel ? "Account" : undefined}
			aria-label={!showLabel ? "Account" : undefined}
			onClick={() => (window.location.href = "/login")}
		>
			<div className="h-8 w-8  -ml-0.5 rounded-full group-hover:bg-background-tertiary/50 bg-background-secondary/60 border group-hover:border-background-tertiary/70 ease duration-300 border-background-secondary/80" />
			<div
				className={clsx(
					" -ml-2 flex min-w-0 flex-col  items-start leading-tight overflow-hidden transition-[max-width,opacity] duration-150"
				)}
			>
				<span className="text-sm font-medium truncate whitespace-nowrap">
					Account
				</span>
				<span className="text-xs opacity-70 truncate whitespace-nowrap">
					Profile & settings
				</span>
			</div>
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
				"grid col-span-2 grid-cols-subgrid"
			)}
			title={!showLabel ? title : undefined}
			aria-label={!showLabel ? title : undefined}
		>
			<span className="w-1 h-full absolute left-0 inset-y-0 bg-transparent transition-colors duration-200 group-hover:bg-accent-main/70" />
			<div className="grid group-hover:text-accent-text-dark place-items-center text-text-primary">
				{Icon ? <Icon className="h-5 w-5" /> : null}
			</div>
			<p
				className={clsx(
					"text-sm text-text-primary group-hover:text-accent-text-dark truncate whitespace-nowrap transition-opacity duration-150",
					showLabel ? "opacity-100" : "opacity-0 pointer-events-none"
				)}
			>
				{title}
			</p>
		</li>
	);
}

function resolveIcon(icon: string | LucideIcon): LucideIcon {
	if (typeof icon !== "string") return icon;

	const key = icon.trim().toLowerCase();
	const map: Record<string, LucideIcon> = {
		home: Home,
		map: Map,
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
