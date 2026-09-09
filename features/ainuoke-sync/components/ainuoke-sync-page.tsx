"use client";

import { useEffect, useState } from "react";
import { AlertBanner, AppShell, Button, Card, EmptyState, ErrorState, LoadingState, Modal, PageContainer, PageHeader, StatusTag, Toast } from "@/components/foundation";
import { ainuokeBridgeClient, type AinuokeReportKey, type AinuokeReportSnapshot } from "@/features/ainuoke-api";
import { loadBasicSettings } from "@/features/basic-settings/repository/basic-settings-repository";
import { closingRepository } from "@/features/closing-center/repository/closing-repository";
import { operationLogRepository } from "@/features/operation-logs";
import { operationsSettingsRepository } from "@/features/operations-settings/repository/operations-settings-repository";
import type { SalesOrder } from "@/features/order-center/model/order";
import { orderRepository } from "@/features/order-center/repository/order-repository";
import { usePermissions } from "@/features/permissions";
import { productionSchedulingRepository } from "@/features/production-scheduling/repository/production-scheduling-repository";
import { buildAinuokeMaterialApiPreview, commitAinuokeMaterialApiPreview, styleProgressRepository, type AinuokeMaterialApiPreview } from "@/features/style-progress";
import { OrderCenterNavigation } from "@/features/style-progress/components/order-center-navigation";
import type { AinuokeContractMirror, AinuokeImportRun, AinuokeSyncState } from "../model/ainuoke";
import { parseAinuokeWorkbooks } from "../parser/ainuoke-excel-parser";
import { buildHistoricalProductionImport, parseHistoricalClosingWorkbook, parseHistoricalScheduleWorkbook, type HistoricalImportResult } from "../parser/historical-production-parser";
import { ainuokeRepository } from "../repository/ainuoke-repository";
import { buildAinuokeContractApiPreview, commitAinuokeContractApiPreview, type AinuokeContractApiPreview } from "../service/ainuoke-contract-api-sync";
import { commitObsoleteHistoricalReviewCleanup, countObsoleteHistoricalReviews } from "../service/ainuoke-historical-review-cleanup";
import { candidateOrdersForContract, synchronizeAinuokeContracts, type AinuokeSyncResult } from "../service/ainuoke-sync-service";
import { stableSourceHash } from "../source/ainuoke-contract-source";

type SourceMode = "api" | "excel";

const dispositionLabels = { synced: "已同步", auto_bound: "自动绑定", recommended: "建议确认", review_required: "待人工确认", auto_created: "自动建单", blocked: "数据阻断" } as const;
const dispositionTone = (value: AinuokeContractMirror["lastDisposition"]) => value === "blocked" ? "danger" : value === "review_required" || value === "recommended" ? "warning" : value ? "success" : "neutral";
const emptyState: AinuokeSyncState = { contracts: [], reviews: [], importRuns: [] };

