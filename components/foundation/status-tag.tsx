import type { ReactNode } from "react";

export function StatusTag({ tone = "neutral", children, label }: { tone?: "success" | "active" | "warning" | "danger" | "neutral"; children: ReactNode; label?: string }) {
  return <span className={`qc-status-tag ${tone}`} role="status" aria-label={label}><i aria-hidden="true" />{children}</span>;
}
