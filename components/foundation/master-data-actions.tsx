import type { ReactNode } from "react";

export function MasterDataActions({ primary, children, label = "更多操作" }: {
  primary: ReactNode;
  children?: ReactNode;
  label?: string;
}) {
  return <div className="qc-master-actions">
    {primary}
    {children && <details className="qc-master-more">
      <summary aria-label={label}>更多</summary>
      <div>{children}</div>
    </details>}
  </div>;
}
