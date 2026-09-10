"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertBanner, Button, Card, Drawer, Modal, PageHeader, StatusTag } from "@/components/foundation";
import { usePermissions } from "@/features/permissions";
import type { OperationsSettingsState } from "@/features/operations-settings/model/operations-settings";
import { recommendMaterialTransport } from "@/features/production-scheduling/service/material-logistics-service";
import { saveExpectedArrivalPlan, restoreExpectedArrivalPlanToSource } from "../service/expected-arrival-plan-service";
import { stableStyleProgressHash, type MaterialExpectedArrivalBatch, type StyleProgressData } from "../model/style-progress";
import {
  bufferRiskForDays,
  calculateDaysToProduction,
  filterCanonicalMaterialsByType,
  type MaterialBufferRisk,
  type CanonicalMaterialProgressProjection,
  type MaterialConsistencyIssue,
  type StyleProgressProjection,
} from "../service/style-progress-service";

type Props = {
  projection: StyleProgressProjection;
  data: StyleProgressData;
  settings: OperationsSettingsState;
  onReload: () => Promise<void>;
  onToast: (message: string) => void;
};

type MaterialFilter = "all" | "fabric" | "trim";
type StatusFilter = "all" | "not_purchased" | "pending_inbound" | "ready" | "risk";
type DetailTab = "material" | "demand" | "purchase" | "inbound" | "shipment" | "outbound" | "dates" | "batches";

const quantity = (value: number | null) => value === null ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
const date = (value: string | null) => value || "—";
const readinessLabel = { not_purchased: "未采购", purchasing: "采购中", pending_inbound: "待入库", ready: "已齐套" } as const;
const salesRiskLabel = { overdue: "已逾期", "7d": "7天", "14d": "14天", "30d": "30天", normal: "正常跟进", unknown: "未记录交期" } as const;
const issueLabel = { material_name: "申购名称与采购实际名称不一致", specification: "申购规格与采购规格不一致", color: "需求颜色与采购颜色不一致" } as const;
const detailTabs: Array<[DetailTab, string]> = [["material", "物料"], ["demand", "单耗 / 需求"], ["purchase", "采购"], ["inbound", "入库"], ["shipment", "出运"], ["outbound", "出库"], ["dates", "日期"], ["batches", "分批到料"]];
const bufferLabel = (risk: MaterialBufferRisk, days: number | null) => days === null ? "待补齐依据" : days < 0 ? `晚 ${Math.abs(days)} 天` : `${days} 天 · ${risk === "green" ? "充足" : "需关注"}`;

function materialTone(item: CanonicalMaterialProgressProjection) {
  return item.isReady ? "success" as const : item.hasUnpurchasedDemand ? "danger" as const : "warning" as const;
}

function hasTransportRisk(item: CanonicalMaterialProgressProjection) {
  return item.expectedArrivalBatches.some((batch) => batch.bufferRisk === "red" || batch.recommendation.status.endsWith("missing") || batch.recommendation.escalationLevel === "faster_required" || batch.recommendation.escalationLevel === "only_fastest");
}

function searchText(item: CanonicalMaterialProgressProjection) {
  return item.demands.flatMap((row) => [
    item.materialName,
    row.demand.materialName,
    row.demand.sourceActualName,
    row.demand.materialColor,
    ...row.demand.garmentColors,
    row.demand.materialCode,
    ...row.purchaseEvents.flatMap((event) => [event.supplier, event.purchaseOrderNo]),
  ]).join(" ").normalize("NFKC").toLocaleLowerCase();
}

function sourceCodeLabel(item: CanonicalMaterialProgressProjection) {
  if (!item.materialCodes.length) return "无来源编码";
  if (item.materialCodes.length === 1) return item.materialCodes[0];
  return `${item.materialCodes.length}个来源编码`;
}

function shortage(item: CanonicalMaterialProgressProjection) {
  const difference = item.requiredQuantity - item.purchasedQuantity;
  if (difference > 0) return `采购不足 ${quantity(difference)}`;
  if (difference < 0) return `采购余量 ${quantity(Math.abs(difference))}`;
  return "采购数量已覆盖需求";
}

