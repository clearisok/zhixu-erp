"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ open, title, description, children, footer, onClose }: { open: boolean; title: string; description?: string; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", close);
    window.setTimeout(() => panel.current?.querySelector<HTMLElement>("input,button,select,textarea")?.focus(), 0);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  if (!open) return null;
  return <div className="qc-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="qc-modal" ref={panel} role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">QUOTE CENTER</span><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" onClick={onClose} aria-label="关闭">×</button></header><div className="qc-modal-body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>;
}
