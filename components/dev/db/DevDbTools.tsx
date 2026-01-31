"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import clsx from "clsx";

import { apiJson } from "./api";
import type { DbColumn, DbTable } from "./types";
import { TableListPanel } from "./TableListPanel";
import { SqlEditorPanel } from "./SqlEditorPanel";
import { TableViewPanel } from "./TableViewPanel";

export function DevDbTools() {
	const [activeTab, setActiveTab] = useState<"table" | "sql">("table");

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [tables, setTables] = useState<DbTable[]>([]);
	const [schemaByTable, setSchemaByTable] = useState<
		Record<string, DbColumn[]>
	>({});
	const [rowsByTable, setRowsByTable] = useState<Record<string, any[]>>({});
	const [selectedTable, setSelectedTable] = useState<string | null>(null);

	const [sql, setSql] = useState(
		`-- Example:\n-- SELECT * FROM your_table LIMIT 100;`
	);
	const [sqlResult, setSqlResult] = useState<{
		columns?: string[];
		rows?: any[];
		rowCount?: number;
	} | null>(null);

	const [newTableName, setNewTableName] = useState("");

	const selectedColumns = useMemo(
		() => (selectedTable ? (schemaByTable[selectedTable] ?? []) : []),
		[schemaByTable, selectedTable]
	);
	const selectedRows = useMemo(
		() => (selectedTable ? (rowsByTable[selectedTable] ?? []) : []),
		[rowsByTable, selectedTable]
	);

	async function loadTables() {
		setBusy(true);
		setError(null);
		try {
			const data = await apiJson<{ tables: DbTable[] }>("/api/dev/db/tables");
			setTables(data.tables ?? []);
		} catch (e: any) {
			setError(e?.message ?? "Failed to load tables.");
		} finally {
			setBusy(false);
		}
	}

	async function loadTable(name: string) {
		setBusy(true);
		setError(null);
		try {
			const data = await apiJson<{ columns: DbColumn[]; rows: any[] }>(
				`/api/dev/db/table?name=${encodeURIComponent(name)}`
			);
			setSchemaByTable((prev) => ({ ...prev, [name]: data.columns ?? [] }));
			setRowsByTable((prev) => ({ ...prev, [name]: data.rows ?? [] }));
			setSelectedTable(name);
			setActiveTab("table");
		} catch (e: any) {
			setError(e?.message ?? "Failed to load table.");
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		void loadTables();
	}, []);

	async function runSql() {
		setBusy(true);
		setError(null);
		setSqlResult(null);
		try {
			const data = await apiJson<{
				columns?: string[];
				rows?: any[];
				rowCount?: number;
			}>("/api/dev/db/query", {
				method: "POST",
				body: JSON.stringify({ sql })
			});
			setSqlResult({
				columns:
					data.columns ?? (data.rows?.[0] ? Object.keys(data.rows[0]) : []),
				rows: data.rows ?? [],
				rowCount: data.rowCount
			});
		} catch (e: any) {
			setError(e?.message ?? "SQL query failed.");
		} finally {
			setBusy(false);
		}
	}

	async function createTable() {
		if (!newTableName.trim()) return;
		setBusy(true);
		setError(null);
		try {
			await apiJson("/api/dev/db/create-table", {
				method: "POST",
				body: JSON.stringify({ name: newTableName.trim() })
			});
			setNewTableName("");
			await loadTables();
		} catch (e: any) {
			setError(e?.message ?? "Failed to create table.");
		} finally {
			setBusy(false);
		}
	}

	async function addColumn(input: {
		name: string;
		type: string;
		nullable: boolean;
		defaultValue: string | null;
	}) {
		if (!selectedTable) return;
		setBusy(true);
		setError(null);
		try {
			await apiJson("/api/dev/db/add-column", {
				method: "POST",
				body: JSON.stringify({ table: selectedTable, ...input })
			});
			await loadTable(selectedTable);
		} catch (e: any) {
			setError(e?.message ?? "Failed to add column.");
		} finally {
			setBusy(false);
		}
	}

	async function insertRow(values: Record<string, any>) {
		if (!selectedTable) throw new Error("Select a table first");
		await apiJson("/api/dev/db/add-row", {
			method: "POST",
			body: JSON.stringify({ table: selectedTable, values })
		});
		await loadTable(selectedTable);
	}

	async function updateRow(
		pk: Record<string, any>,
		values: Record<string, any>
	) {
		if (!selectedTable) throw new Error("Select a table first");
		await apiJson("/api/dev/db/update-row", {
			method: "POST",
			body: JSON.stringify({ table: selectedTable, pk, values })
		});
		await loadTable(selectedTable);
	}

	async function alterColumn(input: {
		column: string;
		newName?: string;
		type?: string;
		nullable?: boolean;
		defaultValue?: string | null;
	}) {
		if (!selectedTable) throw new Error("Select a table first");
		setBusy(true);
		setError(null);
		try {
			await apiJson("/api/dev/db/alter-column", {
				method: "POST",
				body: JSON.stringify({ table: selectedTable, ...input })
			});
			await loadTable(selectedTable);
		} catch (e: any) {
			setError(e?.message ?? "Failed to alter column.");
		} finally {
			setBusy(false);
		}
	}

	async function deleteColumn(column: string) {
		if (!selectedTable) throw new Error("Select a table first");
		setBusy(true);
		setError(null);
		try {
			await apiJson("/api/dev/db/drop-column", {
				method: "POST",
				body: JSON.stringify({ table: selectedTable, column })
			});
			await loadTable(selectedTable);
		} catch (e: any) {
			setError(e?.message ?? "Failed to delete column.");
		} finally {
			setBusy(false);
		}
	}

	async function deleteRow(pk: Record<string, any>) {
		if (!selectedTable) throw new Error("Select a table first");
		setBusy(true);
		setError(null);
		try {
			await apiJson("/api/dev/db/delete-row", {
				method: "POST",
				body: JSON.stringify({ table: selectedTable, pk })
			});
			await loadTable(selectedTable);
		} catch (e: any) {
			setError(e?.message ?? "Failed to delete row.");
		} finally {
			setBusy(false);
		}
	}

	async function deleteTable(name: string) {
		setBusy(true);
		setError(null);
		try {
			await apiJson("/api/dev/db/drop-table", {
				method: "POST",
				body: JSON.stringify({ table: name })
			});
			setTables((prev) => prev.filter((t) => t.name !== name));
			setSchemaByTable((prev) => {
				const next = { ...prev };
				delete next[name];
				return next;
			});
			setRowsByTable((prev) => {
				const next = { ...prev };
				delete next[name];
				return next;
			});
			if (selectedTable === name) setSelectedTable(null);
			await loadTables();
		} catch (e: any) {
			setError(e?.message ?? "Failed to delete table.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="w-full px-2 flex flex-col gap-3">
			{error ? (
				<div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
					{error}
				</div>
			) : null}

			<div className="flex flex-row gap-2 h-10 items-center">
				<button
					type="button"
					className={`h-full max-w-32 flex-1 px-2 rounded-lg transition-colors duration-200 ${
						activeTab === "table"
							? "bg-accent-text-dark hover:bg-accent-text-dark-2 text-white"
							: "bg-background-secondary/50 hover:bg-background-secondary"
					}`}
					onClick={() => setActiveTab("table")}
				>
					Table
				</button>
				<button
					type="button"
					className={`h-full max-w-32 flex-1 px-2 rounded-lg transition-colors duration-200 ${
						activeTab === "sql"
							? "bg-accent-text-dark hover:bg-accent-text-dark-2 text-white"
							: "bg-background-secondary/50 hover:bg-background-secondary"
					}`}
					onClick={() => setActiveTab("sql")}
				>
					SQL
				</button>

				<button
					type="button"
					className="rounded-lg ml-auto flex flex-row items-center justify-center hover:bg-background-secondary transition-colors duration-200 bg-background-secondary/50 text-sm size-10 p-2"
					onClick={loadTables}
					disabled={busy}
					title="Refresh tables"
				>
					<RefreshCcw size={20} className={clsx(busy && "animate-spin")} />
				</button>
			</div>

			<div className="grid gap-4 lg:grid-cols-12">
				<aside className="lg:col-span-4">
					<TableListPanel
						tables={tables}
						busy={busy}
						selectedTable={selectedTable}
						newTableName={newTableName}
						onNewTableNameChange={setNewTableName}
						onCreateTable={createTable}
						onSelectTable={(name) => void loadTable(name)}
						onDeleteTable={(name) => void deleteTable(name)}
					/>
				</aside>

				<main className="lg:col-span-8 min-w-0">
					{activeTab === "sql" ? (
						<SqlEditorPanel
							sql={sql}
							busy={busy}
							sqlResult={sqlResult}
							onSqlChange={setSql}
							onRun={() => void runSql()}
						/>
					) : (
						<TableViewPanel
							busy={busy}
							selectedTable={selectedTable}
							columns={selectedColumns}
							rows={selectedRows}
							onReload={() => selectedTable && void loadTable(selectedTable)}
							onAddColumn={(input) => void addColumn(input)}
							onInsertRow={insertRow}
							onUpdateRow={updateRow}
							onAlterColumn={alterColumn}
							onDeleteColumn={(name) => void deleteColumn(name)}
							onDeleteRow={(pk) => void deleteRow(pk)}
						/>
					)}
				</main>
			</div>
		</section>
	);
}
