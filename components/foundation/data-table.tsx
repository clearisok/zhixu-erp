import type { ReactNode } from "react";

export type DataColumn<T> = { key: string; header: string; className?: string; render: (row: T) => ReactNode };

export function DataTable<T>({ rows, columns, rowKey, empty }: { rows: T[]; columns: DataColumn<T>[]; rowKey: (row: T) => string; empty?: ReactNode }) {
  if (!rows.length && empty) return <>{empty}</>;
  return <div className="qc-table-wrap"><table className="qc-data-table"><thead><tr>{columns.map((column) => <th key={column.key} className={column.className}>{column.header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}
