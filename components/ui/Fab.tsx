import { cn } from "@/lib/utils/index";
import DynamicIcon, { IconName } from "./DynamicICon";
import { type ButtonHTMLAttributes } from "react";

type FabProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	size: "sm" | "md" | "lg";
	icon: IconName;
	iconClassName?: string;
};

const Fab = ({ size, icon, className, iconClassName, ...props }: FabProps) => {
	return (
		<button
			className={cn(
				"fixed bottom-2 right-2 bg-background-secondary/50 text-text-secondary rounded-lg flex flex-row items-center justify-center p-2 border border-background-secondary",
				size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10",
				className
			)}
			{...props}
		>
			<DynamicIcon
				name={icon}
				size={size === "sm" ? 16 : size === "lg" ? 24 : 32}
				className={iconClassName}
			/>
		</button>
	);
};

export default Fab;
