"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type FloatingMenuProps = { children: ReactNode; label: string; trigger?: ReactNode; className?: string; menuClassName?: string; align?: "start" | "end" };
const VIEWPORT_GAP = 8;

export function FloatingMenu({ children, label, trigger = "更多", className = "", menuClassName = "", align = "end" }: FloatingMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect(); const menu = menuRef.current;
    if (!anchor || !menu) return;
    const width = Math.min(Math.max(menu.offsetWidth || 160, 132), window.innerWidth - VIEWPORT_GAP * 2);
    const preferredLeft = align === "end" ? anchor.right - width : anchor.left;
    const left = Math.min(Math.max(preferredLeft, VIEWPORT_GAP), window.innerWidth - width - VIEWPORT_GAP);
    const below = anchor.bottom + 6;
    const top = below + menu.offsetHeight <= window.innerHeight - VIEWPORT_GAP ? below : Math.max(VIEWPORT_GAP, anchor.top - menu.offsetHeight - 6);
    setPosition({ left, top, width });
  }, [align]);
  useEffect(() => {
    if (!open) return; updatePosition();
    const outside = (event: PointerEvent) => { const target = event.target as Node; if (!anchorRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; event.preventDefault(); setOpen(false); anchorRef.current?.focus(); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape, true); window.addEventListener("resize", updatePosition); window.addEventListener("scroll", updatePosition, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true); };
  }, [open, updatePosition]);
  useEffect(() => { if (!open || !menuRef.current) return; updatePosition(); menuRef.current.querySelector<HTMLElement>("button:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])")?.focus({ preventScroll: true }); }, [children, open, updatePosition]);
  return <span className={`qc-floating-menu ${className}`.trim()}>
    <button ref={anchorRef} type="button" className="qc-floating-menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((current) => !current)}>{trigger}</button>
    {open && typeof document !== "undefined" && createPortal(<div ref={menuRef} id={menuId} role="menu" aria-label={label} className={`qc-floating-menu-popover qc-foundation-portal ${menuClassName}`.trim()} style={{ left: position?.left ?? 0, top: position?.top ?? 0, width: position?.width, visibility: position ? "visible" : "hidden" }} onClick={(event) => { if ((event.target as HTMLElement).closest("button,a")) setOpen(false); }}>{children}</div>, document.body)}
  </span>;
}
