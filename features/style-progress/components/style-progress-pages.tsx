"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertBanner, AppShell, Button, Card, DataTable, Drawer, EmptyState, ErrorState, LoadingState, Modal, PageContainer, PageHeader, StatusTag, Toast, type DataColumn } from "@/components/foundation";
import { orderRepository } from "@/features/order-center/repository/order-repository";
import type { SalesOrder } from "@/features/order-center/model/order";
import { operationsSettingsRepository } from "@/features/operations-settings/repository/operations-settings-repository";
import { productionSchedulingRepository } from "@/features/production-scheduling/repository/production-scheduling-repository";
import { operationLogRepository, createOperationLogDraft } from "@/features/operation-logs";
import { usePermissions } from "@/features/permissions";
import { parseMaterialFollowUpWorkbook } from "../parser/material-follow-up-parser";
import { styleProgressRepository } from "../repository/style-progress-repository";
import { buildStyleProgressProjections, fabricDisplayOrder, trimDisplayOrder, type MaterialProgressProjection, type StyleProgressProjection } from "../service/style-progress-service";
import type { MaterialImportPreview, StyleProgressData } from "../model/style-progress";
import { OrderCenterNavigation } from "./order-center-navigation";

type Loaded = { data: StyleProgressData; orders: SalesOrder[]; projections: StyleProgressProjection[] };
type ImportPreviewAudit = { contracts: number; contractsMatched: number; contractsWithoutOrder: number; sourceDateChanges: number; manualOverridesPreserved: number };
const readinessLabels = { not_purchased: "未采购", purchasing: "采购中", pending_inbound: "待入库", ready: "已齐套" } as const;
const lifecycleLabels = { pending_purchase: "待采购", purchasing: "采购中", purchase_complete: "采购完成", partial_inbound: "部分入库", inbound_complete: "入库完成", partial_shipment: "部分出运", shipment_complete: "出运完成", partial_outbound: "部分出库", outbound_complete: "出库完成" } as const;
const salesRiskLabels = { overdue: "已逾期", "7d": "7天", "14d": "14天", "30d": "30天", normal: "正常", unknown: "未记录交期" } as const;
const materialRiskLabels = { ready: "已齐套", unpurchase: "存在未采购", pending_inbound: "采购/入库中", late_expected: "预计到料晚于合同交期", normal: "正常" } as const;
const transportRiskLabels = { none: "正常", pending_schedule: "待排单", hub_missing: "集货仓未设置", site_missing: "生产地点未设置", route_missing: "路线未配置", modes_missing: "运输方式未配置", faster_required: "需加快", only_fastest: "仅最快可行", late: "无可行方式" } as const;
const tone = (risk: StyleProgressProjection["salesRisk"]) => risk === "overdue" || risk === "7d" ? "danger" : risk === "14d" || risk === "30d" ? "warning" : risk === "normal" ? "success" : "neutral";
const quantity = (value: number | null) => value === null ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });

async function loadProgress(): Promise<Loaded> {
  const [data, orders, scheduling, settings] = await Promise.all([styleProgressRepository.loadAll(), orderRepository.list(), productionSchedulingRepository.load(), Promise.resolve(operationsSettingsRepository.load())]);
  return { data, orders, projections: buildStyleProgressProjections({ data, orders, scheduling, settings }) };
}

async function ensureMaterialImportOperationLogs(data: StyleProgressData): Promise<void> {
  const existing = await operationLogRepository.list();
  const loggedBatchIds = new Set(existing.filter((item) => item.entityType === "MaterialImportBatch" && item.action === "导入面辅料跟进").map((item) => item.entityId));
  const missing = data.batches.filter((batch) => batch.status === "committed" && !loggedBatchIds.has(batch.id));
  if (!missing.length) return;
  await operationLogRepository.appendMany(missing.map((batch) => createOperationLogDraft({
    actor: { userId: `material-import:${batch.createdBy}`, userName: batch.createdBy },
    module: "款式进度",
    entityType: "MaterialImportBatch",
    entityId: batch.id,
    action: "导入面辅料跟进",
    createdAt: batch.committedAt ?? batch.createdAt,
    afterData: { objectName: batch.fileName, values: { "文件哈希": batch.fileHash, "原始行": batch.rawRowCount, "有效行": batch.validRowCount, "无效 Trace": batch.invalidRowCount, "物料需求": batch.demandCount, "采购事件": batch.purchaseEventCount, "入库事件": batch.inboundEventCount, "出运事件": batch.shipmentEventCount, "出库事件": batch.outboundEventCount } },
  })));
}

