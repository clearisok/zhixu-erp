"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string; keywords?: string };

export type SearchableSelectCreateAction = {
  label: (query: string) => string;
  onCreate: (query: string) => void;
  disabled?: boolean;
  disabledLabel?: string;
};

export function SearchableSelect({ value, options, onChange, placeholder = "请选择", disabled, createAction }: { value: string; options: SelectOption[]; onChange: (value: string, option: SelectOption) => void; placeholder?: string; disabled?: boolean; createAction?: SearchableSelectCreateAction }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [position, setPosition] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => `${option.label} ${option.keywords || ""}`.toLowerCase().includes(query.toLowerCase()));
  const createQuery = query.normalize("NFKC").trim();
  const exactMatch = options.some((option) => option.label.normalize("NFKC").trim().toLocaleLowerCase("zh-CN") === createQuery.toLocaleLowerCase("zh-CN"));
  const canOfferCreate = Boolean(createAction && createQuery && !exactMatch && filtered.length === 0);
  const optionCount = filtered.length + (canOfferCreate ? 1 : 0);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const choose = (option: SelectOption) => { onChange(option.value, option); setOpen(false); setQuery(""); setActiveIndex(0); };
  const create = () => {
    if (!createAction || createAction.disabled || !canOfferCreate) return;
    createAction.onCreate(createQuery);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };
  const updatePosition = useCallback(() => {
    const anchor = root.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(Math.max(anchor.width, 240), window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    const above = window.innerHeight - anchor.bottom < 280 && anchor.top > 280;
    setPosition({ top: above ? anchor.top - 6 : anchor.bottom + 6, left, width, above });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const reposition = (event: Event) => {
      if (event.target instanceof Node && popover.current?.contains(event.target)) return;
      updatePosition();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  const popoverStyle: CSSProperties | undefined = position ? { top: position.top, left: position.left, width: position.width, transform: position.above ? "translateY(-100%)" : undefined } : undefined;

  return <div className="qc-search-select" ref={root} data-enter-scope="consume" data-open={open ? "true" : "false"} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
    <button type="button" className="qc-control qc-select-trigger" disabled={disabled} aria-haspopup="listbox" aria-controls={listboxId} aria-expanded={open} onClick={() => { setActiveIndex(0); setOpen((current) => !current); }}><span className={selected ? "" : "placeholder"}>{selected?.label || placeholder}</span><i>⌄</i></button>
    {open && position && typeof document !== "undefined" && createPortal(<div ref={popover} id={listboxId} className="qc-select-popover qc-select-popover-portal" style={popoverStyle}><div className="qc-select-search"><span>⌕</span><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, Math.max(optionCount - 1, 0))); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)); }
      if (event.key === "Enter") { event.preventDefault(); if (filtered[activeIndex]) choose(filtered[activeIndex]); else if (activeIndex === filtered.length) create(); }
    }} placeholder="输入关键词搜索" /></div><div role="listbox" className="qc-option-list">{filtered.map((option, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "selected" : ""} key={option.value} onClick={() => choose(option)}><span>{option.label}</span>{option.value === value && <b>✓</b>}</button>)}{canOfferCreate && <button type="button" role="option" aria-selected={activeIndex === filtered.length} className={`qc-select-create-action ${activeIndex === filtered.length ? "selected" : ""}`} disabled={createAction?.disabled} title={createAction?.disabled ? createAction.disabledLabel || "暂无创建权限" : undefined} onClick={create}><span>{createAction?.disabled ? createAction.disabledLabel || "暂无创建权限" : createAction?.label(createQuery)}</span></button>}{!filtered.length && !canOfferCreate && <p>没有匹配选项</p>}</div></div>, document.body)}
  </div>;
}
