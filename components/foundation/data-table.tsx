import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { EmptyState, ErrorState } from "./states";

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  className?: string;
  width?: number;
  minWidth?: number;
  sticky?: "left" | "right";
  align?: "left" | "center" | "right";
  responsivePriority?: "primary" | "secondary" | "tertiary";
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
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
};

function displayValue(value: ReactNode) {
  return value === null || value === undefined || value === "" ? <span className="qc-empty-value">—</span> : value;
}

function activateFromKeyboard<T>(event: KeyboardEvent<HTMLTableRowElement>, row: T, onActivate?: (row: T) => void) {
  if (!onActivate || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  onActivate(row);
}

export function DataTable<T>({ rows, columns, rowKey, rowClassName, empty, emptyTitle = "暂无记录", emptyDescription, loading = false, loadingLabel = "正在加载数据", error, onRetry, selectedRowKey, onRowActivate, renderRecord, ariaLabel = "业务数据表格", className = "" }: DataTableProps<T>) {
  const leftOffsets = new Map<string, number>();
  let left = 0;
  for (const column of columns) {
    if (column.sticky !== "left") continue;
    leftOffsets.set(column.key, left);
    left += column.width ?? column.minWidth ?? 120;
  }
  const rightOffsets = new Map<string, number>();
  let right = 0;
  for (const column of [...columns].reverse()) {
    if (column.sticky !== "right") continue;
    rightOffsets.set(column.key, right);
    right += column.width ?? column.minWidth ?? 96;
  }
  const styleFor = (column: DataColumn<T>): CSSProperties => ({
    width: column.width,
    minWidth: column.minWidth ?? column.width,
    ...(column.sticky === "left" ? { left: leftOffsets.get(column.key) } : {}),
    ...(column.sticky === "right" ? { right: rightOffsets.get(column.key) } : {}),
  });
  const classFor = (column: DataColumn<T>) => [
    column.className,
    column.sticky ? `is-sticky-${column.sticky}` : "",
    column.align ? `is-${column.align}` : "",
  ].filter(Boolean).join(" ");

  if (error) return <ErrorState title="数据加载失败" description={error} onRetry={onRetry} />;
  if (!loading && !rows.length) return <>{empty ?? <EmptyState title={emptyTitle} description={emptyDescription} />}</>;

  return <div className={`qc-business-table ${className}`.trim()} data-loading={loading || undefined}>
    <div className="qc-table-wrap" tabIndex={0} role="region" aria-label={`${ariaLabel}，可横向滚动`}>
      <table className="qc-data-table" aria-label={ariaLabel} aria-busy={loading || undefined}>
        <colgroup>{columns.map((column) => <col key={column.key} style={styleFor(column)} />)}</colgroup>
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col" className={classFor(column)} data-priority={column.responsivePriority ?? "secondary"} style={styleFor(column)}>{column.header}</th>)}</tr></thead>
        <tbody>{loading ? Array.from({ length: 5 }, (_, rowIndex) => <tr key={`loading-${rowIndex}`} className="qc-table-skeleton" aria-hidden="true">{columns.map((column) => <td key={column.key} className={classFor(column)} style={styleFor(column)}><i /></td>)}</tr>) : rows.map((row) => {
          const key = rowKey(row);
          const selected = key === selectedRowKey;
          return <tr key={key} className={[rowClassName?.(row), selected ? "is-selected" : ""].filter(Boolean).join(" ")} aria-selected={selected || undefined} tabIndex={onRowActivate ? 0 : undefined} onClick={() => onRowActivate?.(row)} onKeyDown={(event) => activateFromKeyboard(event, row, onRowActivate)}>{columns.map((column) => <td key={column.key} className={classFor(column)} data-priority={column.responsivePriority ?? "secondary"} style={styleFor(column)}>{displayValue(column.render(row))}</td>)}</tr>;
        })}</tbody>
      </table>
      {loading && <span className="sr-only" role="status">{loadingLabel}</span>}
    </div>
    {renderRecord && !loading && <div className="qc-responsive-record-list" role="list" aria-label={`${ariaLabel}移动视图`}>{rows.map((row) => <article role="listitem" key={rowKey(row)} className={rowKey(row) === selectedRowKey ? "is-selected" : ""} onClick={() => onRowActivate?.(row)}>{renderRecord(row)}</article>)}</div>}
  </div>;
}
