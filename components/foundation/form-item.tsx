import type { ReactNode } from "react";

export function FormItem({ label, required, hint, children, className = "" }: { label: string; required?: boolean; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`qc-form-item ${className}`.trim()}><span>{label}{required && <b> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}
