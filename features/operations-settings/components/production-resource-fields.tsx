"use client";

import type { ReactNode } from "react";
import { Button, FormItem, NullableNumberInput } from "@/components/foundation";

type Reference = { id: string; name: string; enabled: boolean };
export type GroupFields = { name: string; shortName: string; productionSiteId: string; sortOrder: number; remark: string };
export type FactoryFields = { name: string; shortName: string; contactPerson: string; phone: string; remark: string };
export type CalendarFields = { name: string; workingWeekdays: number[]; exceptions: { id: string; date: string; type: "working" | "non_working"; name: string }[]; remark: string };
export type SiteFields = { name: string; countryCode: string | null; productionCalendarId: string; preProductionSampleLeadDays: number; enabled: boolean; remark: string };
export const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
export function weekdaySummary(days: number[]) {
  const ordered = [...new Set(days)].sort((left, right) => left - right);
  if (ordered.join(",") === "1,2,3,4,5") return "周一至周五";
  if (ordered.join(",") === "1,2,3,4,5,6") return "周一至周六";
  if (ordered.length === 7) return "每天";
  return ordered.map(day => weekdayLabels[day]).join("、") || "未设置";
}

/** Presentational fields only. Persistence, IDs, authority and defaults stay with the caller. */
export function ProductionGroupFields({ value, onChange, sites = [], siteControl, error }: { value: GroupFields; onChange: (value: GroupFields) => void; sites?: Reference[]; siteControl?: ReactNode; error?: string }) {
  return <div className="qc-modal-form">
    <FormItem label="名称" required><input className="qc-control" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} /></FormItem>
    <FormItem label="简称"><input className="qc-control" value={value.shortName} onChange={event => onChange({ ...value, shortName: event.target.value })} /></FormItem>
    <FormItem label="生产地点" required>{siteControl ?? <select className="qc-control" value={value.productionSiteId} onChange={event => onChange({ ...value, productionSiteId: event.target.value })}>{sites.filter(item => item.enabled || item.id === value.productionSiteId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</FormItem>
    <FormItem label="排序"><NullableNumberInput className="qc-control" value={value.sortOrder} onValueChange={sortOrder => onChange({ ...value, sortOrder: sortOrder ?? 0 })} /></FormItem>
    <FormItem label="备注"><textarea className="qc-control" rows={3} value={value.remark} onChange={event => onChange({ ...value, remark: event.target.value })} /></FormItem>
    {error && <p className="qc-form-alert">{error}</p>}
  </div>;
}

export function OutsourceFactoryFields({ value, onChange, error }: { value: FactoryFields; onChange: (value: FactoryFields) => void; error?: string }) {
  return <div className="qc-modal-form">
    <FormItem label="名称" required><input className="qc-control" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} /></FormItem>
    <FormItem label="简称"><input className="qc-control" value={value.shortName} onChange={event => onChange({ ...value, shortName: event.target.value })} /></FormItem>
    <FormItem label="联系人"><input className="qc-control" value={value.contactPerson} onChange={event => onChange({ ...value, contactPerson: event.target.value })} /></FormItem>
    <FormItem label="联系电话"><input className="qc-control" value={value.phone} onChange={event => onChange({ ...value, phone: event.target.value })} /></FormItem>
    <FormItem label="备注"><textarea className="qc-control" rows={3} value={value.remark} onChange={event => onChange({ ...value, remark: event.target.value })} /></FormItem>
    {error && <p className="qc-form-alert">{error}</p>}
  </div>;
}

export function ProductionCalendarFields({ value, onChange, createExceptionId }: { value: CalendarFields; onChange: (value: CalendarFields) => void; createExceptionId: () => string }) {
  const patchException = (id: string, patch: Partial<CalendarFields["exceptions"][number]>) => onChange({ ...value, exceptions: value.exceptions.map(item => item.id === id ? { ...item, ...patch } : item) });
  return <div className="qc-infrastructure-form">
    <FormItem label="日历名称" required><input className="qc-control" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} /></FormItem>
    <fieldset className="qc-weekday-field"><legend>每周工作日</legend><div>{weekdayLabels.map((label, day) => <label key={label}><input type="checkbox" checked={value.workingWeekdays.includes(day)} onChange={event => onChange({ ...value, workingWeekdays: event.target.checked ? [...value.workingWeekdays, day].sort() : value.workingWeekdays.filter(item => item !== day) })} /><span>{label}</span></label>)}</div></fieldset>
    <section className="qc-calendar-exceptions"><header><div><strong>特殊日期</strong><small>明确设置某天工作或休息。</small></div><Button variant="secondary" size="compact" onClick={() => onChange({ ...value, exceptions: [...value.exceptions, { id: createExceptionId(), date: "", type: "non_working", name: "" }] })}>＋ 添加特殊日期</Button></header>
      {value.exceptions.map(exception => <div key={exception.id}><input className="qc-control" type="date" aria-label="特殊日期" value={exception.date} onChange={event => patchException(exception.id, { date: event.target.value })} /><select className="qc-control" aria-label="特殊日期类型" value={exception.type} onChange={event => patchException(exception.id, { type: event.target.value as "working" | "non_working" })}><option value="non_working">休息</option><option value="working">工作</option></select><input className="qc-control" aria-label="特殊日期说明" placeholder="说明" value={exception.name} onChange={event => patchException(exception.id, { name: event.target.value })} /><Button variant="text" onClick={() => onChange({ ...value, exceptions: value.exceptions.filter(item => item.id !== exception.id) })}>移除</Button></div>)}
    </section>
    <FormItem label="备注"><textarea className="qc-control" rows={3} value={value.remark} onChange={event => onChange({ ...value, remark: event.target.value })} /></FormItem>
  </div>;
}

export function ProductionSiteFields({ value, onChange, calendars = [], calendarControl, referenceCount }: { value: SiteFields; onChange: (value: SiteFields) => void; calendars?: Reference[]; calendarControl?: ReactNode; referenceCount?: number }) {
  return <div className="qc-infrastructure-form">
    <FormItem label="地点名称" required><input className="qc-control" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} /></FormItem>
    <div className="qc-infrastructure-form-grid">
      <FormItem label="国家 / 地区"><input className="qc-control" value={value.countryCode ?? ""} onChange={event => onChange({ ...value, countryCode: event.target.value || null })} /></FormItem>
      <FormItem label="工作日历" required>{calendarControl ?? <select className="qc-control" value={value.productionCalendarId} onChange={event => onChange({ ...value, productionCalendarId: event.target.value })}>{calendars.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</FormItem>
      <FormItem label="产前准备提前天数"><NullableNumberInput className="qc-control" min="0" value={value.preProductionSampleLeadDays} onValueChange={days => onChange({ ...value, preProductionSampleLeadDays: days ?? 0 })} /></FormItem>
      <FormItem label="状态"><select className="qc-control" value={value.enabled ? "enabled" : "disabled"} onChange={event => onChange({ ...value, enabled: event.target.value === "enabled" })}><option value="enabled">启用</option><option value="disabled">停用</option></select></FormItem>
    </div>
    <p className="qc-infrastructure-reference-note">{referenceCount === undefined ? "地点可停用，已有历史引用继续保留。" : `当前被 ${referenceCount} 个生产组使用。被引用的地点只能停用，不能物理删除。`}</p>
    <FormItem label="备注"><textarea className="qc-control" rows={3} value={value.remark} onChange={event => onChange({ ...value, remark: event.target.value })} /></FormItem>
  </div>;
}
