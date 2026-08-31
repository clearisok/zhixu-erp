"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { globalSearchRegistry } from "../registry";
import { nextSearchResultIndex, type SearchContext, type SearchResult, type SearchResultGroup } from "../model/global-search";
import { recentSearchRepository } from "../repository/recent-search-repository";

function ResultCard({ result, index, active, onChoose, onHover }: { result: SearchResult; index: number; active: boolean; onChoose: () => void; onHover: () => void }) {
  return <button type="button" role="option" data-search-result-index={index} aria-selected={active} className={`qc-global-search-result ${active ? "is-active" : ""}`} onMouseEnter={onHover} onClick={onChoose}>
    <span className="qc-global-search-result-icon" aria-hidden="true">{result.icon}</span>
    <span className="qc-global-search-result-copy"><small>{result.typeLabel}</small><strong>{result.title}</strong><em>{result.subtitle}</em><span>{result.meta.map((item) => <i key={item.label}><b>{item.label}</b>{item.value}</i>)}</span></span>
    <span className="qc-global-search-open-hint">打开 <kbd>↵</kbd></span>
  </button>;
}

export function GlobalSearchPalette({ open, context, onClose, onNavigate }: { open: boolean; context: SearchContext; onClose: () => void; onNavigate: (href: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultListRef = useRef<HTMLDivElement | null>(null);
  const openingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const results = useMemo(() => groups.flatMap((group) => group.results), [groups]);
  const displayed = query.trim() ? results : recent;

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setQuery("");
      setGroups([]);
      const accessibleRecent = globalSearchRegistry.filterAccessible(recentSearchRepository.list(context.userId), context);
      setRecent(accessibleRecent);
      setActiveIndex(accessibleRecent.length ? 0 : -1);
      setLoading(false);
      openingRef.current = false;
      inputRef.current?.focus();
    });
    return () => { active = false; };
  }, [context, open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const normalized = query.trim();
    if (!normalized) return () => { active = false; };
    const timer = window.setTimeout(() => {
      if (!active) return;
      setLoading(true);
      globalSearchRegistry.search(normalized, context).then((next) => {
        if (!active) return;
        setGroups(next);
        setActiveIndex(next.some((group) => group.results.length) ? 0 : -1);
      }).finally(() => { if (active) setLoading(false); });
    }, 120);
    return () => { active = false; window.clearTimeout(timer); };
  }, [context, open, query]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    resultListRef.current?.querySelector<HTMLElement>(`[data-search-result-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open || typeof document === "undefined") return null;

  const openSearchResult = (result: SearchResult) => {
    if (openingRef.current) return;
    const accessible = globalSearchRegistry.filterAccessible([result], context)[0];
    if (!accessible) return;
    openingRef.current = true;
    recentSearchRepository.record(context.userId, accessible);
    inputRef.current?.blur();
    setActiveIndex(-1);
    setQuery("");
    setGroups([]);
    onClose();
    onNavigate(accessible.href);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => nextSearchResultIndex(current, event.key === "ArrowDown" ? 1 : -1, displayed.length));
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0 && displayed[activeIndex]) {
      event.preventDefault();
      openSearchResult(displayed[activeIndex]);
    }
  };

  return createPortal(<div className="qc-global-search-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="qc-global-search-palette" role="dialog" aria-modal="true" aria-label="全局搜索" onKeyDown={onKeyDown}>
      <header className="qc-global-search-input-row"><span aria-hidden="true">⌕</span><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value.trim()) setActiveIndex(recent.length ? 0 : -1); }} placeholder="搜索报价、订单、排单、关账、客户 PO 或款号" aria-label="全局搜索关键词" autoComplete="off" /><kbd>ESC</kbd></header>
      <div className="qc-global-search-content">
        <div className="qc-global-search-section-title"><strong>{query.trim() ? "搜索结果" : "最近访问"}</strong>{query.trim() && <span>{loading ? "正在搜索…" : `${results.length} 条结果`}</span>}</div>
        {displayed.length ? <div ref={resultListRef} className="qc-global-search-results" role="listbox" aria-label={query.trim() ? "搜索结果" : "最近访问"}>{displayed.map((result, index) => <ResultCard key={`${result.providerId}:${result.id}`} result={result} index={index} active={index === activeIndex} onHover={() => setActiveIndex(index)} onChoose={() => openSearchResult(result)} />)}</div> : <div className="qc-global-search-empty"><span>{loading ? "⌛" : "◇"}</span><strong>{loading ? "正在搜索" : query.trim() ? "没有匹配结果" : "暂无最近访问"}</strong><p>{query.trim() ? "尝试输入报价号、订单号、客户 PO、款号、款式名称、品牌或客户" : "通过搜索打开的业务记录会显示在这里"}</p></div>}
      </div>
      <footer><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 打开</span><span><kbd>ESC</kbd> 关闭</span><i>报价 · 订单 · 排单 · 关账 · 权限感知搜索</i></footer>
    </section>
  </div>, document.body);
}
