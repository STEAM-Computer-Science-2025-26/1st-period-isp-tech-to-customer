import clsx from "clsx";
import { useBreakpoints } from "@/app/hooks/useBreakpoints";

export default function MainContent({
	children,
	sidebarAutoCollapse,
	sidebarIsStrip,
	className
}: {
	children: React.ReactNode;
	sidebarAutoCollapse: boolean;
	sidebarIsStrip: boolean;
	className?: string;
}) {
	const { lgUp } = useBreakpoints();
	return (
		<main
			className={clsx(
				className,
				"bg-background-main text-text-main w-full max-w-full min-h-screen py-4 pt-24 transition-[padding] duration-300 absolute mb-6 px-6 overflow-x-hidden",
				lgUp
					? sidebarAutoCollapse
						? "pl-6"
						: "pl-[calc(var(--sidebar-desktop-width)-var(--sidebar-main-gap))]"
					: sidebarIsStrip
						? "pl-22"
						: "pl-8"
			)}
		>
			{children}
		</main>
	);
}
