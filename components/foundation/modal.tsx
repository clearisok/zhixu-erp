"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FormShell } from "./form-shell";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  onClose: () => void;
  onSubmit?: () => void | Promise<void>;
  submitOnModifierEnter?: boolean;
};

export function Modal({ open, title, description, children, footer, className = "", onClose, onSubmit, submitOnModifierEnter = true }: ModalProps) {
  const panel = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const submitModeRef = useRef(Boolean(onSubmit));
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { submitModeRef.current = Boolean(onSubmit); }, [onSubmit]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", close);
    window.setTimeout(() => panel.current?.querySelector<HTMLElement>(submitModeRef.current ? "input:not([type='hidden']),select,textarea,button[type='submit']" : "input,select,textarea,button")?.focus(), 0);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  if (!open) return null;

  const content = <>
    <header><div><span className="eyebrow">QUOTE CENTER</span><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" onClick={onClose} aria-label="关闭">×</button></header>
    <div className="qc-modal-body">{children}</div>
    {footer && <footer>{footer}</footer>}
  </>;
  const common = { className: `qc-modal ${className}`.trim(), role: "dialog", "aria-modal": true as const, "aria-label": title };

  return <div className="qc-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    {onSubmit
      ? <FormShell {...common} ref={(node) => { panel.current = node; }} onSubmit={onSubmit} submitOnModifierEnter={submitOnModifierEnter}>{content}</FormShell>
      : <section {...common} ref={(node) => { panel.current = node; }}>{content}</section>}
  </div>;
}
