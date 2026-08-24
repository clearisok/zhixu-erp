"use client";

import { useEffect, useRef, useState } from "react";

export type QuoteQuickNavigationItem = {
  id: string;
  label: string;
};

export function scrollToQuoteSection(sectionId: string): boolean {
  const section = document.getElementById(sectionId);
  if (!section) return false;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

export function QuoteQuickNavigation({ items }: { items: QuoteQuickNavigationItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const navigate = (id: string) => {
    setOpen(false);
    scrollToQuoteSection(id);
  };

  return <nav ref={root} className="qc-quick-navigation" aria-label="报价详情快速导航">
    <div className="qc-quick-navigation-desktop">
      <span>快速导航</span>
      {items.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.id)}>{item.label}</button>)}
    </div>
    <div className="qc-quick-navigation-mobile">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>快速导航 <span aria-hidden="true">⌄</span></button>
      {open && <div className="qc-quick-navigation-menu" role="menu">
        {items.map((item) => <button key={item.id} type="button" role="menuitem" onClick={() => navigate(item.id)}>{item.label}</button>)}
      </div>}
    </div>
  </nav>;
}