function SummaryMetrics({ rows }: { rows: StyleProgressProjection[] }) {
  const totalMaterials = rows.reduce((total, item) => total + item.totalMaterials, 0); const ready = rows.reduce((total, item) => total + item.totalReady, 0);
  const values = [["销售合同", rows.length], ["物料项", totalMaterials], ["已齐套", ready], ["未采购", rows.reduce((total, item) => total + item.notPurchasedCount, 0)], ["待入库", rows.reduce((total, item) => total + item.pendingInboundCount, 0)], ["运输高风险", rows.reduce((total, item) => total + item.transportRiskCount, 0)]];
  return <section className="sp-metrics">{values.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</section>;
}

function ImportModal({ open, onClose, onCommitted }: { open: boolean; onClose: () => void; onCommitted: () => void }) {
  const { currentUser, can } = usePermissions(); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<MaterialImportPreview | null>(null); const [previewAudit, setPreviewAudit] = useState<ImportPreviewAudit | null>(null); const [duplicate, setDuplicate] = useState(false); const [working, setWorking] = useState(false); const [error, setError] = useState(""); const [report, setReport] = useState("");
  const runPreview = async () => { if (!file) return; setWorking(true); setError(""); setReport(""); try { const buffer = await file.arrayBuffer(); const next = await parseMaterialFollowUpWorkbook({ buffer, fileName: file.name, actorName: currentUser.name }); const [alreadyCommitted, existing, orders] = await Promise.all([styleProgressRepository.hasCommittedFile(next.batch.fileHash), styleProgressRepository.listDemands(), orderRepository.list()]); const contracts = new Set(next.demands.map((item) => item.salesContractNo)); const orderContracts = new Set(orders.map((item) => item.salesContractNo).filter((value): value is string => Boolean(value))); const existingById = new Map(existing.map((item) => [item.id, item])); setPreviewAudit({ contracts: contracts.size, contractsMatched: [...contracts].filter((item) => orderContracts.has(item)).length, contractsWithoutOrder: [...contracts].filter((item) => !orderContracts.has(item)).length, sourceDateChanges: next.demands.filter((item) => { const current = existingById.get(item.id); return current && current.sourceMaterialDueDate !== item.sourceMaterialDueDate; }).length, manualOverridesPreserved: next.demands.filter((item) => existingById.get(item.id)?.expectedDateSource === "manual").length }); setDuplicate(alreadyCommitted); setPreview(next); } catch (reason) { setError(reason instanceof Error ? reason.message : "预检失败"); } finally { setWorking(false); } };
  const commit = async () => {
    if (!preview || !can("style_progress.import")) return;
    setWorking(true); setError("");
    try {
      const result = await styleProgressRepository.commitImport(preview);
      const actual = await styleProgressRepository.loadAll();
      await operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "款式进度", entityType: "MaterialImportBatch", entityId: preview.batch.id, action: "导入面辅料跟进", afterData: { objectName: preview.batch.fileName, values: { "文件哈希": preview.batch.fileHash, "重复文件": result.duplicateFile ? "是" : "否", "新增需求": result.newDemands, "新增采购": result.newPurchaseEvents, "新增入库": result.newInboundEvents, "新增出运": result.newShipmentEvents, "新增出库": result.newOutboundEvents } } }));
      const contracts = new Set(actual.demands.map((item) => item.salesContractNo)).size;
      const delta = `新增：需求 ${result.newDemands} / 采购 ${result.newPurchaseEvents} / 入库 ${result.newInboundEvents} / 出运 ${result.newShipmentEvents} / 出库 ${result.newOutboundEvents}`;
      const totals = `Repository 实际：批次 ${actual.batches.length} / Raw ${actual.rawSnapshots.length} / 需求 ${actual.demands.length} / 采购 ${actual.purchaseEvents.length} / 入库 ${actual.inboundEvents.length} / 出运 ${actual.shipmentEvents.length} / 出库 ${actual.outboundEvents.length} / 合同 ${contracts}${previewAudit ? ` / 已匹配订单 ${previewAudit.contractsMatched} / 尚无订单 ${previewAudit.contractsWithoutOrder}` : ""}`;
      setReport(`${result.duplicateFile ? "相同文件已正式导入，业务事实零重复。" : "正式导入已提交。"}${delta}；${totals}`);
      onCommitted();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "正式导入失败"); } finally { setWorking(false); }
  };
  const b = preview?.batch;
  return <Modal open={open} title="导入面辅料申购统计" eyebrow="AINUOKE MATERIAL FOLLOW-UP" description="上传后先预检，不会直接写入正式物料记录。" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>关闭</Button>{preview ? <Button permission="style_progress.import" disabled={working} onClick={() => void commit()}>{working ? "提交中…" : duplicate ? "验证幂等（零新增）" : "确认正式导入"}</Button> : <Button permission="style_progress.import" disabled={working || !file} onClick={() => void runPreview()}>{working ? "解析中…" : "运行预检"}</Button>}</>}>
    <AlertBanner tone="info" title="来源权威说明">《面辅料申购统计》是艾诺科跟进来源，只通过销售合同号关联正式订单；不会覆盖订单品牌、款号、数量或合同交期。</AlertBanner>
    <label className="sp-file-input"><strong>选择 .xlsx 文件</strong><input type="file" accept=".xlsx" aria-label="选择面辅料申购统计文件" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setPreviewAudit(null); setReport(""); }} /><span>{file?.name ?? "尚未选择"}</span></label>
    {error && <ErrorState title="导入预检失败" description={error} />}{report && <AlertBanner tone="info" title="导入完成">{report}</AlertBanner>}
    {b && <div className="sp-import-preview"><h3>预检结果</h3><dl><div><dt>文件哈希</dt><dd>{b.fileHash}</dd></div><div><dt>Sheet / 范围</dt><dd>{b.sheetName} · {b.usedRange}</dd></div><div><dt>原始行 / 有效 / 无效</dt><dd>{b.rawRowCount} / {b.validRowCount} / {b.invalidRowCount}</dd></div><div><dt>物料需求</dt><dd>{b.demandCount}（去除展开 {b.duplicateDemandRows} 行）</dd></div><div><dt>采购 / 入库 / 出运 / 出库</dt><dd>{b.purchaseEventCount} / {b.inboundEventCount} / {b.shipmentEventCount} / {b.outboundEventCount}</dd></div><div><dt>重复事件展开</dt><dd>{b.duplicateEventRows}</dd></div>{previewAudit && <><div><dt>销售合同 / 已匹配订单 / 尚无订单</dt><dd>{previewAudit.contracts} / {previewAudit.contractsMatched} / {previewAudit.contractsWithoutOrder}</dd></div><div><dt>来源交期变化 / 保留人工预计</dt><dd>{previewAudit.sourceDateChanges} / {previewAudit.manualOverridesPreserved}</dd></div></>}</dl>{duplicate && <AlertBanner tone="warning" title="重复文件">该文件哈希已有正式批次；再次提交只验证幂等，不会新增业务记录。</AlertBanner>}{b.invalidRowCount > 0 && <AlertBanner tone="warning" title="存在无效行">无效行保留技术 Trace、不生成业务记录；其余有效行可正式提交。</AlertBanner>}<AlertBanner tone="info" title="当前预计到料日">艾诺科交期只作为初始来源；已人工调整的跟进日期在重新导入时保留，不会被永久覆盖。</AlertBanner></div>}
  </Modal>;
}

