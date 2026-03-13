import React from "react";
import { cn } from "@/lib/utils/index";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useUiStore } from "@/lib/stores/uiStore";

type SidePanelProps = {
	isOpen?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
};

const SidePanel = ({
	isOpen: controlledOpen,
	onOpenChange
}: SidePanelProps) => {
	const storedOpen = useUiStore((state) => state.sidePanelOpen);
	const setStoredOpen = useUiStore((state) => state.setSidePanelOpen);
	const isOpen = controlledOpen ?? storedOpen;

	const setIsOpen = (nextOpen: boolean) => {
		onOpenChange?.(nextOpen);
		if (controlledOpen === undefined) {
			setStoredOpen(nextOpen);
		}
	};

	return (
		<aside
			className={cn(
				`w-72 translate-x-full z-50 rounded-l-3xl bg-background-secondary/50 border-y border-l fixed top-24 bottom-4 right-0 border-accent-text/50 backdrop-blur-md transition-transform duration-300 ease-in-out`,
				isOpen && "translate-x-0"
			)}
		>
			<div
				className={cn(
					`absolute inset-y-0 -left-10 w-10 h-full flex flex-col justify-center transition-all duration-300`,
					isOpen && "left-0"
				)}
			>
				<div
					className={cn(
						`w-full h-12 z-40 cursor-pointer rounded-l-xl border-y border-l backdrop-blur-md translate-x-8 border-accent-text/50 p-1 py-1.5`,
						isOpen
							? "border-none bg-transparent translate-x-0"
							: "backdrop-blur-md bg-background-secondary/50 duration-200 hover:translate-x-0"
					)}
					style={{ backdropFilter: isOpen ? "none" : "blur(10px)" }}
					onClick={() => setIsOpen(!isOpen)}
				>
					{!isOpen ? (
						<ChevronLeft className={cn(`z-30 size-8`)}></ChevronLeft>
					) : (
						<ChevronRight className={cn(`z-30 size-8`)}></ChevronRight>
					)}
				</div>
			</div>
		</aside>
	);
};

export default SidePanel;
