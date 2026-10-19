"use client";
import { useState } from "react";
import { Button, FormItem, Modal } from "@/components/foundation";
import { businessColumns, processingHiddenColumns, columnPermissions, estimateColumns, type BusinessColumn, type EstimateColumn } from "../model/quote-business-view";
export function ServerSummaryModal({ visibleColumns, permissions, busy, error, onClose, onGenerate,processingOnly=false }: { processingOnly?:boolean;visibleColumns: BusinessColumn[]; permissions: readonly string[]; busy: boolean; error: string; onClose(): void; onGenerate(columns: BusinessColumn[], rowMode: "quote" | "price-version", estimate: EstimateColumn[]): void }) {
  const [columns, setColumns] = useState(visibleColumns.filter(k=>!processingOnly||!processingHiddenColumns.includes(k)));
  const [rowMode, setRowMode] = useState<"quote" | "price-version">("quote");
  const [estimate, setEstimate] = useState<EstimateColumn[]>([]);
  const labels = { estimateTotal: "估算总成本", estimateRevision: "估算成本来源报价版本", estimateDifference: "销售价与估算成本差额" };
  return <Modal open title="内部报价汇总" description="仅生成所选保存来源；任一冲突或失败都不生成不完整文件。本次列调整不改变个人列表偏好。最多25张/500行/20MB。" onClose={() => { if (!busy) onClose(); }} footer={<><Button disabled={busy} variant="secondary" onClick={onClose}>取消</Button><Button disabled={busy || !columns.length} onClick={() => onGenerate(columns, rowMode, estimate)}>{busy ? "生成中…" : "生成内部汇总 Excel"}</Button></>}>
    <FormItem label="行模式"><select aria-label="汇总行模式" className="qc-control" disabled={busy} value={rowMode} onChange={e => setRowMode(e.target.value as typeof rowMode)}><option value="quote">每款一行</option><option value="price-version">每 PriceVersion 一行</option></select></FormItem>
    <div className="qc-setting-options">{businessColumns.filter(c => (!processingOnly||!processingHiddenColumns.includes(c.key))&&columnPermissions(c.key).every(p => permissions.includes(p))).map(c => <label key={c.key}><input type="checkbox" disabled={busy} checked={columns.includes(c.key)} onChange={() => setColumns(current => current.includes(c.key) ? current.filter(k => k !== c.key) : [...current, c.key])} />{c.label}</label>)}</div>
    {!processingOnly&&<><p>Estimate 默认不选；仅 Quote 当前 active，PV 行重复显示 Quote 级值，不产生 PV 估算或求和。</p>
    <div className="qc-setting-options">{estimateColumns.filter(k => columnPermissions(k).every(p => permissions.includes(p))).map(k => <label key={k}><input type="checkbox" disabled={busy} checked={estimate.includes(k)} onChange={() => setEstimate(current => current.includes(k) ? current.filter(c => c !== k) : [...current, k])} />{labels[k]}</label>)}</div>
    </>}
    {error && <p role="alert">{error}；选择已保留，请显式核对或重新发起，不会自动重试。</p>}
  </Modal>;
}
