import React from "react";
import { cn } from "@/lib/utils/index";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useUiStore } from "@/lib/stores/uiStore";

type SidePanelProps = {
	isOpen?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
	children?: React.ReactNode;
};

const SidePanel = ({
	isOpen: controlledOpen,
	onOpenChange,
	children
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
				`translate-x-full z-50 rounded-l-3xl bg-background-secondary/50 border-y border-l fixed top-24 bottom-4 right-0 border-accent-text/50 backdrop-blur-md transition-transform duration-300 ease-in-out`,
				isOpen && "translate-x-0"
			)}
			style={{ width: "max(30vw, 20rem)" }}
		>
			<div
				className={cn(
					"absolute inset-y-0 -left-10 flex h-full items-center transition-all duration-300",
					isOpen && "left-0"
				)}
			>
				<button
					type="button"
					onClick={() => setIsOpen(!isOpen)}
					className={cn(
						"group relative h-12 border-accent-text/50 backdrop-blur-md transition-all duration-200",
						isOpen
							? "w-2 rounded-r-xl border-y border-r bg-background-secondary/70 hover:w-10"
							: "w-10 rounded-l-xl border-y border-l bg-background-secondary/50 translate-x-8 hover:translate-x-0"
					)}
					style={{ backdropFilter: isOpen ? "none" : "blur(10px)" }}
				>
					<span className="absolute inset-0 flex items-center justify-center">
						{!isOpen ? (
							<ChevronLeft className="size-8" />
						) : (
							<ChevronRight className="size-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
						)}
					</span>
				</button>
			</div>

			{children && <div className="h-full overflow-hidden">{children}</div>}
		</aside>
	);
};

export default SidePanel;
