"use client";

import { useRef, useState } from "react";
import { Button, FormItem, Modal, NullableNumberInput, type TablePreference } from "@/components/foundation";
import type { ListColumnKey, QuoteUserSettings, QuoteListViewPreferences } from "../model/quote-settings";
import { businessColumns as listColumnOptions } from "../model/quote-business-view";

export function ListFieldSettingsModal<T extends QuoteListViewPreferences>({ open, settings, tablePreference, defaultColumnWidths, defaultColumnOrder, onClose, onSave }: { open: boolean; settings: T; tablePreference: TablePreference; defaultColumnWidths: Record<string, number>; defaultColumnOrder: string[]; onClose: () => void; onSave: (settings: T, preference: TablePreference) => void }) {
  if (!open) return null;
  return <ListFieldSettingsDialog settings={settings} tablePreference={tablePreference} defaultColumnWidths={defaultColumnWidths} defaultColumnOrder={defaultColumnOrder} onClose={onClose} onSave={onSave} />;
}

function ListFieldSettingsDialog<T extends QuoteListViewPreferences>({ settings, tablePreference, defaultColumnWidths, defaultColumnOrder, onClose, onSave }: { settings: T; tablePreference: TablePreference; defaultColumnWidths: Record<string, number>; defaultColumnOrder: string[]; onClose: () => void; onSave: (settings: T, preference: TablePreference) => void }) {
  const [visibleColumns, setVisibleColumns] = useState<ListColumnKey[]>(settings.visibleColumns);
  const [columnWidths, setColumnWidths] = useState(tablePreference.columnWidths);
  const [columnOrder, setColumnOrder] = useState(tablePreference.columnOrder);
  const dragKey = useRef<string | null>(null);
  const toggle = (key: ListColumnKey) => setVisibleColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const available = listColumnOptions.filter(option => defaultColumnOrder.includes(option.key));
  const orderedOptions = columnOrder.map((key) => available.find((option) => option.key === key)).filter((option): option is (typeof listColumnOptions)[number] => Boolean(option));
  const reorder = (source: string, target: string) => setColumnOrder((current) => { const next = current.filter((key) => key !== source); next.splice(Math.max(0, next.indexOf(target)), 0, source); return next; });
  const save = () => onSave({ ...settings, visibleColumns }, { ...tablePreference, columnWidths, columnOrder });
  return <Modal open title="报价列表页面设置" description="显示字段、顺序与列宽仅属于当前用户，不影响单张报价设置。" onClose={onClose} onSubmit={save} footer={<><Button variant="secondary" onClick={() => { setColumnWidths(defaultColumnWidths); setColumnOrder(defaultColumnOrder); }}>恢复默认布局</Button><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit">保存设置</Button></>}>
    <div className="qc-setting-options qc-column-order-settings">{orderedOptions.map((option) => <label key={option.key} draggable onDragStart={() => { dragKey.current = option.key; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragKey.current) reorder(dragKey.current, option.key); dragKey.current = null; }}><span className="qc-setting-drag-handle" aria-hidden="true">⋮⋮</span><input type="checkbox" checked={visibleColumns.includes(option.key)} onChange={() => toggle(option.key)} /><span><strong>{option.label}</strong><small>{["fabricCost", "trimCost", "labor", "garmentPrice", "confirmedLabor", "confirmedGarment"].includes(option.key) ? "多价格版本在列表中合并为摘要" : "拖动手柄调整显示顺序"}</small></span></label>)}</div>
    <div className="qc-column-width-settings"><strong>表格列宽（px）</strong>{available.map((option) => <FormItem key={option.key} label={option.label}><NullableNumberInput className="qc-control" min="56" value={columnWidths[option.key] ?? defaultColumnWidths[option.key]} onValueChange={(value) => setColumnWidths((current) => ({ ...current, [option.key]: value ?? defaultColumnWidths[option.key] }))} /></FormItem>)}</div>
  </Modal>;
}

export function DefaultQuoteSettingsModal({ open, settings, onClose, onSave }: { open: boolean; settings: QuoteUserSettings; onClose: () => void; onSave: (settings: QuoteUserSettings) => void }) {
  if (!open) return null;
  return <DefaultQuoteSettingsDialog settings={settings} onClose={onClose} onSave={onSave} />;
}

function DefaultQuoteSettingsDialog({ settings, onClose, onSave }: { settings: QuoteUserSettings; onClose: () => void; onSave: (settings: QuoteUserSettings) => void }) {
  const [markupRate, setMarkupRate] = useState(settings.newQuoteDefaults.markupRate);
  const [laborCurrency, setLaborCurrency] = useState(settings.newQuoteDefaults.laborCurrency);
  const save = () => onSave({ ...settings, newQuoteDefaults: { markupRate, laborCurrency } });
  return <Modal open title="新建报价默认值" description="只影响以后创建的新报价，不会改写当前报价和已有历史数据。" onClose={onClose} onSubmit={save} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit">保存默认值</Button></>}>
    <div className="qc-modal-form"><FormItem label="默认成本加成率"><div className="qc-number-suffix qc-control-wrap"><NullableNumberInput className="qc-control" value={markupRate} onValueChange={setMarkupRate} placeholder="默认留空" /><span>%</span></div></FormItem><FormItem label="默认加工币种"><div className="qc-segmented"><button type="button" className={laborCurrency === "CNY" ? "selected" : ""} onClick={() => setLaborCurrency("CNY")}>CNY / 件</button><button type="button" className={laborCurrency === "USD" ? "selected" : ""} onClick={() => setLaborCurrency("USD")}>USD / 件</button></div></FormItem></div>
  </Modal>;
}
