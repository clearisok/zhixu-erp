"use client";

import { useMemo, useState } from "react";
import { Button, Card, FormItem, NullableNumberInput, StatusTag } from "@/components/foundation";
import {
  estimateCostIsStale,
  estimateCostMetrics,
  patchEstimateFabricLine,
  patchEstimateOtherLine,
  patchEstimateTrimLine,
} from "../model/estimate-cost";
import type { EstimateCost, Quote } from "../model/quote-view-model";
import { CostTable, FabricCostTable, TrimCostTable } from "./cost-table";
import { PermissionButton } from "@/features/permissions";

const money = (value: number | null) => value === null ? "—" : `¥${value.toFixed(2)}`;

export function EstimateCostPanel({ quote, readOnly: permissionReadOnly = false, onChange, onGenerate, onIgnoreStale, onRestore, onSave }: {
  quote: Quote;
  readOnly?: boolean;
  onChange: (estimate: EstimateCost) => void;
  onGenerate: (regenerate: boolean) => void;
  onIgnoreStale: () => void;
  onRestore: (historyId: string) => void;
  onSave?: () => Promise<void>;
}) {
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyId, setHistoryId] = useState<string | null>(null);
  const history = useMemo(() => quote.estimateCostHistory.filter((item) => {
    const revision = quote.revisions.find((entry) => entry.revisionId === item.basedOnRevisionId);
    return `${revision?.revisionLabel ?? ""} ${item.generatedBy} ${item.generatedAt} ${new Date(item.generatedAt).toLocaleString("zh-CN")}`.toLocaleLowerCase().includes(historyQuery.trim().toLocaleLowerCase());
  }).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)), [historyQuery, quote.estimateCostHistory, quote.revisions]);
  const historical = historyId ? quote.estimateCostHistory.find((item) => item.id === historyId) ?? null : null;
  const estimate = historical ?? quote.activeEstimateCost;
  const readOnly = Boolean(historical) || permissionReadOnly;

  if (!estimate) return <div className="qc-estimate-empty"><span>◇</span><h3>尚未生成估算成本</h3><p>估算成本不会预先创建。请从一个报价版本快照生成独立估算，客户报价与导出不会读取这里的数据。</p><PermissionButton disabled={permissionReadOnly} permission="estimate.edit" onClick={() => onGenerate(false)}>生成估算成本</PermissionButton></div>;

  const metrics = estimateCostMetrics(estimate);
  const stale = !historical && estimateCostIsStale(quote, estimate);
  const revision = quote.revisions.find((entry) => entry.revisionId === estimate.basedOnRevisionId);
  const suppliers = [...new Set([...estimate.fabrics.map((line) => line.supplier), ...estimate.trims.map((line) => line.supplier)].filter(Boolean))];
  const patch = (next: EstimateCost) => { if (!readOnly) onChange(next); };

  return <div className="qc-estimate-cost-panel">
    <p>来源价格版本：{revision?.priceVersions.find(p => p.id === estimate.sourcePriceVersionId)?.name ?? estimate.sourcePriceVersionId}</p>
    {!historical && onSave && <Button disabled={permissionReadOnly} onClick={() => void onSave()}>保存估算成本</Button>}
    <header className="qc-estimate-toolbar"><div><span>估算成本</span><strong>{readOnly ? "只读" : "当前估算"}</strong><small>基于报价版本 {revision?.revisionLabel ?? estimate.basedOnRevisionId} · {new Date(estimate.generatedAt).toLocaleString("zh-CN")} · {estimate.generatedBy}</small></div><div>{historical ? <><Button variant="secondary" onClick={() => setHistoryId(null)}>返回当前估算</Button><PermissionButton disabled={permissionReadOnly} permission="estimate.edit" onClick={() => onRestore(estimate.id)}>恢复为新的当前估算</PermissionButton></> : <PermissionButton disabled={permissionReadOnly} permission="estimate.edit" variant="secondary" onClick={() => onGenerate(true)}>重新生成</PermissionButton>}</div></header>
    {stale && <div className="qc-estimate-stale"><div><strong>当前估算成本已过期</strong><span>默认报价版本已更新，当前估算仍基于 {revision?.revisionLabel ?? estimate.basedOnRevisionId}。</span></div><PermissionButton disabled={permissionReadOnly} permission="estimate.edit" variant="secondary" onClick={onIgnoreStale}>忽略本次提醒</PermissionButton><PermissionButton disabled={permissionReadOnly} permission="estimate.edit" onClick={() => onGenerate(true)}>按当前默认版本重新生成</PermissionButton></div>}
    <div className="qc-estimate-metrics"><span><small>面料成本</small><strong>{money(metrics.fabricCost)}</strong></span><span><small>辅料成本</small><strong>{money(metrics.trimCost)}</strong></span><span><small>工价 RMB</small><strong>{money(metrics.laborRmb)}</strong></span><span><small>其他费用</small><strong>{money(metrics.otherCost)}</strong></span><span className="total"><small>估算总成本</small><strong>{money(metrics.preMarkupTotal)}</strong></span></div>
    <fieldset disabled={readOnly} className="qc-readonly-fieldset"><div className="qc-cost-stack">
      <FabricCostTable fixedStructure lines={estimate.fabrics} library={[]} supplierOptions={suppliers} onChange={(id, value) => patch(patchEstimateFabricLine(estimate, id, value))} onPurchaseUnitChange={(id, purchaseUnit) => patch(patchEstimateFabricLine(estimate, id, { purchaseUnit }))} onSelectLibrary={() => undefined} />
      <TrimCostTable fixedStructure lines={estimate.trims} library={[]} supplierOptions={suppliers} onChange={(id, value) => patch(patchEstimateTrimLine(estimate, id, value))} onSelectLibrary={() => undefined} />
      <Card className="qc-labor-card"><header><div><h3>工价</h3><p>估算成本保留生成时的加工币种和汇率口径。</p></div><span>{estimate.pricingParameters.laborCurrency} / 件</span></header><div><FormItem label="工价"><NullableNumberInput className="qc-control" min="0" value={estimate.labor.value} onValueChange={(value) => patch({ ...estimate, labor: { ...estimate.labor, value } })} /></FormItem><FormItem label="工序说明"><input className="qc-control" value={estimate.labor.description} onChange={(event) => patch({ ...estimate, labor: { ...estimate.labor, description: event.target.value } })} /></FormItem></div></Card>
      <CostTable fixedStructure title="其他费用" description="固定为来源报价版本生成时的费用行，不允许增删。" namePlaceholder="费用名称" lines={estimate.otherCosts} onChange={(id, value) => patch(patchEstimateOtherLine(estimate, id, value))} />
    </div></fieldset>
    <section className="qc-estimate-history"><header><div><h3>估算成本历史</h3><p>重新生成与恢复都会保留此前版本；恢复操作会克隆，不会改写历史。</p></div><input className="qc-control" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索版本、创建人或时间" /></header>{history.length ? <div>{history.map((item) => { const itemRevision = quote.revisions.find((entry) => entry.revisionId === item.basedOnRevisionId); return <button type="button" className={historyId === item.id ? "selected" : ""} key={item.id} onClick={() => setHistoryId(item.id)}><strong>基于 {itemRevision?.revisionLabel ?? item.basedOnRevisionId}</strong><span>{new Date(item.generatedAt).toLocaleString("zh-CN")}</span><small>{item.generatedBy}</small><StatusTag tone="neutral">历史只读</StatusTag></button>; })}</div> : <p className="qc-estimate-history-empty">暂无历史估算成本</p>}</section>
  </div>;
}
