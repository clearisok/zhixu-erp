import type { ReactNode } from "react";

export type DescriptionItem = { key: string; label: ReactNode; value: ReactNode; secondary?: ReactNode; action?: ReactNode };

export function DescriptionList({ items, columns = 2, compact = false, className = "" }: { items: DescriptionItem[]; columns?: 1 | 2 | 3 | 4; compact?: boolean; className?: string }) {
  return <dl className={`qc-description-list ${className}`.trim()} data-columns={columns} data-compact={compact || undefined}>{items.map((item) => <div key={item.key} className="qc-detail-row"><dt>{item.label}</dt><dd><span>{item.value ?? "—"}</span>{item.secondary && <small>{item.secondary}</small>}</dd>{item.action && <aside>{item.action}</aside>}</div>)}</dl>;
}