export function StyleProgressPage() {
  const router = useRouter(); const { can } = usePermissions(); const [loaded, setLoaded] = useState<Loaded | null>(null); const [error, setError] = useState(""); const [query, setQuery] = useState(""); const [importOpen, setImportOpen] = useState(false); const [toast, setToast] = useState("");
  const reload = async () => { setError(""); try { setLoaded(await loadProgress()); } catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取款式进度"); } };
  useEffect(() => { Promise.resolve().then(() => void reload()); }, []); useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2400); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (loaded) void ensureMaterialImportOperationLogs(loaded.data); }, [loaded]);
  const rows = useMemo(() => (loaded?.projections ?? []).filter((item) => [item.salesContractNo, item.styleNo, item.factoryStyleNo, item.brand, item.owner].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [loaded, query]);
  const columns: DataColumn<StyleProgressProjection>[] = [
    { key: "risk", header: "风险", width: 90, sticky: "left", render: (row) => <StatusTag tone={tone(row.salesRisk)}>{salesRiskLabels[row.salesRisk]}</StatusTag> },
    { key: "style", header: "工厂款号", minWidth: 130, sticky: "left", render: (row) => <strong>{row.factoryStyleNo || row.styleNo}</strong> },
    { key: "contract", header: "销售合同", minWidth: 130, render: (row) => row.salesContractNo }, { key: "brand", header: "品牌", minWidth: 120, render: (row) => row.brand }, { key: "owner", header: "跟单人", width: 90, render: (row) => row.owner },
    { key: "quantity", header: "成衣数量", width: 100, align: "right", render: (row) => quantity(row.garmentQuantity) }, { key: "delivery", header: "合同交期", width: 110, render: (row) => row.contractDeliveryDate },
    { key: "fabric", header: "面料齐套", width: 95, render: (row) => `${row.fabricReady}/${row.fabricTotal}` }, { key: "trim", header: "辅料齐套", width: 95, render: (row) => `${row.trimReady}/${row.trimTotal}` }, { key: "rate", header: "总齐套", width: 85, render: (row) => `${row.readinessRate.toFixed(1)}%` },
    { key: "unpurchase", header: "未采购", width: 80, align: "right", render: (row) => row.notPurchasedCount }, { key: "inbound", header: "待入库", width: 80, align: "right", render: (row) => row.pendingInboundCount }, { key: "transport", header: "运输风险", minWidth: 110, render: (row) => transportRiskLabels[row.transportRisk] },
    { key: "view", header: "操作", width: 86, sticky: "right", render: (row) => <Button variant="text" onClick={() => router.push(`/order-center/style-progress/detail?contract=${encodeURIComponent(row.salesContractNo)}`)}>查看</Button> },
  ];
  if (!can("style_progress.read")) return <AppShell title="款式进度"><PageContainer><ErrorState title="暂无权限" description="请联系管理员开通款式进度查看权限。" /></PageContainer></AppShell>;
  return <AppShell title="款式进度"><PageContainer className="sp-page"><OrderCenterNavigation /><PageHeader eyebrow="MATERIAL CONTROL TOWER" title="款式进度" count={`${rows.length} 款`} description="按合同查看采购、到料、齐套与运输风险；正式订单字段始终来自订单中心。" primaryAction={<Button permission="style_progress.import" onClick={() => setImportOpen(true)}>导入面辅料跟进</Button>} />
    {error && <ErrorState title="读取失败" description={error} onRetry={() => void reload()} />}{!loaded && !error ? <LoadingState label="正在计算物料齐套与物流建议" /> : <><SummaryMetrics rows={rows} /><Card className="sp-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索销售合同、款号、品牌或跟单人" aria-label="搜索款式进度" /></Card><DataTable rows={rows} columns={columns} rowKey={(row) => row.salesContractNo} onRowActivate={(row) => router.push(`/order-center/style-progress/detail?contract=${encodeURIComponent(row.salesContractNo)}`)} ariaLabel="款式进度列表" emptyTitle="尚无款式进度" emptyDescription="请先导入真实《面辅料申购统计.xlsx》。" renderRecord={(row) => <><header><strong>{row.factoryStyleNo || row.styleNo}</strong><StatusTag tone={tone(row.salesRisk)}>{salesRiskLabels[row.salesRisk]}</StatusTag></header><p>{row.salesContractNo} · {row.brand}</p><small>面料 {row.fabricReady}/{row.fabricTotal} · 辅料 {row.trimReady}/{row.trimTotal} · 未采购 {row.notPurchasedCount}</small></>} /></>}
    <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onCommitted={() => { setToast("正式物料数据已更新"); void reload(); }} />{toast && <Toast message={toast} />}
  </PageContainer></AppShell>;
}

