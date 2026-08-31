"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FormShell } from "./form-shell";
import { closeFromBackdrop, useOverlayLifecycle } from "./overlay";

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
  eyebrow?: string;
  tone?: "default" | "danger";
};

export function Modal({ open, title, description, children, footer, className = "", onClose, onSubmit, submitOnModifierEnter = true, eyebrow, tone = "default" }: ModalProps) {
  const panel = useRef<HTMLElement | null>(null);
  const { titleId, descriptionId } = useOverlayLifecycle({ open, panelRef: panel, onClose });
  if (!open) return null;

  const content = <>
    <header><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button type="button" onClick={onClose} aria-label={`关闭${title}`}>×</button></header>
    <div className="qc-modal-body">{children}</div>
    {footer && <footer>{footer}</footer>}
  </>;
  const common = { className: `qc-modal ${className}`.trim(), role: "dialog", "aria-modal": true as const, "aria-labelledby": titleId, "aria-describedby": description ? descriptionId : undefined, "data-tone": tone, tabIndex: -1 };

  if (typeof document === "undefined") return null;
  return createPortal(<div className="qc-modal-backdrop qc-foundation-portal" onMouseDown={(event) => closeFromBackdrop(event, onClose)}>
    {onSubmit
      ? <FormShell {...common} ref={(node) => { panel.current = node; }} onSubmit={onSubmit} submitOnModifierEnter={submitOnModifierEnter}>{content}</FormShell>
      : <section {...common} ref={(node) => { panel.current = node; }}>{content}</section>}
  </div>, document.body);
}
