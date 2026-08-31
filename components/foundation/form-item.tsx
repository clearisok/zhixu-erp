import type { ReactNode } from "react";

export function FormItem({ label, required, hint, error, children, className = "" }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return <label className={`qc-form-item ${className}`.trim()} data-invalid={Boolean(error) || undefined}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{error ? <small className="qc-field-error" role="alert">{error}</small> : hint && <small>{hint}</small>}</label>;
}