function MaterialTable({ title, rows, onSaveDate, canEdit }: { title: string; rows: MaterialProgressProjection[]; onSaveDate: (row: MaterialProgressProjection, date: string | null, reset: boolean) => void; canEdit: boolean }) {
  return <Card className="sp-material-section"><div className="sp-section-head"><h2>{title}</h2><span>{rows.filter((item) => item.readinessStatus === "ready").length}/{rows.length} 已齐套</span></div><div className="sp-material-table"><table><thead><tr><th>齐套</th><th>物料 / 颜色</th><th>规格</th><th>计划单耗</th>{title === "面料" && <th>实际用量</th>}<th>需求</th><th>已采购</th><th>已入库</th><th>艾诺科交期</th><th>当前预计到料日</th><th>实际齐套日</th><th>计划开工</th><th>最晚到厂</th><th>推荐运输 / ETA</th><th>异常</th></tr></thead><tbody>{rows.map((item) => <tr key={item.demand.id} data-material-demand-id={item.demand.id}><td><StatusTag tone={item.readinessStatus === "ready" ? "success" : item.readinessStatus === "not_purchased" ? "danger" : "warning"}>{readinessLabels[item.readinessStatus]}</StatusTag><small>{lifecycleLabels[item.lifecycleStatus]}</small></td><td><strong>{item.demand.sourceActualName || item.demand.materialName}</strong><span>{item.demand.materialColor || "—"}</span><small>{item.demand.materialCode}</small></td><td>{item.demand.specification || "—"}</td><td>{quantity(item.demand.plannedConsumption)}</td>{title === "面料" && <td>{quantity(item.demand.actualConsumption)}</td>}<td>{quantity(item.demand.requiredQuantity)}</td><td>{quantity(item.purchasedQuantity)}</td><td>{quantity(item.inboundQuantity)}</td><td>{item.demand.sourceMaterialDueDate ?? "—"}</td><td><div className="sp-date-edit"><input type="date" aria-label={`${item.demand.materialName}当前预计到料日`} disabled={!canEdit} value={item.demand.expectedMaterialReadyDate ?? ""} onInput={(event) => onSaveDate(item, event.currentTarget.value || null, false)} />{item.demand.expectedDateSource === "manual" && <button type="button" disabled={!canEdit} onClick={() => onSaveDate(item, null, true)}>恢复使用艾诺科交期</button>}<small>{item.demand.expectedDateSource === "manual" ? `人工 · 来源 ${item.demand.sourceMaterialDueDate ?? "—"}` : "跟随艾诺科"}</small></div></td><td>{item.actualInboundDate ?? "—"}</td><td>{item.logistics.plannedProductionStartDate ?? "—"}</td><td>{item.logistics.latestRequiredArrivalDate ?? "—"}</td><td><strong>{item.logistics.recommendedMode?.name ?? item.logistics.message}</strong><span>{item.logistics.expectedArrivalDate ?? ""}</span></td><td className={item.logistics.status === "late" || item.logistics.status.endsWith("missing") || item.readinessStatus === "not_purchased" ? "sp-danger" : ""}>{item.readinessStatus === "not_purchased" ? `缺采 ${quantity(item.demand.requiredQuantity)}` : item.logistics.status === "late" || item.logistics.status.endsWith("missing") ? item.logistics.message : "—"}</td></tr>)}</tbody></table></div></Card>;
}

