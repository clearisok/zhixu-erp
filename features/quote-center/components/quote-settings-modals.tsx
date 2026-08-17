"use client";

import { useState } from "react";
import { Button, FormItem, Modal, NullableNumberInput } from "@/components/foundation";
import { listColumnOptions, type ListColumnKey, type QuoteUserSettings } from "../model/quote-settings";

export function ListFieldSettingsModal({ open, settings, onClose, onSave }: { open: boolean; settings: QuoteUserSettings; onClose: () => void; onSave: (settings: QuoteUserSettings) => void }) {
  if (!open) return null;
  return <ListFieldSettingsDialog settings={settings} onClose={onClose} onSave={onSave} />;
}

function ListFieldSettingsDialog({ settings, onClose, onSave }: { settings: QuoteUserSettings; onClose: () => void; onSave: (settings: QuoteUserSettings) => void }) {
  const [visibleColumns, setVisibleColumns] = useState<ListColumnKey[]>(settings.visibleColumns);
  const toggle = (key: ListColumnKey) => setVisibleColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  return <Modal open title="报价列表字段设置" description="选择需要在报价中心列表中展示的字段；设置会保存在当前浏览器。" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button onClick={() => onSave({ ...settings, visibleColumns })}>保存设置</Button></>}>
    <div className="qc-setting-options">{listColumnOptions.map((option) => <label key={option.key}><input type="checkbox" checked={visibleColumns.includes(option.key)} onChange={() => toggle(option.key)} /><span><strong>{option.label}</strong><small>{["fabricCost", "trimCost", "confirmedLabor", "confirmedGarment"].includes(option.key) ? "默认价格版本的摘要值" : "报价基础字段"}</small></span></label>)}</div>
  </Modal>;
}

export function DefaultQuoteSettingsModal({ open, settings, onClose, onSave }: { open: boolean; settings: QuoteUserSettings; onClose: () => void; onSave: (settings: QuoteUserSettings) => void }) {
  if (!open) return null;
  return <DefaultQuoteSettingsDialog settings={settings} onClose={onClose} onSave={onSave} />;
}

function DefaultQuoteSettingsDialog({ settings, onClose, onSave }: { settings: QuoteUserSettings; onClose: () => void; onSave: (settings: QuoteUserSettings) => void }) {
  const [markupRate, setMarkupRate] = useState(settings.newQuoteDefaults.markupRate);
  const [laborCurrency, setLaborCurrency] = useState(settings.newQuoteDefaults.laborCurrency);
  return <Modal open title="新建报价默认值" description="只影响以后创建的新报价，不会改写当前报价和已有历史数据。" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button onClick={() => onSave({ ...settings, newQuoteDefaults: { markupRate, laborCurrency } })}>保存默认值</Button></>}>
    <div className="qc-modal-form"><FormItem label="默认成本加成率"><div className="qc-number-suffix qc-control-wrap"><NullableNumberInput className="qc-control" value={markupRate} onValueChange={setMarkupRate} placeholder="默认留空" /><span>%</span></div></FormItem><FormItem label="默认加工币种"><div className="qc-segmented"><button type="button" className={laborCurrency === "CNY" ? "selected" : ""} onClick={() => setLaborCurrency("CNY")}>CNY / 件</button><button type="button" className={laborCurrency === "USD" ? "selected" : ""} onClick={() => setLaborCurrency("USD")}>USD / 件</button></div></FormItem></div>
  </Modal>;
}
