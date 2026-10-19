"use client";

import { useEffect, useRef, useState } from "react";

/** Shared session action; opening this disclosure never logs the user out. */
export function ServerUserMenu({ name, detail, initial, canLogout, onLogout }: {
  name: string; detail: string; initial: string; canLogout: boolean; onLogout(): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try { await onLogout(); }
    catch { setError("退出未完成，请检查网络后重试。"); setOpen(true); }
    finally { inFlight.current = false; setPending(false); }
  }
  const identity = <><span>{initial}</span><div><strong>{name}</strong><small>{detail}</small></div></>;
  if (!canLogout) return <div className="qc-server-identity" aria-label="当前身份">{identity}</div>;
  return <div className="qc-user-menu" ref={root}
    onPointerEnter={event => { if (event.pointerType === "mouse") setOpen(true); }}
    onPointerLeave={event => { if (event.pointerType === "mouse" && !root.current?.contains(document.activeElement) && !error) setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !error) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); trigger.current?.focus(); setOpen(false); } }}>
    <button ref={trigger} type="button" className="qc-server-identity" aria-label="用户菜单" aria-expanded={open}
      aria-controls="server-user-actions" onFocus={() => setOpen(true)} onClick={() => setOpen(true)}>{identity}</button>
    {open && <div id="server-user-actions" className="qc-user-popover"><div className="qc-user-popover-inner">
      <button type="button" disabled={pending} onClick={() => void logout()}>{pending ? "正在退出…" : "退出登录"}</button>
      {error && <span role="alert">{error}</span>}
    </div></div>}
  </div>;
}
