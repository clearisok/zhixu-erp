import type { ReactNode } from "react";

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ops-content qc-page-container ${className}`.trim()}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, count, back, status, primaryAction, secondaryActions, moreActions, actions, sticky = false, variant = "list", className = "" }: { eyebrow?: string; title: ReactNode; description?: ReactNode; count?: ReactNode; back?: ReactNode; status?: ReactNode; primaryAction?: ReactNode; secondaryActions?: ReactNode; moreActions?: ReactNode; actions?: ReactNode; sticky?: boolean; variant?: "list" | "object"; className?: string }) {
  const actionContent = actions ?? <>{secondaryActions}{moreActions}{primaryAction}</>;
  return <header className={`module-head qc-page-header ${className}`.trim()} data-variant={variant} data-sticky={sticky || undefined}>
    {back && <div className="qc-page-back">{back}</div>}
    <div className="qc-page-identity">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<div className="qc-page-title-line"><h1>{title}</h1>{count !== undefined && <span className="qc-page-count">{count}</span>}{status}</div>{description && <p>{description}</p>}</div>
    {actionContent && <div className="qc-page-actions">{actionContent}</div>}
  </header>;
}
