"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AppShell,
  Button,
  Card,
  ContextSummary,
  FormItem,
  FormSection,
  FormShell,
  Modal,
  NullableNumberInput,
  PageContainer,
  PageHeader,
  SaveBar,
  Toast,
} from "@/components/foundation";
import {
  createFabricCostLineFromLibrary,
  createTrimCostLineFromLibrary,
  defaultOtherCostLine,
  defaultBasicSettings,
  fabricLibraryItemFromCostLine,
  resolveQuoteDefaults,
  supplierSuggestions,
  trimLibraryItemFromCostLine,
  upsertFabricLibraryItem,
  upsertTrimLibraryItem,
  customerSalespeopleForBrand,
  type BasicSettingsState,
} from "../../basic-settings/model/basic-settings";
import {
  createMasterDataId,
  loadBasicSettings,
  saveBasicSettings,
} from "../../basic-settings/repository/basic-settings-repository";
import { copyPriceVersion, costLineAmount } from "../model/quote-calculations";
import {
  createEmptyOtherCostLine,
  createEmptyFabricCostLine,
  createEmptyTrimCostLine,
  createNavigationIntent,
  parseNumberDraft,
  patchStableRow,
} from "../model/quote-editor-state";
import { applyCustomerConfirmation, confirmationAggregateStatus, confirmationSummaryLabel, createRevisionFromSnapshot, removePriceVersion, summarizeRevisionConfirmations } from "../model/quote-workflows";
import { nullablePriceVersionMetrics } from "../model/quote-presentation";
import { formatFinalGarmentPrice } from "../model/final-quote-format";
import { quoteReferencesAttachment } from "../model/quote-attachments";
import { focusQuoteValidationIssue, validateCustomerConfirmation, validateQuoteCreation, validateRevisionUpdate, type QuoteValidationIssue } from "../model/quote-validation";
import { loadGlobalQuoteSettings } from "../model/quote-settings";
import {
  applyCostSyncDecisions,
  createCostSyncCandidates,
  detectUnconfirmedCostDifferences,
  ensurePriceVersionLineGroups,
  type CostSyncCandidate,
  type CostSyncDecision,
} from "../model/price-version-cost-sync";
import {
  BASE_PRICE_VERSION_NAME,
  getDefaultRevision,
  normalizeSinglePriceVersionName,
  type FabricCostLine,
  type OtherCostLine,
  type PriceVersion,
  type Quote,
  type QuoteRevision,
  type QuoteRevisionReason,
  type TrimCostLine,
} from "../model/quote-view-model";
import { mockQuoteRepository } from "../repository/mock-quote-repository";
import { indexedDbAttachmentRepository } from "../repository/indexeddb-attachment-repository";
import { CostTable, FabricCostTable, TrimCostTable } from "./cost-table";
import { PriceVersionSelector } from "./price-version-selector";
import { QuoteBaseInfo } from "./quote-base-info";
import { QuoteMetrics } from "./quote-metrics";
import { QuotePricingSettings } from "./quote-pricing-settings";
import { QuoteExportModal, type QuoteExportGuardMode, type QuoteExportScope } from "./quote-export-modal";
import { RevisionManagerModal } from "./revision-manager-modal";
import { ValidationSummary } from "./validation-summary";
import { QuoteAttachmentPanel, revisionLegacyStyleReference, useAttachmentAsset } from "./attachment-panel";
import { QuoteQuickNavigation, type QuoteQuickNavigationItem } from "./quote-quick-navigation";
import { QuoteActionBar, type QuoteActionBarMode, type QuoteActionDescriptor } from "./quote-action-bar";
import { activateEstimateCost, createEstimateCostFromRevision, ignoreEstimateCostForCurrentRevision, restoreHistoricalEstimateCost } from "../model/estimate-cost";
import type { EstimateCost } from "../model/quote-view-model";
import { usePermissions } from "@/features/permissions";
import { assignOperationMetadata, createOperationId, createOperationLogDraft, createQuoteDeletionLog, createQuoteOperationLogs, operationLogRepository, type OperationLogDraft } from "@/features/operation-logs";
import { OperationLogModal } from "@/features/operation-logs/components/operation-log-modal";
import { QuickMasterDataCreate, type QuickMasterDataRequest } from "@/features/basic-settings/components/quick-master-data-create";
import { PriceVersionCostSyncModal, PriceVersionDifferencesModal } from "./price-version-cost-sync-modal";
import { orderRepository } from "@/features/order-center";
import { QuoteToOrderModal } from "@/features/order-center/components/quote-to-order-modal";

type VersionModalState = { mode: "copy" | "edit"; sourceId: string } | null;
type MasterSwitchIntent = { kind: "brand" | "salesperson"; value: string; label: string } | null;
type PersistIntent = "save" | "navigate" | "export";
type PriceSyncRequest = { candidates: CostSyncCandidate[]; intent: PersistIntent } | null;

