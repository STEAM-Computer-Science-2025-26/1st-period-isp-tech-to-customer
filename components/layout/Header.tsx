import { clsx } from "clsx";
import { useBreakpoints } from "@/app/hooks/useBreakpoints";
import { Menu } from "lucide-react";

type HeaderProps = {
	sidebarAutoCollapse: boolean;
	sidebarIsStrip: boolean;
	onMobileMenuClick?: () => void;
	mobileMenuOpen?: boolean;
};

export default function Header({
	sidebarAutoCollapse,
	sidebarIsStrip,
	onMobileMenuClick,
	mobileMenuOpen
}: HeaderProps) {
	const { lgUp } = useBreakpoints();
	const { smUp } = useBreakpoints();

	return (
		<div
			className={clsx(
				"fixed ease duration-300 transition-all top-0 z-40 inset-x-0 h-20 pt-4 px-4 bg-linear-to-t from-transparent to-background-main to-50%",
				lgUp
					? sidebarAutoCollapse
						? "pl-4"
						: "pl-[calc(var(--sidebar-desktop-width)-var(--sidebar-main-gap)-0.5rem)]"
					: sidebarIsStrip
						? "pl-20"
						: "pl-6"
			)}
		>
			<header className="w-full px-4 flex flex-row items-center justify-between rounded-xl h-full bg-background-secondary/50 shadow-sm backdrop-blur-md">
				<h1 className="text-lg font-semibold text-text-main">Dashboard</h1>
				{smUp ? (
					<nav className="flex flex-row items-center gap-2 text-text-secondary [&>a]:cursor-pointer">
						{/* Navigation items can be added here */}
						<a>About Us</a>
						<a>Contact</a>
						<a>Help</a>
					</nav>
				) : (
					<button
						className="text-text-secondary hover:text-text-main transition-colors"
						onClick={onMobileMenuClick}
						aria-label="Toggle sidebar"
						aria-expanded={mobileMenuOpen}
						type="button"
					>
						<Menu />
					</button>
				)}
			</header>
		</div>
	);
}
