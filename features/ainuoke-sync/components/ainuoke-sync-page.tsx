"use client";

import { useEffect, useState } from "react";
import { AlertBanner, AppShell, Button, Card, EmptyState, ErrorState, LoadingState, PageContainer, PageHeader, StatusTag, Toast } from "@/components/foundation";
import { loadBasicSettings } from "@/features/basic-settings/repository/basic-settings-repository";
import { operationLogRepository } from "@/features/operation-logs";
import { closingRepository } from "@/features/closing-center/repository/closing-repository";
import { operationsSettingsRepository } from "@/features/operations-settings/repository/operations-settings-repository";
import { orderRepository } from "@/features/order-center/repository/order-repository";
import { productionSchedulingRepository } from "@/features/production-scheduling/repository/production-scheduling-repository";
import type { SalesOrder } from "@/features/order-center/model/order";
import { usePermissions } from "@/features/permissions";
import { parseAinuokeWorkbooks, stableSourceHash } from "../parser/ainuoke-excel-parser";
import { buildHistoricalProductionImport, parseHistoricalClosingWorkbook, parseHistoricalScheduleWorkbook, type HistoricalImportResult } from "../parser/historical-production-parser";
import { ainuokeRepository } from "../repository/ainuoke-repository";
import { candidateOrdersForContract, synchronizeAinuokeContracts, type AinuokeSyncResult } from "../service/ainuoke-sync-service";
import type { AinuokeContractMirror, AinuokeImportRun, AinuokeSyncState } from "../model/ainuoke";

const dispositionLabels = { synced: "已同步", auto_bound: "自动绑定", recommended: "建议确认", review_required: "待人工确认", auto_created: "自动建单", blocked: "数据阻断" } as const;
const dispositionTone = (value: AinuokeContractMirror["lastDisposition"]) => value === "blocked" ? "danger" : value === "review_required" || value === "recommended" ? "warning" : value ? "success" : "neutral";
const emptyState: AinuokeSyncState = { contracts: [], reviews: [], importRuns: [] };

