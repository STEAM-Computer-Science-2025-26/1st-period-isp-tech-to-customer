"use client";

import clsx from "clsx";
import Link from "next/link";

import { CardShell } from "./CardShell";
import type { ListCardProps } from "./types";

export function ListCardInner(props: ListCardProps) {
	const { title, subtitle, actions, className, bodyClassName, footer } = props;
	return (
		<CardShell
			title={title}
			subtitle={subtitle}
			actions={actions}
			className={className}
			bodyClassName={bodyClassName}
			footer={footer}
		>
			<ListBody {...props} />
		</CardShell>
	);
}

export function ListCard(props: Omit<ListCardProps, "type">) {
	return <ListCardInner {...props} type="list" />;
}

function ListBody({ items, ordered = false, children }: ListCardProps) {
	if (children) return <div>{children}</div>;

	const ListTag = ordered ? "ol" : "ul";

	return (
		<ListTag
			className={clsx(
				"flex flex-col gap-1",
				ordered ? "list-decimal pl-4" : "list-none"
			)}
		>
			{(items ?? []).map((item, index) => {
				const key = item.id ?? index;
				const row = (
					<div
						className={clsx(
							"group w-full rounded-lg border border-transparent",
							"hover:bg-background-primary/50 hover:border-background-secondary/50",
							"transition-colors duration-200 px-3 py-2",
							"flex items-center justify-between gap-3"
						)}
					>
						<div className="min-w-0">
							<div className="text-sm text-text-main truncate">
								{item.label}
							</div>
							{item.description ? (
								<div className="text-xs text-text-secondary mt-0.5">
									{item.description}
								</div>
							) : null}
						</div>
						{item.right ? (
							<div className="shrink-0 text-text-tertiary">{item.right}</div>
						) : null}
					</div>
				);

				return (
					<li key={key}>
						{item.href ? (
							<Link href={item.href} className="block">
								{row}
							</Link>
						) : (
							<button
								type="button"
								onClick={item.onClick}
								className="block w-full text-left"
								disabled={!item.onClick}
							>
								{row}
							</button>
						)}
					</li>
				);
			})}
		</ListTag>
	);
}
