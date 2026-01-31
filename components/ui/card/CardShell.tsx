"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

type CardShellProps = {
	title: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	className?: string;
	bodyClassName?: string;
	footer?: ReactNode;
	children?: ReactNode;
};

export function CardShell({
	title,
	subtitle,
	actions,
	className,
	bodyClassName,
	footer,
	children
}: CardShellProps) {
	return (
		<section
			className={clsx(
				"w-full max-w-full min-w-0 overflow-hidden rounded-xl bg-background-secondary/50 backdrop-blur-md border border-accent-text/30",
				"shadow-sm",
				className
			)}
		>
			<header className="flex items-start justify-between gap-3 px-4 pt-4">
				<div className="min-w-0">
					<h3 className="text-sm font-semibold tracking-wide text-accent-text-dark-2 truncate">
						{title}
					</h3>
					{subtitle ? (
						<p className="text-xs text-accent-text-dark mt-0.5">{subtitle}</p>
					) : null}
				</div>
				{actions ? <div className="shrink-0">{actions}</div> : null}
			</header>

			<div className={clsx("px-4 pb-4 pt-3", bodyClassName)}>{children}</div>

			{footer ? (
				<footer className="px-4 pb-4 pt-0 text-xs text-accent-text-dark">
					{footer}
				</footer>
			) : null}
		</section>
	);
}