function LogisticsBasisCard({ projection }: { projection: StyleProgressProjection }) {
  const basis = projection.logisticsBasis;
  const plannedStartDate = projection.materials[0]?.logistics.plannedProductionStartDate ?? null;
  const routeLabel = basis.matchedRoute?.name ?? (projection.transportRisk === "pending_schedule" ? "待排单后匹配" : projection.transportRisk === "hub_missing" ? "待设置集货仓后匹配" : projection.transportRisk === "site_missing" ? "待设置生产地点后匹配" : basis.supplyHub && basis.productionSite ? `${basis.supplyHub.name} → ${basis.productionSite.name}路线未配置` : "尚未匹配");
  const modeLabel = basis.candidateTransportModes.length ? basis.candidateTransportModes.map((item) => `${item.name}${item.transitDays}天`).join(" / ") : basis.matchedRoute ? "当前路线未配置运输方式" : "—";
  return <Card className="sp-logistics-basis" data-sales-contract-no={projection.salesContractNo} data-order-id={projection.order?.id ?? ""} data-schedule-assignment-id={basis.scheduleAssignmentId ?? ""} data-supply-hub-id={basis.supplyHub?.id ?? ""} data-production-site-id={basis.productionSite?.id ?? ""} data-supply-route-id={basis.matchedRoute?.id ?? ""}><div className="sp-logistics-basis-title"><strong>物流依据</strong><span>{transportRiskLabels[projection.transportRisk]}</span></div><dl><div><dt>集货仓</dt><dd>{basis.supplyHub?.name ?? "未设置"}</dd></div><div><dt>生产地点</dt><dd>{basis.productionSite?.name ?? "未设置"}</dd></div><div><dt>排单开工</dt><dd>{plannedStartDate ?? "待排单"}</dd></div><div><dt>路线</dt><dd>{routeLabel}</dd></div><div><dt>运输方式</dt><dd>{modeLabel}</dd></div></dl></Card>;
}

function sourceDateFromRaw(rawFields: Record<string, string | number | boolean | null>): string | null {
  const value = Object.entries(rawFields).find(([key]) => key.endsWith(":采购交期"))?.[1];
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? String(value);
}

