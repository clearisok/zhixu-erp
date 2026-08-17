import type { ReactNode } from "react";

export function StatusTag({ tone = "neutral", children }: { tone?: "success" | "active" | "warning" | "danger" | "neutral"; children: ReactNode }) {
  return <span className={`qc-status-tag ${tone}`}><i />{children}</span>;
}
