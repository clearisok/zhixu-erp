"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const weekDays = ["一", "二", "三", "四", "五", "六", "日"];
const pad = (value: number) => String(value).padStart(2, "0");
const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const displayDate = (value: string | null) => value ? value.replaceAll("-", "/") : "";

export function NullableDateField({ value, onChange, placeholder = "请选择日期", disabled }: { value: string | null; onChange: (value: string | null) => void; placeholder?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => value ? new Date(`${value}T00:00:00`) : new Date());
  const root = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const firstDay = new Date(year, month, 1);
    const leading = (firstDay.getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    return [...Array.from({ length: leading }, () => null), ...Array.from({ length: count }, (_, index) => new Date(year, month, index + 1))];
  }, [view]);

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return <div className="qc-date-field" ref={root} data-enter-scope="consume" data-open={open ? "true" : "false"} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
    <button type="button" className="qc-control qc-date-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><span className={value ? "" : "placeholder"}>{displayDate(value) || placeholder}</span><i>▣</i></button>
    {open && <div className="qc-date-popover" role="dialog" aria-label="选择日期"><header><button type="button" aria-label="上个月" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>‹</button><strong>{view.getFullYear()} 年 {view.getMonth() + 1} 月</strong><button type="button" aria-label="下个月" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>›</button></header><div className="qc-calendar-week">{weekDays.map((day) => <span key={day}>{day}</span>)}</div><div className="qc-calendar-days">{days.map((day, index) => day ? <button type="button" className={toIsoDate(day) === value ? "selected" : ""} key={toIsoDate(day)} onClick={() => { onChange(toIsoDate(day)); setOpen(false); }}>{day.getDate()}</button> : <i key={`blank-${index}`} />)}</div><footer><button type="button" onClick={() => { onChange(null); setOpen(false); }}>设置为空</button><button type="button" onClick={() => { const today = new Date(); onChange(toIsoDate(today)); setView(today); setOpen(false); }}>今天</button></footer></div>}
  </div>;
}