function MaterialSourceHistory({ projection, data }: { projection: StyleProgressProjection; data: StyleProgressData }) {
  const { can } = usePermissions();
  if (!can("style_progress.view_history")) return null;
  const demandIds = new Set(projection.materials.map((item) => item.demand.id));
  const sourceDates = new Map<string, string[]>();
  for (const snapshot of data.rawSnapshots) {
    if (!snapshot.normalizedDemandId || !demandIds.has(snapshot.normalizedDemandId)) continue;
    const sourceDate = sourceDateFromRaw(snapshot.rawFields);
    if (!sourceDate) continue;
    const dates = sourceDates.get(snapshot.normalizedDemandId) ?? [];
    if (!dates.includes(sourceDate)) sourceDates.set(snapshot.normalizedDemandId, [...dates, sourceDate]);
  }
  const changed = projection.materials.filter((item) => (sourceDates.get(item.demand.id)?.length ?? 0) > 1 || item.demand.expectedDateSource === "manual");
  const batches = data.batches.filter((item) => item.status === "committed").sort((left, right) => (right.committedAt ?? right.createdAt).localeCompare(left.committedAt ?? left.createdAt)).slice(0, 5);
  return <Card className="sp-source-history"><div className="sp-section-head"><h2>来源与跟进历史</h2><span>技术 Trace + 人工 Effective 状态</span></div><p>艾诺科交期保留在 Source；“当前预计到料日”是业务采用值。人工值不会被重导入覆盖，修改与恢复记录在统一 OperationLog。</p>{changed.length > 0 ? <ul>{changed.slice(0, 8).map((item) => { const dates = sourceDates.get(item.demand.id) ?? []; return <li key={item.demand.id}><strong>{item.demand.sourceActualName || item.demand.materialName}</strong><span>来源 {dates.length > 1 ? dates.join(" → ") : item.demand.sourceMaterialDueDate ?? "—"} · 当前 {item.demand.expectedMaterialReadyDate ?? "—"}（{item.demand.expectedDateSource === "manual" ? "人工" : "跟随来源"}）</span></li>; })}</ul> : <p>当前没有来源交期变化或人工覆盖。</p>}<div className="sp-batch-history">{batches.map((batch) => <span key={batch.id}>{batch.fileName} · {batch.committedAt?.slice(0, 10) ?? batch.createdAt.slice(0, 10)} · {batch.fileHash.slice(0, 10)}…</span>)}</div></Card>;
}

