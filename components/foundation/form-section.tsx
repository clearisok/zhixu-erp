import type { ReactNode } from "react";

export function FormSection({ title, description, actions, children, columns = 2, className = "" }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; columns?: 1 | 2 | 3; className?: string }) {
  return <section className={`qc-form-section ${className}`.trim()} data-columns={columns}><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions && <aside>{actions}</aside>}</header><div className="qc-form-section-fields">{children}</div></section>;
}

export function ReadOnlyField({ label, value, secondary }: { label: ReactNode; value: ReactNode; secondary?: ReactNode }) {
  return <div className="qc-readonly-field"><span>{label}</span><strong>{value ?? "—"}</strong>{secondary && <small>{secondary}</small>}</div>;
}
