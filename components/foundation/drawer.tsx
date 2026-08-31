"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FormShell } from "./form-shell";
import { closeFromBackdrop, useOverlayLifecycle } from "./overlay";

type DrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  onClose: () => void;
  onSubmit?: () => void | Promise<void>;
  eyebrow?: string;
  placement?: "left" | "right";
  presentation?: "drawer" | "fullscreen";
};

export function Drawer({ open, title, description, children, footer, className = "", onClose, onSubmit, eyebrow, placement = "right", presentation = "drawer" }: DrawerProps) {
  const panel = useRef<HTMLElement | null>(null);
  const { titleId, descriptionId } = useOverlayLifecycle({ open, panelRef: panel, onClose });
  if (!open) return null;

  const content = <>
    <header><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button type="button" onClick={onClose} aria-label={`关闭${title}`}>×</button></header>
    <div className="qc-drawer-body">{children}</div>
    {footer && <footer>{footer}</footer>}
  </>;
  const common = { className: `qc-drawer ${className}`.trim(), role: "dialog", "aria-modal": true as const, "aria-labelledby": titleId, "aria-describedby": description ? descriptionId : undefined, "data-placement": placement, "data-presentation": presentation, tabIndex: -1 };

  if (typeof document === "undefined") return null;
  return createPortal(<div className="qc-drawer-backdrop qc-foundation-portal" data-placement={placement} onMouseDown={(event) => closeFromBackdrop(event, onClose)}>
    {onSubmit
      ? <FormShell {...common} ref={(node) => { panel.current = node; }} onSubmit={onSubmit}>{content}</FormShell>
      : <section {...common} ref={(node) => { panel.current = node; }}>{content}</section>}
  </div>, document.body);
}