function SourceHistoryDrawer({ open, onClose, projection, data }: { open: boolean; onClose: () => void; projection: StyleProgressProjection; data: StyleProgressData }) {
  const demandIds = new Set([...projection.materials.map((item) => item.demand.id), ...projection.factorySuppliedDemands.map((item) => item.id)]);
  const snapshots = data.rawSnapshots.filter((item) => item.normalizedDemandId && demandIds.has(item.normalizedDemandId));
  const batches = data.batches.filter((item) => item.status === "committed").sort((left, right) => (right.committedAt ?? right.createdAt).localeCompare(left.committedAt ?? left.createdAt));
  return <Drawer open={open} title="来源历史" eyebrow="SOURCE TRACE" description="只读保留导入批次与原始来源，不改变当前 Effective 计划。" onClose={onClose}>
    <div className="sp-v4-drawer-stack">
      <section><h3>导入批次</h3>{batches.length ? <ul className="sp-v4-trace-list">{batches.map((batch) => <li key={batch.id}><strong>{batch.sourceKind === "api" ? `6087050 / ${batch.queryContext.insideOrderNo}` : batch.fileName}</strong><span>{batch.committedAt?.slice(0, 16) ?? batch.createdAt.slice(0, 16)} · {batch.validRowCount.toLocaleString("zh-CN")} 条有效数据</span><small>{batch.sourceKind === "api" ? batch.sourceArtifactHash : batch.fileHash}</small></li>)}</ul> : <p>暂无已提交导入批次。</p>}</section>
      <section><h3>当前款式来源 Trace</h3><p>{snapshots.length.toLocaleString("zh-CN")} 条 Raw Snapshot；来源值保持只读。</p></section>
    </div>
  </Drawer>;
}

function FactorySupplyDrawer({ open, onClose, projection }: { open: boolean; onClose: () => void; projection: StyleProgressProjection }) {
  return <Drawer open={open} title="厂供信息" eyebrow="SOURCE INFORMATION" description="厂供仅用于来源追溯，不进入采购、齐套、风险、物流或预计到料计划。" onClose={onClose}>
    <div className="sp-v4-event-list">{projection.factorySuppliedDemands.map((item) => <article key={item.id}>
      <header><strong>{item.sourceActualName || item.materialName || item.materialCode}</strong><StatusTag tone="neutral">厂供</StatusTag></header>
      <dl><div><dt>来源编码</dt><dd>{item.materialCode || "—"}</dd></div><div><dt>颜色 / 规格</dt><dd>{item.materialColor || item.specification || "—"}</dd></div><div><dt>需求数量</dt><dd>{quantity(item.requiredQuantity)}</dd></div><div><dt>Source 交期</dt><dd>{date(item.sourceMaterialDueDate)}</dd></div></dl>
    </article>)}</div>
  </Drawer>;
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number | null>> }) {
  return <div className="sp-v4-inner-scroll"><table className="sp-v4-detail-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={`${rowIndex}-${index}`}>{cell === null || cell === "" ? "—" : cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>暂无记录</td></tr>}</tbody></table></div>;
}

