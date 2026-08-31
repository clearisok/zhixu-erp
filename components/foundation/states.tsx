import type { ReactNode } from "react";
import { Button } from "./button";

export function EmptyState({ title, description, action, icon = "◇", compact = false }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return <div className="qc-state qc-empty-state" data-compact={compact || undefined}><span aria-hidden="true">{icon}</span><strong>{title}</strong>{description && <p>{description}</p>}{action && <div>{action}</div>}</div>;
}

export function LoadingState({ label = "正在加载", rows = 4, compact = false }: { label?: string; rows?: number; compact?: boolean }) {
  return <div className="qc-state qc-loading-state" data-compact={compact || undefined} role="status" aria-live="polite"><strong>{label}</strong><div aria-hidden="true">{Array.from({ length: rows }, (_, index) => <i key={index} />)}</div></div>;
}

export function ErrorState({ title = "无法加载内容", description, onRetry, permission = false }: { title?: string; description?: string; onRetry?: () => void; permission?: boolean }) {
  return <div className="qc-state qc-error-state" role="alert" data-permission={permission || undefined}><span aria-hidden="true">!</span><strong>{title}</strong>{description && <p>{description}</p>}{onRetry && <Button variant="secondary" onClick={onRetry}>重试</Button>}</div>;
}

export function AlertBanner({ tone = "warning", title, children, actions }: { tone?: "info" | "warning" | "danger"; title: string; children?: ReactNode; actions?: ReactNode }) {
  return <section className="qc-alert-banner" data-tone={tone} role={tone === "danger" ? "alert" : "status"}><span aria-hidden="true">{tone === "danger" ? "!" : "△"}</span><div><strong>{title}</strong>{children && <div>{children}</div>}</div>{actions && <aside>{actions}</aside>}</section>;
}
