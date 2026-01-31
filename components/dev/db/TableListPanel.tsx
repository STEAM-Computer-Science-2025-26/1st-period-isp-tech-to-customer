"use client";

import type { DbTable } from "./types";
import { Plus, Trash2 } from "lucide-react";

export function TableListPanel(props: {
	tables: DbTable[];
	busy: boolean;
	selectedTable: string | null;
	newTableName: string;
	onNewTableNameChange: (value: string) => void;
	onCreateTable: () => void;
	onSelectTable: (name: string) => void;
	onDeleteTable: (name: string) => void;
}) {
	const {
		tables,
		busy,
		selectedTable,
		newTableName,
		onNewTableNameChange,
		onCreateTable,
	onSelectTable,
	onDeleteTable
	} = props;

	return (
		<div className="rounded-lg flex flex-col gap-2 bg-background-primary border border-accent-text p-3">
			<div className="flex items-center justify-between">
				<h2 className="font-medium">Tables</h2>
				<span className="text-xs opacity-70">{tables.length} total</span>
			</div>

			<div className="flex flex-row gap-2 h-8">
				<input
					className="w-full rounded-md border border-accent-text px-2 py-1 text-text-secondary/80 transition-colors duration-200 focus:text-text-primary text-sm outline-none focus:border-accent-text-dark-2"
					placeholder="new_table_name"
					value={newTableName}
					onChange={(e) => onNewTableNameChange(e.target.value)}
				/>
				<button
					type="button"
					className="rounded-lg border border-accent-text size-8 p-1 aspect-square flex flex-row items-center justify-center text-sm bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200"
					onClick={onCreateTable}
					disabled={busy || !newTableName.trim()}
					title="Create a new table"
				>
					<Plus size={20} />
				</button>
			</div>

			<div className="max-h-105 overflow-auto">
				<ul className="flex flex-col gap-1">
					{tables.map((t) => (
						<li key={t.name}>
							<div
								className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-background-secondary/30 flex items-center gap-2 ${
									selectedTable === t.name ? "bg-background-secondary/50" : ""
								}`}
							>
								<button
									type="button"
									className="flex-1 min-w-0 text-left"
									onClick={() => onSelectTable(t.name)}
									disabled={busy}
								>
									<div className="flex items-center justify-between gap-2">
										<span className="font-mono truncate">{t.name}</span>
										{t.comment ? (
											<span className="truncate text-xs opacity-70">
												{t.comment}
											</span>
										) : null}
									</div>
								</button>
								<button
									type="button"
									className="size-8 rounded-md border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 flex items-center justify-center"
									onClick={() => {
										if (
											window.confirm(
												`Delete table "${t.name}"? This cannot be undone.`
											)
										) {
											onDeleteTable(t.name);
										}
									}}
									disabled={busy}
									title="Delete table"
								>
									<Trash2 size={14} />
								</button>
							</div>
						</li>
					))}
					{tables.length === 0 ? (
						<li className="px-3 py-2 text-sm opacity-70">
							No tables loaded yet. Click refresh.
						</li>
					) : null}
				</ul>
			</div>
		</div>
	);
}
