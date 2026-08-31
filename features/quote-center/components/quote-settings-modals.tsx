"use client";

import { useState } from "react";
import { Button, FormItem, Modal, NullableNumberInput, type TablePreference } from "@/components/foundation";
import { listColumnOptions, type ListColumnKey, type QuoteUserSettings } from "../model/quote-settings";

export function ListFieldSettingsModal({ open, settings, tablePreference, defaultColumnWidths, onClose, onSave }: { open: boolean; settings: QuoteUserSettings; tablePreference: TablePreference; defaultColumnWidths: Record<string, number>; onClose: () => void; onSave: (settings: QuoteUserSettings, preference: TablePreference) => void }) {
  if (!open) return null;
  return <ListFieldSettingsDialog settings={settings} tablePreference={tablePreference} defaultColumnWidths={defaultColumnWidths} onClose={onClose} onSave={onSave} />;
}

function ListFieldSettingsDialog({ settings, tablePreference, defaultColumnWidths, onClose, onSave }: { settings: QuoteUserSettings; tablePreference: TablePreference; defaultColumnWidths: Record<string, number>; onClose: () => void; onSave: (settings: QuoteUserSettings, preference: TablePreference) => void }) {
  const [visibleColumns, setVisibleColumns] = useState<ListColumnKey[]>(settings.visibleColumns);
  const [columnWidths, setColumnWidths] = useState(tablePreference.columnWidths);
  const toggle = (key: ListColumnKey) => setVisibleColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const save = () => onSave({ ...settings, visibleColumns }, { ...tablePreference, columnWidths });
  return <Modal open title="报价列表页面设置" description="显示字段与列宽仅属于当前用户，不影响单张报价设置。" onClose={onClose} onSubmit={save} footer={<><Button variant="secondary" onClick={() => setColumnWidths(defaultColumnWidths)}>恢复默认列宽</Button><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit">保存设置</Button></>}>
    <div className="qc-setting-options">{listColumnOptions.map((option) => <label key={option.key}><input type="checkbox" checked={visibleColumns.includes(option.key)} onChange={() => toggle(option.key)} /><span><strong>{option.label}</strong><small>{["fabricCost", "trimCost", "labor", "garmentPrice", "confirmedLabor", "confirmedGarment"].includes(option.key) ? "多价格版本按区间或确认汇总展示" : "报价基础字段"}</small></span></label>)}</div>
    <div className="qc-column-width-settings"><strong>表格列宽（px）</strong>{listColumnOptions.map((option) => <FormItem key={option.key} label={option.label}><NullableNumberInput className="qc-control" min="56" value={columnWidths[option.key] ?? defaultColumnWidths[option.key]} onValueChange={(value) => setColumnWidths((current) => ({ ...current, [option.key]: value ?? defaultColumnWidths[option.key] }))} /></FormItem>)}</div>
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
