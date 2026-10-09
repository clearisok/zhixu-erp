"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { usePermissions } from "@/features/permissions/components/permission-provider";
import { EmptyState, ErrorState } from "./states";
import { loadTablePreference, normalizeColumnOrder, saveTablePreference, type TablePreference } from "./table-preference";
import { quoteAuthority } from "@/features/quote-center/authority/quote-authority";

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  className?: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  sticky?: "left" | "right";
  align?: "left" | "center" | "right";
  responsivePriority?: "primary" | "secondary" | "tertiary";
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  /** Opt-in pixel floors with local horizontal overflow; other tables remain fit-first. */
  layout?: "fit" | "readable";
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string;
  empty?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  onRetry?: () => void;
  selectedRowKey?: string | null;
  onRowActivate?: (row: T) => void;
  renderRecord?: (row: T) => ReactNode;
  ariaLabel?: string;
  className?: string;
  moduleKey?: string;
  tableKey?: string;
  tablePreference?: TablePreference;
  preferenceAliases?: Record<string, string | string[]>;
  onTablePreferenceChange?: (preference: TablePreference) => void;
};

const MIN_COLUMN_WIDTH = 56;
const MAX_COLUMN_WIDTH = 720;

function displayValue(value: ReactNode) {
  return value === null || value === undefined || value === "" ? <span className="qc-empty-value">—</span> : value;
}

