"use client";

import { useEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string; keywords?: string };

export function SearchableSelect({ value, options, onChange, placeholder = "请选择", disabled }: { value: string; options: SelectOption[]; onChange: (value: string, option: SelectOption) => void; placeholder?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => `${option.label} ${option.keywords || ""}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return <div className="qc-search-select" ref={root} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
    <button type="button" className="qc-control qc-select-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><span className={selected ? "" : "placeholder"}>{selected?.label || placeholder}</span><i>⌄</i></button>
    {open && <div className="qc-select-popover"><div className="qc-select-search"><span>⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词搜索" /></div><div role="listbox" className="qc-option-list">{filtered.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} key={option.value} onClick={() => { onChange(option.value, option); setOpen(false); setQuery(""); }}><span>{option.label}</span>{option.value === value && <b>✓</b>}</button>)}{!filtered.length && <p>没有匹配选项</p>}</div></div>}
  </div>;
}