function MaterialTab({ item }: { item: CanonicalMaterialProgressProjection }) {
  const suppliers = [...new Set(item.demands.flatMap((row) => row.purchaseEvents.map((event) => event.supplier)).filter(Boolean))];
  const purchasers = [...new Set(item.demands.flatMap((row) => row.purchaseEvents.map((event) => event.purchaser)).filter(Boolean))];
  const purchaseEntities = [...new Set(item.demands.flatMap((row) => row.purchaseEvents.map((event) => event.purchaseEntity)).filter(Boolean))];
  return <div className="sp-v4-description-grid">
    <div><dt>织序物料名称</dt><dd>{item.materialName}</dd></div><div><dt>物料类型</dt><dd>{item.materialType === "fabric" ? "面料" : "辅料"}</dd></div>
    <div><dt>规格 / 成分</dt><dd>{[...new Set(item.demands.map((row) => row.demand.specification).filter(Boolean))].join(" / ") || "—"}</dd></div>
    <div><dt>门幅</dt><dd>{[...new Set(item.demands.map((row) => row.demand.width).filter(Boolean))].join(" / ") || "—"}</dd></div>
    <div><dt>克重</dt><dd>{[...new Set(item.demands.map((row) => row.demand.gsm).filter(Boolean))].join(" / ") || "—"}</dd></div>
    <div><dt>所有来源编码</dt><dd>{item.materialCodes.join(" / ") || "—"}</dd></div>
    <div><dt>颜色 / 规格明细</dt><dd>{item.demands.length} 项</dd></div><div><dt>供应商</dt><dd>{suppliers.join(" / ") || "—"}</dd></div>
    <div><dt>采购主体</dt><dd>{purchaseEntities.join(" / ") || "—"}</dd></div><div><dt>采购人</dt><dd>{purchasers.join(" / ") || "—"}</dd></div>
    <div><dt>汇总口径</dt><dd>同合同、同类型、同标准化名称</dd></div>
  </div>;
}

function ConsistencyIssues({ issues }: { issues: MaterialConsistencyIssue[] }) {
  if (!issues.length) return null;
  return <div className="sp-v4-consistency"><strong>数据一致性提示</strong>{issues.map((issue) => <p key={`${issue.demandId}-${issue.purchaseEventId}-${issue.field}`}>{issueLabel[issue.field]}：{issue.sourceValue} → {issue.purchaseValue}</p>)}</div>;
}

