"use client";

import type { ReactNode } from "react";
import { Button, FormItem, NullableNumberInput } from "@/components/foundation";

type Reference = { id: string; name: string; enabled: boolean };
export type GroupFields = { name: string; shortName: string; productionSiteId: string; sortOrder: number; remark: string };
export type FactoryFields = { name: string; shortName: string; contactPerson: string; phone: string; remark: string };
export type CalendarFields = { name: string; workingWeekdays: number[]; exceptions: { id: string; date: string; type: "working" | "non_working"; name: string }[]; remark: string };
export type SiteFields = { name: string; countryCode: string | null; productionCalendarId: string; preProductionSampleLeadDays: number; enabled: boolean; remark: string };
export type HubFields = { name: string; enabled: boolean; remark: string };
export type TransportModeFields = { id: string; name: string; enabled: boolean; transitDays: number | null; sortOrder: number | null };
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

export function SupplyHubFields({ value, onChange }: { value: HubFields; onChange: (value: HubFields) => void }) {
  return <div className="qc-infrastructure-form">
    <FormItem label="集货仓名称" required><input className="qc-control" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} /></FormItem>
    <FormItem label="状态"><select className="qc-control" value={value.enabled ? "enabled" : "disabled"} onChange={event => onChange({ ...value, enabled: event.target.value === "enabled" })}><option value="enabled">启用</option><option value="disabled">停用</option></select></FormItem>
    <FormItem label="备注"><textarea className="qc-control" rows={3} value={value.remark} onChange={event => onChange({ ...value, remark: event.target.value })} /></FormItem>
  </div>;
}

/** Existing transport layout only. Callers retain identities, persistence and nullable policy. */
export function TransportPlanFields({ hubControl, siteControl, modes, onAddMode, onModeChange, remark, onRemarkChange, maxModes }: {
  hubControl: ReactNode; siteControl: ReactNode; modes: TransportModeFields[]; onAddMode: () => void;
  onModeChange: (id: string, patch: Partial<Omit<TransportModeFields, "id">>) => void; remark: string; onRemarkChange: (remark: string) => void; maxModes?: number;
}) {
  return <div className="qc-infrastructure-form"><div className="qc-infrastructure-steps">
    <FormItem label="1. 出发集货仓" required>{hubControl}</FormItem><FormItem label="2. 到达生产地点" required>{siteControl}</FormItem>
  </div><section className="qc-transport-mode-editor"><header><div><strong>3. 运输方式</strong><small>系统按自然日和排序使用现有运输方式事实。</small></div><Button variant="secondary" size="compact" disabled={maxModes !== undefined && modes.length >= maxModes} onClick={onAddMode}>＋ 增加运输方式</Button></header>
    {modes.map(mode => <div key={mode.id}><input className="qc-control" aria-label="运输方式名称" placeholder="名称" value={mode.name} onChange={event => onModeChange(mode.id, { name: event.target.value })} />
      <NullableNumberInput className="qc-control" min="0" aria-label="运输自然日" value={mode.transitDays} onValueChange={transitDays => onModeChange(mode.id, { transitDays })} /><span>自然日</span>
      <label><input type="checkbox" checked={mode.enabled} onChange={event => onModeChange(mode.id, { enabled: event.target.checked })} /> 启用</label>
      <NullableNumberInput className="qc-control" min="0" aria-label="运输方式排序" value={mode.sortOrder} onValueChange={sortOrder => onModeChange(mode.id, { sortOrder })} /></div>)}
  </section><FormItem label="方案备注"><textarea className="qc-control" rows={3} value={remark} onChange={event => onRemarkChange(event.target.value)} /></FormItem></div>;
}