export function AinuokeSyncPage() {
  const { currentUser, can } = usePermissions();
  const [state, setState] = useState<AinuokeSyncState>(emptyState);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [colorFile, setColorFile] = useState<File | null>(null);
  const [scheduleFile, setScheduleFile] = useState<File | null>(null);
  const [closingFile, setClosingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AinuokeSyncResult | null>(null);
  const [historicalPreview, setHistoricalPreview] = useState<HistoricalImportResult | null>(null);
  const [previewContracts, setPreviewContracts] = useState<AinuokeContractMirror[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const reload = async () => {
    setLoading(true); setError("");
    try { const [nextState, nextOrders] = await Promise.all([ainuokeRepository.load(), orderRepository.list()]); setState(nextState); setOrders(nextOrders); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取艾诺科同步数据"); }
    finally { setLoading(false); }
  };
  useEffect(() => { Promise.resolve().then(() => void reload()); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const actor = { id: currentUser.id, name: currentUser.name, userId: currentUser.id, userName: currentUser.name };
  const runPreview = async () => {
    if (!salesFile || !colorFile || !scheduleFile || !closingFile) { setError("请同时选择销售合同、分色分码、排单计划和生产预警四份文件"); return; }
    setWorking(true); setError(""); setPreview(null); setHistoricalPreview(null);
    try {
      const settings = loadBasicSettings();
      const aliases = settings.brandAliases.filter((item) => item.enabled).map((item) => ({ alias: item.alias, canonicalName: settings.brands.find((brand) => brand.id === item.brandId)?.name ?? item.alias, enabled: item.enabled }));
      const contracts = await parseAinuokeWorkbooks({ salesBuffer: await salesFile.arrayBuffer(), salesFileName: salesFile.name, colorBuffer: await colorFile.arrayBuffer(), colorFileName: colorFile.name, aliases });
      const result = synchronizeAinuokeContracts({ state, contracts, orders, settings, actor });
      const [scheduleRows, closingRows, scheduling, closing, operationsSettings] = await Promise.all([parseHistoricalScheduleWorkbook(await scheduleFile.arrayBuffer(), scheduleFile.name), parseHistoricalClosingWorkbook(await closingFile.arrayBuffer(), closingFile.name), productionSchedulingRepository.load(), closingRepository.load(), Promise.resolve(operationsSettingsRepository.load())]);
      const historical = buildHistoricalProductionImport({ scheduleRows, closingRows, orders: result.orders, scheduling, closing, settings: operationsSettings, actor });
      const reviews = new Map(result.state.reviews.map((item) => [item.id, item])); for (const review of historical.reviews) reviews.set(review.id, review);
      setPreviewContracts(contracts); setPreview({ ...result, state: { ...result.state, reviews: [...reviews.values()] } }); setHistoricalPreview(historical); setToast("四份真实文件预检完成，尚未写入正式数据");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "预检失败"); }
    finally { setWorking(false); }
  };

  const commit = async () => {
    if (!preview || !historicalPreview || !salesFile || !colorFile || !scheduleFile || !closingFile || !can("ainuoke.sync")) return;
    setWorking(true); setError("");
    try {
      const timestamp = new Date().toISOString();
      const report = preview.report;
      const run: AinuokeImportRun = {
        id: `ainuoke-run-${stableSourceHash([timestamp, salesFile.name, colorFile.name, scheduleFile.name, closingFile.name])}`,
        sourceFiles: [salesFile.name, colorFile.name, scheduleFile.name, closingFile.name], sourceHashes: previewContracts.map((item) => item.sourceHash), mode: "commit",
        contractsSeen: report.contractsSeen, contractsChanged: report.updatedExistingCount + report.autoBoundCount + report.autoCreatedCount,
        colorRowsSeen: previewContracts.reduce((sum, item) => sum + item.colorRows.length, 0), mismatchCount: report.mismatchCount,
        autoBoundCount: report.autoBoundCount, reviewCount: report.manualReviewCount, autoCreatedCount: report.autoCreatedCount,
        duplicatePreventedCount: report.duplicatePreventedCount, scheduleCount: historicalPreview.report.scheduleAdded, closingCount: historicalPreview.report.closingAdded, correctedDateCount: historicalPreview.report.correctedDateCount,
        createdAt: timestamp, createdBy: currentUser.name,
      };
      const committedState = { ...preview.state, importRuns: [run, ...preview.state.importRuns] };
      await orderRepository.saveAll(preview.orders);
      operationsSettingsRepository.save(historicalPreview.settings);
      await productionSchedulingRepository.save(historicalPreview.scheduling);
      await closingRepository.save(historicalPreview.closing);
      await ainuokeRepository.save(committedState);
      await operationLogRepository.appendMany(preview.operationLogs);
      setState(committedState); setOrders(preview.orders); setPreview(null); setHistoricalPreview(null); setPreviewContracts([]);
      setToast(`正式导入完成：订单新增 ${report.autoCreatedCount}，排单 ${historicalPreview.report.scheduleAdded}，关账 ${historicalPreview.report.closingAdded}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "正式同步失败"); }
    finally { setWorking(false); }
  };

  const visibleContracts = preview?.state.contracts ?? state.contracts;
  const visibleReviews = (preview?.state.reviews ?? state.reviews).filter((item) => !item.resolvedAt);
  const report = preview?.report;
  const metrics = report ? [
    ["合同", report.contractsSeen], ["校验异常", report.mismatchCount], ["更新既有", report.updatedExistingCount], ["自动绑定", report.autoBoundCount], ["自动建单", report.autoCreatedCount], ["待人工确认", report.manualReviewCount],
  ] : [["镜像合同", state.contracts.length], ["待确认", visibleReviews.length], ["导入批次", state.importRuns.length], ["已绑定", state.contracts.filter((item) => item.boundOrderId).length], ["异常", state.contracts.filter((item) => item.validationStatus !== "valid").length], ["订单总数", orders.length]];

  if (loading) return <AppShell title="艾诺科同步"><PageContainer><LoadingState label="正在读取同步镜像" /></PageContainer></AppShell>;
  return <AppShell title="艾诺科同步"><PageContainer className="as-page">
    <PageHeader eyebrow="AINUOKE ERP SYNC" title="艾诺科同步" count={`${visibleReviews.length} 条待确认`} description="自动创建与自动绑定在后台完成；此页集中处理真正需要人工判断的同步异常。" primaryAction={<Button permission="ainuoke.sync" disabled={working || !salesFile || !colorFile || !scheduleFile || !closingFile} onClick={() => void runPreview()}>{working ? "处理中…" : "运行四文件预检"}</Button>} />
    {error && <ErrorState title="同步处理失败" description={error} onRetry={() => setError("")} />}
    <AlertBanner tone="info" title="正式数据保护已启用">系统会自动防重、创建或绑定订单；只有多候选、无可靠归属或源数据异常才进入人工确认。预检不会改动订单。</AlertBanner>
    <Card><div className="as-upload-grid">
      <label className="as-upload"><strong>1. 销售合同.xlsx</strong><small>读取销售合同号、客户、品牌、款号、工厂款号、数量与合同交期。</small><input aria-label="选择销售合同文件" type="file" accept=".xlsx,.xls" onChange={(event) => { setSalesFile(event.target.files?.[0] ?? null); setPreview(null); }} /><span>{salesFile?.name ?? "尚未选择"}</span></label>
      <label className="as-upload"><strong>2. 成衣分色分码明细.xlsx</strong><small>按销售合同号汇总颜色、尺码、数量和交期，并与合同总量交叉校验。</small><input aria-label="选择分色分码文件" type="file" accept=".xlsx,.xls" onChange={(event) => { setColorFile(event.target.files?.[0] ?? null); setPreview(null); }} /><span>{colorFile?.name ?? "尚未选择"}</span></label>
      <label className="as-upload"><strong>3. 柬凯排单计划.xlsx</strong><small>主计划按生产组解析，艺丰、锦新、PT 按真实外发厂解析；不唯一匹配进入复核。</small><input aria-label="选择排单计划文件" type="file" accept=".xlsx,.xls" onChange={(event) => { setScheduleFile(event.target.files?.[0] ?? null); setPreview(null); }} /><span>{scheduleFile?.name ?? "尚未选择"}</span></label>
      <label className="as-upload"><strong>4. 柬埔寨生产预警报表.xlsx</strong><small>Sheet 月份作为历史关账月份；加工币种固定 USD，新关账不写汇率。</small><input aria-label="选择生产预警文件" type="file" accept=".xlsx,.xls" onChange={(event) => { setClosingFile(event.target.files?.[0] ?? null); setPreview(null); }} /><span>{closingFile?.name ?? "尚未选择"}</span></label>
    </div>{preview && historicalPreview && <div className="as-actions"><span>预检结果尚未写入正式数据</span><Button variant="secondary" onClick={() => { setPreview(null); setHistoricalPreview(null); }}>放弃预检</Button><Button permission="ainuoke.sync" disabled={working || preview.report.mismatchCount > 0} onClick={() => void commit()}>确认并正式导入四份数据</Button></div>}</Card>
    <section className="as-metrics">{metrics.map(([label, value]) => <div className="as-metric" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</section>
    {preview && preview.report.mismatchCount > 0 && <AlertBanner tone="danger" title={`${preview.report.mismatchCount} 份合同未通过数量校验`}>请先修正源文件再运行预检；当前批次不能正式写入。</AlertBanner>}
    {historicalPreview && <Card><div className="as-section-head"><h2>真实生产数据 Dry Run</h2><span>确定性来源 ID · 可重复执行</span></div><section className="as-metrics"><div className="as-metric"><span>排单源行</span><strong>{historicalPreview.report.scheduleSourceRows}</strong></div><div className="as-metric"><span>排单唯一匹配</span><strong>{historicalPreview.report.scheduleMatched}</strong></div><div className="as-metric"><span>排单待复核</span><strong>{historicalPreview.report.scheduleUnresolved}</strong></div><div className="as-metric"><span>关账源行</span><strong>{historicalPreview.report.closingSourceRows}</strong></div><div className="as-metric"><span>关账唯一匹配</span><strong>{historicalPreview.report.closingMatched}</strong></div><div className="as-metric"><span>关账待复核</span><strong>{historicalPreview.report.closingUnresolved}</strong></div></section><p>本次将新增排单 {historicalPreview.report.scheduleAdded} 条、历史关账 {historicalPreview.report.closingAdded} 条，撤销无销售合同的历史排单 {historicalPreview.report.scheduleInvalidExistingRemoved} 条、历史关账 {historicalPreview.report.closingInvalidExistingRemoved} 条，修正跨年日期 {historicalPreview.report.correctedDateCount} 条；未唯一匹配的数据不会落库。</p></Card>}
    {preview && <Card><div className="as-section-head"><h2>本次预检自动处理结果</h2><span>提交前检查</span></div>
      {visibleContracts.length ? <div className="as-table-wrap"><table className="as-table"><thead><tr><th>销售合同号</th><th>款号</th><th>品牌 / 客户</th><th>合同数量</th><th>分色数量</th><th>交期</th><th>匹配结果</th><th>候选</th></tr></thead><tbody>{visibleContracts.slice(0, 500).map((contract) => { const candidates = candidateOrdersForContract(contract, orders); return <tr key={contract.salesContractNo}><td><strong>{contract.salesContractNo}</strong><small>{contract.factoryStyleNo || "无工厂款号"}</small></td><td><strong>{contract.styleNoRaw}</strong><small>{contract.baseStyleKey}</small></td><td><strong>{contract.brandNormalized || contract.brandRaw || "—"}</strong><small>{contract.customerName || "—"}</small></td><td>{contract.quantity.toLocaleString("zh-CN")}</td><td>{contract.colorQuantity.toLocaleString("zh-CN")}<small>{contract.colorLines.length} 色</small></td><td>{contract.contractDeliveryDate ?? "—"}</td><td><StatusTag tone={dispositionTone(contract.lastDisposition)}>{contract.lastDisposition ? dispositionLabels[contract.lastDisposition] : contract.validationStatus === "valid" ? "待预检" : "校验异常"}</StatusTag></td><td>{contract.boundOrderId ? "已绑定" : candidates.length ? `${candidates.length} 个` : "无候选"}</td></tr>; })}</tbody></table></div> : <EmptyState title="尚无艾诺科合同镜像" description="选择两份来源文件并运行预检。" />}
    </Card>}
    <Card><div className="as-section-head"><h2>待人工确认</h2><span>{visibleReviews.length} 条</span></div>{visibleReviews.length ? <div className="as-history">{visibleReviews.slice(0, 100).map((review) => <article key={review.id}><div><strong>{review.salesContractNo ?? review.sourceKey}</strong><span>{review.reason}</span></div><StatusTag tone="warning">{review.candidateOrderIds.length} 个候选</StatusTag></article>)}</div> : <EmptyState compact title="没有待确认项" description="高置信度匹配会自动绑定，异常会在此处进入人工队列。" />}</Card>
    <Card><div className="as-section-head"><h2>导入批次</h2><span>最近 {Math.min(10, state.importRuns.length)} 次</span></div>{state.importRuns.length ? <div className="as-history">{state.importRuns.slice(0, 10).map((run) => <article key={run.id}><div><strong>{new Date(run.createdAt).toLocaleString("zh-CN")} · {run.createdBy}</strong><span>{run.sourceFiles.join(" + ")}</span></div><span>合同 {run.contractsSeen} · 新建 {run.autoCreatedCount} · 绑定 {run.autoBoundCount} · 待确认 {run.reviewCount}</span></article>)}</div> : <EmptyState compact title="暂无正式导入批次" />}</Card>
    <Toast message={toast} />
  </PageContainer></AppShell>;
}