function activateFromKeyboard<T>(event: KeyboardEvent<HTMLTableRowElement>, row: T, onActivate?: (row: T) => void) {
  if (!onActivate || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  onActivate(row);
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button,a,input,select,textarea,[role='button'],[data-table-control]"));
}

export function DataTable<T>({ layout = "fit", rows, columns, rowKey, rowClassName, empty, emptyTitle = "暂无记录", emptyDescription, loading = false, loadingLabel = "正在加载数据", error, onRetry, selectedRowKey, onRowActivate, renderRecord, ariaLabel = "业务数据表格", className = "", moduleKey = "workspace", tableKey, tablePreference, preferenceAliases = {}, onTablePreferenceChange }: DataTableProps<T>) {
  const { currentUser } = usePermissions();
  const stableTableKey = tableKey ?? `${moduleKey}.${ariaLabel}`;
  const defaults = useMemo(() => Object.fromEntries(columns.map((column) => [column.key, column.width ?? column.minWidth ?? 120])), [columns]);
  const defaultOrder = useMemo(() => columns.map((column) => column.key), [columns]);
  const defaultsSignature = JSON.stringify(defaults);
  const orderSignature = defaultOrder.join("|");
  const [localPreference, setLocalPreference] = useState<TablePreference>(() => ({ moduleKey, tableKey: stableTableKey, columnWidths: defaults, columnOrder: defaultOrder }));
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const dragKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (tablePreference || quoteAuthority() === "server") return;
    Promise.resolve().then(() => setLocalPreference(loadTablePreference(currentUser.id, moduleKey, stableTableKey, defaults, defaultOrder, preferenceAliases)));
    // Column definitions are intentionally tracked by their stable serialized signatures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, moduleKey, stableTableKey, defaultsSignature, orderSignature, tablePreference]);

  const preference = tablePreference ?? localPreference;
  const normalizedOrder = normalizeColumnOrder(preference.columnOrder, defaultOrder, preferenceAliases);
  const columnMap = new Map(columns.map((column) => [column.key, column]));
  const orderedColumns = normalizedOrder.map((key) => columnMap.get(key)).filter((column): column is DataColumn<T> => Boolean(column));
  const widths = Object.fromEntries(orderedColumns.map((column) => [column.key, Math.max(layout === "readable" ? column.minWidth ?? MIN_COLUMN_WIDTH : 0, preference.columnWidths[column.key] ?? defaults[column.key] ?? 120)]));
  const totalWidth = Math.max(1, Object.values(widths).reduce((sum, width) => sum + width, 0));

  const applyPreference = (next: TablePreference, persist: boolean) => {
    if (!tablePreference) setLocalPreference(next);
    onTablePreferenceChange?.(next);
    if (persist && quoteAuthority() !== "server") saveTablePreference(currentUser.id, next, defaults, defaultOrder, preferenceAliases);
  };

  const resizeColumn = (key: string, nextWidth: number, persist: boolean) => {
    const column = columnMap.get(key);
    const min = column?.minWidth ?? MIN_COLUMN_WIDTH;
    const max = column?.maxWidth ?? MAX_COLUMN_WIDTH;
    applyPreference({ ...preference, columnWidths: { ...preference.columnWidths, [key]: Math.round(Math.min(max, Math.max(min, nextWidth))) }, columnOrder: normalizedOrder }, persist);
  };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>, column: DataColumn<T>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { key: column.key, startX: event.clientX, startWidth: widths[column.key] };
    const move = (moveEvent: PointerEvent) => {
      const active = resizeRef.current;
      if (active) resizeColumn(active.key, active.startWidth + moveEvent.clientX - active.startX, false);
    };
    const finish = (upEvent: PointerEvent) => {
      const active = resizeRef.current;
      resizeRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      if (active) resizeColumn(active.key, active.startWidth + upEvent.clientX - active.startX, true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };

  const moveColumn = (sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    const next = normalizedOrder.filter((key) => key !== sourceKey);
    next.splice(Math.max(0, next.indexOf(targetKey)), 0, sourceKey);
    applyPreference({ ...preference, columnWidths: widths, columnOrder: next }, true);
  };

  const styleFor = (column: DataColumn<T>): CSSProperties => {
    const percent = widths[column.key] / totalWidth * 100;
    return {
      width: layout === "readable" ? widths[column.key] : `${percent}%`,
      ...(column.sticky === "left" ? { left: 0 } : {}),
      ...(column.sticky === "right" ? { right: 0 } : {}),
    };
  };
  const classFor = (column: DataColumn<T>) => [column.className, column.sticky ? `is-sticky-${column.sticky}` : "", column.align ? `is-${column.align}` : ""].filter(Boolean).join(" ");

  if (error) return <ErrorState title="数据加载失败" description={error} onRetry={onRetry} />;
  if (!loading && !rows.length) return <>{empty ?? <EmptyState title={emptyTitle} description={emptyDescription} />}</>;

  return <div className={`qc-business-table ${className}`.trim()} data-layout={layout} data-loading={loading || undefined} data-table-key={stableTableKey}>
    <div className="qc-table-wrap" role="region" aria-label={ariaLabel}>
      <table className="qc-data-table" style={layout === "readable" ? { minWidth: totalWidth } : undefined} aria-label={ariaLabel} aria-busy={loading || undefined}>
        <colgroup>{orderedColumns.map((column) => <col key={column.key} data-column-key={column.key} style={styleFor(column)} />)}</colgroup>
        <thead><tr>{orderedColumns.map((column) => <th key={column.key} scope="col" className={classFor(column)} data-column-key={column.key} data-priority={column.responsivePriority ?? "secondary"} style={styleFor(column)} draggable onDragStart={(event) => { dragKeyRef.current = column.key; event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const source = dragKeyRef.current; dragKeyRef.current = null; if (source) moveColumn(source, column.key); }}>
          <span className="qc-table-heading"><span className="qc-column-drag-handle" aria-hidden="true">⋮⋮</span><span>{column.header}</span></span>
          <button type="button" className="qc-column-resize-handle" data-table-control aria-label={`调整${typeof column.header === "string" ? column.header : column.key}列宽`} onPointerDown={(event) => startResize(event, column)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); event.stopPropagation(); resizeColumn(column.key, widths[column.key] + (event.key === "ArrowRight" ? 8 : -8), true); }} />
        </th>)}</tr></thead>
        <tbody>{loading ? Array.from({ length: 5 }, (_, rowIndex) => <tr key={`loading-${rowIndex}`} className="qc-table-skeleton" aria-hidden="true">{orderedColumns.map((column) => <td key={column.key} className={classFor(column)} data-column-key={column.key} style={styleFor(column)}><i /></td>)}</tr>) : rows.map((row) => {
          const key = rowKey(row);
          const selected = key === selectedRowKey;
          return <tr key={key} className={[rowClassName?.(row), selected ? "is-selected" : ""].filter(Boolean).join(" ")} aria-selected={selected || undefined} tabIndex={onRowActivate ? 0 : undefined} onClick={(event) => { if (!isInteractiveTarget(event.target)) onRowActivate?.(row); }} onKeyDown={(event) => activateFromKeyboard(event, row, onRowActivate)}>{orderedColumns.map((column) => <td key={column.key} className={classFor(column)} data-column-key={column.key} data-priority={column.responsivePriority ?? "secondary"} style={styleFor(column)}>{displayValue(column.render(row))}</td>)}</tr>;
        })}</tbody>
      </table>
      {loading && <span className="sr-only" role="status">{loadingLabel}</span>}
    </div>
    {renderRecord && !loading && <div className="qc-responsive-record-list" role="list" aria-label={`${ariaLabel}移动视图`}>{rows.map((row) => <article role="listitem" key={rowKey(row)} className={rowKey(row) === selectedRowKey ? "is-selected" : ""} onClick={() => onRowActivate?.(row)}>{renderRecord(row)}</article>)}</div>}
  </div>;
}
