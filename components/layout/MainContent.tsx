import clsx from "clsx";
import { useBreakpoints } from "@/app/hooks/useBreakpoints";

export default function MainContent({
	children,
	sidebarAutoCollapse,
	sidebarIsStrip
}: {
	children: React.ReactNode;
	sidebarAutoCollapse: boolean;
	sidebarIsStrip: boolean;
}) {
	const { lgUp } = useBreakpoints();
	return (
		<main
			className={clsx(
				"bg-background-main text-text-main w-full min-h-screen py-4 pt-24 transition-[padding] duration-300 absolute mb-6 px-6",
				lgUp
					? sidebarAutoCollapse
						? "pl-6"
						: "pl-[calc(var(--sidebar-desktop-width)-var(--sidebar-main-gap))]"
					: sidebarIsStrip
						? "pl-20"
						: "pl-6"
			)}
		>
			{children}
		</main>
	);
}