export function AinuokeSyncPage() {
  const { currentUser, can } = usePermissions();
  const [state, setState] = useState<AinuokeSyncState>(emptyState);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [sourceMode, setSourceMode] = useState<SourceMode>("api");
  const [insideOrderNo, setInsideOrderNo] = useState("D1935");
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [colorFile, setColorFile] = useState<File | null>(null);
  const [scheduleFile, setScheduleFile] = useState<File | null>(null);
  const [closingFile, setClosingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AinuokeSyncResult | null>(null);
  const [apiPreview, setApiPreview] = useState<AinuokeContractApiPreview | null>(null);
  const [materialApiPreview, setMaterialApiPreview] = useState<AinuokeMaterialApiPreview | null>(null);
  const [historicalPreview, setHistoricalPreview] = useState<HistoricalImportResult | null>(null);
  const [previewContracts, setPreviewContracts] = useState<AinuokeContractMirror[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [materialCommitOpen, setMaterialCommitOpen] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextState, nextOrders] = await Promise.all([ainuokeRepository.load(), orderRepository.list()]);
      setState(nextState);
      setOrders(nextOrders);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取艾诺科同步数据");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { Promise.resolve().then(() => void reload()); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const actor = { id: currentUser.id, name: currentUser.name, userId: currentUser.id, userName: currentUser.name };
  const clearPreview = () => { setPreview(null); setApiPreview(null); setMaterialApiPreview(null); setMaterialCommitOpen(false); setHistoricalPreview(null); setPreviewContracts([]); };
  const changeSourceMode = (next: SourceMode) => { clearPreview(); setError(""); setSourceMode(next); };

  const readAllPages = async (reportKey: AinuokeReportKey, query: string): Promise<AinuokeReportSnapshot[]> => {
    return ainuokeBridgeClient.readAllReportPages(currentUser.id, reportKey, { pageSize: 50, maxPages: 100, query: { insideOrderNo: query } });
  };

  const runApiPreview = async () => {
    const query = insideOrderNo.normalize("NFKC").trim();
    if (!can("ainuoke.view")) { setError("缺少 ainuoke.view 权限，不能读取艾诺科 API Source"); return; }
    if (!query) { setError("请输入 InsideOrderNo"); return; }
    setWorking(true);
    setError("");
    clearPreview();
    try {
      const account = await ainuokeBridgeClient.getAccount(currentUser.id);
      if (!account.configured) throw new Error("请先在“我的设置 → 艾诺科账号”绑定个人账号");
      const [contractSnapshots, colorSnapshots] = await Promise.all([
        readAllPages("sales_contracts", query),
        readAllPages("sales_contract_color_sizes", query),
      ]);
      const result = buildAinuokeContractApiPreview({ contractSnapshots, colorSnapshots, state, orders, settings: loadBasicSettings(), actor });
      setApiPreview(result);
      setPreview(result.sync);
      setPreviewContracts(result.sync.state.contracts);
      setToast("艾诺科 API 预检完成，尚未写入正式数据");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "艾诺科 API 预检失败");
    } finally {
      setWorking(false);
    }
  };

  const runMaterialApiPreview = async () => {
    const query = insideOrderNo.normalize("NFKC").trim();
    if (!can("ainuoke.view")) { setError("缺少 ainuoke.view 权限，不能读取艾诺科 API Source"); return; }
    if (!query) { setError("请输入 InsideOrderNo"); return; }
    setWorking(true);
    setError("");
    clearPreview();
    try {
      const account = await ainuokeBridgeClient.getAccount(currentUser.id);
      if (!account.configured) throw new Error("请先在“我的设置 → 艾诺科账号”绑定个人账号");
      const snapshots = await readAllPages("material_purchase_statistics", query);
      const result = buildAinuokeMaterialApiPreview({ snapshots });
      setMaterialApiPreview(result);
      setToast("物料 API 预检完成，尚未写入款式进度");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "物料 API 预检失败");
    } finally {
      setWorking(false);
    }
  };

  const runExcelPreview = async () => {
    if (!salesFile || !colorFile || !scheduleFile || !closingFile) { setError("请同时选择销售合同、分色分码、排单计划和生产预警四份文件"); return; }
    setWorking(true);
    setError("");
    clearPreview();
    try {
      const settings = loadBasicSettings();
      const aliases = settings.brandAliases.filter((item) => item.enabled).map((item) => ({ alias: item.alias, canonicalName: settings.brands.find((brand) => brand.id === item.brandId)?.name ?? item.alias, enabled: item.enabled }));
      const contracts = await parseAinuokeWorkbooks({ salesBuffer: await salesFile.arrayBuffer(), salesFileName: salesFile.name, colorBuffer: await colorFile.arrayBuffer(), colorFileName: colorFile.name, aliases });
      const result = synchronizeAinuokeContracts({ state, contracts, orders, settings, actor });
      const [scheduleRows, closingRows, scheduling, closing, operationsSettings] = await Promise.all([parseHistoricalScheduleWorkbook(await scheduleFile.arrayBuffer(), scheduleFile.name), parseHistoricalClosingWorkbook(await closingFile.arrayBuffer(), closingFile.name), productionSchedulingRepository.load(), closingRepository.load(), Promise.resolve(operationsSettingsRepository.load())]);
      const historical = buildHistoricalProductionImport({ scheduleRows, closingRows, orders: result.orders, scheduling, closing, settings: operationsSettings, actor });
      const reviews = new Map(result.state.reviews.map((item) => [item.id, item]));
      for (const review of historical.reviews) reviews.set(review.id, review);
      setPreviewContracts(contracts);
      setPreview({ ...result, state: { ...result.state, reviews: [...reviews.values()] } });
      setHistoricalPreview(historical);
      setToast("四份真实文件预检完成，尚未写入正式数据");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "预检失败");
    } finally {
      setWorking(false);
    }
  };

  const commitApiPreview = async () => {
    if (!apiPreview || !preview) return;
    setWorking(true);
    setError("");
    try {
      const committed = await commitAinuokeContractApiPreview({
        preview: apiPreview,
        canSync: can("ainuoke.sync"),
        actorName: currentUser.name,
        repositories: { orders: orderRepository, ainuoke: ainuokeRepository, operationLogs: operationLogRepository },
      });
      setState(committed.state);
      setOrders(committed.orders);
      clearPreview();
      setToast(`API 合同同步完成：新增 ${preview.report.autoCreatedCount}，更新 ${preview.report.updatedExistingCount}，绑定 ${preview.report.autoBoundCount}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "API 合同同步失败");
    } finally {
      setWorking(false);
    }
  };

  const commitMaterialApiPreview = async () => {
    if (!materialApiPreview) return;
    setWorking(true);
    setError("");
    try {
      const result = await commitAinuokeMaterialApiPreview({
        preview: materialApiPreview,
        canImport: can("style_progress.import"),
        actor: { userId: currentUser.id, userName: currentUser.name },
        repositories: { styleProgress: styleProgressRepository, operationLogs: operationLogRepository },
      });
      setMaterialCommitOpen(false);
      clearPreview();
      setToast(result.report.duplicateFile
        ? "该 API Snapshot 已导入，本次未新增业务事实"
        : `物料 API 导入完成：新增需求 ${result.report.newDemands}，更新需求 ${result.report.updatedDemands}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "物料 API 导入失败");
      setMaterialCommitOpen(false);
    } finally {
      setWorking(false);
    }
  };

  const commitExcelPreview = async () => {
    if (!preview || !historicalPreview || !salesFile || !colorFile || !scheduleFile || !closingFile || !can("ainuoke.sync")) return;
    setWorking(true);
    setError("");
    try {
      const timestamp = new Date().toISOString();
      const report = preview.report;
      const run: AinuokeImportRun = {
        id: `ainuoke-run-${stableSourceHash([timestamp, salesFile.name, colorFile.name, scheduleFile.name, closingFile.name])}`,
        sourceKind: "excel",
        sourceFiles: [salesFile.name, colorFile.name, scheduleFile.name, closingFile.name],
        sourceHashes: previewContracts.map((item) => item.sourceHash),
        mode: "commit",
        contractsSeen: report.contractsSeen,
        contractsChanged: report.updatedExistingCount + report.autoBoundCount + report.autoCreatedCount,
        colorRowsSeen: previewContracts.reduce((sum, item) => sum + item.colorRows.length, 0),
        mismatchCount: report.mismatchCount,
        autoBoundCount: report.autoBoundCount,
        reviewCount: report.manualReviewCount,
        autoCreatedCount: report.autoCreatedCount,
        duplicatePreventedCount: report.duplicatePreventedCount,
        scheduleCount: historicalPreview.report.scheduleAdded,
        closingCount: historicalPreview.report.closingAdded,
        correctedDateCount: historicalPreview.report.correctedDateCount,
        createdAt: timestamp,
        createdBy: currentUser.name,
      };
      const committedState = { ...preview.state, importRuns: [run, ...preview.state.importRuns] };
      await orderRepository.saveAll(preview.orders);
      operationsSettingsRepository.save(historicalPreview.settings);
      await productionSchedulingRepository.save(historicalPreview.scheduling);
      await closingRepository.save(historicalPreview.closing);
      await ainuokeRepository.save(committedState);
      await operationLogRepository.appendMany(preview.operationLogs);
      setState(committedState);
      setOrders(preview.orders);
      clearPreview();
      setToast(`正式导入完成：订单新增 ${report.autoCreatedCount}，排单 ${historicalPreview.report.scheduleAdded}，关账 ${historicalPreview.report.closingAdded}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "正式同步失败");
    } finally {
      setWorking(false);
    }
  };

  const cleanupHistoricalReviews = async () => {
    setWorking(true);
    setError("");
    try {
      const result = await commitObsoleteHistoricalReviewCleanup({
        canResolveConflicts: can("ainuoke.resolve_conflict"),
        actor: { userId: currentUser.id, userName: currentUser.name },
        repositories: { ainuoke: ainuokeRepository, operationLogs: operationLogRepository },
      });
      setState(result.state);
      clearPreview();
      setCleanupOpen(false);
      setToast(result.totalRemoved > 0 ? `已清理 ${result.totalRemoved} 条旧迁移待确认` : "旧迁移待确认已是 0 条");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "清理旧迁移待确认失败");
    } finally {
      setWorking(false);
    }
  };

  const visibleContracts = preview?.state.contracts ?? state.contracts;
  const visibleReviews = (preview?.state.reviews ?? state.reviews).filter((item) => !item.resolvedAt);
  const obsoleteReviewCounts = countObsoleteHistoricalReviews(state);
  const report = preview?.report;
  const metrics = report ? [
    ["合同", report.contractsSeen], ["校验异常", report.mismatchCount], ["更新既有", report.updatedExistingCount], ["自动绑定", report.autoBoundCount], ["自动建单", report.autoCreatedCount], ["待人工确认", report.manualReviewCount],
  ] : [["镜像合同", state.contracts.length], ["待确认", visibleReviews.length], ["导入批次", state.importRuns.length], ["已绑定", state.contracts.filter((item) => item.boundOrderId).length], ["异常", state.contracts.filter((item) => item.validationStatus !== "valid").length], ["订单总数", orders.length]];

  if (loading) return <AppShell title="艾诺科同步"><PageContainer><LoadingState label="正在读取同步镜像" /></PageContainer></AppShell>;
  return <AppShell title="艾诺科同步"><PageContainer className="as-page"><OrderCenterNavigation />
    <PageHeader eyebrow="AINUOKE ERP SYNC" title="艾诺科同步" count={`${visibleReviews.length} 条待确认`} description="API 与 Excel 只是不同来源；两者共用唯一合同镜像、匹配服务和提交边界。" primaryAction={sourceMode === "api"
      ? <Button permission="ainuoke.view" disabled={working || !insideOrderNo.trim()} onClick={() => void runApiPreview()}>{working ? "处理中…" : "运行 API 预检"}</Button>
      : <Button permission="ainuoke.sync" disabled={working || !salesFile || !colorFile || !scheduleFile || !closingFile} onClick={() => void runExcelPreview()}>{working ? "处理中…" : "运行四文件预检"}</Button>} />
    {error && <ErrorState title="同步处理失败" description={error} onRetry={() => setError("")} />}
    <AlertBanner tone="info" title="Preview-first 数据保护">合同读取与物料预检不会写业务数据。6087050 只有通过预检并由具备 `style_progress.import` 权限的用户在二次确认 Modal 中明确确认，才会写入款式进度；不会修改订单、排单或关账。</AlertBanner>
    {obsoleteReviewCounts.total > 0 && <Card>
      <div className="as-section-head"><h2>旧迁移待确认</h2><span>{obsoleteReviewCounts.total} 条</span></div>
      <section className="as-metrics"><div className="as-metric"><span>排单匹配</span><strong>{obsoleteReviewCounts.scheduleReviews}</strong></div><div className="as-metric"><span>生产/关账匹配</span><strong>{obsoleteReviewCounts.closingReviews}</strong></div></section>
      <p>这些记录来自旧的排单计划 / 生产预警历史迁移。清理只删除尚未处理的匹配任务，不会删除已经导入的订单、排单、关账或同步批次。</p>
      <div className="as-actions"><Button variant="danger" permission="ainuoke.resolve_conflict" disabled={working} onClick={() => setCleanupOpen(true)}>清理旧迁移待确认</Button></div>
    </Card>}
    <Card>
      <div className="as-section-head"><h2>来源模式</h2><span>固定 API Catalog / 历史 Excel</span></div>
      <div className="as-actions">
        <Button variant={sourceMode === "api" ? "primary" : "secondary"} onClick={() => changeSourceMode("api")}>艾诺科 API</Button>
        <Button variant={sourceMode === "excel" ? "primary" : "secondary"} onClick={() => changeSourceMode("excel")}>Excel / 历史文件</Button>
      </div>
    </Card>
    {sourceMode === "api" ? <>
      <Card>
        <div className="as-section-head"><h2>合同 API Source</h2><span>6086103 + 6086997</span></div>
        <label className="as-upload"><strong>InsideOrderNo</strong><small>使用当前用户的个人艾诺科账号只读查询；不要求排单或生产预警文件。</small><input className="qc-control" value={insideOrderNo} onChange={(event) => { setInsideOrderNo(event.target.value); clearPreview(); }} placeholder="例如 D1935" /></label>
        {apiPreview && <div className="as-actions"><span>预检尚未写入正式数据 · Snapshot {apiPreview.source.snapshotHashes.length} 页</span><Button variant="secondary" onClick={clearPreview}>放弃预检</Button><Button permission="ainuoke.sync" disabled={working || preview?.report.mismatchCount !== 0} onClick={() => void commitApiPreview()}>确认同步合同</Button></div>}
      </Card>
      <Card>
        <div className="as-section-head"><h2>物料 API 预检</h2><span>6087050 · Preview first</span></div>
        <p>当前数据来自艾诺科实时 API Snapshot。历史 Excel 是另一时间点的来源，不参与实时行数校验。</p>
        <div className="as-actions"><Button variant="secondary" permission="ainuoke.view" disabled={working || !insideOrderNo.trim()} onClick={() => void runMaterialApiPreview()}>{working ? "处理中…" : "运行物料 API 预检"}</Button>{materialApiPreview && <><Button variant="secondary" onClick={clearPreview}>放弃物料预检</Button><Button permission="style_progress.import" disabled={working || materialApiPreview.summary.errors.length > 0 || materialApiPreview.summary.sourceIdentityCollisions > 0} onClick={() => setMaterialCommitOpen(true)}>确认导入款式进度</Button></>}</div>
        {materialApiPreview && <>
          <AlertBanner tone="info" title="预检尚未写入款式进度">提交将使用当前预检绑定的 immutable Snapshot，不会静默换源。获取时间 {new Date(materialApiPreview.source.fetchedAt).toLocaleString("zh-CN")} · InsideOrderNo {materialApiPreview.source.query.insideOrderNo} · {materialApiPreview.source.pages.length} 页 · Source {materialApiPreview.source.sourceRowCount} 行 / 实时 total {materialApiPreview.source.reportedTotal}</AlertBanner>
          <section className="as-metrics">
            <div className="as-metric"><span>有效 / 拒绝</span><strong>{materialApiPreview.summary.normalizedRows} / {materialApiPreview.summary.rejectedRows}</strong></div>
            <div className="as-metric"><span>Canonical 物料</span><strong>{materialApiPreview.summary.canonicalMaterialGroups}</strong></div>
            <div className="as-metric"><span>面料 / 辅料</span><strong>{materialApiPreview.summary.fabricGroups} / {materialApiPreview.summary.trimGroups}</strong></div>
            <div className="as-metric"><span>厂供 Source 行</span><strong>{materialApiPreview.summary.vendorSupplySourceRows}</strong></div>
            <div className="as-metric"><span>Operational 物料</span><strong>{materialApiPreview.summary.operationalMaterialGroups}</strong></div>
            <div className="as-metric"><span>需求</span><strong>{materialApiPreview.summary.demands}</strong></div>
            <div className="as-metric"><span>采购 / 入库</span><strong>{materialApiPreview.summary.purchaseEvents} / {materialApiPreview.summary.inboundEvents}</strong></div>
            <div className="as-metric"><span>出运 / 出库</span><strong>{materialApiPreview.summary.shipmentEvents} / {materialApiPreview.summary.outboundEvents}</strong></div>
            <div className="as-metric"><span>需求 / 事件去重</span><strong>{materialApiPreview.summary.duplicateDemandRowsPrevented} / {materialApiPreview.summary.duplicateEventRowsPrevented}</strong></div>
            <div className="as-metric"><span>Source duplicate / collision</span><strong>{materialApiPreview.summary.duplicateSourceRowsPrevented} / {materialApiPreview.summary.sourceIdentityCollisions}</strong></div>
          </section>
          {materialApiPreview.summary.errors.length > 0 && <AlertBanner tone="warning" title={`${materialApiPreview.summary.rejectedRows} 行未通过校验`}>{materialApiPreview.summary.errors.map((issue) => `${issue.message} × ${issue.count}`).join("；")}</AlertBanner>}
          {materialApiPreview.summary.warnings.map((issue) => <AlertBanner key={issue.code} tone="warning" title="字段映射限制">{issue.message}</AlertBanner>)}
        </>}
      </Card>
    </> : <Card><div className="as-upload-grid">
      <label className="as-upload"><strong>1. 销售合同.xlsx</strong><small>读取销售合同号、客户、品牌、款号、工厂款号、数量与合同交期。</small><input aria-label="选择销售合同文件" type="file" accept=".xlsx,.xls" onChange={(event) => { setSalesFile(event.target.files?.[0] ?? null); clearPreview(); }} /><span>{salesFile?.name ?? "尚未选择"}</span></label>
      <label className="as-upload"><strong>2. 成衣分色分码明细.xlsx</strong><small>按销售合同号汇总颜色、尺码、数量和交期，并与合同总量交叉校验。</small><input aria-label="选择分色分码文件" type="file" accept=".xlsx,.xls" onChange={(event) => { setColorFile(event.target.files?.[0] ?? null); clearPreview(); }} /><span>{colorFile?.name ?? "尚未选择"}</span></label>
      <label className="as-upload"><strong>3. 柬凯排单计划.xlsx</strong><small>历史模式才解析排单；API Contract Mode 不触碰排单。</small><input aria-label="选择排单计划文件" type="file" accept=".xlsx,.xls" onChange={(event) => { setScheduleFile(event.target.files?.[0] ?? null); clearPreview(); }} /><span>{scheduleFile?.name ?? "尚未选择"}</span></label>
      <label className="as-upload"><strong>4. 柬埔寨生产预警报表.xlsx</strong><small>历史模式才解析关账；API Contract Mode 不触碰关账。</small><input aria-label="选择生产预警文件" type="file" accept=".xlsx,.xls" onChange={(event) => { setClosingFile(event.target.files?.[0] ?? null); clearPreview(); }} /><span>{closingFile?.name ?? "尚未选择"}</span></label>
    </div>{preview && historicalPreview && <div className="as-actions"><span>预检结果尚未写入正式数据</span><Button variant="secondary" onClick={clearPreview}>放弃预检</Button><Button permission="ainuoke.sync" disabled={working || preview.report.mismatchCount > 0} onClick={() => void commitExcelPreview()}>确认并正式导入四份数据</Button></div>}</Card>}
    <section className="as-metrics">{metrics.map(([label, value]) => <div className="as-metric" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</section>
    {preview && preview.report.mismatchCount > 0 && <AlertBanner tone="danger" title={`${preview.report.mismatchCount} 份合同未通过数量校验`}>合同数量与分色数量不一致；当前预检不能写入正式数据。</AlertBanner>}
    {historicalPreview && <Card><div className="as-section-head"><h2>真实生产数据 Dry Run</h2><span>确定性来源 ID · 可重复执行</span></div><section className="as-metrics"><div className="as-metric"><span>排单源行</span><strong>{historicalPreview.report.scheduleSourceRows}</strong></div><div className="as-metric"><span>排单唯一匹配</span><strong>{historicalPreview.report.scheduleMatched}</strong></div><div className="as-metric"><span>排单待复核</span><strong>{historicalPreview.report.scheduleUnresolved}</strong></div><div className="as-metric"><span>关账源行</span><strong>{historicalPreview.report.closingSourceRows}</strong></div><div className="as-metric"><span>关账唯一匹配</span><strong>{historicalPreview.report.closingMatched}</strong></div><div className="as-metric"><span>关账待复核</span><strong>{historicalPreview.report.closingUnresolved}</strong></div></section><p>本次将新增排单 {historicalPreview.report.scheduleAdded} 条、历史关账 {historicalPreview.report.closingAdded} 条；未唯一匹配的数据不会落库。</p></Card>}
    {preview && <Card><div className="as-section-head"><h2>本次预检自动处理结果</h2><span>预检尚未写入正式数据</span></div>
      {visibleContracts.length ? <div className="as-table-wrap"><table className="as-table"><thead><tr><th>销售合同号</th><th>款号 / 工厂款号</th><th>品牌 / 客户</th><th>合同数量</th><th>分色数量</th><th>数量差异</th><th>颜色数</th><th>合同交期</th><th>校验</th><th>匹配结果</th><th>候选</th></tr></thead><tbody>{visibleContracts.slice(0, 500).map((contract) => { const candidates = candidateOrdersForContract(contract, orders); return <tr key={contract.salesContractNo}><td><strong>{contract.salesContractNo}</strong></td><td><strong>{contract.styleNoRaw}</strong><small>{contract.factoryStyleNo || "无工厂款号"}</small></td><td><strong>{contract.brandNormalized || contract.brandRaw || "—"}</strong><small>{contract.customerName || "—"}</small></td><td>{contract.quantity.toLocaleString("zh-CN")}</td><td>{contract.colorQuantity.toLocaleString("zh-CN")}</td><td>{contract.quantityDifference.toLocaleString("zh-CN")}</td><td>{contract.colorLines.length}</td><td>{contract.contractDeliveryDate ?? "—"}</td><td><StatusTag tone={contract.validationStatus === "valid" ? "success" : "danger"}>{contract.validationStatus}</StatusTag></td><td><StatusTag tone={dispositionTone(contract.lastDisposition)}>{contract.lastDisposition ? dispositionLabels[contract.lastDisposition] : "待预检"}</StatusTag></td><td>{contract.boundOrderId ? "已绑定" : candidates.length ? `${candidates.length} 个` : "无候选"}</td></tr>; })}</tbody></table></div> : <EmptyState title="本次来源没有合同" description="请检查 InsideOrderNo 或来源文件。" />}
    </Card>}
    <Card><div className="as-section-head"><h2>待人工确认</h2><span>{visibleReviews.length} 条</span></div>{visibleReviews.length ? <div className="as-history">{visibleReviews.slice(0, 100).map((review) => <article key={review.id}><div><strong>{review.salesContractNo ?? review.sourceKey}</strong><span>{review.reason}</span></div><StatusTag tone="warning">{review.candidateOrderIds.length} 个候选</StatusTag></article>)}</div> : <EmptyState compact title="没有待确认项" description="高置信度匹配会自动绑定，异常会进入人工队列。" />}</Card>
    <Card><div className="as-section-head"><h2>导入批次</h2><span>最近 {Math.min(10, state.importRuns.length)} 次</span></div>{state.importRuns.length ? <div className="as-history">{state.importRuns.slice(0, 10).map((run) => <article key={run.id}><div><strong>{new Date(run.createdAt).toLocaleString("zh-CN")} · {run.createdBy}</strong><span>{run.sourceKind === "api" ? `API · ${run.query?.insideOrderNo ?? "未记录查询"} · ${(run.reportIds ?? []).join(" + ")}` : run.sourceFiles.join(" + ")}</span></div><span>合同 {run.contractsSeen} · 新建 {run.autoCreatedCount} · 绑定 {run.autoBoundCount} · 待确认 {run.reviewCount}</span></article>)}</div> : <EmptyState compact title="暂无正式导入批次" />}</Card>
    <Modal open={cleanupOpen && obsoleteReviewCounts.total > 0} tone="danger" title="确认清理旧迁移待确认" description="该操作只删除尚未处理的旧历史匹配任务。" onClose={() => setCleanupOpen(false)} footer={<><Button variant="secondary" disabled={working} onClick={() => setCleanupOpen(false)}>取消</Button><Button variant="danger" permission="ainuoke.resolve_conflict" disabled={working} onClick={() => void cleanupHistoricalReviews()}>确认清理旧待确认</Button></>}>
      <div className="qc-modal-form"><strong>即将删除</strong><ul><li>排单待确认：{obsoleteReviewCounts.scheduleReviews}</li><li>生产/关账待确认：{obsoleteReviewCounts.closingReviews}</li><li>合计：{obsoleteReviewCounts.total}</li></ul><strong>不会删除</strong><ul><li>SalesOrder</li><li>已导入排单</li><li>已导入关账</li><li>Ainuoke 合同镜像</li><li>ImportRun</li></ul></div>
    </Modal>
    <Modal open={materialCommitOpen && Boolean(materialApiPreview)} tone="danger" title="确认导入款式进度" description="该操作会把当前 6087050 Preview 通过现有 Material commitImport 写入 Style Progress。" onClose={() => setMaterialCommitOpen(false)} footer={<><Button variant="secondary" disabled={working} onClick={() => setMaterialCommitOpen(false)}>取消</Button><Button variant="danger" permission="style_progress.import" disabled={working || !materialApiPreview} onClick={() => void commitMaterialApiPreview()}>{working ? "导入中…" : "确认导入款式进度"}</Button></>}>
      {materialApiPreview && <div className="qc-modal-form"><strong>当前绑定 Snapshot</strong><ul><li>InsideOrderNo：{materialApiPreview.source.query.insideOrderNo}</li><li>获取时间：{new Date(materialApiPreview.source.fetchedAt).toLocaleString("zh-CN")}</li><li>Source rows：{materialApiPreview.source.sourceRowCount}</li><li>Canonical groups：{materialApiPreview.summary.canonicalMaterialGroups}</li><li>Demands：{materialApiPreview.summary.demands}</li><li>Purchase / Inbound / Shipment / Outbound：{materialApiPreview.summary.purchaseEvents} / {materialApiPreview.summary.inboundEvents} / {materialApiPreview.summary.shipmentEvents} / {materialApiPreview.summary.outboundEvents}</li><li>厂供 Source rows：{materialApiPreview.summary.vendorSupplySourceRows}</li></ul><strong>本次将写入</strong><ul><li>Style Progress MaterialImportBatch、Raw Trace、Demand 与 Events</li><li>现有 Expected Arrival reconciliation</li><li>一条不含密钥的 OperationLog（重复 Snapshot 不新增）</li></ul><strong>不会修改</strong><ul><li>SalesOrder</li><li>Scheduling</li><li>Closing</li></ul></div>}
    </Modal>
    <Toast message={toast} />
  </PageContainer></AppShell>;
}
