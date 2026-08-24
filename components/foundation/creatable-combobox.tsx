"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type PortalPosition = { top: number; left: number; width: number; placement: "above" | "below" };

export function CreatableCombobox({
  value,
  suggestions,
  onChange,
  placeholder = "可选择历史值或直接输入",
  ariaLabel,
}: {
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PortalPosition | null>(null);
  const query = value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
  const filtered = useMemo(() => suggestions.filter((item) => item.normalize("NFKC").toLocaleLowerCase("zh-CN").includes(query)), [query, suggestions]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const updatePosition = useCallback(() => {
    const anchor = root.current?.getBoundingClientRect();
    if (!anchor) return;
    const margin = 12;
    const gap = 6;
    const width = Math.min(anchor.width, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
    const spaceBelow = window.innerHeight - anchor.bottom;
    const placement = spaceBelow >= 180 || spaceBelow >= anchor.top ? "below" : "above";
    setPosition({ top: placement === "below" ? anchor.bottom + gap : anchor.top - gap, left, width, placement });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const portalStyle: CSSProperties | undefined = position ? {
    top: position.top,
    left: position.left,
    width: position.width,
    transform: position.placement === "above" ? "translateY(-100%)" : undefined,
  } : undefined;

  return <div className="qc-creatable-combobox" ref={root} data-enter-scope="consume" data-open={open ? "true" : "false"}>
    <input
      className="qc-control"
      role="combobox"
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-controls={listboxId}
      aria-expanded={open}
      value={value}
      placeholder={placeholder}
      onFocus={() => { setActiveIndex(0); updatePosition(); setOpen(true); }}
      onChange={(event) => { setActiveIndex(0); onChange(event.target.value); updatePosition(); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0))); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)); }
        if (event.key === "Enter" && open) { event.preventDefault(); if (filtered[activeIndex]) onChange(filtered[activeIndex]); setOpen(false); }
        if (event.key === "Escape") setOpen(false);
      }}
    />
    {open && position && typeof document !== "undefined" && createPortal(<div className="qc-creatable-options qc-creatable-options-portal" ref={popover} id={listboxId} role="listbox" style={portalStyle}>
      {filtered.map((item, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} key={item} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item); setOpen(false); }}>{item}</button>)}
      {!filtered.length && <p>没有历史匹配，可继续输入新供应商</p>}
    </div>, document.body)}
  </div>;
}
