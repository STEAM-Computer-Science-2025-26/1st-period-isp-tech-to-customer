"use client";

import type { DbTable } from "./types";

export function SqlEditorPanel(props: {
	sql: string;
	busy: boolean;
	sqlResult: { columns?: string[]; rows?: any[]; rowCount?: number } | null;
	onSqlChange: (value: string) => void;
	onRun: () => void;
	tables?: DbTable[];
}) {
	const { sql, busy, sqlResult, onSqlChange, onRun } = props;

	return (
		<div className="rounded-lg bg-background-primary border border-accent-text-dark p-3">
			<div className="flex items-center justify-between gap-2">
				<h2 className="font-medium">SQL editor</h2>
				<button
					type="button"
					className="h-8 rounded-lg px-3 text-sm bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 border border-accent-text"
					onClick={onRun}
					disabled={busy || !sql.trim()}
					title="Run SQL via /api/dev/db/query"
				>
					Run
				</button>
			</div>

			<textarea
				className="mt-3 min-h-45 w-full rounded-md border border-accent-text p-2 font-mono text-sm outline-none focus:border-accent-text-dark-2"
				value={sql}
				onChange={(e) => onSqlChange(e.target.value)}
				spellCheck={false}
			/>

			{sqlResult ? (
				<div className="mt-3 rounded-lg border border-accent-text p-3">
					<div className="flex items-center justify-between">
						<div className="text-sm font-medium">Result</div>
						{typeof sqlResult.rowCount === "number" ? (
							<div className="text-xs opacity-70">
								{sqlResult.rowCount} row(s)
							</div>
						) : null}
					</div>

					<div className="mt-2 max-h-85 overflow-auto rounded-md border border-accent-text">
						<div className="min-w-full overflow-x-auto">
							<table className="w-full text-left text-sm">
								<thead className="sticky top-0 bg-background-primary">
									<tr className="border-b border-accent-text">
										{(sqlResult.columns ?? []).map((c) => (
											<th key={c} className="px-2 py-1 font-medium">
												{c}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{(sqlResult.rows ?? []).map((r, idx) => (
										<tr
											key={idx}
											className="border-b border-accent-text/30 last:border-b-0"
										>
											{(sqlResult.columns ?? []).map((c) => (
												<td key={c} className="px-2 py-1 align-top">
													<code className="text-xs">
														{typeof r?.[c] === "object"
															? JSON.stringify(r?.[c])
															: String(r?.[c] ?? "")}
													</code>
												</td>
											))}
										</tr>
									))}
									{(sqlResult.rows ?? []).length === 0 ? (
										<tr>
											<td
												className="px-2 py-2 text-sm opacity-70"
												colSpan={(sqlResult.columns ?? []).length || 1}
											>
												No rows returned.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
