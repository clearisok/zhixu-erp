"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FormShell } from "./form-shell";
import { closeFromBackdrop, useOverlayLifecycle } from "./overlay";

export function MobileSheet({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  onSubmit,
  className = "",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  onSubmit?: () => void | Promise<void>;
  className?: string;
}) {
  const panel = useRef<HTMLElement | null>(null);
  const { titleId, descriptionId } = useOverlayLifecycle({ open, panelRef: panel, onClose });
  if (!open || typeof document === "undefined") return null;

  const content = <>
    <header><div className="qc-sheet-handle" aria-hidden="true" /><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button type="button" onClick={onClose} aria-label={`关闭${title}`}>×</button></header>
    <div className="qc-mobile-sheet-body">{children}</div>
    {footer && <footer>{footer}</footer>}
  </>;
  const common = {
    className: `qc-mobile-sheet ${className}`.trim(),
    role: "dialog",
    "aria-modal": true as const,
    "aria-labelledby": titleId,
    "aria-describedby": description ? descriptionId : undefined,
    tabIndex: -1,
  };

  return createPortal(<div className="qc-mobile-sheet-backdrop qc-foundation-portal" onMouseDown={(event) => closeFromBackdrop(event, onClose)}>
    {onSubmit
      ? <FormShell {...common} ref={(node) => { panel.current = node; }} onSubmit={onSubmit}>{content}</FormShell>
      : <section {...common} ref={(node) => { panel.current = node; }}>{content}</section>}
  </div>, document.body);
}
