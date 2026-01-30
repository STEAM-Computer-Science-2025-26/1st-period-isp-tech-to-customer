"use client";

import { useMemo, useState } from "react";
import type { DbColumn } from "./types";
import {
  Check,
  Columns2,
  Copy,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  X
} from "lucide-react";

const MIN_COL_PX = 120;
const MIN_COL_PX_RESIZE = 60;
const CELL_MAX_LINES = 4;

function parseByType(
  raw: string,
  colType: string
): { ok: true; value: any } | { ok: false; error: string } {
  const t = colType.toLowerCase();
  if (["int", "integer", "bigint", "smallint"].some((k) => t.includes(k))) {
    const n = Number(raw);
    if (!Number.isInteger(n)) return { ok: false, error: "expected integer" };
    return { ok: true, value: n };
  }
  if (["float", "double", "numeric", "decimal", "real"].some((k) => t.includes(k))) {
    const n = Number(raw);
    if (Number.isNaN(n)) return { ok: false, error: "expected number" };
    return { ok: true, value: n };
  }
  if (t.includes("bool")) {
    if (["true", "1", "t", "yes"].includes(raw.toLowerCase())) return { ok: true, value: true };
    if (["false", "0", "f", "no"].includes(raw.toLowerCase())) return { ok: true, value: false };
    return { ok: false, error: "expected boolean" };
  }
  if (t.includes("json")) {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: false, error: "invalid JSON" };
    }
  }
  if (t.includes("date")) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "invalid date" };
    return { ok: true, value: raw };
  }
  return { ok: true, value: raw };
}

function columnTooltip(c: DbColumn) {
  const parts = [c.type];
  if (!c.nullable) parts.push("NOT NULL");
  if (c.defaultValue) parts.push(`DEFAULT ${c.defaultValue}`);
  if (c.isPrimaryKey) parts.push("PRIMARY KEY");
  return parts.join(" · ");
}

