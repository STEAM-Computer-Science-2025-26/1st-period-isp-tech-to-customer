import React from "react";
import { cn } from "@/lib/utils/index";

type FadeEndParams = {
	prefix: "before" | "after" | "both";
	sizeClass?: string;
	className?: string;
	orientation?: "horizontal" | "vertical";
	fromColorClass: string;
	children?: React.ReactNode;
	wrapperClassName?: string;
};

const FadeEnd = ({
	prefix,
	sizeClass = "w-20",
	className,
	orientation = "horizontal",
	fromColorClass,
	children,
	wrapperClassName
}: FadeEndParams) => {
	const isHorizontal = orientation === "horizontal";
	const overlaySize = isHorizontal ? sizeClass : sizeClass.replace("w-", "h-");

	const leftOrTopGradient = isHorizontal
		? "bg-gradient-to-r"
		: "bg-gradient-to-b";
	const rightOrBottomGradient = isHorizontal
		? "bg-gradient-to-l"
		: "bg-gradient-to-t";

	const baseOverlay = cn(
		"absolute z-20 pointer-events-none",
		overlaySize,
		fromColorClass,
		"via-transparent to-transparent"
	);

	return (
		<div className={cn(className, "relative")}>
			{(prefix === "before" || prefix === "both") && (
				<span
					className={cn(
						baseOverlay,
						leftOrTopGradient,
						isHorizontal ? "left-0 inset-y-0 h-full" : "top-0 inset-x-0 w-full"
					)}
				/>
			)}
			{(prefix === "after" || prefix === "both") && (
				<span
					className={cn(
						baseOverlay,
						rightOrBottomGradient,
						isHorizontal
							? "right-0 inset-y-0 h-full"
							: "bottom-0 inset-x-0 w-full"
					)}
				/>
			)}
			<div className={cn(wrapperClassName)}>
				{React.Children.map(children, (child) => {
					if (React.isValidElement(child)) {
						return React.cloneElement(child, {
							...(child.props as Record<string, any>),
							className: cn(
								(child.props as Record<string, any>).className,
								"z-10"
							)
						} as any);
					}
					return child;
				})}
			</div>
		</div>
	);
};

export default FadeEnd;
