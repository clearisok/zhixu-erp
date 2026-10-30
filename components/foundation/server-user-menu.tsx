"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Shared session action; opening this disclosure never logs the user out. */
export function ServerUserMenu({ name, detail, initial, canLogout, onLogout, placement = "default" }: {
  name: string; detail: string; initial: string; canLogout: boolean; onLogout(): Promise<void>; placement?: "default" | "sidebar" | "drawer";
}) {
  const actionsId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !popover.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); trigger.current?.focus(); setOpen(false); } };
    const reposition = () => {
      if (placement !== "sidebar") return;
      const anchor = trigger.current?.getBoundingClientRect(), menu = popover.current;
      if (!anchor || !menu) return;
      setPosition({ left: Math.max(8, Math.min(anchor.left, innerWidth - menu.offsetWidth - 8)), top: Math.max(8, anchor.top - menu.offsetHeight - 6) });
    };
    reposition();
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const observer = new ResizeObserver(reposition);
    if (popover.current) observer.observe(popover.current);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape, true); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); observer.disconnect(); };
  }, [open, placement]);
  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try { await onLogout(); }
    catch { setError("退出未完成，请检查网络后重试。"); setOpen(true); }
    finally { inFlight.current = false; setPending(false); }
  }
  const identity = <><span>{initial}</span><div><strong>{name}</strong><small>{detail}</small></div></>;
  const identityClass = placement === "sidebar" ? "ops-user" : "qc-server-identity";
  if (!canLogout) return <div className={identityClass} aria-label="当前身份">{identity}</div>;
  const actions = open && <div ref={popover} id={actionsId} className={`qc-user-popover${placement === "sidebar" ? " qc-user-popover-portal" : ""}`}
    style={placement === "sidebar" ? { left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" } : undefined}>
    <div className="qc-user-popover-inner">
      <button type="button" disabled={pending} onClick={() => void logout()}>{pending ? "正在退出…" : "退出登录"}</button>
      {error && <span role="alert">{error}</span>}
    </div>
  </div>;
  return <div className={`qc-user-menu qc-user-menu-${placement}`} ref={root}
    onPointerEnter={event => { if (event.pointerType === "mouse") setOpen(true); }}
    onPointerLeave={event => { if (placement !== "sidebar" && event.pointerType === "mouse" && !root.current?.contains(document.activeElement) && !error) setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !popover.current?.contains(event.relatedTarget) && !error) setOpen(false); }}>
    <button ref={trigger} type="button" className={identityClass} aria-label="用户菜单" title={name} aria-expanded={open}
      aria-controls={actionsId} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
      onKeyDown={event => { if (open && (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey))) { event.preventDefault(); popover.current?.querySelector("button")?.focus(); } }}>{identity}</button>
    {placement === "sidebar" && typeof document !== "undefined" ? createPortal(actions, document.body) : actions}
  </div>;
}
