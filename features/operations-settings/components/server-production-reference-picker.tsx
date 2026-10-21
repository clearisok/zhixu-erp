"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { ProductionResourceError, productionResourceClient, type ProductionResource, type ResourceDirectory } from "../server/production-resource-client";

type ReferenceKind = "sites" | "calendars" | "groups" | "factories" | "hubs";
/** A paged lookup, never an incomplete first-page dropdown presented as all records. */
export function ServerProductionReferencePicker({ kind, value, onChange, isCurrent }: { kind: ReferenceKind; value: string; onChange: (id: string) => void; isCurrent: () => boolean }) {
  const session = useServerSession(), label = { sites: "生产地点", calendars: "工作日历", groups: "生产组", factories: "外发厂", hubs: "集货仓" }[kind];
  const [query, setQuery] = useState(""), [offset, setOffset] = useState(0), [attempt, retry] = useState(0);
  const lease = useMemo(() => ({ session, kind, query, offset, attempt }), [session, kind, query, offset, attempt]);
  const committed = useRef<typeof lease | null>(null);
  useLayoutEffect(() => { committed.current = lease; return () => { committed.current = null; }; }, [lease]);
  const [directory, setDirectory] = useState<{ lease: typeof lease; result?: ResourceDirectory; error?: string }>();
  const selection = useMemo(() => ({ session, kind, value, attempt }), [session, kind, value, attempt]);
  const selectedOwner = useRef<typeof selection | null>(null);
  useLayoutEffect(() => { selectedOwner.current = selection; return () => { selectedOwner.current = null; }; }, [selection]);
  const [selected, setSelected] = useState<{ owner: typeof selection; result?: ProductionResource; error?: string }>();
  useEffect(() => {
    if (!isCurrent()) return;
    let active = true;
    void productionResourceClient.list(kind, { search: query, status: "all", offset, limit: 20 }).then(result => {
      if (active && isCurrent() && committed.current === lease) setDirectory({ lease, result });
    }).catch(error => {
      if (!active || !isCurrent() || committed.current !== lease) return;
      if (error instanceof ProductionResourceError && error.status === 401) session.invalidate();
      else setDirectory({ lease, error: error instanceof ProductionResourceError ? error.message : "关联资料读取失败，请重新读取。" });
    });
    return () => { active = false; };
  }, [kind, query, offset, lease, session, isCurrent]);
  useEffect(() => {
    if (!value || !isCurrent()) return;
    let active = true;
    void productionResourceClient.read(kind, value).then(result => {
      if (active && isCurrent() && selectedOwner.current === selection) setSelected({ owner: selection, result });
    }).catch(error => {
      if (!active || !isCurrent() || selectedOwner.current !== selection) return;
      if (error instanceof ProductionResourceError && error.status === 401) session.invalidate();
      else setSelected({ owner: selection, error: "已选资料暂时无法核对，请重新读取。" });
    });
    return () => { active = false; };
  }, [kind, value, selection, session, isCurrent]);
  const list = directory?.lease === lease ? directory : undefined, current = selected?.owner === selection ? selected : undefined;
  const options = list?.result?.items ?? [], retained = value && !options.some(item => item.id === value);
  return <div>
    <input className="qc-control" aria-label={`搜索${label}`} placeholder={`搜索${label}，空格为且`} value={query} onChange={event => { if (isCurrent()) { setQuery(event.target.value); setOffset(0); } }} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); } }} />
    <select className="qc-control" aria-label={`${label}选择`} value={value} onChange={event => { if (isCurrent()) onChange(event.target.value); }}>
      <option value="">请选择{label}</option>
      {retained && <option value={value}>{current?.result ? current.result.name + (current.result.enabled ? "" : "（已停用）") : current?.error ? "已选资料暂时无法读取" : "正在核对已选资料…"}</option>}
      {options.map(item => <option key={item.id} value={item.id} disabled={!item.enabled && item.id !== value}>{item.name}{item.enabled ? "" : "（已停用）"}</option>)}
    </select>
    <div className="qc-master-actions"><Button variant="text" size="compact" disabled={!offset || !list?.result} onClick={() => setOffset(Math.max(0, offset - 20))}>上页{label}</Button><small role="status">{list?.result ? `${list.result.total} 条 · 第 ${Math.floor(offset / 20) + 1} 页` : list?.error ?? "正在读取…"}</small><Button variant="text" size="compact" disabled={!list?.result || offset + 20 >= list.result.total} onClick={() => setOffset(offset + 20)}>下页{label}</Button></div>
    {(list?.error || current?.error) && <><small role="alert">{list?.error || current?.error}</small><Button variant="text" size="compact" onClick={() => retry(value => value + 1)}>重读{label}</Button></>}
  </div>;
}