export function StyleProgressDetailPage() {
  const router = useRouter(); const params = useSearchParams(); const contract = params.get("contract")?.normalize("NFKC").trim().toLocaleUpperCase() ?? ""; const { currentUser, can } = usePermissions(); const [loaded, setLoaded] = useState<Loaded | null>(null); const [selectedColor, setSelectedColor] = useState("all"); const [error, setError] = useState(""); const [toast, setToast] = useState("");
  const reload = async () => { try { setLoaded(await loadProgress()); } catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取款式进度"); } }; useEffect(() => { Promise.resolve().then(() => void reload()); }, []);
  const projection = loaded?.projections.find((item) => item.salesContractNo === contract) ?? null; const colors = projection?.order?.orderColorLines.map((line) => line.colorName).filter(Boolean) ?? [];
  const visible = (projection?.materials ?? []).filter((item) => selectedColor === "all" || item.demand.garmentColors.includes(selectedColor));
  const saveDate = async (item: MaterialProgressProjection, date: string | null, reset: boolean) => { const before = item.demand.expectedMaterialReadyDate; try { const next = await styleProgressRepository.updateExpectedDate(item.demand.id, date, reset ? "source" : "manual"); await operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "款式进度", entityType: "MaterialDemand", entityId: item.demand.id, action: reset ? "恢复艾诺科交期" : "修改当前预计到料日", beforeData: { orderId: projection?.order?.id, orderNo: projection?.order?.orderNo, orderStyleNo: projection?.styleNo, values: { "当前预计到料日": before, "来源": item.demand.expectedDateSource } }, afterData: { orderId: projection?.order?.id, orderNo: projection?.order?.orderNo, orderStyleNo: projection?.styleNo, values: { "当前预计到料日": next.expectedMaterialReadyDate, "来源": next.expectedDateSource } } })); setToast(reset ? "已恢复使用艾诺科交期" : "当前预计到料日已保存"); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } };
  if (!loaded && !error) return <AppShell title="款式进度详情"><PageContainer><LoadingState label="正在读取物料明细" /></PageContainer></AppShell>;
  if (error) return <AppShell title="款式进度详情"><PageContainer><ErrorState title="读取失败" description={error} onRetry={() => { setError(""); void reload(); }} /></PageContainer></AppShell>;
  if (!projection) return <AppShell title="款式进度详情"><PageContainer className="sp-page"><OrderCenterNavigation /><PageHeader title={contract || "款式进度详情"} back={<Button variant="text" onClick={() => router.push("/order-center/style-progress")}>← 返回款式进度</Button>} /><EmptyState title="当前导入数据未找到该款" description="没有使用虚构数据补齐；请核对销售合同号或导入最新面辅料申购统计。" /></PageContainer></AppShell>;
  return <AppShell title={`${projection.factoryStyleNo || projection.styleNo} · 款式进度`}><PageContainer className="sp-page sp-detail"><OrderCenterNavigation /><PageHeader variant="object" eyebrow="STYLE PROGRESS" title={projection.factoryStyleNo || projection.styleNo} back={<Button variant="text" onClick={() => router.push("/order-center/style-progress")}>← 返回款式进度</Button>} description={<>{projection.salesContractNo} · {projection.brand} · {projection.owner || "未记录跟单人"}</>} status={<StatusTag tone={tone(projection.salesRisk)}>{salesRiskLabels[projection.salesRisk]}</StatusTag>} secondaryActions={projection.order ? <Button variant="secondary" onClick={() => router.push(`/order-center/detail?id=${encodeURIComponent(projection.order!.id)}`)}>查看订单</Button> : <Button variant="secondary" onClick={() => router.push("/ainuoke-sync")}>前往艾诺科同步</Button>} />
    {!projection.order && <AlertBanner tone="warning" title="销售合同尚未形成织序订单">款式进度不会猜测款号或自动创建订单；请在艾诺科同步处理。</AlertBanner>}
    <section className="sp-detail-summary"><Card><span>合同交期</span><strong>{projection.contractDeliveryDate ?? "—"}</strong><small>{projection.daysRemaining === null ? "未记录" : projection.daysRemaining < 0 ? `逾期 ${Math.abs(projection.daysRemaining)} 天` : `剩余 ${projection.daysRemaining} 天`}</small></Card><Card><span>面料齐套</span><strong>{projection.fabricReady}/{projection.fabricTotal}</strong></Card><Card><span>辅料齐套</span><strong>{projection.trimReady}/{projection.trimTotal}</strong></Card><Card><span>总齐套</span><strong>{projection.readinessRate.toFixed(1)}%</strong></Card><Card><span>物料风险</span><strong>{materialRiskLabels[projection.materialRisk]}</strong></Card><Card><span>运输风险</span><strong>{transportRiskLabels[projection.transportRisk]}</strong></Card></section>
    <LogisticsBasisCard projection={projection} />
    <Card className="sp-exceptions"><div><h2>关键异常</h2><span>优先显示 3–5 项</span></div>{projection.keyExceptions.length ? <ol>{projection.keyExceptions.map((item) => <li key={item}>{item}</li>)}</ol> : <p>当前没有关键异常。</p>}</Card>
    {colors.length > 0 && <Card className="sp-color-filter"><strong>成衣颜色</strong><button type="button" className={selectedColor === "all" ? "active" : ""} onClick={() => setSelectedColor("all")}>全部</button>{colors.map((color) => <button type="button" key={color} className={selectedColor === color ? "active" : ""} onClick={() => setSelectedColor(color)}>{color}</button>)}</Card>}
    <MaterialTable title="面料" rows={fabricDisplayOrder(visible)} onSaveDate={(row, date, reset) => void saveDate(row, date, reset)} canEdit={can("style_progress.edit")} /><MaterialTable title="辅料" rows={trimDisplayOrder(visible)} onSaveDate={(row, date, reset) => void saveDate(row, date, reset)} canEdit={can("style_progress.edit")} /><MaterialSourceHistory projection={projection} data={loaded!.data} />{toast && <Toast message={toast} />}
  </PageContainer></AppShell>;
}