function versionId() {
  return `price-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function quoteRevisionId(quoteId: string) {
  return `${quoteId}-revision-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function costLineId(priceVersionId: string, category: string) {
  return `${priceVersionId}-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function estimateId() {
  return `estimate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function QuoteEditor({ initialQuote, isNew = false }: { initialQuote: Quote; isNew?: boolean }) {
  const router = useRouter();
  const { can, currentUser } = usePermissions();
  const [quote, setQuote] = useState<Quote>(initialQuote);
  const initialRevision = getDefaultRevision(initialQuote);
  const [viewedRevisionId, setViewedRevisionId] = useState(initialRevision.revisionId);
  const [activePriceId, setActivePriceId] = useState(initialRevision.priceVersions[0]?.id || "");
  const [versionModal, setVersionModal] = useState<VersionModalState>(null);
  const [priceVersionDeleteTargetId, setPriceVersionDeleteTargetId] = useState<string | null>(null);
  const [versionDraft, setVersionDraft] = useState({ name: "", quantity: "", description: "" });
  const [versionError, setVersionError] = useState("");
  const [toast, setToast] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [createAttempted, setCreateAttempted] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [masterData, setMasterData] = useState<BasicSettingsState>(defaultBasicSettings);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [headerActionMode, setHeaderActionMode] = useState<QuoteActionBarMode>("compact");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<QuoteExportScope>("all");
  const [exporting, setExporting] = useState(false);
  const [quoteToOrderOpen, setQuoteToOrderOpen] = useState(false);
  const [masterSwitchIntent, setMasterSwitchIntent] = useState<MasterSwitchIntent>(null);
  const [quickMasterRequest, setQuickMasterRequest] = useState<QuickMasterDataRequest | null>(null);
  const titleSentinelRef = useRef<HTMLDivElement>(null);
  const pendingAttachmentDeletesRef = useRef<Set<string>>(new Set());
  const pendingAuditLogsRef = useRef<OperationLogDraft[]>([]);
  const defaultsStateRef = useRef({
    rateTouched: false,
    trimsTouched: false,
    otherTouched: false,
    rateAuto: isNew && initialRevision.priceVersions[0]?.pricingParameters.usdCnyRate !== null,
    trimsAuto: false,
    otherAuto: false,
  });
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationDraft, setConfirmationDraft] = useState({ labor: "", garment: "", note: "" });
  const [confirmationError, setConfirmationError] = useState("");
  const [revisionManagerOpen, setRevisionManagerOpen] = useState(false);
  const [operationLogOpen, setOperationLogOpen] = useState(false);
  const [priceSyncRequest, setPriceSyncRequest] = useState<PriceSyncRequest>(null);
  const [priceDifferencesOpen, setPriceDifferencesOpen] = useState(false);
  const [exportDifferenceWarningOpen, setExportDifferenceWarningOpen] = useState(false);
  const [confirmationValidationIssues, setConfirmationValidationIssues] = useState<QuoteValidationIssue[]>([]);
  const [attachmentPreviewId, setAttachmentPreviewId] = useState<string | null>(null);
  const [pendingEstimateGeneration, setPendingEstimateGeneration] = useState<{ source: QuoteRevision; regenerate: boolean } | null>(null);
  const savedQuoteRef = useRef<Quote | null>(isNew ? null : structuredClone(initialQuote));

  const currentRevision = getDefaultRevision(quote);
  const revision = quote.revisions.find((item) => item.revisionId === viewedRevisionId) ?? currentRevision;
  const isHistorical = revision.revisionId !== quote.defaultRevisionId;
  const activeVersion = revision.priceVersions.find((version) => version.id === activePriceId) ?? revision.priceVersions[0];
  const activePriceDisplayName = revision.priceVersions.length === 1 ? BASE_PRICE_VERSION_NAME : activeVersion?.name;
  const activeProductionLabel = activeVersion?.pricingParameters.manufacturingPresetName || activeVersion?.pricingParameters.manufacturingCountry || "未设置制作国家";
  const liveRevisionValidationIssues = validateRevisionUpdate(revision).issues;
  const metrics = activeVersion ? nullablePriceVersionMetrics(activeVersion) : null;
  const pageTitle = revision.baseInfo.quoteStyleNo.trim() || (isNew ? "新建报价" : "未填写款号");
  const pageSubtitle = revision.baseInfo.styleName.trim() || "未填写款式名称";
  const quoteStatusLabel = {
    draft: "草稿",
    quoting: "报价中",
    partially_confirmed: "部分确认",
    confirmed: "已确认",
  }[quote.aggregateStatus];
  const brandOptions = masterData.brands.filter((brand) => brand.status === "active").map((brand) => ({ value: brand.id, label: brand.name }));
  const salespersonOptions = customerSalespeopleForBrand(masterData, revision.baseInfo.brandId).map((person) => ({ value: person.id, label: person.name }));
  const supplierOptions = supplierSuggestions(masterData);
  const legacyStyleReference = revisionLegacyStyleReference(revision);
  const styleImageAsset = useAttachmentAsset(revision.styleImageAttachmentId, legacyStyleReference);
  const canEditQuote = can("quote.edit");
  const canEditCosts = canEditQuote && can("quote.cost.edit");
  const quoteReadOnly = isHistorical || !canEditQuote;
  const costReadOnly = isHistorical || !canEditCosts;
  const unconfirmedCostDifferences = detectUnconfirmedCostDifferences(revision);

  const updateRevision = (next: QuoteRevision) => {
    if (quoteReadOnly || next.revisionId !== quote.defaultRevisionId) return;
    const confirmationSummary = summarizeRevisionConfirmations(next);
    const normalized = { ...next, confirmationSummary };
    setQuote((current) => ({
      ...current,
      aggregateStatus: confirmationSummary.confirmedCount > 0 || current.aggregateStatus === "confirmed" || current.aggregateStatus === "partially_confirmed" ? confirmationAggregateStatus(confirmationSummary) : current.aggregateStatus,
      revisions: current.revisions.map((item) => item.revisionId === normalized.revisionId ? normalized : item),
    }));
    setIsDirty(true);
  };
  const updateActiveVersion = (updater: (version: PriceVersion) => PriceVersion) => updateRevision({ ...revision, priceVersions: revision.priceVersions.map((version) => version.id === activeVersion.id ? updater(version) : version) });
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const commitEstimateGeneration = (source: QuoteRevision) => {
    const now = new Date().toISOString();
    const estimate = createEstimateCostFromRevision({
      quoteId: quote.id,
      revision: source,
      id: estimateId(),
      generatedAt: now,
      generatedBy: currentRevision.baseInfo.salespersonName || "当前用户",
    });
    setQuote((current) => activateEstimateCost(current, estimate));
    pendingAuditLogsRef.current.push(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "报价中心", entityType: "EstimateCost", entityId: estimate.id, quoteId: quote.id, action: "生成估算成本", afterData: { quoteStyleNo: source.baseInfo.quoteStyleNo, styleName: source.baseInfo.styleName, revisionLabel: source.revisionLabel, laborCurrency: source.priceVersions[0]?.pricingParameters.laborCurrency, values: { "来源报价版本": source.revisionLabel } } }));
    setPendingEstimateGeneration(null);
    setIsDirty(true);
    notify(`已基于报价版本 ${source.revisionLabel} 生成估算成本`);
  };
  const requestEstimateGeneration = (source: QuoteRevision, regenerate: boolean) => {
    if (regenerate && quote.activeEstimateCost) { setRevisionManagerOpen(false); setPendingEstimateGeneration({ source, regenerate }); }
    else commitEstimateGeneration(source);
  };
  const changeEstimate = (estimate: EstimateCost) => {
    setQuote((current) => ({ ...current, activeEstimateCost: estimate }));
    setIsDirty(true);
  };
  const restoreEstimate = (historyId: string) => {
    const restoredId = estimateId();
    setQuote((current) => restoreHistoricalEstimateCost(current, historyId, { id: restoredId, generatedAt: new Date().toISOString(), generatedBy: currentRevision.baseInfo.salespersonName || "当前用户" }));
    pendingAuditLogsRef.current.push(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "报价中心", entityType: "EstimateCost", entityId: restoredId, quoteId: quote.id, action: "恢复历史估算成本", beforeData: { quoteStyleNo: currentRevision.baseInfo.quoteStyleNo, styleName: currentRevision.baseInfo.styleName, revisionLabel: currentRevision.revisionLabel, values: { "历史估算成本": historyId } }, afterData: { quoteStyleNo: currentRevision.baseInfo.quoteStyleNo, styleName: currentRevision.baseInfo.styleName, revisionLabel: currentRevision.revisionLabel, values: { "新估算成本": restoredId } } }));
    setIsDirty(true);
    notify("已从历史记录克隆为新的当前估算成本");
  };

  useEffect(() => {
    if (!isDirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [isDirty]);

  useEffect(() => { Promise.resolve().then(() => setMasterData(loadBasicSettings())); }, []);

  useEffect(() => {
    const target = titleSentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setStickyVisible(!entry.isIntersecting), { rootMargin: "-8px 0px 0px", threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const requestNavigation = (target: string) => {
    const intent = createNavigationIntent(isDirty, target);
    if (intent.pendingTarget) setPendingNavigation(intent.pendingTarget);
    if (intent.navigateTo) router.push(intent.navigateTo);
  };

  const openVersionModal = (mode: "copy" | "edit", source: PriceVersion) => {
    setVersionError("");
    setVersionDraft({
      name: mode === "copy" ? "" : source.name,
      quantity: mode === "copy" || source.quantity === null ? "" : String(source.quantity),
      description: mode === "copy" ? "" : source.description,
    });
    setVersionModal({ mode, sourceId: source.id });
  };

  const submitVersionModal = () => {
    if (!versionModal) return;
    if (!versionDraft.name.trim()) { setVersionError("请填写价格版本名称"); return; }
    const quantity = parseNumberDraft(versionDraft.quantity);
    if (quantity === null) { setVersionError("请填写价格版本数量"); return; }
    const sourceVersions = normalizeSinglePriceVersionName(revision.priceVersions);
    const source = sourceVersions.find((version) => version.id === versionModal.sourceId);
    if (!source) return;
    if (versionModal.mode === "edit") {
      updateRevision({ ...revision, priceVersions: revision.priceVersions.map((version) => version.id === source.id ? { ...version, name: versionDraft.name.trim(), quantity, description: versionDraft.description } : version) });
      notify("价格版本信息已更新");
    } else {
      const creatingSecondVersion = sourceVersions.length === 1;
      const id = versionId();
      // 旧数据只在用户明确执行复制时建立确定关系；绝不按名称猜测关联。
      const linkedSource = ensurePriceVersionLineGroups(source);
      const copied = copyPriceVersion(linkedSource, { id, name: versionDraft.name.trim(), quantity, description: versionDraft.description });
      const priceVersions = [...sourceVersions.map((version) => version.id === linkedSource.id ? linkedSource : version), copied];
      updateRevision({ ...revision, priceVersions, confirmationSummary: summarizeRevisionConfirmations({ priceVersions }) });
      setActivePriceId(id);
      notify(creatingSecondVersion ? "已创建价格版本，基础价格数量保持不变" : "已复制当前价格版本，客户确认结果未复制");
    }
    setVersionModal(null);
  };

  const updateFabricLine = (lineId: string, patch: Partial<FabricCostLine>) => updateActiveVersion((version) => ({ ...version, fabrics: patchStableRow(version.fabrics, lineId, patch) }));
  const changeFabricPurchaseUnit = (lineId: string, purchaseUnit: FabricCostLine["purchaseUnit"]) => {
    const line = activeVersion.fabrics.find((item) => item.id === lineId);
    if (!line || line.purchaseUnit === purchaseUnit) return;
    updateFabricLine(lineId, { purchaseUnit });
    notify("采购单位已改变，请确认对应单价；系统未进行 RMB/kg 与 RMB/m 换算。");
  };
  const updateTrimLine = (lineId: string, patch: Partial<TrimCostLine>) => {
    defaultsStateRef.current.trimsTouched = true;
    defaultsStateRef.current.trimsAuto = false;
    updateActiveVersion((version) => ({ ...version, trims: patchStableRow(version.trims, lineId, patch) }));
  };
  const updateOtherLine = (lineId: string, patch: Partial<OtherCostLine>) => {
    defaultsStateRef.current.otherTouched = true;
    defaultsStateRef.current.otherAuto = false;
    updateActiveVersion((version) => ({
      ...version,
      otherCosts: version.otherCosts.map((line) => {
        if (line.id !== lineId) return line;
        const next = {
          ...line,
          ...patch,
          id: line.id,
          source: line.source === "global" ? "global" as const : "manual" as const,
          overridden: line.source === "global" ? true : line.overridden,
        };
        return { ...next, amount: costLineAmount(next) };
      }),
    }));
  };

  const addFabricLine = () => updateActiveVersion((version) => ({ ...version, fabrics: [...version.fabrics, createEmptyFabricCostLine(costLineId(version.id, "fabric"))] }));
  const addTrimLine = () => {
    defaultsStateRef.current.trimsTouched = true;
    defaultsStateRef.current.trimsAuto = false;
    updateActiveVersion((version) => ({ ...version, trims: [...version.trims, createEmptyTrimCostLine(costLineId(version.id, "trim"))] }));
  };
  const addOtherLine = () => {
    defaultsStateRef.current.otherTouched = true;
    defaultsStateRef.current.otherAuto = false;
    updateActiveVersion((version) => ({ ...version, otherCosts: [...version.otherCosts, createEmptyOtherCostLine(costLineId(version.id, "other"))] }));
  };

  const saveFabricToLibrary = (line: FabricCostLine) => {
    if (!line.name.trim()) { notify("请先填写面料名称"); return; }
    const existing = masterData.fabricLibrary.find((item) => item.id === line.sourceLibraryItemId);
    const id = existing?.id ?? createMasterDataId("fabric");
    const next = saveBasicSettings(upsertFabricLibraryItem(masterData, fabricLibraryItemFromCostLine(line, id, existing)));
    setMasterData(next);
    updateFabricLine(line.id, { sourceLibraryItemId: id });
    notify(existing ? `已更新面料库中的“${line.name.trim()}”` : `“${line.name.trim()}”已存入面料库`);
  };

  const saveTrimToLibrary = (line: TrimCostLine) => {
    if (!line.name.trim()) { notify("请先填写辅料名称"); return; }
    const existing = masterData.trimLibrary.find((item) => item.id === line.sourceLibraryItemId);
    const id = existing?.id ?? createMasterDataId("trim");
    const next = saveBasicSettings(upsertTrimLibraryItem(masterData, trimLibraryItemFromCostLine(line, id, existing)));
    setMasterData(next);
    updateTrimLine(line.id, { sourceLibraryItemId: id });
    notify(existing ? `已更新辅料库中的“${line.name.trim()}”` : `“${line.name.trim()}”已存入辅料库`);
  };

  const flushPendingAttachmentDeletes = async () => {
    const pendingDeletes = [...pendingAttachmentDeletesRef.current];
    await Promise.all(pendingDeletes.map(async (attachmentId) => {
      if (await orderRepository.isAttachmentReferenced(attachmentId)) return;
      await indexedDbAttachmentRepository.delete(attachmentId);
    }));
    pendingAttachmentDeletesRef.current.clear();
  };

  const appendSavedOperationLogs = async (savedQuote: Quote, additionalLogs: OperationLogDraft[] = []) => {
    const operationId = createOperationId();
    const createdAt = new Date().toISOString();
    const logs = assignOperationMetadata([
      ...createQuoteOperationLogs(savedQuoteRef.current, savedQuote, { userId: currentUser.id, userName: currentUser.name }, createdAt, operationId),
      ...pendingAuditLogsRef.current,
      ...additionalLogs,
    ], operationId, createdAt);
    await operationLogRepository.appendMany(logs);
    pendingAuditLogsRef.current = [];
    savedQuoteRef.current = structuredClone(savedQuote);
  };

  const persistQuote = async (targetQuote: Quote, additionalLogs: OperationLogDraft[] = []) => {
    await mockQuoteRepository.save(targetQuote);
    await appendSavedOperationLogs(targetQuote, additionalLogs);
    await flushPendingAttachmentDeletes();
    setIsDirty(false);
    notify("报价草稿已保存");
  };

  const runExcelExport = async (targetQuote: Quote, targetRevision: QuoteRevision) => {
    const selectedPriceVersion = targetRevision.priceVersions.find((version) => version.id === activePriceId) ?? targetRevision.priceVersions[0];
    const priceVersions = exportScope === "all" ? targetRevision.priceVersions : selectedPriceVersion ? [selectedPriceVersion] : [];
    const { exportQuoteRevisionExcel } = await import("../export/quote-excel-exporter");
    const result = await exportQuoteRevisionExcel({
      quote: targetQuote,
      revision: targetRevision,
      priceVersions,
      attachmentRepository: indexedDbAttachmentRepository,
    });
    await operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "报价中心", entityType: "Export", entityId: `${targetQuote.id}:${targetRevision.revisionId}:${result.fileName}`, quoteId: targetQuote.id, action: "导出报价单", afterData: { quoteStyleNo: targetRevision.baseInfo.quoteStyleNo, styleName: targetRevision.baseInfo.styleName, revisionLabel: targetRevision.revisionLabel, laborCurrency: priceVersions[0]?.pricingParameters.laborCurrency, values: { "文件": result.fileName, "价格版本数量": priceVersions.length } } }));
    notify(result.warnings.length ? `${result.fileName} 已导出；${result.warnings.join("；")}` : `${result.fileName} 已导出`);
  };

  const executeExport = async (resolveTarget: () => Promise<{ targetQuote: Quote; targetRevision: QuoteRevision }>) => {
    if (exporting) return false;
    setExporting(true);
    try {
      const { targetQuote, targetRevision } = await resolveTarget();
      await runExcelExport(targetQuote, targetRevision);
      setExportOpen(false);
      return true;
    } catch (error) {
      console.error("Quote Excel export failed", error);
      notify("报价导出失败，请重试。");
      return false;
    } finally {
      setExporting(false);
    }
  };

  const finishPersistIntent = async (intent: PersistIntent, targetQuote: Quote) => {
    if (intent === "navigate") {
      const target = pendingNavigation;
      setPendingNavigation(null);
      if (target) router.push(target);
      return;
    }
    if (intent === "export") {
      const targetRevision = targetQuote.revisions.find((item) => item.revisionId === revision.revisionId) ?? getDefaultRevision(targetQuote);
      await executeExport(async () => ({ targetQuote, targetRevision }));
      if (isNew) router.replace(`/quote-center/detail?id=${encodeURIComponent(targetQuote.id)}`);
      return;
    }
    if (isNew) window.setTimeout(() => router.replace(`/quote-center/detail?id=${encodeURIComponent(targetQuote.id)}`), 350);
  };

  const requestPersist = async (intent: PersistIntent) => {
    if (isNew) {
      const creationValidation = validateQuoteCreation(revision);
      if (!creationValidation.valid) {
        setCreateAttempted(true);
        notify(`还有 ${creationValidation.issues.length} 项创建资料未完成`);
        const first = creationValidation.issues[0];
        if (first?.priceVersionId) setActivePriceId(first.priceVersionId);
        if (first) focusQuoteValidationIssue(first);
        return false;
      }
    }
    const savedRevision = savedQuoteRef.current?.revisions.find((item) => item.revisionId === revision.revisionId);
    const candidates = isHistorical ? [] : createCostSyncCandidates(savedRevision, revision, activeVersion.id);
    if (candidates.length) {
      if (intent === "export") setExportOpen(false);
      setPriceSyncRequest({ candidates, intent });
      return false;
    }
    await persistQuote(quote);
    await finishPersistIntent(intent, quote);
    return true;
  };

  const commitPriceVersionSync = async (decisions: Record<string, CostSyncDecision>) => {
    if (!priceSyncRequest) return;
    const applied = applyCostSyncDecisions(revision, priceSyncRequest.candidates, decisions);
    const finalQuote: Quote = {
      ...quote,
      revisions: quote.revisions.map((item) => item.revisionId === applied.revision.revisionId ? applied.revision : item),
    };
    const affectedNames = applied.revision.priceVersions.filter((version) => applied.affectedPriceVersionIds.includes(version.id)).map((version) => version.name);
    const syncLog = createOperationLogDraft({
      actor: { userId: currentUser.id, userName: currentUser.name },
      module: "报价中心",
      entityType: "PriceVersion",
      entityId: `${applied.revision.revisionId}:cost-sync`,
      quoteId: quote.id,
      action: "同步价格版本成本",
      afterData: {
        quoteStyleNo: applied.revision.baseInfo.quoteStyleNo,
        styleName: applied.revision.baseInfo.styleName,
        revisionLabel: applied.revision.revisionLabel,
        values: { "同步字段": priceSyncRequest.candidates.length, "影响价格版本": affectedNames.join("、") },
      },
    });
    const intent = priceSyncRequest.intent;
    setPriceSyncRequest(null);
    setQuote(finalQuote);
    await persistQuote(finalQuote, [syncLog]);
    await finishPersistIntent(intent, finalQuote);
  };

  const saveCurrentPriceVersionOnly = () => {
    if (!priceSyncRequest) return;
    const decisions = Object.fromEntries(priceSyncRequest.candidates.map((candidate) => [candidate.id, { scope: "current" as const, selectedVersionIds: [candidate.sourcePriceVersionId] }]));
    return commitPriceVersionSync(decisions);
  };

  const save = async () => { await requestPersist("save"); };

  const exportCurrentRevision = () => executeExport(async () => ({ targetQuote: quote, targetRevision: revision }));

  const exportSavedRevision = () => executeExport(async () => {
    const savedQuote = await mockQuoteRepository.getById(quote.id);
    if (!savedQuote) throw new Error("没有找到已保存报价");
    const savedRevision = savedQuote.revisions.find((item) => item.revisionId === revision.revisionId) ?? getDefaultRevision(savedQuote);
    return { targetQuote: savedQuote, targetRevision: savedRevision };
  });

  const saveAndExportRevision = async () => {
    await requestPersist("export");
  };

  const saveAndNavigate = async () => {
    await requestPersist("navigate");
  };

  const discardAndNavigate = () => {
    const target = pendingNavigation;
    setIsDirty(false);
    setPendingNavigation(null);
    if (target) router.push(target);
  };

  const deleteQuote = async () => {
    if (isNew) return;
    await mockQuoteRepository.delete(quote.id);
    await operationLogRepository.append(createQuoteDeletionLog(quote, { userId: currentUser.id, userName: currentUser.name }));
    setDeleteOpen(false);
    setIsDirty(false);
    router.replace("/quote-center");
  };

  const openConfirmation = () => {
    const confirmation = activeVersion.confirmation;
    const preflight = validateCustomerConfirmation(revision, activeVersion, {
      labor: confirmation?.confirmedLaborPrice ?? 0,
      garment: revision.baseInfo.quoteType === "distribution" ? confirmation?.confirmedGarmentPrice ?? 0 : null,
    });
    if (!preflight.valid) {
      setConfirmationValidationIssues(preflight.issues.filter((issue) => !issue.code.startsWith("confirmation.")));
      notify("客户确认前请先完成关键报价资料");
      return;
    }
    setConfirmationValidationIssues([]);
    setConfirmationDraft({
      labor: confirmation?.confirmedLaborPrice === null || confirmation?.confirmedLaborPrice === undefined ? "" : String(confirmation.confirmedLaborPrice),
      garment: confirmation?.confirmedGarmentPrice === null || confirmation?.confirmedGarmentPrice === undefined ? "" : String(confirmation.confirmedGarmentPrice),
      note: confirmation?.note ?? "",
    });
    setConfirmationError("");
    setConfirmationOpen(true);
  };

  const saveConfirmation = async () => {
    const labor = parseNumberDraft(confirmationDraft.labor);
    const garment = parseNumberDraft(confirmationDraft.garment);
    const validation = validateCustomerConfirmation(revision, activeVersion, { labor, garment });
    if (!validation.valid) {
      setConfirmationError(validation.issues.map((issue) => issue.message).join("；"));
      return;
    }
    if (labor === null) return;
    const next = applyCustomerConfirmation(quote, activeVersion.id, labor, revision.baseInfo.quoteType === "distribution" ? garment : null, confirmationDraft.note);
    await mockQuoteRepository.save(next);
    await appendSavedOperationLogs(next);
    await flushPendingAttachmentDeletes();
    setQuote(next);
    setIsDirty(false);
    setConfirmationOpen(false);
    notify(`已保存 ${activePriceDisplayName} 的客户确认`);
  };

  const canUpdateRevision = (source: QuoteRevision) => {
    const validation = validateRevisionUpdate(source);
    if (!validation.valid) {
      notify("更新报价版本前请先完成关键资料");
      return false;
    }
    return true;
  };

  const createRevision = async (source: QuoteRevision, reason: QuoteRevisionReason, note: string) => {
    const next = createRevisionFromSnapshot(quote, {
      sourceRevisionId: source.revisionId,
      reason,
      note,
      createdBy: source.baseInfo.salespersonName || "当前用户",
      nowIso: new Date().toISOString(),
      revisionId: quoteRevisionId(quote.id),
    });
    await mockQuoteRepository.save(next);
    await appendSavedOperationLogs(next);
    await flushPendingAttachmentDeletes();
    setQuote(next);
    const newCurrent = getDefaultRevision(next);
    setViewedRevisionId(newCurrent.revisionId);
    setActivePriceId(newCurrent.priceVersions[0]?.id ?? "");
    setIsDirty(false);
    setRevisionManagerOpen(false);
    notify(`已创建 ${newCurrent.revisionLabel} 完整报价快照，客户确认已重置`);
  };

  const requestDeletePriceVersion = (priceVersionId: string) => {
    if (revision.priceVersions.length <= 1) {
      notify("当前报价至少需要保留一个价格版本，不能删除最后一个价格版本。");
      return;
    }
    setPriceVersionDeleteTargetId(priceVersionId);
  };

  const confirmDeletePriceVersion = () => {
    if (!priceVersionDeleteTargetId) return;
    const remaining = revision.priceVersions.filter((version) => version.id !== priceVersionDeleteTargetId);
    const nextRevision = removePriceVersion(revision, priceVersionDeleteTargetId);
    updateRevision(nextRevision);
    if (activePriceId === priceVersionDeleteTargetId) setActivePriceId(remaining[0]?.id ?? "");
    setPriceVersionDeleteTargetId(null);
    setVersionModal(null);
    notify("价格版本已删除，总数量与客户确认汇总已同步更新");
  };

  const hasUserDefaultData = () => Boolean(
    (activeVersion.trims.length && !defaultsStateRef.current.trimsAuto)
    || (activeVersion.otherCosts.some((line) => line.source !== "global" || line.overridden) && !defaultsStateRef.current.otherAuto),
  );

  const performMasterSwitch = (intent: Exclude<MasterSwitchIntent, null>, mode: "keep" | "apply", sourceState = masterData) => {
    const brandId = intent.kind === "brand" ? intent.value : revision.baseInfo.brandId;
    const salespersonId = intent.kind === "brand" ? "" : intent.value;
    const baseInfo = intent.kind === "brand"
      ? { ...revision.baseInfo, brandId, brandName: intent.label, salespersonId: "", salespersonName: "" }
      : { ...revision.baseInfo, salespersonId, salespersonName: intent.label };
    let next: QuoteRevision = { ...revision, baseInfo };

    if (mode === "apply") {
      const systemSettings = loadGlobalQuoteSettings();
      const defaults = resolveQuoteDefaults(sourceState, brandId, salespersonId, {
        usdCnyRate: systemSettings.defaultUsdCnyRate,
        defaultOtherCost: systemSettings.defaultOtherCost,
      });
      next = {
        ...next,
        priceVersions: next.priceVersions.map((version) => version.id !== activeVersion.id ? version : ({
          ...version,
          pricingParameters: { ...version.pricingParameters, usdCnyRate: defaults.usdCnyRate },
          trims: defaults.trims.map((line) => ({ ...line, id: createMasterDataId(`${version.id}-default-trim`) })),
          otherCosts: defaults.otherCost ? [defaultOtherCostLine(createMasterDataId(`${version.id}-default-other`), defaults.otherCost)] : [],
        })),
      };
      defaultsStateRef.current = { rateTouched: false, trimsTouched: false, otherTouched: false, rateAuto: defaults.usdCnyRate !== null, trimsAuto: defaults.trims.length > 0, otherAuto: defaults.otherCost !== null };
      const rateText = defaults.usdCnyRate === null ? "汇率未设置" : `汇率 ${defaults.usdCnyRate}`;
      const otherText = defaults.otherCost?.amount === null || defaults.otherCost?.amount === undefined ? "无默认其他费用" : `${defaults.otherCost.name} ¥${defaults.otherCost.amount.toFixed(2)}`;
      notify(`已应用 ${defaults.sourceLabel} 的默认报价资料：${defaults.trims.length} 条辅料 · ${rateText} · ${otherText}`);
    } else {
      notify(`已切换${intent.kind === "brand" ? "品牌" : "客户业务员"}，当前报价资料已保留`);
    }

    updateRevision(next);
    setMasterSwitchIntent(null);
  };

  const requestBrandChange = (value: string, option: { label: string }, sourceState = masterData) => {
    if (value === revision.baseInfo.brandId) return;
    const intent: Exclude<MasterSwitchIntent, null> = { kind: "brand", value, label: option.label };
    if (hasUserDefaultData() || defaultsStateRef.current.rateTouched || defaultsStateRef.current.trimsTouched || defaultsStateRef.current.otherTouched) setMasterSwitchIntent(intent);
    else performMasterSwitch(intent, "apply", sourceState);
  };

  const requestSalespersonChange = (value: string, option: { label: string }, sourceState = masterData) => {
    if (value === revision.baseInfo.salespersonId) return;
    const intent: Exclude<MasterSwitchIntent, null> = { kind: "salesperson", value, label: option.label };
    if (hasUserDefaultData() || defaultsStateRef.current.rateTouched || defaultsStateRef.current.trimsTouched || defaultsStateRef.current.otherTouched) setMasterSwitchIntent(intent);
    else performMasterSwitch(intent, "apply", sourceState);
  };

  if (!activeVersion) return null;

  const selectViewedRevision = (nextRevision: QuoteRevision) => {
    setViewedRevisionId(nextRevision.revisionId);
    setActivePriceId(nextRevision.priceVersions[0]?.id ?? "");
    setConfirmationValidationIssues([]);
    setPricingOpen(false);
    setAttachmentPreviewId(null);
  };

  const returnToDefaultRevision = () => selectViewedRevision(currentRevision);
  const creatingSecondPriceVersion = versionModal?.mode === "copy" && revision.priceVersions.length === 1;
  const creationValidationIssues = isNew ? validateQuoteCreation(revision).issues : [];

  if (isNew) return <AppShell title="新建报价" onRequestNavigation={requestNavigation}><PageContainer className="qc-create-page qc-quote-create-page">
    <FormShell className="qc-create-form" submitOnEnter={false} onSubmit={save}>
      <PageHeader
        variant="object"
        eyebrow="CREATE QUOTE"
        title={revision.baseInfo.quoteStyleNo.trim() || "新建报价"}
        description={<><strong>{revision.baseInfo.styleName.trim() || "先建立款式与客户上下文"}</strong><span>创建后进入报价详情继续维护成本、附件与客户确认。</span></>}
        back={<Button variant="text" onClick={() => requestNavigation("/quote-center")}>← 返回报价中心</Button>}
        status={<span className="qc-create-state" data-dirty={isDirty || undefined}>{isDirty ? "有未保存修改" : "尚未保存"}</span>}
        primaryAction={<Button type="submit" permission="quote.edit">创建报价</Button>}
      />

      <ContextSummary title="创建摘要" items={[
        { key: "style", label: "款号", value: revision.baseInfo.quoteStyleNo || "待填写" },
        { key: "customer", label: "品牌 / 客户", value: revision.baseInfo.brandName ? `${revision.baseInfo.brandName} · ${revision.baseInfo.salespersonName || "待选择"}` : "待选择" },
        { key: "type", label: "报价类型", value: revision.baseInfo.quoteType === "distribution" ? "经销" : "加工" },
        { key: "price", label: "初始 PriceVersion", value: `${activePriceDisplayName} · ${activeVersion.quantity === null ? "数量待填写" : `${activeVersion.quantity.toLocaleString("zh-CN")} 件`}` },
      ]} />

      <ValidationSummary key={createAttempted ? "creation-attempted" : "creation-initial"} initiallyExpanded={createAttempted} issues={creationValidationIssues} title={creationValidationIssues.length ? `创建报价前还需完成 ${creationValidationIssues.length} 项` : "创建资料已完整"} onSelect={(issue) => { if (issue.priceVersionId) setActivePriceId(issue.priceVersionId); focusQuoteValidationIssue(issue); }} />

      <div data-validation-anchor="base-info"><QuoteBaseInfo revision={revision} readOnly={quoteReadOnly} brandOptions={brandOptions} salespersonOptions={salespersonOptions} onBrandChange={requestBrandChange} onSalespersonChange={requestSalespersonChange} onCreateBrand={(query) => setQuickMasterRequest({ kind: "brand", query })} onCreateSalesperson={(query) => setQuickMasterRequest({ kind: "salesperson", query, brandId: revision.baseInfo.brandId })} canCreateBrand={can("settings.brand.edit")} canCreateSalesperson={can("settings.salesperson.edit")} onChange={updateRevision} styleImage={styleImageAsset ? { url: styleImageAsset.url, name: styleImageAsset.attachment.name } : null} onStyleImagePreview={() => revision.styleImageAttachmentId && setAttachmentPreviewId(revision.styleImageAttachmentId)} /></div>

      <FormSection title="初始价格方案" description="PriceVersion 是当前报价快照内的价格方案；成本明细将在创建后继续维护。" columns={2} className="qc-create-pricing-section">
        <FormItem label="报价类型" required><select className="qc-control" value={revision.baseInfo.quoteType} onChange={(event) => updateRevision({ ...revision, baseInfo: { ...revision.baseInfo, quoteType: event.target.value as QuoteRevision["baseInfo"]["quoteType"] } })}><option value="processing">加工报价</option><option value="distribution">经销报价</option></select></FormItem>
        <FormItem label="价格方案名称" required><input className="qc-control" value={activeVersion.name} onChange={(event) => updateActiveVersion((version) => ({ ...version, name: event.target.value }))} /></FormItem>
        <div className="qc-create-readonly"><span>制作口径</span><strong>{activeProductionLabel}</strong><small>当前为报价快照；系统预设后续变化不会回写。</small></div>
        <div className="qc-create-readonly"><span>工价币种 / 成本加成</span><strong>{activeVersion.pricingParameters.laborCurrency} · {activeVersion.pricingParameters.markupRate === null ? "未设置" : `${activeVersion.pricingParameters.markupRate}%`}</strong><Button variant="text" permission="quote.settings.edit" onClick={() => setPricingOpen(true)}>调整报价设置</Button></div>
      </FormSection>

      <section className="qc-create-next-step"><div><strong>创建后继续</strong><span>面料、辅料、工价、其他费用、附件和客户确认仍使用报价详情的正式数据通道。</span></div><small>本页不会预生成 EstimateCost，也不会创建第二套计算逻辑。</small></section>
      {isDirty && <SaveBar state="dirty" message="新建报价有未保存修改" saveLabel="创建报价" onSave={() => void save()} />}
    </FormShell>
    <QuickMasterDataCreate request={quickMasterRequest} state={masterData} onStateChange={setMasterData} onClose={() => setQuickMasterRequest(null)} onBrandCreated={(brand, nextState) => { setMasterData(nextState); requestBrandChange(brand.id, { label: brand.name }, nextState); }} onSalespersonCreated={(salesperson, nextState) => { setMasterData(nextState); requestSalespersonChange(salesperson.id, { label: salesperson.name }, nextState); }} notify={notify} />
    <QuotePricingSettings open={pricingOpen} priceVersion={activeVersion} readOnly={!can("quote.settings.edit")} onPriceVersionChange={(priceVersion) => { defaultsStateRef.current.rateTouched = true; defaultsStateRef.current.rateAuto = false; updateActiveVersion(() => priceVersion); }} onClose={() => setPricingOpen(false)} />
    <Modal open={Boolean(pendingNavigation)} title="新建报价有未保存修改" description="离开后当前内存草稿将被丢弃，不会创建报价记录。" onClose={() => setPendingNavigation(null)} onSubmit={saveAndNavigate} footer={<><Button variant="danger" onClick={discardAndNavigate}>放弃并返回</Button><Button variant="secondary" onClick={() => setPendingNavigation(null)}>继续编辑</Button><Button type="submit">创建并返回</Button></>}><p className="qc-unsaved-message">只有成功创建后才会写入 Quote Repository。</p></Modal>
    <Toast message={toast} />
  </PageContainer></AppShell>;

  const exportGuardMode: QuoteExportGuardMode = isNew ? "new" : isDirty && !isHistorical ? "dirty" : "clean";
  const openExport = () => {
    setExportScope("all");
    if (unconfirmedCostDifferences.length) setExportDifferenceWarningOpen(true);
    else setExportOpen(true);
  };
  const quickNavigationItems: QuoteQuickNavigationItem[] = [
    { id: "quote-section-base-info", label: "基本信息" },
    ...(revision.priceVersions.length >= 2 ? [{ id: "quote-section-price-versions", label: "价格版本" }] : []),
    { id: "quote-section-fabrics", label: "面料" },
    { id: "quote-section-trims", label: "辅料" },
    { id: "quote-section-labor", label: "加工费" },
    { id: "quote-section-other-costs", label: "其他费用" },
    { id: "quote-section-confirmation", label: "客户确认" },
    { id: "quote-section-attachments", label: "附件" },
    ...(!isNew ? [{ id: "quote-section-history", label: "报价历史" }] : []),
  ];

  const leadingAction: QuoteActionDescriptor = {
    id: "back",
    label: "返回列表",
    variant: "secondary",
    onClick: () => requestNavigation("/quote-center"),
  };
  const contextualActions: QuoteActionDescriptor[] = isHistorical ? [
    { id: "revisions", label: "报价版本", permission: "quote.revision.view", variant: "secondary", onClick: () => setRevisionManagerOpen(true) },
    { id: "operation-log", label: "操作记录", permission: "quote.view", variant: "secondary", onClick: () => setOperationLogOpen(true) },
    { id: "export", label: "导出报价", permission: "quote.export", variant: "secondary", onClick: openExport },
    { id: "create-order", label: "生成订单", permission: "order.create", variant: "secondary", onClick: () => setQuoteToOrderOpen(true) },
    { id: "current-revision", label: "返回当前版本", variant: "secondary", onClick: returnToDefaultRevision },
  ] : [
    ...(!isNew ? [
      { id: "revisions", label: "报价版本", permission: "quote.revision.view" as const, variant: "secondary" as const, onClick: () => setRevisionManagerOpen(true) },
      { id: "operation-log", label: "操作记录", permission: "quote.view" as const, variant: "secondary" as const, onClick: () => setOperationLogOpen(true) },
    ] : []),
    { id: "create-price-version", label: "创建价格版本", permission: "quote.price_version.create", variant: "secondary", onClick: () => openVersionModal("copy", activeVersion) },
    ...(!isNew ? [{ id: "confirmation", label: "客户确认", permission: "quote.confirm" as const, variant: "secondary" as const, onClick: openConfirmation }] : []),
    { id: "export", label: "导出报价", permission: "quote.export", variant: "secondary", onClick: openExport },
    ...(!isNew ? [{ id: "create-order", label: "生成订单", permission: "order.create" as const, variant: "secondary" as const, onClick: () => setQuoteToOrderOpen(true) }] : []),
    ...(!isNew ? [{ id: "delete", label: "删除报价", permission: "quote.delete" as const, variant: "danger" as const, menuVariant: "danger" as const, onClick: () => setDeleteOpen(true) }] : []),
  ];
  const primaryAction: QuoteActionDescriptor | undefined = isHistorical
    ? { id: "update-revision", label: "更新此报价版本", permission: "quote.revision.update", variant: "primary", onClick: () => setRevisionManagerOpen(true) }
    : { id: "save", label: "保存草稿", permission: "quote.edit", variant: "primary", onClick: save };
  const quoteActionBarProps = { leadingAction, actions: contextualActions, primaryAction, quickNavigationItems };

  const headerActions = <div className="qc-quote-header-controls">
    <QuoteActionBar {...quoteActionBarProps} onModeChange={setHeaderActionMode} />
  </div>;

  return <AppShell title={isNew ? "新建报价" : "款式报价明细"} onRequestNavigation={requestNavigation}><PageContainer>
    <FormShell className="qc-page-form-shell" submitOnEnter={false} onSubmit={() => { if (!quoteReadOnly) return save(); }}>
    <div ref={titleSentinelRef} className="qc-title-sentinel"><PageHeader eyebrow="QUOTE WORKSPACE" title={`${pageTitle} · ${pageSubtitle}`} description={<span className="qc-workspace-metadata"><b>{revision.baseInfo.brandName || "未填写品牌"}</b><span>{revision.baseInfo.salespersonName || "未填写客户业务员"}</span><span>{revision.baseInfo.quoteType === "distribution" ? "经销报价" : "加工报价"}</span><span>{quoteStatusLabel}</span><span>报价编号 {quote.quoteCode}</span><span>{isHistorical ? "历史只读" : "当前编辑"}</span></span>} actions={headerActions} /><QuoteMetrics className="qc-header-metrics" version={activeVersion} revision={revision} /></div>
    <div className={`qc-sticky-header ${stickyVisible ? "is-visible" : ""}`} aria-hidden={!stickyVisible}><div className="qc-sticky-summary"><strong>{pageTitle}</strong><small>{revision.baseInfo.brandName || "未填写客户"} · {pageSubtitle}</small></div><div className="qc-sticky-state"><span>{activePriceDisplayName}</span><span>{confirmationSummaryLabel(revision.confirmationSummary)}</span><b>{isDirty ? "有未保存修改" : "已保存"}</b></div><div className="qc-sticky-actions">{!isHistorical && <Button permission="quote.edit" onClick={save}>保存</Button>}{!isNew && <Button permission="order.create" variant="secondary" onClick={() => setQuoteToOrderOpen(true)}>生成订单</Button>}</div></div>
    <div className="qc-quote-functional-stack">
      <div className={`qc-quick-navigation-normal ${headerActionMode === "full" ? "" : "is-collapsed"}`}><QuoteQuickNavigation items={quickNavigationItems} /></div>
      <div className={`qc-quote-version-bar qc-price-version-context ${isHistorical ? "is-history" : ""}`}>
        <div className="qc-revision-context"><span>报价版本 · 历史快照</span><strong>{revision.revisionLabel}</strong><small>{isHistorical ? "历史只读" : "当前默认报价"}</small></div>
        <div className="qc-active-price-context"><span>当前价格方案</span><strong>{activePriceDisplayName}</strong><small>{activeProductionLabel} · {activeVersion.quantity === null ? "数量未填写" : `${activeVersion.quantity.toLocaleString("zh-CN")} 件`}</small></div>
        <div className="qc-active-price-result"><span>最终报价</span><strong>{formatFinalGarmentPrice(metrics?.garmentSellingPrice ?? null)}</strong><small>RMB / 件 · {confirmationSummaryLabel(revision.confirmationSummary)}</small></div>
        <div className="qc-price-context-meta">{unconfirmedCostDifferences.length > 0 && <button type="button" className="qc-version-difference-button" onClick={() => setPriceDifferencesOpen(true)}>{unconfirmedCostDifferences.length} 项未确认差异</button>}<span>{activeVersion.pricingParameters.laborCurrency} 工价 · 成本加成 <b>{activeVersion.pricingParameters.markupRate === null ? "未设置" : `${activeVersion.pricingParameters.markupRate}%`}</b></span></div>
        <Button permission="quote.settings.edit" className="qc-quote-settings-entry" variant="secondary" onClick={() => setPricingOpen(true)}>报价设置</Button>
      </div>
      <ValidationSummary issues={liveRevisionValidationIssues} title={isNew ? "完成新建报价前请完成以下内容" : isHistorical ? "当前报价版本尚有以下资料未完成" : "更新报价版本前请完成以下内容"} onSelect={isHistorical ? undefined : (issue) => { if (issue.priceVersionId) setActivePriceId(issue.priceVersionId); focusQuoteValidationIssue(issue); }} />
      <ValidationSummary issues={confirmationValidationIssues} title="客户确认前请完成以下内容" onSelect={(issue) => { if (issue.priceVersionId) setActivePriceId(issue.priceVersionId); focusQuoteValidationIssue(issue); }} />
    </div>
    <div id="quote-section-base-info" className="qc-editor-surface qc-page-section-anchor" data-validation-anchor="base-info"><QuoteBaseInfo revision={revision} readOnly={quoteReadOnly} readOnlyLabel={isHistorical ? "历史只读" : "权限只读"} brandOptions={brandOptions} salespersonOptions={salespersonOptions} onBrandChange={requestBrandChange} onSalespersonChange={requestSalespersonChange} onCreateBrand={(query) => setQuickMasterRequest({ kind: "brand", query })} onCreateSalesperson={(query) => setQuickMasterRequest({ kind: "salesperson", query, brandId: revision.baseInfo.brandId })} canCreateBrand={can("settings.brand.edit")} canCreateSalesperson={can("settings.salesperson.edit")} onChange={updateRevision} styleImage={styleImageAsset ? { url: styleImageAsset.url, name: styleImageAsset.attachment.name } : null} onStyleImagePreview={() => revision.styleImageAttachmentId && setAttachmentPreviewId(revision.styleImageAttachmentId)} /></div>
    {revision.priceVersions.length >= 2 && <PriceVersionSelector sectionId="quote-section-price-versions" revision={revision} activeId={activeVersion.id} readOnly={isHistorical} canEdit={canEditQuote} onSelect={setActivePriceId} onEdit={(version) => openVersionModal("edit", version)} />}
    <section id="quote-section-costs" className="qc-cost-heading qc-page-section-anchor"><div><span className="qc-section-index">02</span><div><h2>{activePriceDisplayName} · 成本明细</h2><p>正在{isHistorical ? "查看历史报价版本快照" : "编辑当前价格方案"}；所有物料值均为独立报价快照。</p></div></div></section>
    {can("quote.cost.view") ? <fieldset disabled={costReadOnly} className="qc-editor-surface"><div className="qc-cost-stack">
      <div id="quote-section-fabrics" className="qc-page-section-anchor" data-validation-anchor="fabric-costs"><FabricCostTable lines={activeVersion.fabrics} library={masterData.fabricLibrary} supplierOptions={supplierOptions} readOnly={costReadOnly} onChange={updateFabricLine} onPurchaseUnitChange={changeFabricPurchaseUnit} onSelectLibrary={(lineId, item) => updateActiveVersion((version) => ({ ...version, fabrics: patchStableRow(version.fabrics, lineId, createFabricCostLineFromLibrary(item, lineId, version.fabrics.find((line) => line.id === lineId)?.lineGroupId)) }))} onSaveToLibrary={saveFabricToLibrary} onAdd={addFabricLine} onDelete={(lineId) => updateActiveVersion((version) => ({ ...version, fabrics: version.fabrics.filter((line) => line.id !== lineId) }))} /></div>
      <div id="quote-section-trims" className="qc-page-section-anchor" data-validation-anchor="trim-costs"><TrimCostTable lines={activeVersion.trims} library={masterData.trimLibrary} supplierOptions={supplierOptions} onChange={updateTrimLine} onSelectLibrary={(lineId, item) => { defaultsStateRef.current.trimsTouched = true; defaultsStateRef.current.trimsAuto = false; updateActiveVersion((version) => ({ ...version, trims: patchStableRow(version.trims, lineId, createTrimCostLineFromLibrary(item, lineId, undefined, version.trims.find((line) => line.id === lineId)?.lineGroupId)) })); }} onSaveToLibrary={saveTrimToLibrary} onAdd={addTrimLine} onDelete={(lineId) => { defaultsStateRef.current.trimsTouched = true; defaultsStateRef.current.trimsAuto = false; updateActiveVersion((version) => ({ ...version, trims: version.trims.filter((line) => line.id !== lineId) })); }} /></div>
      <span data-validation-anchor="labor-cost" />
      <div id="quote-section-labor" className="qc-page-section-anchor qc-cost-section"><Card className="qc-labor-card">
        <header><div><h3>工价</h3><p>{activeVersion.pricingParameters.laborCurrency === "USD" ? "保留原始 USD 工价，并按当前汇率与固定折算系数换算为 RMB。" : "当前价格版本直接按人民币录入工价。"}</p></div><div className="qc-labor-header-result"><span>{activeVersion.pricingParameters.laborCurrency === "USD" ? "USD" : "RMB"} / 件</span><strong>{metrics?.laborRmb === null || metrics?.laborRmb === undefined ? "—" : `¥${metrics.laborRmb.toFixed(2)}`}<small>RMB / 件</small></strong></div></header>
        <div className="qc-labor-fields"><FormItem label={`原始工价（${activeVersion.pricingParameters.laborCurrency === "USD" ? "USD" : "RMB"} / 件）`}><NullableNumberInput className="qc-control" min="0" placeholder="请输入工价" value={activeVersion.labor.value} onValueChange={(value) => updateActiveVersion((version) => ({ ...version, labor: { ...version.labor, value } }))} /></FormItem><FormItem label="工价说明"><input className="qc-control" value={activeVersion.labor.description} onChange={(event) => updateActiveVersion((version) => ({ ...version, labor: { ...version.labor, description: event.target.value } }))} /></FormItem>{activeVersion.pricingParameters.laborCurrency === "USD" && <div className="qc-labor-conversion"><span>USD/CNY 汇率 {activeVersion.pricingParameters.usdCnyRate === null ? "—" : activeVersion.pricingParameters.usdCnyRate.toFixed(2)}</span><strong>折合 {metrics?.laborRmb === null || metrics?.laborRmb === undefined ? "—" : `¥${metrics.laborRmb.toFixed(2)}`} RMB / 件</strong><small>USD 工价按当前汇率及固定折算系数换算为 RMB。</small></div>}</div>
      </Card></div>
      <div id="quote-section-other-costs" className="qc-page-section-anchor"><CostTable title="其他费用" description="包装、运输、管理分摊等费用" namePlaceholder="请输入费用名称" lines={activeVersion.otherCosts} onChange={updateOtherLine} onAdd={addOtherLine} onDelete={(lineId) => { defaultsStateRef.current.otherTouched = true; defaultsStateRef.current.otherAuto = false; updateActiveVersion((version) => ({ ...version, otherCosts: version.otherCosts.filter((line) => line.id !== lineId) })); }} /></div>
    </div></fieldset> : <Card className="qc-editor-surface qc-permission-cost-hidden"><strong>成本信息不可见</strong><p>暂无成本查看权限，请联系管理员。</p></Card>}
    <section id="quote-section-confirmation" className="qc-workspace-reference qc-page-section-anchor"><div><span>客户确认</span><strong>{activeVersion.confirmation ? "当前价格方案已确认" : "当前价格方案未确认"}</strong><small>确认归属于 {revision.revisionLabel} · {activePriceDisplayName}</small></div>{!isNew && <Button permission="quote.confirm" variant="secondary" onClick={openConfirmation}>{activeVersion.confirmation ? "查看 / 更新确认" : "客户确认"}</Button>}</section>
    <div id="quote-section-attachments" className="qc-page-section-anchor"><QuoteAttachmentPanel revision={revision} readOnly={quoteReadOnly} createdBy={revision.baseInfo.salespersonName || currentUser.name} previewAttachmentId={attachmentPreviewId} onPreviewAttachmentIdChange={setAttachmentPreviewId} onChange={updateRevision} onAttachmentRemoved={(attachmentId) => { if (!quoteReferencesAttachment(quote, attachmentId, revision.revisionId)) pendingAttachmentDeletesRef.current.add(attachmentId); }} notify={notify} /></div>
    {!isNew && <section id="quote-section-history" className="qc-workspace-reference qc-page-section-anchor"><div><span>报价历史</span><strong>{revision.revisionLabel} · {revision.reason}</strong><small>QuoteRevision 是不可变报价快照；价格方案在当前快照内独立切换。</small></div><Button permission="quote.revision.view" variant="secondary" onClick={() => setRevisionManagerOpen(true)}>查看报价历史</Button></section>}
    </FormShell>
    <QuickMasterDataCreate request={quickMasterRequest} state={masterData} onStateChange={setMasterData} onClose={() => setQuickMasterRequest(null)} onBrandCreated={(brand, nextState) => { setMasterData(nextState); requestBrandChange(brand.id, { label: brand.name }, nextState); }} onSalespersonCreated={(salesperson, nextState) => { setMasterData(nextState); requestSalespersonChange(salesperson.id, { label: salesperson.name }, nextState); }} notify={notify} />

    <QuotePricingSettings open={pricingOpen} priceVersion={activeVersion} readOnly={isHistorical || !can("quote.settings.edit")} onPriceVersionChange={(priceVersion) => { defaultsStateRef.current.rateTouched = true; defaultsStateRef.current.rateAuto = false; updateActiveVersion(() => priceVersion); }} onClose={() => setPricingOpen(false)} />
    {priceSyncRequest && <PriceVersionCostSyncModal open candidates={priceSyncRequest.candidates} onClose={() => setPriceSyncRequest(null)} onConfirm={commitPriceVersionSync} onCurrentOnly={saveCurrentPriceVersionOnly} />}
    <PriceVersionDifferencesModal open={priceDifferencesOpen} differences={unconfirmedCostDifferences} onClose={() => setPriceDifferencesOpen(false)} />
    <Modal open={exportDifferenceWarningOpen} title="发现未确认的价格版本差异" description="建议确认后再导出；该提醒不会阻止你继续导出。" onClose={() => setExportDifferenceWarningOpen(false)} className="qc-export-difference-modal" footer={<><Button variant="secondary" onClick={() => { setExportDifferenceWarningOpen(false); setPriceDifferencesOpen(true); }}>查看差异</Button><Button onClick={() => { setExportDifferenceWarningOpen(false); setExportOpen(true); }}>仍然导出</Button></>}><div className="qc-export-difference-warning"><strong>{unconfirmedCostDifferences.length} 项未确认差异</strong><p>已明确标记为独立调整的版本差异不会出现在这里。</p></div></Modal>
    <QuoteExportModal open={exportOpen} revisionLabel={revision.revisionLabel} scope={exportScope} guardMode={exportGuardMode} loading={exporting} onScopeChange={setExportScope} onClose={() => setExportOpen(false)} onExport={async () => { await exportCurrentRevision(); }} onExportSaved={async () => { await exportSavedRevision(); }} onSaveAndExport={saveAndExportRevision} />
    <Modal open={Boolean(versionModal)} title={creatingSecondPriceVersion ? "创建价格版本" : versionModal?.mode === "copy" ? "复制价格版本" : "编辑价格版本"} description={versionModal?.mode === "copy" ? `基于当前${creatingSecondPriceVersion ? "基础价格" : "查看的价格版本"}复制面料、辅料、工价和其他费用；不会复制数量与客户确认结果。` : "修改名称、数量和说明，不改变该版本成本。"} onClose={() => setVersionModal(null)} onSubmit={submitVersionModal} footer={versionModal?.mode === "edit" ? <div className="qc-modal-footer-split"><Button permission="quote.price_version.delete" variant="danger" onClick={() => requestDeletePriceVersion(versionModal.sourceId)}>删除价格版本</Button><div><Button variant="secondary" onClick={() => setVersionModal(null)}>取消</Button><Button type="submit">保存修改</Button></div></div> : <><Button variant="secondary" onClick={() => setVersionModal(null)}>取消</Button><Button type="submit">{creatingSecondPriceVersion ? "确认创建" : "确认复制"}</Button></>}><div className="qc-modal-form"><FormItem label="价格版本名称" required><input className={`qc-control ${versionError ? "qc-control-error" : ""}`} autoFocus value={versionDraft.name} placeholder="请填写价格版本名称" onChange={(event) => { setVersionDraft({ ...versionDraft, name: event.target.value }); if (versionError) setVersionError(""); }} /></FormItem>{versionError && <p className="qc-form-alert">{versionError}</p>}<FormItem label="数量" required><input className="qc-control" inputMode="decimal" placeholder="请输入数量" value={versionDraft.quantity} onChange={(event) => { if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setVersionDraft({ ...versionDraft, quantity: event.target.value }); }} /></FormItem><FormItem label="说明"><textarea className="qc-control" value={versionDraft.description} onChange={(event) => setVersionDraft({ ...versionDraft, description: event.target.value })} /></FormItem></div></Modal>
    <Modal open={Boolean(priceVersionDeleteTargetId)} title="删除价格版本？" description="删除后，此价格版本将从当前报价中移除；mock 阶段允许删除，但操作不可撤销。" onClose={() => setPriceVersionDeleteTargetId(null)} onSubmit={confirmDeletePriceVersion} footer={<><Button variant="secondary" onClick={() => setPriceVersionDeleteTargetId(null)}>取消</Button><Button type="submit" variant="danger">确认删除</Button></>}>
      <div className="qc-delete-price-version-message"><p>确认删除“{revision.priceVersions.find((version) => version.id === priceVersionDeleteTargetId)?.name ?? "当前价格版本"}”吗？</p>{revision.priceVersions.find((version) => version.id === priceVersionDeleteTargetId)?.confirmation && <strong>该价格版本已有客户确认信息，请确认是否删除。</strong>}</div>
    </Modal>
    <Modal open={Boolean(pendingNavigation)} title="有未保存的修改" description="当前报价还有尚未保存的修改。离开后这些修改将丢失。" onClose={() => setPendingNavigation(null)} onSubmit={saveAndNavigate} footer={<><Button variant="danger" onClick={discardAndNavigate}>放弃修改</Button><Button variant="secondary" onClick={() => setPendingNavigation(null)}>继续编辑</Button><Button type="submit">保存并返回</Button></>}><p className="qc-unsaved-message">你可以保存当前报价后返回，也可以放弃本次修改。</p></Modal>
    <Modal open={deleteOpen} title="删除报价" description="删除后这张报价将从当前 mock repository 中移除。" onClose={() => setDeleteOpen(false)} onSubmit={deleteQuote} footer={<><Button variant="secondary" onClick={() => setDeleteOpen(false)}>取消</Button><Button type="submit" variant="danger">确认删除</Button></>}><p className="qc-unsaved-message">确定删除“{pageTitle}”吗？此操作需要再次确认。</p></Modal>
    <Modal open={Boolean(masterSwitchIntent)} title="更换默认资料来源" description="更换品牌 / 客户业务员可能会重新应用默认报价资料。" onClose={() => setMasterSwitchIntent(null)} onSubmit={() => { if (masterSwitchIntent) performMasterSwitch(masterSwitchIntent, "apply"); }} footer={<><Button variant="secondary" onClick={() => setMasterSwitchIntent(null)}>取消切换</Button><Button variant="secondary" onClick={() => masterSwitchIntent && performMasterSwitch(masterSwitchIntent, "keep")}>保留当前报价资料</Button><Button type="submit">应用新的默认资料</Button></>}><p className="qc-unsaved-message">应用新的默认资料会替换当前价格版本的默认辅料、汇率和默认其他费用；面料与工价不会被改写。</p></Modal>
    <Modal open={confirmationOpen} title={`客户确认 · ${activePriceDisplayName}`} description={`确认结果归属于报价版本 ${revision.revisionLabel} + 当前价格版本，不会覆盖系统测算值。`} onClose={() => setConfirmationOpen(false)} onSubmit={saveConfirmation} footer={<><Button variant="secondary" onClick={() => setConfirmationOpen(false)}>取消</Button><Button type="submit">保存确认</Button></>}>
      <div className="qc-confirmation-quoted"><span><small>系统报价工价</small><strong>{activeVersion.labor.value === null ? "—" : activeVersion.labor.value.toFixed(2)} {activeVersion.pricingParameters.laborCurrency} / 件</strong></span>{revision.baseInfo.quoteType === "distribution" && <span><small>系统报价成衣销售单价</small><strong>{metrics?.garmentSellingPrice === null || metrics?.garmentSellingPrice === undefined ? "—" : `${formatFinalGarmentPrice(metrics.garmentSellingPrice)} RMB / 件`}</strong></span>}</div>
      <div className="qc-modal-form" data-validation-anchor="confirmation-fields"><FormItem label={`客户确认工价（${activeVersion.pricingParameters.laborCurrency} / 件）`} required><input className="qc-control" inputMode="decimal" value={confirmationDraft.labor} onChange={(event) => { if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setConfirmationDraft({ ...confirmationDraft, labor: event.target.value }); }} placeholder="请输入客户确认工价" /></FormItem>{revision.baseInfo.quoteType === "distribution" && <FormItem label="客户确认成衣价格（RMB / 件）" required><input className="qc-control" inputMode="decimal" value={confirmationDraft.garment} onChange={(event) => { if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setConfirmationDraft({ ...confirmationDraft, garment: event.target.value }); }} placeholder="请输入客户确认工价" /></FormItem>}<FormItem label="确认备注"><textarea className="qc-control" value={confirmationDraft.note} onChange={(event) => setConfirmationDraft({ ...confirmationDraft, note: event.target.value })} placeholder="可选" /></FormItem>{confirmationError && <p className="qc-form-alert">{confirmationError}</p>}</div>
    </Modal>
    {!isNew && <RevisionManagerModal open={revisionManagerOpen} quote={quote} viewedRevisionId={revision.revisionId} onClose={() => setRevisionManagerOpen(false)} canUpdate={can("quote.revision.update")} canViewEstimate={can("estimate.view")} canEditEstimate={can("estimate.edit")} onView={selectViewedRevision} onCanUpdate={canUpdateRevision} onCreate={createRevision} onEstimateChange={changeEstimate} onEstimateGenerate={requestEstimateGeneration} onEstimateIgnoreStale={() => { setQuote((current) => ignoreEstimateCostForCurrentRevision(current)); setIsDirty(true); }} onEstimateRestore={restoreEstimate} />}
    {!isNew && <OperationLogModal open={operationLogOpen} quoteId={quote.id} onClose={() => setOperationLogOpen(false)} />}
    {!isNew && quoteToOrderOpen && <QuoteToOrderModal open quote={quote} defaultRevisionId={revision.revisionId} defaultPriceVersionId={activeVersion.id} onClose={() => setQuoteToOrderOpen(false)} />}
    <Modal open={Boolean(pendingEstimateGeneration)} title="重新生成估算成本？" description="当前估算将归档到历史记录，新估算会从所选报价版本重新形成独立快照。" onClose={() => setPendingEstimateGeneration(null)} onSubmit={() => { if (pendingEstimateGeneration) commitEstimateGeneration(pendingEstimateGeneration.source); }} footer={<><Button variant="secondary" onClick={() => setPendingEstimateGeneration(null)}>取消</Button><Button type="submit">确认重新生成</Button></>}><p className="qc-unsaved-message">已有估算成本不会丢失，可随时从历史记录恢复并克隆为新的当前估算。</p></Modal>
    <Toast message={toast} />
  </PageContainer></AppShell>;
}

export function QuoteDetailLoader() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("id") || "quote-001";
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => setQuote(undefined));
    mockQuoteRepository.getById(quoteId).then((next) => { if (active) setQuote(next); });
    return () => { active = false; };
  }, [quoteId]);
  if (quote === undefined) return <AppShell title="载入报价"><PageContainer><div className="loading-screen qc-inline-loading"><div className="loading-mark">纫</div><strong>正在载入报价</strong><span /></div></PageContainer></AppShell>;
  if (!quote) return <AppShell title="报价不存在"><PageContainer><Card className="qc-not-found"><strong>没有找到这张报价</strong><p>该 mock 报价可能已随浏览器会话结束而清除。</p><Button onClick={() => window.location.assign("/quote-center")}>返回报价中心</Button></Card></PageContainer></AppShell>;
  return <QuoteEditor key={quote.id} initialQuote={quote} />;
}

export function QuoteNewLoader() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    mockQuoteRepository.createDraft(today).then(setQuote);
  }, []);
  if (!quote) return <AppShell title="新建报价"><PageContainer><div className="loading-screen qc-inline-loading"><div className="loading-mark">纫</div><strong>正在准备报价草稿</strong><span /></div></PageContainer></AppShell>;
  return <QuoteEditor initialQuote={quote} isNew />;
}
