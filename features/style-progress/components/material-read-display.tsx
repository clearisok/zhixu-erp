import type { ReactNode } from 'react';
import { Card } from '@/components/foundation/card';
/** Shared display-only shell used by Browser and Server Material Control Tower. */
export function MaterialReadCard({ materialKey, children }: { materialKey: string; children: ReactNode }) {
  return <Card className="sp-v4-material-card" data-canonical-material-key={materialKey}>{children}</Card>;
}
export function MaterialReadTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number | null>> }) {
  return <div className="sp-v4-inner-scroll"><table className="sp-v4-detail-table"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row,i) => <tr key={i}>{row.map((cell,j) => <td key={j}>{cell === null || cell === '' ? '—' : cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>暂无记录</td></tr>}</tbody></table></div>;
}