export function StyleRiskPage() {
  const router = useRouter(); const [loaded, setLoaded] = useState<Loaded | null>(null); const [tab, setTab] = useState("all"); useEffect(() => { void loadProgress().then(setLoaded); }, []);
  if (!loaded) return <AppShell title="风险预警"><PageContainer><LoadingState label="正在汇总风险" /></PageContainer></AppShell>;
  const tabs = [["overdue", "已逾期"], ["7d", "7天"], ["14d", "14天"], ["30d", "30天"], ["unpurchase", "未采购"], ["inbound", "待入库"], ["transport", "运输风险"], ["all", "全部异常"]];
  const rows = loaded.projections.filter((item) => tab === "all" ? item.salesRisk !== "normal" || item.notPurchasedCount > 0 || item.pendingInboundCount > 0 || item.transportRisk !== "none" : ["overdue", "7d", "14d", "30d"].includes(tab) ? item.salesRisk === tab : tab === "unpurchase" ? item.notPurchasedCount > 0 : tab === "inbound" ? item.pendingInboundCount > 0 : item.transportRisk !== "none");
  return <AppShell title="风险预警"><PageContainer className="sp-page"><OrderCenterNavigation /><PageHeader eyebrow="RISK CENTER" title="风险预警" count={`${rows.length} 款`} description="销售交期、物料和运输风险分维度并存，不用单一状态掩盖原因。" /><nav className="sp-risk-tabs">{tabs.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav><section className="sp-risk-list">{rows.map((row) => <Card key={row.salesContractNo}><header><div><strong>{row.factoryStyleNo || row.styleNo}</strong><span>{row.salesContractNo} · {row.brand}</span></div><StatusTag tone={tone(row.salesRisk)}>{salesRiskLabels[row.salesRisk]}</StatusTag></header><p>未采购 {row.notPurchasedCount} · 待入库 {row.pendingInboundCount} · 运输 {transportRiskLabels[row.transportRisk]}</p><small>{row.keyExceptions[0] ?? "查看完整物料明细"}</small><Button variant="text" onClick={() => router.push(`/order-center/style-progress/detail?contract=${encodeURIComponent(row.salesContractNo)}`)}>查看款式进度</Button></Card>)}</section>{!rows.length && <EmptyState title="当前筛选没有风险记录" />}</PageContainer></AppShell>;
}

export function OrderStyleProgressSummary({ order }: { order: SalesOrder }) {
  const router = useRouter(); const [projection, setProjection] = useState<StyleProgressProjection | null>(null); const [drawer, setDrawer] = useState(false);
  useEffect(() => { if (!order.salesContractNo) return; void loadProgress().then((loaded) => setProjection(loaded.projections.find((item) => item.salesContractNo === order.salesContractNo) ?? null)); }, [order.salesContractNo]);
  if (!order.salesContractNo || !projection) return <Card className="sp-order-summary"><EmptyState compact title="尚无面辅料跟进" description={order.salesContractNo ? "请在款式进度导入真实面辅料申购统计。" : "订单尚未绑定销售合同。"} /></Card>;
  return <><Card className="sp-order-summary"><div><strong>面辅料跟进</strong><span>面料 {projection.fabricReady}/{projection.fabricTotal} · 辅料 {projection.trimReady}/{projection.trimTotal} · 总齐套 {projection.readinessRate.toFixed(1)}%</span><small>{projection.notPurchasedCount} 项未采购 · {projection.pendingInboundCount} 项待入库 · {projection.transportRiskCount} 项运输风险</small><em>预计最晚齐料：{projection.expectedLatestMaterialDate ?? "—"}</em></div><div><Button variant="secondary" onClick={() => setDrawer(true)}>展开</Button><Button onClick={() => router.push(`/order-center/style-progress/detail?contract=${encodeURIComponent(projection.salesContractNo)}`)}>进入款式进度</Button></div></Card><Drawer open={drawer} title={`${projection.factoryStyleNo || projection.styleNo} · 面辅料摘要`} description={`${projection.salesContractNo} · 完整编辑请进入款式进度`} onClose={() => setDrawer(false)} footer={<Button onClick={() => router.push(`/order-center/style-progress/detail?contract=${encodeURIComponent(projection.salesContractNo)}`)}>进入款式进度</Button>}><SummaryMetrics rows={[projection]} /><h3>关键异常</h3>{projection.keyExceptions.length ? <ol>{projection.keyExceptions.map((item) => <li key={item}>{item}</li>)}</ol> : <p>当前没有关键异常。</p>}<h3>运输结论</h3><p>{transportRiskLabels[projection.transportRisk]} · 风险物料 {projection.transportRiskCount} 项</p></Drawer></>;
}
