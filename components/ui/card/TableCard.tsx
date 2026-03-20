"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

import { CardShell } from "./CardShell";
import type { TableCardProps } from "./types";

export function TableCardInner<Row extends Record<string, unknown>>(
	props: TableCardProps<Row>
) {
	const {
		title,
		subtitle,
		actions,
		className,
		bodyClassName,
		footer,
		toolbar,
		columns,
		rows,
		getRowKey,
		emptyState
	} = props;

	return (
		<CardShell
			title={title}
			subtitle={subtitle}
			actions={actions}
			className={className}
			bodyClassName={bodyClassName}
			footer={footer}
		>
			<div className="flex flex-col gap-3">
				{toolbar ? (
					<div className="flex items-center justify-between gap-2">
						{toolbar}
					</div>
				) : null}
				<div className="rounded-lg bg-background-primary/50 border border-background-secondary/50">
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="text-text-secondary">
								<tr>
									{columns.map((col) => (
										<th
											key={col.key}
											className={clsx(
												"py-2 px-3 font-medium",
												col.align === "center"
													? "text-center"
													: col.align === "right"
														? "text-right"
														: "text-left",
												col.headerClassName
											)}
										>
											{col.header}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.length === 0 ? (
									<tr>
										<td
											colSpan={Math.max(columns.length, 1)}
											className="px-3 py-6 text-center text-text-tertiary"
										>
											{emptyState ?? "No rows"}
										</td>
									</tr>
								) : (
									rows.map((row, rowIndex) => (
										<tr
											key={getRowKey ? getRowKey(row, rowIndex) : rowIndex}
											className="border-t border-background-secondary/50"
										>
											{columns.map((col) => (
												<td
													key={col.key}
													className={clsx(
														"py-2 px-3 text-text-main",
														col.align === "center"
															? "text-center"
															: col.align === "right"
																? "text-right"
																: "text-left",
														col.className
													)}
												>
													{col.cell
														? col.cell(row, rowIndex)
														: (row[col.key] as ReactNode)}
												</td>
											))}
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</CardShell>
	);
}

export function TableCard<Row extends Record<string, unknown>>(
	props: Omit<TableCardProps<Row>, "type">
) {
	return <TableCardInner {...props} type="table" />;
}
