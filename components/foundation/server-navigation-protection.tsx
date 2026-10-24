"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./button";
import { Modal } from "./modal";
import { workspaceHistoryKey, type WorkspaceHistory } from "./server-navigation-history";

type Protection = { dirty?: boolean; blocked?: boolean; message?: string };
type Entry = { scope: string | null; value: Protection };
type Controls = {
  scope: string | null;
  register(entry: Entry): () => void;
  check(handledDirty?: boolean): boolean;
  confirmed<T>(run: () => T): T;
  permit(entry: Entry, scope: string | null, run: () => void): void;
  navigate(target: string, replace: boolean, run: () => void): void;
};
const Context = createContext<Controls | null>(null);
const defaultMessage = "操作正在处理或提交结果尚未确认，请先完成保存或核对原请求。";
type HistoryWindow = Window & { __zhixuWorkspaceHistory?: WorkspaceHistory };
function businessLocation(href: string) { const url = new URL(href); return url.pathname + url.search; }

export function ServerNavigationProtection({ scope, children }: { scope: string | null; children: ReactNode }) {
  const generation = useMemo(() => ({ scope }), [scope]);
  const state = useRef({ scope, generation, entries: new Set<Entry>(), permitted: new Set<Entry>(), bypass: 0, historyUntrusted: false });
  useLayoutEffect(() => { state.current.scope = scope; state.current.generation = generation; }, [scope, generation]);
  const [notice, setNotice] = useState<{ generation: typeof generation; message: string } | null>(null);
  const showNotice = useCallback((message: string) => setNotice({ generation: state.current.generation, message }), []);
  const protections = useCallback(() => state.current.scope === null ? [] : [...state.current.entries].filter(entry => entry.scope === state.current.scope && !state.current.permitted.has(entry)).map(entry => entry.value), []);
  const register = useCallback((entry: Entry) => { state.current.entries.add(entry); return () => { state.current.entries.delete(entry); }; }, []);
  const check = useCallback((handledDirty = false) => {
    if (state.current.bypass) return true;
    const active = protections(), blocked = active.find(entry => entry.blocked);
    if (blocked) { showNotice(blocked.message ?? defaultMessage); return false; }
    return handledDirty || !active.some(entry => entry.dirty) || window.confirm("有未保存的修改，是否放弃本次输入并离开？");
  }, [protections, showNotice]);
  const confirmed = useCallback(<T,>(run: () => T): T => {
    state.current.bypass++;
    try { return run(); } finally { state.current.bypass--; }
  }, []);
  const permit = useCallback((entry: Entry, expectedScope: string | null, run: () => void) => {
    // An asynchronous receipt cannot grant navigation after its owner or identity disappeared.
    if (expectedScope === null || expectedScope !== state.current.scope || entry.scope !== expectedScope || !state.current.entries.has(entry)) return;
    state.current.permitted.add(entry);
    try { if (check()) confirmed(run); } finally { state.current.permitted.delete(entry); }
  }, [check, confirmed]);
  const navigate = useCallback((target: string, replace: boolean, run: () => void) => {
    if (!check()) return;
    if (!state.current.historyUntrusted) { run(); return; }
    const url = new URL(target, location.href);
    if (url.origin !== location.origin || !["http:", "https:"].includes(url.protocol)) return;
    // A foreign history entry cannot be repaired by guessing a direction or rewriting it.
    // The next explicitly approved destination starts a fresh document/history epoch.
    if (replace) location.replace(url.href); else location.assign(url.href);
  }, [check]);
  const controls = useMemo(() => ({ scope, register, check, confirmed, permit, navigate }), [scope, register, check, confirmed, permit, navigate]);

  useEffect(() => {
    const tracker = (window as HistoryWindow).__zhixuWorkspaceHistory;
    let traversal: { origin: number; originHref: string; delta: number; scope: string | null; phase: "restore" | "replay" } | null = null;
    const unload = (event: BeforeUnloadEvent) => {
      if (protections().some(entry => entry.dirty || entry.blocked)) { event.preventDefault(); event.returnValue = ""; }
    };
    const link = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.download || anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || businessLocation(url.href) === businessLocation(location.href)) return;
      if (!check()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const pop = (event: PopStateEvent) => {
      if (!tracker) return;
      const target = history.state?.[workspaceHistoryKey] as { epoch?: string; index?: number } | undefined;
      const known = target?.epoch === tracker.epoch && Number.isSafeInteger(target.index);
      if (traversal) {
        const pending = traversal;
        if (pending.phase === "replay" && known && target!.index === pending.origin + pending.delta) {
          traversal = null; tracker.index = target!.index!; tracker.href = location.href; return;
        }
        event.stopImmediatePropagation();
        if (!known) { traversal = null; state.current.historyUntrusted = true; showNotice("浏览器历史已无法可靠核对，当前输入仍保留。请先完成当前操作；下次明确离开会重新打开目标页面。当前地址可能与正在编辑的页面不同。"); return; }
        if (target!.index !== pending.origin) { history.go(pending.origin - target!.index!); return; }
        tracker.index = pending.origin; tracker.href = location.href;
        if (pending.scope === state.current.scope && check()) { pending.phase = "replay"; history.go(pending.delta); }
        else traversal = null;
        return;
      }
      const active = protections();
      const needsGuard = active.some(entry => entry.dirty || entry.blocked) && (businessLocation(location.href) !== businessLocation(tracker.href) || location.href === tracker.href);
      if (!needsGuard) { if (known) tracker.index = target!.index!; tracker.href = location.href; return; }
      if (!known || target!.index === tracker.index) {
        // Foreign/untracked entries have no provable direction. Never guess go(1).
        if (!check()) { event.stopImmediatePropagation(); state.current.historyUntrusted = true; showNotice("浏览器历史已无法可靠核对，当前输入仍保留。请先完成当前操作；下次明确离开会重新打开目标页面。当前地址可能与正在编辑的页面不同。"); }
        else { state.current.historyUntrusted = true; tracker.href = location.href; }
        return;
      }
      event.stopImmediatePropagation();
      traversal = { origin: tracker.index, originHref: tracker.href, delta: target!.index! - tracker.index, scope: state.current.scope, phase: "restore" };
      history.go(-traversal.delta);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);
    // Window is the popstate target. A later capture listener can still run after
    // framework listeners there; the early public-History dispatcher runs first.
    if (tracker) tracker.onPop = pop;
    return () => { traversal = null; window.removeEventListener("beforeunload", unload); document.removeEventListener("click", link, true); if (tracker?.onPop === pop) tracker.onPop = undefined; };
  }, [check, protections, showNotice]);

  return <Context.Provider value={controls}>{children}<Modal open={scope !== null && notice?.generation === generation} title="请先完成当前操作" onClose={() => setNotice(null)} footer={<Button onClick={() => setNotice(null)}>继续处理</Button>}><p>{notice?.message}</p></Modal></Context.Provider>;
}

export function useServerNavigationControls() { return useContext(Context); }

/** Registers UI protection only; saving and receipt reconciliation remain feature-owned. */
export function useServerNavigationProtection(value: Protection) {
  const controls = useContext(Context);
  const entry = useRef<Entry>({ scope: controls?.scope ?? null, value });
  useLayoutEffect(() => { entry.current.value = value; entry.current.scope = controls?.scope ?? null; });
  useLayoutEffect(() => controls?.register(entry.current), [controls]);
  const scope = controls?.scope ?? null;
  return useCallback((run: () => void) => { if (controls) controls.permit(entry.current, scope, run); else run(); }, [controls, scope]);
}

/** Public router operations used by protected Server pages and modal owners. */
export function useProtectedRouter() {
  const router = useRouter(), controls = useContext(Context);
  return useMemo(() => !controls ? router : {
    ...router,
    push: (...args: Parameters<typeof router.push>) => controls.navigate(args[0], false, () => router.push(...args)),
    replace: (...args: Parameters<typeof router.replace>) => controls.navigate(args[0], true, () => router.replace(...args)),
    refresh: () => { if (controls.check()) router.refresh(); },
  }, [router, controls]);
}