function MaterialDetailDrawer({ item, open, onClose, onPlan }: { item: CanonicalMaterialProgressProjection | null; open: boolean; onClose: () => void; onPlan: (item: CanonicalMaterialProgressProjection) => void }) {
  const [tab, setTab] = useState<DetailTab>("material");
  if (!item) return null;
  const purchaseEvents = item.demands.flatMap((row) => row.purchaseEvents);
  const inboundEvents = item.demands.flatMap((row) => row.inboundEvents);
  const shipmentEvents = item.demands.flatMap((row) => row.shipmentEvents);
  const outboundEvents = item.demands.flatMap((row) => row.outboundEvents);
  return <Drawer open={open} title={item.materialName} eyebrow="CANONICAL MATERIAL" description={`${item.demands.length} 项颜色 / 规格 · ${sourceCodeLabel(item)}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>关闭</Button><Button permission="style_progress.edit" onClick={() => onPlan(item)}>管理分批到料</Button></>}>
    <nav className="sp-v4-detail-tabs" aria-label="物料详情"><>{detailTabs.map(([value, label]) => <button type="button" key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</></nav>
    <ConsistencyIssues issues={item.consistencyIssues} />
    {tab === "material" && <MaterialTab item={item} />}
    {tab === "demand" && <SimpleTable headers={["颜色 / 规格", "计划单耗", "实际单耗", "损耗率", "总耗", "需求数量"]} rows={item.demands.map((row) => [row.demand.materialColor || row.demand.specification, quantity(row.demand.plannedConsumption), quantity(row.demand.actualConsumption), quantity(row.demand.lossRate), quantity(row.demand.totalConsumption), quantity(row.demand.requiredQuantity)])} />}
    {tab === "purchase" && <SimpleTable headers={["采购单号", "采购日期", "供应商", "采购主体", "采购人", "采购实际名称", "开票名称", "规格", "颜色", "币种", "单价", "数量", "样衣", "金额", "额外费用"]} rows={purchaseEvents.map((event) => [event.purchaseOrderNo, date(event.purchaseDate), event.supplier, event.purchaseEntity, event.purchaser, event.actualName || event.purchasedMaterialName, event.invoiceName, event.specification, event.color, event.currency, quantity(event.unitPrice), quantity(event.quantity), quantity(event.sampleQuantity), quantity(event.amount), quantity(event.extraCost)])} />}
    {tab === "inbound" && <SimpleTable headers={["入库单号", "入库日期", "入库数量", "Source Rows"]} rows={inboundEvents.map((event) => [event.documentNo, date(event.eventDate), quantity(event.quantity), event.sourceRows.join(", ")])} />}
    {tab === "shipment" && <SimpleTable headers={["出运单号", "出运日期", "运输方式", "出运数量"]} rows={shipmentEvents.map((event) => [event.documentNo, date(event.eventDate), event.transportModeSnapshot, quantity(event.quantity)])} />}
    {tab === "outbound" && <SimpleTable headers={["出库单号", "出库日期", "出库数量"]} rows={outboundEvents.map((event) => [event.documentNo, date(event.eventDate), quantity(event.quantity)])} />}
    {tab === "dates" && <SimpleTable headers={["颜色 / 规格", "Source", "Effective / Batch", "Actual", "计划上线 / 开工"]} rows={item.demands.map((row) => [row.demand.materialColor || row.demand.specification, date(row.demand.sourceMaterialDueDate), row.batchSummary.expectedArrival ?? "未安排", date(row.actualInboundDate), row.logistics.plannedProductionStartDate ?? "待排单"])} />}
    {tab === "batches" && <SimpleTable headers={["批次", "预计到集货仓", "已分配", "推荐出运", "预计到厂", "距上线", "运输 Buffer"]} rows={item.expectedArrivalBatches.map((batch, index) => [`批次 ${index + 1}`, batch.batch.expectedArrivalAtHubDate, quantity(batch.allocatedQuantity), batch.recommendation.recommendedMode?.name ?? batch.recommendation.message, date(batch.recommendation.expectedArrivalDate), batch.daysToProduction === null ? "—" : batch.daysToProduction < 0 ? `晚 ${Math.abs(batch.daysToProduction)} 天` : `${batch.daysToProduction} 天`, batch.recommendation.bufferDays === null ? "—" : batch.recommendation.bufferDays < 0 ? `晚 ${Math.abs(batch.recommendation.bufferDays)} 天` : `${batch.recommendation.bufferDays} 天`])} />}
  </Drawer>;
}

function BatchPlanner({ item, open, onClose, projection, settings, onSaved }: { item: CanonicalMaterialProgressProjection; open: boolean; onClose: () => void; projection: StyleProgressProjection; settings: OperationsSettingsState; onSaved: () => Promise<void> }) {
  const { currentUser, can } = usePermissions();
  const [drafts, setDrafts] = useState<MaterialExpectedArrivalBatch[]>(() => structuredClone(item.expectedArrivalBatches.map((entry) => entry.batch)));
  const [error, setError] = useState("");
  const demandIds = item.demands.map((row) => row.demand.id);
  const allocated = new Map(demandIds.map((id) => [id, drafts.reduce((total, batch) => total + (batch.allocations.find((allocation) => allocation.materialDemandId === id)?.quantity ?? 0), 0)]));
  const logistics = new Map(drafts.map((batch) => {
    const recommendation = recommendMaterialTransport({ assignment: projection.logisticsContext.assignment, settings, supplyHubId: projection.logisticsContext.supplyHubId, expectedMaterialReadyDate: /^\d{4}-\d{2}-\d{2}$/.test(batch.expectedArrivalAtHubDate) ? batch.expectedArrivalAtHubDate : null });
    const daysToProduction = /^\d{4}-\d{2}-\d{2}$/.test(batch.expectedArrivalAtHubDate) ? calculateDaysToProduction(batch.expectedArrivalAtHubDate, recommendation.plannedProductionStartDate) : null;
    return [batch.id, { recommendation, daysToProduction, risk: bufferRiskForDays(recommendation.bufferDays) }] as const;
  }));
  const addBatch = () => {
    const timestamp = new Date().toISOString();
    const id = `material-arrival-${stableStyleProgressHash([item.canonicalMaterialKey, timestamp, drafts.length])}`;
    setDrafts((current) => [...current, { id, salesContractNo: projection.salesContractNo, canonicalMaterialKey: item.canonicalMaterialKey, expectedArrivalAtHubDate: "", dateSource: "manual", allocations: [], createdAt: timestamp, createdBy: currentUser.name, updatedAt: timestamp, updatedBy: currentUser.name }]);
  };
  const updateDate = (batchId: string, value: string) => setDrafts((current) => current.map((batch) => batch.id === batchId ? { ...batch, expectedArrivalAtHubDate: value, updatedAt: new Date().toISOString(), updatedBy: currentUser.name } : batch));
  const updateQuantity = (batchId: string, demandId: string, value: number) => setDrafts((current) => current.map((batch) => batch.id !== batchId ? batch : { ...batch, allocations: value > 0 ? [...batch.allocations.filter((allocation) => allocation.materialDemandId !== demandId), { id: batch.allocations.find((allocation) => allocation.materialDemandId === demandId)?.id ?? `material-allocation-${stableStyleProgressHash([batch.id, demandId])}`, materialDemandId: demandId, quantity: value }] : batch.allocations.filter((allocation) => allocation.materialDemandId !== demandId), updatedAt: new Date().toISOString(), updatedBy: currentUser.name }));
  const removeBatch = (batchId: string) => setDrafts((current) => current.filter((batch) => batch.id !== batchId));
  const validate = () => {
    if (drafts.some((batch) => !/^\d{4}-\d{2}-\d{2}$/.test(batch.expectedArrivalAtHubDate))) return "每个批次都必须填写有效的预计到集货仓日期";
    if (drafts.some((batch) => !batch.allocations.length)) return "每个批次至少需要一项大于 0 的需求分配";
    for (const row of item.demands) {
      const total = allocated.get(row.demand.id) ?? 0;
      if (total > row.demand.requiredQuantity + 1e-9) return `${row.demand.materialColor || row.demand.specification} 超分配：已安排 ${quantity(total)} / 需求 ${quantity(row.demand.requiredQuantity)}`;
    }
    return "";
  };
  const save = async () => {
    const issue = validate();
    if (issue) { setError(issue); return; }
    try {
      await saveExpectedArrivalPlan({ salesContractNo: projection.salesContractNo, canonicalMaterialKey: item.canonicalMaterialKey, materialDemandIds: demandIds, batches: drafts, actor: { userId: currentUser.id, userName: currentUser.name }, orderId: projection.order?.id, orderNo: projection.order?.orderNo, orderStyleNo: projection.styleNo });
      await onSaved();
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存分批预计到料失败"); }
  };
  const restore = async () => {
    try {
      await restoreExpectedArrivalPlanToSource({ salesContractNo: projection.salesContractNo, canonicalMaterialKey: item.canonicalMaterialKey, materialDemandIds: demandIds, actor: { userId: currentUser.id, userName: currentUser.name }, orderId: projection.order?.id, orderNo: projection.order?.orderNo, orderStyleNo: projection.styleNo });
      await onSaved();
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "恢复来源计划失败"); }
  };
  return <Modal open={open} title="分批预计到料" eyebrow="EXPECTED ARRIVAL AT SUPPLYHUB" description={`${item.materialName} · 允许一个需求拆分到多个批次，未安排数量可以保留。`} className="sp-v4-planner" onClose={onClose} onSubmit={save} footer={<><Button variant="text" disabled={!can("style_progress.edit")} onClick={() => void restore()}>恢复使用来源计划</Button><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" disabled={!can("style_progress.edit")}>保存计划</Button></>}>
    {error && <AlertBanner tone="danger" title="无法保存">{error}</AlertBanner>}
    <div className="sp-v4-allocation-overview">{item.demands.map((row) => { const total = allocated.get(row.demand.id) ?? 0; return <div key={row.demand.id}><span>{row.demand.materialColor || row.demand.specification || row.demand.materialCode}</span><strong>已安排 {quantity(total)} / 需求 {quantity(row.demand.requiredQuantity)}</strong><small>未安排 {quantity(Math.max(0, row.demand.requiredQuantity - total))}</small></div>; })}</div>
    <div className="sp-v4-batch-list">{drafts.map((batch, index) => { const preview = logistics.get(batch.id)!; return <section key={batch.id} className="sp-v4-batch">
      <header><strong>批次 {index + 1}</strong><label>预计到集货仓<input type="date" value={batch.expectedArrivalAtHubDate} disabled={!can("style_progress.edit")} onInput={(event) => updateDate(batch.id, event.currentTarget.value)} /></label><Button variant="text" disabled={!can("style_progress.edit")} onClick={() => removeBatch(batch.id)}>删除批次</Button></header>
      <div className="sp-v4-batch-demands">{item.demands.map((row) => { const current = batch.allocations.find((allocation) => allocation.materialDemandId === row.demand.id)?.quantity ?? 0; return <label key={row.demand.id}><span>{row.demand.materialColor || row.demand.specification || row.demand.materialCode}</span><small>需求 {quantity(row.demand.requiredQuantity)}</small><input type="number" min="0" step="0.001" value={current || ""} placeholder="本批数量" disabled={!can("style_progress.edit")} onInput={(event) => updateQuantity(batch.id, row.demand.id, Number(event.currentTarget.value) || 0)} /></label>; })}</div>
      <div className="sp-v4-batch-logistics" data-risk={preview.risk}><span>推荐运输<strong>{preview.recommendation.recommendedMode?.name ?? preview.recommendation.message}</strong></span><span>预计到厂<strong>{date(preview.recommendation.expectedArrivalDate)}</strong></span><span>距上线<strong>{preview.daysToProduction === null ? "—" : preview.daysToProduction < 0 ? `晚 ${Math.abs(preview.daysToProduction)} 天` : `${preview.daysToProduction} 天`}</strong></span><span>运输 Buffer<strong>{bufferLabel(preview.risk, preview.recommendation.bufferDays)}</strong></span></div>
      <footer><span>本批总数量</span><strong>{quantity(batch.allocations.reduce((total, allocation) => total + allocation.quantity, 0))}</strong></footer>
    </section>; })}</div>
    <Button variant="secondary" disabled={!can("style_progress.edit")} onClick={addBatch}>＋ 增加批次</Button>
  </Modal>;
}

function DemandRows({ item }: { item: CanonicalMaterialProgressProjection }) {
  return <div className="sp-v4-color-scroll"><table className="sp-v4-color-table"><thead><tr><th>颜色 / 规格</th><th>需求</th><th>采购</th><th>入库</th><th>出运</th><th>当前状态</th><th>当前预计到料</th><th>推荐出运</th><th>预计到厂</th><th>距上线</th><th>实际入库</th></tr></thead><tbody>{item.demands.map((row) => <tr key={row.demand.id} data-material-demand-id={row.demand.id}><td><strong>{row.demand.materialColor || row.demand.specification || "—"}</strong><small>{row.demand.specification || row.demand.materialCode}</small></td><td>{quantity(row.demand.requiredQuantity)}</td><td>{quantity(row.purchasedQuantity)}</td><td>{quantity(row.inboundQuantity)}</td><td>{quantity(row.shipmentQuantity)}</td><td><StatusTag tone={row.readinessStatus === "ready" ? "success" : row.readinessStatus === "not_purchased" ? "danger" : "warning"}>{readinessLabel[row.readinessStatus]}</StatusTag></td><td>{row.batchSummary.expectedArrival ?? "未安排"}</td><td>{row.batchSummary.recommendedTransport ?? "—"}</td><td>{row.batchSummary.expectedFactoryArrival ?? "—"}</td><td>{row.batchSummary.daysToProduction ?? "—"}</td><td>{date(row.actualInboundDate)}</td></tr>)}</tbody></table></div>;
}

function MaterialCard({ item, expanded, onToggle, onPlan, onDetail }: { item: CanonicalMaterialProgressProjection; expanded: boolean; onToggle: () => void; onPlan: () => void; onDetail: () => void }) {
  return <Card className="sp-v4-material-card" data-canonical-material-key={item.canonicalMaterialKey}>
    <div className="sp-v4-material-head"><button type="button" className="sp-v4-material-identity" aria-expanded={expanded} onClick={onToggle}><span aria-hidden>{expanded ? "▾" : "▸"}</span><div><strong>{item.materialName}</strong><small>{sourceCodeLabel(item)} · {item.demands.length} 个颜色 / 明细</small></div></button><StatusTag tone={materialTone(item)}>{readinessLabel[item.readinessStatus]}</StatusTag><div className="sp-v4-material-totals"><span>需求 <b>{quantity(item.requiredQuantity)}</b></span><span>采购 <b>{quantity(item.purchasedQuantity)}</b></span><span>入库 <b>{quantity(item.inboundQuantity)}</b></span></div><div className="sp-v4-material-risk"><strong>{shortage(item)}</strong>{item.consistencyIssues.length > 0 && <small>{item.consistencyIssues.length} 项数据不一致</small>}</div><div className="sp-v4-card-actions"><Button variant="secondary" size="compact" permission="style_progress.edit" onClick={onPlan}>分批到料</Button><Button variant="text" size="compact" onClick={onDetail}>详情</Button></div></div>
    {expanded && <div className="sp-v4-material-body"><div className="sp-v4-plan-summary"><span>预计到料 <strong>{item.batchSummary.expectedArrival ?? "未安排"}</strong></span><span>推荐出运 <strong>{item.batchSummary.recommendedTransport ?? "—"}</strong></span><span>预计到厂 <strong>{item.batchSummary.expectedFactoryArrival ?? "—"}</strong></span><span>距上线 <strong>{item.batchSummary.daysToProduction ?? "—"}</strong></span></div><DemandRows item={item} /></div>}
  </Card>;
}

export function MaterialControlTower({ projection, data, settings, onReload, onToast }: Props) {
  const router = useRouter();
  const { can } = usePermissions();
  const [typeFilter, setTypeFilter] = useState<MaterialFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [detail, setDetail] = useState<CanonicalMaterialProgressProjection | null>(null);
  const [planner, setPlanner] = useState<CanonicalMaterialProgressProjection | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [factoryOpen, setFactoryOpen] = useState(false);
  const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
  const visible = useMemo(() => filterCanonicalMaterialsByType(projection.canonicalMaterials, typeFilter).filter((item) => {
    if (statusFilter === "not_purchased" && !item.hasUnpurchasedDemand) return false;
    if (statusFilter === "pending_inbound" && (item.isReady || item.hasUnpurchasedDemand)) return false;
    if (statusFilter === "ready" && !item.isReady) return false;
    if (statusFilter === "risk" && !hasTransportRisk(item) && !item.consistencyIssues.length) return false;
    return !normalizedQuery || searchText(item).includes(normalizedQuery);
  }), [normalizedQuery, projection.canonicalMaterials, statusFilter, typeFilter]);
  const followUpCount = projection.canonicalMaterials.filter((item) => !item.isReady || hasTransportRisk(item)).length;
  const toggle = (key: string) => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const saved = async () => { onToast("分批预计到料计划已保存"); await onReload(); };
  return <>
    <PageHeader variant="object" eyebrow="STYLE PROGRESS · MATERIAL CONTROL TOWER" title={projection.factoryStyleNo || projection.styleNo} description={<>{projection.salesContractNo} · {projection.brand || "未记录品牌"} · {projection.owner || "未记录负责人"} · 订单数量 {quantity(projection.garmentQuantity)}</>} status={<StatusTag tone={projection.salesRisk === "overdue" || projection.salesRisk === "7d" ? "danger" : projection.salesRisk === "14d" || projection.salesRisk === "30d" ? "warning" : "success"}>{salesRiskLabel[projection.salesRisk]}</StatusTag>} secondaryActions={<div className="sp-v4-page-actions"><Button variant="secondary" disabled={!can("style_progress.view_history")} onClick={() => setSourceOpen(true)}>来源历史</Button>{projection.factorySuppliedDemands.length > 0 && <Button variant="secondary" onClick={() => setFactoryOpen(true)}>厂供信息</Button>}<Button onClick={() => projection.order ? router.push(`/order-center/detail?id=${encodeURIComponent(projection.order.id)}`) : router.push("/ainuoke-sync")}>{projection.order ? "查看订单" : "前往艾诺科同步"}</Button></div>} />
    {!projection.order && <AlertBanner tone="warning" title="销售合同尚未形成织序订单">款式进度不会猜测款号或自动创建订单；请在艾诺科同步处理。</AlertBanner>}
    <section className="sp-v4-kpis"><Card><span>合同交期</span><strong>{date(projection.contractDeliveryDate)}</strong><small>{projection.daysRemaining === null ? "未记录" : projection.daysRemaining < 0 ? `逾期 ${Math.abs(projection.daysRemaining)} 天` : `剩余 ${projection.daysRemaining} 天`}</small></Card><Card><span>面料齐套</span><strong>{projection.fabricReady} / {projection.fabricTotal}</strong></Card><Card><span>辅料齐套</span><strong>{projection.trimReady} / {projection.trimTotal}</strong></Card><Card><span>总齐套率</span><strong>{projection.readinessRate.toFixed(1)}%</strong></Card><Card className="warning"><span>需要跟进</span><strong>{followUpCount}</strong></Card></section>
    {(projection.notPurchasedCount > 0 || projection.pendingInboundCount > 0 || projection.transportRisk !== "none") && <Card className="sp-v4-actions"><header><h2>需要你处理</h2></header><div>{projection.notPurchasedCount > 0 && <article><span>采</span><strong>{projection.notPurchasedCount} 项尚未形成采购事实</strong><Button variant="text" onClick={() => setStatusFilter("not_purchased")}>只看未采购 →</Button></article>}{projection.pendingInboundCount > 0 && <article><span>仓</span><strong>{projection.pendingInboundCount} 项采购后仍待齐套</strong><Button variant="text" onClick={() => setStatusFilter("pending_inbound")}>只看待入库 →</Button></article>}{projection.transportRisk !== "none" && <article><span>运</span><strong>{projection.transportRisk === "hub_missing" ? "集货仓未设置" : `${projection.transportRiskCount} 项物流需要处理`}</strong><Button variant="text" onClick={() => projection.transportRisk === "hub_missing" ? router.push("/system-settings/production-infrastructure") : setStatusFilter("risk")}>{projection.transportRisk === "hub_missing" ? "设置集货仓 →" : "只看有风险 →"}</Button></article>}</div></Card>}
    <Card className="sp-v4-filter"><div className="sp-v4-segment" aria-label="物料类型">{(["all", "fabric", "trim"] as MaterialFilter[]).map((value) => <button type="button" key={value} className={typeFilter === value ? "active" : ""} onClick={() => setTypeFilter(value)}>{value === "all" ? "全部" : value === "fabric" ? "面料" : "辅料"} {value === "all" ? projection.totalMaterials : value === "fabric" ? projection.fabricTotal : projection.trimTotal}</button>)}</div><select aria-label="物料状态" value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}><option value="all">全部状态</option><option value="not_purchased">未采购</option><option value="pending_inbound">待入库</option><option value="ready">已齐套</option><option value="risk">仅看有风险</option></select><input type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="搜索物料、颜色、来源编码、供应商、采购单号" aria-label="搜索物料" /><span>{visible.length} / {projection.totalMaterials}</span></Card>
    <section className="sp-v4-material-list" aria-label="采购跟进物料">{visible.length ? visible.map((item) => <MaterialCard key={item.canonicalMaterialKey} item={item} expanded={expanded.has(item.canonicalMaterialKey)} onToggle={() => toggle(item.canonicalMaterialKey)} onPlan={() => setPlanner(item)} onDetail={() => setDetail(item)} />) : <Card className="sp-v4-empty">没有符合当前筛选条件的物料。</Card>}</section>
    <SourceHistoryDrawer open={sourceOpen} onClose={() => setSourceOpen(false)} projection={projection} data={data} />
    <FactorySupplyDrawer open={factoryOpen} onClose={() => setFactoryOpen(false)} projection={projection} />
    <MaterialDetailDrawer item={detail} open={Boolean(detail)} onClose={() => setDetail(null)} onPlan={(item) => { setDetail(null); setPlanner(item); }} />
    {planner && <BatchPlanner key={planner.canonicalMaterialKey} item={planner} open onClose={() => setPlanner(null)} projection={projection} settings={settings} onSaved={saved} />}
  </>;
}
