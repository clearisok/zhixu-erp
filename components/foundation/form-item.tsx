"use client";

import { createContext, useContext, useId, type ReactNode } from "react";

export type FormFieldControl = { id: string; "aria-labelledby": string; "aria-describedby"?: string; "aria-invalid"?: true };
const FormItemFieldContext = createContext<{ label: string; control: FormFieldControl } | null>(null);
export const useFormItemField = () => useContext(FormItemFieldContext);

export function FormItem({ label, required, hint, error, children, className = "" }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode | ((control: FormFieldControl) => ReactNode); className?: string }) {
  const fieldId = useId();
  const control: FormFieldControl = { id: fieldId, "aria-labelledby": fieldId + "-label", "aria-describedby": error ? fieldId + "-error" : hint ? fieldId + "-help" : undefined, "aria-invalid": error ? true : undefined };
  return <FormItemFieldContext.Provider value={{ label, control }}><label className={`qc-form-item ${className}`.trim()} data-invalid={Boolean(error) || undefined}><span id={control["aria-labelledby"]}>{label}{required && <b aria-hidden="true"> *</b>}</span>{typeof children === "function" ? children(control) : children}{error ? <small id={fieldId + "-error"} className="qc-field-error" role="alert">{error}</small> : hint && <small id={fieldId + "-help"}>{hint}</small>}</label></FormItemFieldContext.Provider>;
}