export function TableViewPanel(props: {
  busy: boolean;
  selectedTable: string | null;
  columns: DbColumn[];
  rows: any[];
  onReload: () => void;
  onAddColumn: (input: {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
  }) => void;
  onInsertRow: (values: Record<string, any>) => Promise<void>;
  onUpdateRow: (pk: Record<string, any>, values: Record<string, any>) => Promise<void>;
  onAlterColumn: (input: {
    column: string;
    newName?: string;
    type?: string;
    nullable?: boolean;
    defaultValue?: string | null;
  }) => Promise<void>;
}) {
  const {
    busy,
    selectedTable,
    columns,
    rows,
    onReload,
    onAddColumn,
    onInsertRow,
    onUpdateRow,
    onAlterColumn
  } = props;

  const [pendingRow, setPendingRow] = useState<Record<string, string> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const [columnDraft, setColumnDraft] = useState<{
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string;
  } | null>(null);
  const [columnDraftError, setColumnDraftError] = useState<string | null>(null);

  const [editingColumn, setEditingColumn] = useState<{
    originalName: string;
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string;
  } | null>(null);
  const [columnEditError, setColumnEditError] = useState<string | null>(null);
  const [columnSaving, setColumnSaving] = useState(false);

  const pkColumns = useMemo(() => columns.filter((c) => c.isPrimaryKey), [columns]);
  const canEditRows = pkColumns.length > 0;

  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editingRowDraft, setEditingRowDraft] = useState<Record<string, string> | null>(null);
  const [rowEditError, setRowEditError] = useState<string | null>(null);
  const [rowSavingIndex, setRowSavingIndex] = useState<number | null>(null);

  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const visibleColumns = useMemo(() => columns.filter((c) => !hiddenColumns[c.name]), [columns, hiddenColumns]);

  const rowsTableMinWidthPx = useMemo(() => {
    const actionWidth = 96;
    if (!visibleColumns.length) return actionWidth + MIN_COL_PX;
    return actionWidth + visibleColumns.length * MIN_COL_PX;
  }, [visibleColumns.length]);

  function resetColumnLayout() {
    setHiddenColumns({});
    setColumnWidths({});
  }

  function beginResize(columnName: string, startX: number) {
    const startWidth = columnWidths[columnName] ?? Math.max(MIN_COL_PX, MIN_COL_PX_RESIZE);
    document.body.style.userSelect = "none";

    const onMove = (clientX: number) => {
      const delta = clientX - startX;
      const next = Math.max(MIN_COL_PX_RESIZE, Math.round(startWidth + delta));
      setColumnWidths((prev) => ({ ...prev, [columnName]: next }));
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches?.length) return;
      onMove(e.touches[0].clientX);
    };
    const cleanup = () => {
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", cleanup);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", cleanup);
      document.removeEventListener("touchcancel", cleanup);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", cleanup);
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", cleanup);
    document.addEventListener("touchcancel", cleanup);
  }

  const clampStyle: React.CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: CELL_MAX_LINES,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    whiteSpace: "normal"
  };

  async function copyToClipboard(text: string) {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopyError("Copy failed (clipboard blocked)");
    }
  }

  function toDraftValue(value: any) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function buildValuesFromDraft(draft: Record<string, string>, mode: "insert" | "update") {
    const values: Record<string, any> = {};
    const missing: string[] = [];
    const invalid: string[] = [];

    for (const col of columns) {
      const raw = draft[col.name] ?? "";
      const trimmed = raw.trim();

      if (!trimmed) {
        if (mode === "insert") {
          continue; // allow default
        }
        if (col.nullable === false && !col.defaultValue) {
          missing.push(col.name);
        } else {
          values[col.name] = null;
        }
        continue;
      }

      const parsed = parseByType(trimmed, col.type);
      if (!parsed.ok) {
        invalid.push(`${col.name}: ${parsed.error}`);
        continue;
      }
      values[col.name] = parsed.value;
    }

    return { values, missing, invalid };
  }

  async function savePendingRow() {
    if (!selectedTable || !pendingRow) return;
    setSaveError(null);

    const { values, missing, invalid } = buildValuesFromDraft(pendingRow, "insert");
    if (missing.length) {
      setSaveError(`Missing required: ${missing.join(", ")}`);
      return;
    }
    if (invalid.length) {
      setSaveError(`Invalid values: ${invalid.join(" | ")}`);
      return;
    }

    setSaving(true);
    try {
      await onInsertRow(values);
      setPendingRow(null);
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed to insert row");
    } finally {
      setSaving(false);
    }
  }

  async function saveNewColumn() {
    if (!columnDraft) return;
    setColumnDraftError(null);
    if (!columnDraft.name.trim() || !columnDraft.type.trim()) {
      setColumnDraftError("Column name and type are required");
      return;
    }
    try {
      onAddColumn({
        name: columnDraft.name.trim(),
        type: columnDraft.type.trim(),
        nullable: columnDraft.nullable,
        defaultValue: columnDraft.defaultValue.trim() || null
      });
      setColumnDraft(null);
    } catch (e: any) {
      setColumnDraftError(e?.message ?? "Failed to add column");
    }
  }

  async function saveEditedColumn() {
    if (!editingColumn) return;
    setColumnEditError(null);
    if (!editingColumn.name.trim() || !editingColumn.type.trim()) {
      setColumnEditError("Column name and type are required");
      return;
    }

    setColumnSaving(true);
    try {
      await onAlterColumn({
        column: editingColumn.originalName,
        newName: editingColumn.name.trim(),
        type: editingColumn.type.trim(),
        nullable: editingColumn.nullable,
        defaultValue: editingColumn.defaultValue.trim()
          ? editingColumn.defaultValue.trim()
          : null
      });
      setEditingColumn(null);
    } catch (e: any) {
      setColumnEditError(e?.message ?? "Failed to update column");
    } finally {
      setColumnSaving(false);
    }
  }

  function startEditRow(index: number) {
    setRowEditError(null);
    setSaveError(null);
    setPendingRow(null);
    setEditingRowIndex(index);
    const row = rows[index];
    const draft: Record<string, string> = {};
    for (const c of columns) draft[c.name] = toDraftValue(row?.[c.name]);
    setEditingRowDraft(draft);
  }

  async function saveEditedRow() {
    if (editingRowIndex === null || !editingRowDraft) return;
    setRowEditError(null);

    if (!canEditRows) {
      setRowEditError("Row editing requires a primary key.");
      return;
    }

    const row = rows[editingRowIndex];
    const pk: Record<string, any> = {};
    for (const c of pkColumns) pk[c.name] = row?.[c.name];
    if (Object.values(pk).some((v) => v === undefined)) {
      setRowEditError("Could not determine primary key values for this row.");
      return;
    }

    const { values, missing, invalid } = buildValuesFromDraft(editingRowDraft, "update");
    if (missing.length) {
      setRowEditError(`Missing required: ${missing.join(", ")}`);
      return;
    }
    if (invalid.length) {
      setRowEditError(`Invalid values: ${invalid.join(" | ")}`);
      return;
    }

    setRowSavingIndex(editingRowIndex);
    try {
      await onUpdateRow(pk, values);
      setEditingRowIndex(null);
      setEditingRowDraft(null);
    } catch (e: any) {
      setRowEditError(e?.message ?? "Failed to update row");
    } finally {
      setRowSavingIndex(null);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-accent-text px-3 py-1 text-sm hover:bg-background-secondary disabled:opacity-60"
          onClick={onReload}
          disabled={busy}
          title="Reload table"
        >
          <RefreshCcw size={14} />
          Reload
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-accent-text px-3 py-1 text-sm hover:bg-background-secondary disabled:opacity-60"
          onClick={resetColumnLayout}
          disabled={busy}
          title="Reset column layout"
        >
          <RotateCcw size={14} />
          Reset columns
        </button>
        {selectedTable ? <span className="text-xs opacity-70">{selectedTable}</span> : null}
      </div>

      {!selectedTable ? (
        <div className="mt-3 text-sm opacity-70">Select a table from the list.</div>
      ) : (
        <>
          <div className="mt-3 rounded-lg border border-accent-text p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Columns</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-70">{columns.length} column(s)</span>
                {columnDraft ? (
                  <>
                    <button
                      type="button"
                      className="h-8 rounded-lg border border-accent-text bg-accent-text-dark px-3 text-xs text-white transition-colors duration-200 hover:bg-accent-text-dark-2 disabled:opacity-60"
                      onClick={saveNewColumn}
                      disabled={busy}
                      title="Save new column"
                    >
                      <Check size={14} className="inline mr-1" />
                      Save changes
                    </button>
                    <button
                      type="button"
                      className="size-8 rounded-lg border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 flex items-center justify-center"
                      onClick={() => {
                        setColumnDraft(null);
                        setColumnDraftError(null);
                      }}
                      disabled={busy}
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="h-8 rounded-lg border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 px-3 text-xs"
                    onClick={() => {
                      setColumnEditError(null);
                      setEditingColumn(null);
                      setColumnDraft({ name: "", type: "TEXT", nullable: true, defaultValue: "" });
                    }}
                    disabled={busy}
                    title="New column"
                  >
                    <Plus size={14} className="inline mr-1" />
                    New column
                  </button>
                )}
              </div>
            </div>

            {columnDraftError ? <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{columnDraftError}</div> : null}
            {columnEditError ? <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{columnEditError}</div> : null}

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-background-primary">
                  <tr className="border-b border-accent-text">
                    <th className="px-2 py-1">Name</th>
                    <th className="px-2 py-1">Type</th>
                    <th className="px-2 py-1">Nullable</th>
                    <th className="px-2 py-1">Default</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {columnDraft ? (
                    <tr className="border-b border-accent-text/30 bg-background-secondary/30">
                      <td className="px-2 py-1">
                        <input
                          className="w-full min-w-0 rounded-md border border-accent-text bg-background-primary px-2 py-1 text-xs font-mono outline-none focus:border-accent-text-dark-2"
                          placeholder="column_name"
                          value={columnDraft.name}
                          onChange={(e) => setColumnDraft((p) => (p ? { ...p, name: e.target.value } : p))}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full min-w-0 rounded-md border border-accent-text bg-background-primary px-2 py-1 text-xs font-mono outline-none focus:border-accent-text-dark-2"
                          placeholder="TEXT"
                          value={columnDraft.type}
                          onChange={(e) => setColumnDraft((p) => (p ? { ...p, type: e.target.value } : p))}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <label className="text-xs inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={columnDraft.nullable}
                            onChange={(e) =>
                              setColumnDraft((p) => (p ? { ...p, nullable: e.target.checked } : p))
                            }
                          />
                          Nullable
                        </label>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full min-w-0 rounded-md border border-accent-text bg-background-primary px-2 py-1 text-xs font-mono outline-none focus:border-accent-text-dark-2"
                          placeholder="(default)"
                          value={columnDraft.defaultValue}
                          onChange={(e) => setColumnDraft((p) => (p ? { ...p, defaultValue: e.target.value } : p))}
                        />
                      </td>
                      <td className="px-2 py-1"></td>
                    </tr>
                  ) : null}

                  {columns.map((c) => {
                    const isEditing = editingColumn?.originalName === c.name;
                    return (
                      <tr key={c.name} className="border-b border-accent-text/30 last:border-b-0" title={columnTooltip(c)}>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              className="w-full min-w-0 rounded-md border border-accent-text bg-background-primary px-2 py-1 text-xs font-mono outline-none focus:border-accent-text-dark-2"
                              value={editingColumn?.name ?? ""}
                              onChange={(e) => setEditingColumn((p) => (p ? { ...p, name: e.target.value } : p))}
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-mono truncate">{c.name}</span>
                              {c.isPrimaryKey ? <span className="text-[11px] opacity-70">PK</span> : null}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              className="w-full min-w-0 rounded-md border border-accent-text bg-background-primary px-2 py-1 text-xs font-mono outline-none focus:border-accent-text-dark-2"
                              value={editingColumn?.type ?? ""}
                              onChange={(e) => setEditingColumn((p) => (p ? { ...p, type: e.target.value } : p))}
                            />
                          ) : (
                            <span className="font-mono">{c.type}</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <label className="text-xs inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editingColumn?.nullable ?? true}
                                onChange={(e) => setEditingColumn((p) => (p ? { ...p, nullable: e.target.checked } : p))}
                              />
                              Nullable
                            </label>
                          ) : (
                            <span>{c.nullable ? "yes" : "no"}</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              className="w-full min-w-0 rounded-md border border-accent-text bg-background-primary px-2 py-1 text-xs font-mono outline-none focus:border-accent-text-dark-2"
                              value={editingColumn?.defaultValue ?? ""}
                              onChange={(e) => setEditingColumn((p) => (p ? { ...p, defaultValue: e.target.value } : p))}
                            />
                          ) : (
                            <span className="font-mono">{c.defaultValue ?? ""}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                className="size-8 rounded-lg border border-accent-text bg-accent-text-dark text-white transition-colors duration-200 hover:bg-accent-text-dark-2 flex items-center justify-center disabled:opacity-60"
                                onClick={saveEditedColumn}
                                disabled={busy || columnSaving}
                                title="Save"
                              >
                                <Save size={14} />
                              </button>
                              <button
                                type="button"
                                className="size-8 rounded-lg border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 flex items-center justify-center"
                                onClick={() => {
                                  setEditingColumn(null);
                                  setColumnEditError(null);
                                }}
                                disabled={busy || columnSaving}
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="size-8 rounded-lg border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 inline-flex items-center justify-center"
                              onClick={() => {
                                setColumnDraft(null);
                                setColumnDraftError(null);
                                setEditingColumn({
                                  originalName: c.name,
                                  name: c.name,
                                  type: c.type,
                                  nullable: c.nullable !== false,
                                  defaultValue: c.defaultValue ?? ""
                                });
                              }}
                              disabled={busy}
                              title="Edit column"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {columns.length === 0 ? (
                    <tr>
                      <td className="px-2 py-2 text-sm opacity-70" colSpan={5}>
                        No schema loaded (or table has no columns).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-accent-text p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Rows</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-70">{rows.length} row(s) loaded</span>
                <button
                  type="button"
                  className="size-9 rounded-lg border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 flex items-center justify-center"
                  onClick={() => {
                    setCopyError(null);
                    setRowEditError(null);
                    setSaveError(null);
                    setEditingRowIndex(null);
                    setEditingRowDraft(null);
                    setPendingRow((prev) => {
                      if (prev) return prev;
                      const blank: Record<string, string> = {};
                      for (const c of columns) blank[c.name] = "";
                      return blank;
                    });
                  }}
                  disabled={busy || !columns.length}
                  title="Add new row"
                >
                  <Plus size={18} />
                </button>
                <button
                  type="button"
                  className="h-9 rounded-lg border border-accent-text bg-accent-text-dark px-3 text-sm text-white transition-colors duration-200 hover:bg-accent-text-dark-2 disabled:opacity-60"
                  onClick={savePendingRow}
                  disabled={busy || saving || !pendingRow}
                  title="Save new row"
                >
                  <Save size={16} className="inline mr-2" />
                  Save changes
                </button>
                <details className="relative">
                  <summary className="list-none cursor-pointer select-none h-8 rounded-lg border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 px-2 text-xs inline-flex items-center gap-2">
                    <Columns2 size={14} />
                    Columns
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 min-w-[220px] rounded-md border border-accent-text bg-background-primary p-2 shadow-lg">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span>Visible columns</span>
                      <button
                        type="button"
                        className="text-[11px] underline"
                        onClick={resetColumnLayout}
                        disabled={busy}
                      >
                        Reset
                      </button>
                    </div>
                    <div className="mt-2 max-h-64 space-y-1 overflow-auto">
                      {columns.map((c) => (
                        <label key={c.name} className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!hiddenColumns[c.name]}
                              onChange={(e) => setHiddenColumns((prev) => ({ ...prev, [c.name]: !e.target.checked }))}
                            />
                            <span className="font-mono">{c.name}</span>
                          </div>
                          <button
                            type="button"
                            className="text-[11px] underline"
                            onClick={() => setColumnWidths((prev) => ({ ...prev, [c.name]: MIN_COL_PX }))}
                          >
                            Reset width
                          </button>
                        </label>
                      ))}
                    </div>
                  </div>
                </details>
              </div>
            </div>

            {saveError ? <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{saveError}</div> : null}
            {rowEditError ? <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{rowEditError}</div> : null}
            {copyError ? <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{copyError}</div> : null}
            {!canEditRows ? <div className="mt-2 text-xs opacity-70">Row editing is disabled (table has no primary key).</div> : null}

            <div className="mt-3 overflow-x-auto">
              <table
                className="w-full text-left text-sm"
                style={{ minWidth: `${rowsTableMinWidthPx}px` }}
              >
                <thead className="sticky top-0 bg-background-primary">
                  <tr className="border-b border-accent-text">
                    <th className="px-2 py-1 font-medium">Actions</th>
                    {visibleColumns.map((c) => (
                      <th
                        key={c.name}
                        className="px-2 py-1 font-medium relative"
                        title={columnTooltip(c)}
                        style={{ width: columnWidths[c.name] }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono">{c.name}</span>
                          <div
                            className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none"
                            onMouseDown={(e) => beginResize(c.name, e.clientX)}
                            onTouchStart={(e) => {
                              if (!e.touches?.length) return;
                              beginResize(c.name, e.touches[0].clientX);
                            }}
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingRow && visibleColumns.length ? (
                    <tr className="border-b border-accent-text/30 bg-background-secondary/30">
                      <td className="px-2 py-1 align-top">
                        <button
                          type="button"
                          className="size-8 rounded-lg border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 inline-flex items-center justify-center"
                          onClick={() => {
                            setPendingRow(null);
                            setSaveError(null);
                          }}
                          disabled={busy || saving}
                          title="Cancel new row"
                        >
                          <X size={14} />
                        </button>
                      </td>
                      {visibleColumns.map((c) => (
                        <td key={c.name} className="px-2 py-1 align-top">
                          <input
                            className="w-full min-w-0 rounded-md border border-accent-text bg-background-primary px-2 py-1 text-xs font-mono outline-none focus:border-accent-text-dark-2"
                            value={pendingRow[c.name] ?? ""}
                            onChange={(e) =>
                              setPendingRow((prev) =>
                                prev ? { ...prev, [c.name]: e.target.value } : prev
                              )
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ) : null}

                  {rows.map((r, idx) => {
                    return (
                      <tr
                        key={idx}
                        className="border-b border-accent-text/30 last:border-b-0"
                      >
                        <td className="px-2 py-1 align-top">
                          {editingRowIndex === idx ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="size-8 rounded-lg border border-accent-text bg-accent-text-dark text-white transition-colors duration-200 inline-flex items-center justify-center disabled:opacity-60"
                                onClick={saveEditedRow}
                                disabled={busy || rowSavingIndex === idx}
                                title="Save row"
                              >
                                <Save size={14} />
                              </button>
                              <button
                                type="button"
                                className="size-8 rounded-lg border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 inline-flex items-center justify-center"
                                onClick={() => {
                                  setEditingRowIndex(null);
                                  setEditingRowDraft(null);
                                  setRowEditError(null);
                                }}
                                disabled={busy || rowSavingIndex === idx}
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="size-8 rounded-lg border border-accent-text bg-background-secondary/50 hover:bg-background-secondary transition-colors duration-200 inline-flex items-center justify-center disabled:opacity-60"
                              onClick={() => startEditRow(idx)}
                              disabled={busy || !canEditRows}
                              title={canEditRows ? "Edit row" : "Row editing requires a primary key"}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </td>
                        {visibleColumns.length ? (
                          visibleColumns.map((c) => {
                            const rawValue = r?.[c.name];
                            const text =
                              typeof rawValue === "object"
                                ? JSON.stringify(rawValue)
                                : String(rawValue ?? "");

                            return (
                              <td key={c.name} className="px-2 py-1 align-top">
                                {editingRowIndex === idx && editingRowDraft ? (
                                  <input
                                    className="w-full min-w-0 rounded-md border border-accent-text bg-background-primary px-2 py-1 text-xs font-mono outline-none focus:border-accent-text-dark-2"
                                    value={editingRowDraft[c.name] ?? ""}
                                    onChange={(e) =>
                                      setEditingRowDraft((prev) =>
                                        prev ? { ...prev, [c.name]: e.target.value } : prev
                                      )
                                    }
                                  />
                                ) : (
                                  <div className="group relative pr-7">
                                    <code
                                      className="text-xs wrap-break-word block"
                                      style={clampStyle}
                                      title={text}
                                    >
                                      {text}
                                    </code>
                                    <button
                                      type="button"
                                      className="absolute top-1 right-1 size-6 rounded-md border border-accent-text bg-background-primary/80 hover:bg-background-secondary transition-colors duration-200 opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                      onClick={() => void copyToClipboard(text)}
                                      title="Copy"
                                    >
                                      <Copy size={12} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            );
                          })
                        ) : (
                          <td className="px-2 py-1 align-top">
                            <code className="text-xs">{JSON.stringify(r)}</code>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {rows.length === 0 ? (
                    <tr>
                      <td
                        className="px-2 py-2 text-sm opacity-70"
                        colSpan={Math.max(1, visibleColumns.length + 1)}
                      >
                        No rows loaded.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
