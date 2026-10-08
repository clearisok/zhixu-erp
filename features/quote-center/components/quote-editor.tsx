"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NumberPrecisionContext } from "@/components/foundation/nullable-number-input";
import { browserNumberFromExactDecimal } from "../server/quote-server-editor-adapter";
import type { QuoteEditorPersistence } from "../server/quote-editor-persistence";
import type { QuoteVersionAction } from "../server/quote-editor-persistence";
import { mergeAttachmentMirror } from "../server/quote-attachment-draft";
import { createServerQuoteAttachmentController } from "../model/quote-attachment-controller";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AppShell,
  AlertBanner,
  Button,
  Card,
  ErrorState,
  ContextSummary,
  Drawer,
  FormItem,
  FormSection,
  FormShell,
  Modal,
  NullableNumberInput,
  PageContainer,
  PageHeader,
  LoadingState,
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
  type ResolvedQuoteDefaults,
  type BasicSettingsState,
} from "../../basic-settings/model/basic-settings";
import {
  createMasterDataId,
  loadBasicSettings,
  saveBasicSettings,
} from "../../basic-settings/repository/basic-settings-repository";
import { masterSettingsAuthority } from "../../basic-settings/authority/master-settings-authority";
import { createServerQuoteMasterDependencies } from "../../basic-settings/server/quote-master-dependencies";
import type { BasicSettingsServerScope } from "../../basic-settings/server/server-basic-settings-adapter";
import { QuoteMasterServerError } from "../../basic-settings/server/quote-master-server-client";
import { calculatePriceVersionMetrics, copyPriceVersion, costLineAmount } from "../model/quote-calculations";
import {
  createEmptyOtherCostLine,
  createEmptyFabricCostLine,
  createEmptyTrimCostLine,
  createNavigationIntent,
  parseNumberDraft,
  patchStableRow,
} from "../model/quote-editor-state";
import { applyCustomerConfirmation, aggregateStatusAfterRevisionEdit, confirmationSummaryLabel, createRevisionFromSnapshot, isQuoteConfirmationComplete, removePriceVersion, summarizeRevisionConfirmations } from "../model/quote-workflows";
import { nullablePriceVersionMetrics } from "../model/quote-presentation";
import { formatFinalGarmentPrice } from "../model/final-quote-format";
import { quoteReferencesAttachment } from "../model/quote-attachments";
import { focusQuoteValidationIssue, validateCustomerConfirmation, validateQuoteCreation, validateRevisionUpdate, type QuoteValidationIssue } from "../model/quote-validation";
import { loadGlobalQuoteSettings, type GlobalQuoteSettings } from "../model/quote-settings";
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
import { assertBrowserQuoteWrite, isBrowserQuoteFrozen } from "../authority/quote-writer-mode";
import { deleteBrowserQuoteAttachment } from "../model/quote-attachment-controller";
import { indexedDbAttachmentRepository } from "../repository/indexeddb-attachment-repository";
import { CostTable, FabricCostTable, TrimCostTable } from "./cost-table";
import { PriceVersionSelector } from "./price-version-selector";
import { QuoteBaseInfo } from "./quote-base-info";
import { QuoteCockpit } from "./quote-metrics";
import { QuotePricingSettings } from "./quote-pricing-settings";
import { QuoteExportModal, type QuoteExportGuardMode, type QuoteExportScope } from "./quote-export-modal";
import { RevisionManagerModal } from "./revision-manager-modal";
import { ValidationSummary } from "./validation-summary";
import { QuoteAttachmentPanel, revisionLegacyStyleReference, useAttachmentAsset } from "./attachment-panel";
import { QuoteQuickNavigation, type QuoteQuickNavigationItem } from "./quote-quick-navigation";
import { QuoteActionBar, type QuoteActionBarMode, type QuoteActionDescriptor } from "./quote-action-bar";
import { activateEstimateCost, createEstimateCostFromRevision, ignoreEstimateCostForCurrentRevision, restoreHistoricalEstimateCost } from "../model/estimate-cost";
import type { EstimateCost } from "../model/quote-view-model";
import { PermissionAuthorityProvider, usePermissions } from "@/features/permissions";
import { assignOperationMetadata, createOperationId, createOperationLogDraft, createQuoteDeletionLog, createQuoteOperationLogs, operationLogRepository, type OperationLogDraft } from "@/features/operation-logs";
import { OperationLogModal } from "@/features/operation-logs/components/operation-log-modal";
import { QuickMasterDataCreate, type QuickMasterDataRequest } from "@/features/basic-settings/components/quick-master-data-create";
import { PriceVersionCostSyncModal, PriceVersionDifferencesModal } from "./price-version-cost-sync-modal";
import { orderRepository } from "@/features/order-center";
import { QuoteToOrderModal } from "@/features/order-center/components/quote-to-order-modal";
import { ServerLoginCard, useServerSession } from "@/features/server-auth";
import {
  ConfirmedCommercialTermsServerError,
  confirmedCommercialTermsServerClient,
  isQuoteTermsServerLinkageActivated,
  resolveQuoteTermsConfirmationAuthority,
  type ConfirmedCommercialTermsDto,
} from "@/features/confirmed-commercial-terms";

type VersionModalState = { mode: "copy" | "edit"; sourceId: string } | null;
type MasterSwitchIntent = { kind: "brand" | "salesperson"; value: string; label: string } | null;
type PersistIntent = "save" | "navigate" | "export";
type PriceSyncRequest = { candidates: CostSyncCandidate[]; intent: PersistIntent } | null;
type ServerTermsState = "idle" | "legacy_pre_activation" | "loading" | "ready" | "login_required" | "forbidden" | "error";

const quoteTermsServerLinkageActivated = isQuoteTermsServerLinkageActivated(
  process.env.NEXT_PUBLIC_ZHIXU_CONFIRMED_TERMS_QUOTE_LINKAGE,
);

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

export function QuoteEditor({ initialQuote, isNew = false, persistence }: { initialQuote: Quote; isNew?: boolean; persistence?: QuoteEditorPersistence }) {
  const serverMode = Boolean(persistence);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const versionActionPending = useRef(false);
  const costSyncPending = useRef(false);
  const [unsafeNumbers, setUnsafeNumbers] = useState<Set<string>>(() => new Set());
  const precisionUnsafe = useCallback((id: string, unsafe: boolean) => setUnsafeNumbers((current) => {
    if (current.has(id) === unsafe) return current;
    const next = new Set(current); if (unsafe) next.add(id); else next.delete(id); return next;
  }), []);
  const precision = useMemo(() => ({ unsafe: precisionUnsafe, valid: (draft: string) => {
    if (!draft.trim()) return true;
    try { browserNumberFromExactDecimal(draft.endsWith(".") ? `${draft}0` : draft, "editor.input"); return true; } catch { return false; }
  } }), [precisionUnsafe]);
  const quoteFrozen = isBrowserQuoteFrozen();
  const router = useRouter();
  const q3Authority = masterSettingsAuthority();
  const { can: permissionCan, currentUser } = usePermissions();
  const can: typeof permissionCan = (permission) => !(serverMode && ["quote.revision.delete", "estimate.edit", "estimate.view", "quote.confirm", "quote.export", "quote.delete", "order.create"].includes(permission)) && permissionCan(permission);
  const serverSession = useServerSession();
  const serverMasters = useMemo(() => createServerQuoteMasterDependencies(serverSession.permissions), [serverSession.permissions]);
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
  const [serverSupplierOptions, setServerSupplierOptions] = useState<string[]>([]);
  const [masterSettings, setMasterSettings] = useState<GlobalQuoteSettings | null>(null);
  const [masterStatus, setMasterStatus] = useState<"loading" | "ready" | "error">("loading");
  const [masterError, setMasterError] = useState("");
  const [stickyVisible, setStickyVisible] = useState(false);
  const [headerActionMode, setHeaderActionMode] = useState<QuoteActionBarMode>("compact");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<QuoteExportScope>("all");
  const [exporting, setExporting] = useState(false);
  const [quoteToOrderOpen, setQuoteToOrderOpen] = useState(false);
  const [masterSwitchIntent, setMasterSwitchIntent] = useState<MasterSwitchIntent>(null);
  const [quickMasterRequest, setQuickMasterRequest] = useState<QuickMasterDataRequest | null>(null);
  const masterSwitchSequenceRef = useRef(0);
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
  const [serverTerms, setServerTerms] = useState<ConfirmedCommercialTermsDto | null>(null);
  const [serverTermsState, setServerTermsState] = useState<ServerTermsState>("idle");
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
  const activeServerTerms = serverTerms?.quoteProvenance?.quoteId === quote.id
    && serverTerms.quoteProvenance.revisionId === revision.revisionId
    && serverTerms.quoteProvenance.priceVersionId === activeVersion?.id
    ? serverTerms
    : null;
  const activeServerTermsState = serverTermsState === "ready" && !activeServerTerms ? "loading" : serverTermsState;
  const activeConfirmationAuthority = resolveQuoteTermsConfirmationAuthority({
    activated: quoteTermsServerLinkageActivated,
    lookupReady: activeServerTermsState === "ready",
    linkage: activeServerTerms?.linkage ?? null,
  });
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
  const linkedCurrentConfirmationComplete = activeServerTerms?.linkage === "linked" && isQuoteConfirmationComplete(
    revision.baseInfo.quoteType,
    activeServerTerms.current?.confirmedLaborPrice,
    activeServerTerms.current?.customerConfirmedPrice,
  );
  const activeConfirmationLabel = !isHistorical && activeServerTerms?.linkage === "linked"
    ? linkedCurrentConfirmationComplete
      ? "已确认（Server current）"
      : "未确认（Server current）"
    : confirmationSummaryLabel(revision.confirmationSummary);
  const brandOptions = masterData.brands.filter((brand) => brand.status === "active").map((brand) => ({ value: brand.id, label: brand.name }));
  const salespersonOptions = customerSalespeopleForBrand(masterData, revision.baseInfo.brandId).map((person) => ({ value: person.id, label: person.name }));
  const supplierOptions = q3Authority === "server" ? serverSupplierOptions : supplierSuggestions(masterData);
  const canQ3 = (permission: Parameters<typeof can>[0]) => q3Authority === "frozen" ? false : q3Authority === "server" ? serverSession.hasPermission(permission) : can(permission);
  const attachmentController = useMemo(() => persistence ? persistence.coordinate(createServerQuoteAttachmentController({
    quoteId: initialQuote.id, revisionId: viewedRevisionId, getVersion: persistence.getVersion,
    isSharedWithHistorical: (id) => persistence.getBaseline().revisions.some((item) => item.readOnly && [...item.imageAttachmentIds, ...item.fileAttachmentIds].includes(id)),
    onCommitted: (snapshot) => {
      persistence.acceptAttachment(snapshot);
      setQuote((current) => mergeAttachmentMirror(current, snapshot.revision.revisionId, snapshot));
    },
  })) : undefined, [persistence, initialQuote.id, viewedRevisionId]);
  const legacyStyleReference = serverMode ? undefined : revisionLegacyStyleReference(revision);
  const styleImageAsset = useAttachmentAsset(revision.styleImageAttachmentId, legacyStyleReference, attachmentController);
  const canEditQuote = !quoteFrozen && can("quote.edit") && !serverBusy && !serverError;
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
      aggregateStatus: aggregateStatusAfterRevisionEdit(current.aggregateStatus, confirmationSummary),
      revisions: current.revisions.map((item) => item.revisionId === normalized.revisionId ? normalized : item),
    }));
    setIsDirty(true);
  };
  const updateActiveVersion = (updater: (version: PriceVersion) => PriceVersion) => updateRevision({ ...revision, priceVersions: revision.priceVersions.map((version) => version.id === activeVersion.id ? updater(version) : version) });
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const commitEstimateGeneration = (source: QuoteRevision) => {
    if (quoteFrozen) return;
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
    if (quoteFrozen) return;
    if (regenerate && quote.activeEstimateCost) { setRevisionManagerOpen(false); setPendingEstimateGeneration({ source, regenerate }); }
    else commitEstimateGeneration(source);
  };
  const changeEstimate = (estimate: EstimateCost) => {
    if (quoteFrozen) return;
    setQuote((current) => ({ ...current, activeEstimateCost: estimate }));
    setIsDirty(true);
  };
  const restoreEstimate = (historyId: string) => {
    if (quoteFrozen) return;
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

  useEffect(() => {
    let active = true;
    if (q3Authority === "server" && (serverSession.status !== "authenticated" || !serverSession.hasPermission("quote.view"))) return;
    void Promise.resolve().then(async () => {
      try {
        const loaded = q3Authority === "server"
          ? await serverMasters.load()
          : { state: loadBasicSettings(), settings: loadGlobalQuoteSettings() };
        if (!active) return;
        setMasterData(loaded.state);
        setMasterSettings(loaded.settings);
        if (q3Authority === "server" && "supplierOptions" in loaded) setServerSupplierOptions(loaded.supplierOptions);
        setMasterStatus("ready");
      } catch (error) {
        if (!active) return;
        if (error instanceof QuoteMasterServerError && error.status === 401) serverSession.invalidate();
        setMasterError("基础资料或报价设置读取失败；未回退到 Browser 数据。");
        setMasterStatus("error");
      }
    });
    return () => { active = false; };
  }, [q3Authority, serverMasters, serverSession]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      if (isNew || isHistorical || !activeVersion) {
        setServerTerms(null);
        setServerTermsState("idle");
        return;
      }
      if (!quoteTermsServerLinkageActivated) {
        setServerTerms(null);
        setServerTermsState("legacy_pre_activation");
        return;
      }
      if (serverSession.status === "checking") {
        setServerTermsState("loading");
        return;
      }
      if (serverSession.status !== "authenticated") {
        setServerTerms(null);
        setServerTermsState(serverSession.status === "anonymous" ? "login_required" : "error");
        return;
      }
      if (!serverSession.hasPermission("quote.view")) {
        setServerTerms(null);
        setServerTermsState("forbidden");
        return;
      }
      setServerTermsState("loading");
      try {
        const result = await confirmedCommercialTermsServerClient.getByQuote(quote.id, revision.revisionId, activeVersion.id);
        if (!active) return;
        setServerTerms(result);
        setServerTermsState("ready");
      } catch (error) {
        if (!active) return;
        setServerTerms(null);
        if (error instanceof ConfirmedCommercialTermsServerError && error.status === 401) {
          serverSession.invalidate();
          setServerTermsState("login_required");
        } else if (error instanceof ConfirmedCommercialTermsServerError && error.status === 403) {
          setServerTermsState("forbidden");
        } else {
          setServerTermsState("error");
        }
      }
    });
    return () => { active = false; };
  }, [activeVersion, isHistorical, isNew, quote.id, revision.revisionId, serverSession]);

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
    if (quoteFrozen) return;
    setVersionError("");
    setVersionDraft({
      name: mode === "copy" ? "" : source.name,
      quantity: mode === "copy" || source.quantity === null ? "" : String(source.quantity),
      description: mode === "copy" ? "" : source.description,
    });
    setVersionModal({ mode, sourceId: source.id });
  };

  const submitVersionModal = async () => {
    if (!versionModal) return;
    if (!versionDraft.name.trim()) { setVersionError("请填写价格版本名称"); return; }
    const quantity = parseNumberDraft(versionDraft.quantity);
    if (quantity === null) { setVersionError("请填写价格版本数量"); return; }
    if (serverMode) {
      try { browserNumberFromExactDecimal(versionDraft.quantity, "priceVersion.quantity"); }
      catch { setVersionError("数量无法安全精确读写；草稿保留，未执行版本命令。"); return; }
    }
    const sourceVersions = normalizeSinglePriceVersionName(revision.priceVersions);
    const source = sourceVersions.find((version) => version.id === versionModal.sourceId);
    if (!source) return;
    if (serverMode) {
      const completed = await serverVersionAction({ action: versionModal.mode === "copy" ? "price.create" : "price.update", revisionId: revision.revisionId, priceVersionId: source.id, name: versionDraft.name.trim(), quantity: versionDraft.quantity, description: versionDraft.description });
      if (completed) setVersionModal(null);
      return;
    }
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

  const persistMaster = async (scope: BasicSettingsServerScope, next: BasicSettingsState) => {
    if (q3Authority === "frozen") throw new Error("迁移维护中，基础资料只读");
    if (q3Authority === "server") {
      if (serverSession.status !== "authenticated") throw new Error("Server 会话未就绪");
      try {
        const result = await serverMasters.persist(scope, masterData, next);
        if (result.supplierOptions) setServerSupplierOptions(result.supplierOptions);
        return result;
      } catch (error) {
        if (error instanceof QuoteMasterServerError && error.status === 401) serverSession.invalidate();
        throw error;
      }
    }
    return { state: saveBasicSettings(next) };
  };

  const masterSaveError = (error: unknown, kind: string) => {
    if (error instanceof QuoteMasterServerError) {
      if (error.status === 401) return `Server 会话失效；${kind}未保存，报价草稿保留。`;
      if (error.status === 403) return `Server 权限不足；${kind}未保存，报价草稿保留。`;
      if (error.status === 409) return `Server 资料已变更；${kind}未保存，请核对最新版本。`;
    }
    return `${kind}保存失败；未写入 Browser 基础资料，报价草稿保留。`;
  };

  const saveFabricToLibrary = async (line: FabricCostLine) => {
    if (!line.name.trim()) { notify("请先填写面料名称"); return; }
    const existing = masterData.fabricLibrary.find((item) => item.id === line.sourceLibraryItemId);
    const id = existing?.id ?? createMasterDataId("fabric");
    try {
      const saved = await persistMaster("fabrics", upsertFabricLibraryItem(masterData, fabricLibraryItemFromCostLine(line, id, existing)));
      setMasterData(saved.state);
      updateFabricLine(line.id, { sourceLibraryItemId: saved.createdId ?? id });
      notify(existing ? `已更新面料库中的“${line.name.trim()}”` : `“${line.name.trim()}”已存入面料库`);
    } catch (error) { notify(masterSaveError(error, "面料库")); }
  };

  const saveTrimToLibrary = async (line: TrimCostLine) => {
    if (!line.name.trim()) { notify("请先填写辅料名称"); return; }
    const existing = masterData.trimLibrary.find((item) => item.id === line.sourceLibraryItemId);
    const id = existing?.id ?? createMasterDataId("trim");
    try {
      const saved = await persistMaster("trims", upsertTrimLibraryItem(masterData, trimLibraryItemFromCostLine(line, id, existing)));
      setMasterData(saved.state);
      updateTrimLine(line.id, { sourceLibraryItemId: saved.createdId ?? id });
      notify(existing ? `已更新辅料库中的“${line.name.trim()}”` : `“${line.name.trim()}”已存入辅料库`);
    } catch (error) { notify(masterSaveError(error, "辅料库")); }
  };

  const flushPendingAttachmentDeletes = async () => {
    assertBrowserQuoteWrite();
    const pendingDeletes = [...pendingAttachmentDeletesRef.current];
    await Promise.all(pendingDeletes.map(async (attachmentId) => {
      if (await orderRepository.isAttachmentReferenced(attachmentId)) return;
      await deleteBrowserQuoteAttachment(attachmentId);
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
    if (persistence) {
      if (serverBusy || serverError || unsafeNumbers.size) throw new Error("Server 保存被阻止：写入进行中、精度不足或待核对");
      setServerBusy(true);
      try {
        const saved = await persistence.save(targetQuote);
        setQuote(saved.quote);
        savedQuoteRef.current = structuredClone(saved.quote);
        pendingAuditLogsRef.current = [];
        setIsDirty(false);
        notify(`报价已保存到 Server · v${saved.expectedVersion}`);
      } finally { setServerBusy(false); }
      return;
    }
    await mockQuoteRepository.save(targetQuote);
    await appendSavedOperationLogs(targetQuote, additionalLogs);
    await flushPendingAttachmentDeletes();
    setIsDirty(false);
    notify("报价草稿已保存");
  };

  const serverVersionAction = async (command?: QuoteVersionAction, view?: () => void) => {
    if (!persistence || versionActionPending.current || serverBusy || serverError || unsafeNumbers.size) return false;
    versionActionPending.current = true;
    let savedFirst = false;
    try {
      if (isDirty) {
        if (!window.confirm("有未保存修改。保存成功后继续版本操作？取消会保留草稿。")) return false;
        const savedRevision = savedQuoteRef.current?.revisions.find(item => item.revisionId === revision.revisionId);
        const candidates = isHistorical ? [] : createCostSyncCandidates(savedRevision, revision, activeVersion.id);
        if (candidates.length) {
          setPriceSyncRequest({ candidates, intent: "save" });
          notify("先完成显式成本同步选择并保存，再继续版本操作；尚未执行版本命令。");
          return false;
        }
        await persistQuote(quote); savedFirst = true;
      }
      if (!command) { view?.(); return true; }
      setServerBusy(true);
      const result = await persistence.workflow(command);
      setQuote(result.quote); savedQuoteRef.current = structuredClone(result.quote); setIsDirty(false);
      const current = getDefaultRevision(result.quote);
      setViewedRevisionId(current.revisionId);
      setActivePriceId(command.action === "price.create" ? current.priceVersions.at(-1)!.id : current.priceVersions.some(p => p.id === activePriceId) ? activePriceId : current.priceVersions[0].id);
      setAttachmentPreviewId(null); setPricingOpen(false);
      notify(`版本操作已保存到 Server · v${result.expectedVersion}`);
      return true;
    } catch (cause) {
      const status = cause && typeof cause === "object" && "status" in cause ? `HTTP ${String(cause.status)}` : "结果不确定";
      setServerError(`${savedFirst ? "前一步草稿已保存；" : "草稿保留；"}版本操作未确认（${status}），请核对 Server，不自动重复创建。`);
      return false;
    } finally { versionActionPending.current = false; setServerBusy(false); }
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
    if (serverMode && (serverBusy || serverError || unsafeNumbers.size)) return false;
    if (quoteFrozen) return false;
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

  const reportServerSaveFailure = (error: unknown) => {
    const status = error && typeof error === "object" && "status" in error ? `HTTP ${String(error.status)}` : "网络/精度";
    setServerError(`Server 保存未完成（${status}）；未保存草稿保留。请显式重新读取并核对，不自动重试、不保存至 Browser。`);
  };

  const commitPriceVersionSync = async (decisions: Record<string, CostSyncDecision>) => {
    if (!priceSyncRequest || costSyncPending.current || (persistence && (serverBusy || serverError || unsafeNumbers.size))) return;
    costSyncPending.current = true;
    try {
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
    setQuote(finalQuote);
    setIsDirty(true);
    await persistQuote(finalQuote, [syncLog]);
    setPriceSyncRequest(null);
    await finishPersistIntent(intent, finalQuote);
    } catch (error) {
      if (!persistence) throw error;
      // The chosen scope is already reflected in finalQuote, including independent
      // flags. Keep that dirty draft; close the overlay to expose reconciliation.
      setPriceSyncRequest(null);
      reportServerSaveFailure(error);
    } finally { costSyncPending.current = false; }
  };

  const saveCurrentPriceVersionOnly = () => {
    if (!priceSyncRequest) return;
    const decisions = Object.fromEntries(priceSyncRequest.candidates.map((candidate) => [candidate.id, { scope: "current" as const, selectedVersionIds: [candidate.sourcePriceVersionId] }]));
    return commitPriceVersionSync(decisions);
  };

  const save = async () => {
    if (persistence && (serverBusy || serverError || unsafeNumbers.size)) return;
    try { await requestPersist("save"); } catch (error) {
      if (!persistence) throw error;
      reportServerSaveFailure(error);
    }
  };

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
    try { await requestPersist("navigate"); } catch (error) {
      if (!serverMode) throw error;
      setServerError("Server 保存未确认，未保存草稿保留；请显式核对。未离开页面、未写 Browser。");
    }
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
    if (quoteFrozen) return;
    if (!isHistorical && !isNew && activeConfirmationAuthority === "unknown_blocked") {
      notify(activeServerTermsState === "login_required"
        ? "请先登录可信 Server 会话，再确认当前价格方案是否已关联正式订单。"
        : activeServerTermsState === "forbidden"
          ? "当前 Server 账号没有 quote.view 权限，不能安全解析共享确认条款。"
          : "共享确认条款状态尚不可用；未写入本地确认值。");
      return;
    }
    const linked = !isHistorical && activeServerTerms?.linkage === "linked";
    const confirmation = linked ? activeServerTerms.current : activeVersion.confirmation;
    const preflight = validateCustomerConfirmation(revision, activeVersion, {
      labor: confirmation?.confirmedLaborPrice === null || confirmation?.confirmedLaborPrice === undefined ? 0 : Number(confirmation.confirmedLaborPrice),
      garment: revision.baseInfo.quoteType === "distribution"
        ? confirmation && "confirmedGarmentPrice" in confirmation
          ? confirmation.confirmedGarmentPrice ?? 0
          : confirmation?.customerConfirmedPrice === null || confirmation?.customerConfirmedPrice === undefined
            ? 0
            : Number(confirmation.customerConfirmedPrice)
        : null,
    });
    if (!preflight.valid) {
      setConfirmationValidationIssues(preflight.issues.filter((issue) => !issue.code.startsWith("confirmation.")));
      notify("客户确认前请先完成关键报价资料");
      return;
    }
    setConfirmationValidationIssues([]);
    setConfirmationDraft({
      labor: confirmation?.confirmedLaborPrice === null || confirmation?.confirmedLaborPrice === undefined ? "" : String(confirmation.confirmedLaborPrice),
      garment: confirmation && "confirmedGarmentPrice" in confirmation
        ? confirmation.confirmedGarmentPrice === null ? "" : String(confirmation.confirmedGarmentPrice)
        : confirmation?.customerConfirmedPrice ?? "",
      note: confirmation && "note" in confirmation ? confirmation.note : "",
    });
    setConfirmationError("");
    setConfirmationOpen(true);
  };

  const saveConfirmation = async () => {
    assertBrowserQuoteWrite();
    const labor = parseNumberDraft(confirmationDraft.labor);
    const garment = parseNumberDraft(confirmationDraft.garment);
    if (activeConfirmationAuthority === "unknown_blocked") {
      setConfirmationError("Server 关联状态未知；未写入本地确认值。");
      return;
    }
    const validation = validateCustomerConfirmation(revision, activeVersion, { labor, garment });
    if (!validation.valid) {
      setConfirmationError(validation.issues.map((issue) => issue.message).join("；"));
      return;
    }
    if (labor === null) return;
    if (activeConfirmationAuthority === "linked_server" && activeServerTerms?.linkage === "linked") {
      if (serverSession.status !== "authenticated" || !serverSession.hasPermission("quote.confirm")) {
        setConfirmationError("需要具有 quote.confirm 的可信 Server 会话；未写入本地确认值。");
        return;
      }
      try {
        const nextTerms = await confirmedCommercialTermsServerClient.updateByQuote(
          quote.id,
          revision.revisionId,
          activeVersion.id,
          {
            expectedVersion: activeServerTerms.current?.version ?? 0,
            customerConfirmedPrice: revision.baseInfo.quoteType === "distribution" ? confirmationDraft.garment : null,
            confirmedLaborPrice: confirmationDraft.labor,
            laborCurrency: activeVersion.pricingParameters.laborCurrency,
          },
        );
        setServerTerms(nextTerms);
        setConfirmationOpen(false);
        notify(`已保存 ${activePriceDisplayName} 的 Server 共享确认条款`);
      } catch (error) {
        if (error instanceof ConfirmedCommercialTermsServerError && error.status === 401) {
          serverSession.invalidate();
          setConfirmationOpen(false);
          notify("Server 会话已失效；未写入本地确认值。");
          return;
        }
        if (error instanceof ConfirmedCommercialTermsServerError && error.status === 409) {
          try {
            const current = await confirmedCommercialTermsServerClient.getByQuote(quote.id, revision.revisionId, activeVersion.id);
            setServerTerms(current);
            setConfirmationDraft({
              labor: current.current?.confirmedLaborPrice ?? "",
              garment: current.current?.customerConfirmedPrice ?? "",
              note: "",
            });
          } catch {
            // Preserve the explicit optimistic-conflict message.
          }
          setConfirmationError("共享条款已被其他页面更新，已重新读取当前值；请核对后再保存。");
          return;
        }
        setConfirmationError(error instanceof ConfirmedCommercialTermsServerError && error.status === 403
          ? "当前 Server 账号没有 quote.confirm 权限。"
          : "Server 共享条款保存失败；未回退写入 Quote 本地数值。");
      }
      return;
    }
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
    if (quoteFrozen) return false;
    const validation = validateRevisionUpdate(source);
    if (!validation.valid) {
      notify("更新报价版本前请先完成关键资料");
      return false;
    }
    return true;
  };

  const createRevision = async (source: QuoteRevision, reason: QuoteRevisionReason, note: string) => {
    if (serverMode) {
      if (await serverVersionAction({ action: "revision.create", sourceRevisionId: source.revisionId, reason, note })) setRevisionManagerOpen(false);
      return;
    }
    assertBrowserQuoteWrite();
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

  const confirmDeletePriceVersion = async () => {
    if (!priceVersionDeleteTargetId) return;
    if (serverMode) {
      if (await serverVersionAction({ action: "price.delete", revisionId: revision.revisionId, priceVersionId: priceVersionDeleteTargetId })) { setPriceVersionDeleteTargetId(null); setVersionModal(null); }
      return;
    }
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

  const performMasterSwitch = async (intent: Exclude<MasterSwitchIntent, null>, mode: "keep" | "apply", sourceState = masterData) => {
    const sequence = ++masterSwitchSequenceRef.current;
    const brandId = intent.kind === "brand" ? intent.value : revision.baseInfo.brandId;
    const salespersonId = intent.kind === "brand" ? "" : intent.value;
    const baseInfo = intent.kind === "brand"
      ? { ...revision.baseInfo, brandId, brandName: intent.label, salespersonId: "", salespersonName: "" }
      : { ...revision.baseInfo, salespersonId, salespersonName: intent.label };
    let next: QuoteRevision = { ...revision, baseInfo };

    if (mode === "apply") {
      let defaults: ResolvedQuoteDefaults;
      try {
        if (q3Authority === "server") defaults = await serverMasters.resolveDefaults(brandId, salespersonId);
        else {
          const systemSettings = masterSettings ?? loadGlobalQuoteSettings();
          defaults = resolveQuoteDefaults(sourceState, brandId, salespersonId, {
            usdCnyRate: systemSettings.defaultUsdCnyRate,
            defaultOtherCost: systemSettings.defaultOtherCost,
          });
        }
        if (sequence !== masterSwitchSequenceRef.current) return;
      } catch (error) {
        if (sequence !== masterSwitchSequenceRef.current) return;
        if (error instanceof QuoteMasterServerError && error.status === 401) serverSession.invalidate();
        setMasterError("Server 默认资料读取失败；当前报价草稿未改变，也未回退 Browser。");
        setMasterSwitchIntent(intent);
        notify("Server 默认资料读取失败；当前报价草稿已保留。");
        return;
      }
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
    setMasterError("");
    setMasterSwitchIntent(null);
  };

  const requestBrandChange = (value: string, option: { label: string }, sourceState = masterData) => {
    if (value === revision.baseInfo.brandId) return;
    const intent: Exclude<MasterSwitchIntent, null> = { kind: "brand", value, label: option.label };
    if (hasUserDefaultData() || defaultsStateRef.current.rateTouched || defaultsStateRef.current.trimsTouched || defaultsStateRef.current.otherTouched) setMasterSwitchIntent(intent);
    else void performMasterSwitch(intent, "apply", sourceState);
  };

  const requestSalespersonChange = (value: string, option: { label: string }, sourceState = masterData) => {
    if (value === revision.baseInfo.salespersonId) return;
    const intent: Exclude<MasterSwitchIntent, null> = { kind: "salesperson", value, label: option.label };
    if (hasUserDefaultData() || defaultsStateRef.current.rateTouched || defaultsStateRef.current.trimsTouched || defaultsStateRef.current.otherTouched) setMasterSwitchIntent(intent);
    else void performMasterSwitch(intent, "apply", sourceState);
  };

  if (!activeVersion) return null;
  const breakdownMetrics = calculatePriceVersionMetrics(activeVersion);

  const selectViewedRevision = (nextRevision: QuoteRevision) => {
    if (serverMode && !can("quote.revision.view")) return;
    setViewedRevisionId(nextRevision.revisionId);
    setActivePriceId(nextRevision.priceVersions[0]?.id ?? "");
    setConfirmationValidationIssues([]);
    setPricingOpen(false);
    setAttachmentPreviewId(null);
  };

  const viewRevision = (next: QuoteRevision) => serverMode ? void serverVersionAction(undefined, () => selectViewedRevision(next)) : selectViewedRevision(next);
  const returnToDefaultRevision = () => viewRevision(currentRevision);
  const creatingSecondPriceVersion = versionModal?.mode === "copy" && revision.priceVersions.length === 1;
  const creationValidationIssues = isNew ? validateQuoteCreation(revision).issues : [];
  const cancelMasterSwitch = () => { masterSwitchSequenceRef.current += 1; setMasterSwitchIntent(null); };
  const masterSwitchModal = <Modal open={Boolean(masterSwitchIntent)} title="更换默认资料来源" description="更换品牌 / 客户业务员可能会重新应用默认报价资料。" onClose={cancelMasterSwitch} onSubmit={() => { if (masterSwitchIntent) void performMasterSwitch(masterSwitchIntent, "apply"); }} footer={<><Button variant="secondary" onClick={cancelMasterSwitch}>取消切换</Button><Button variant="secondary" onClick={() => masterSwitchIntent && void performMasterSwitch(masterSwitchIntent, "keep")}>保留当前报价资料</Button><Button type="submit">应用新的默认资料</Button></>}><p className="qc-unsaved-message">应用新的默认资料会替换当前价格版本的默认辅料、汇率和默认其他费用；面料与工价不会被改写。</p>{masterError && <p className="qc-form-alert">{masterError}</p>}</Modal>;
  const q3AuthorityNotice = q3Authority === "browser" ? null : <AlertBanner tone="warning" title={q3Authority === "frozen" ? "基础资料迁移维护中" : "基础资料来自 PostgreSQL"}>{serverMode ? "报价与基础资料保存至 Server；暂无资料或设置时保持未配置，不补 Browser 数据。" : q3Authority === "frozen" ? "Browser 基础资料只读；报价聚合仍保存在 Browser。" : "品牌、业务员、面辅料库和报价默认值来自可信 Server；报价聚合仍保存在 Browser。"}</AlertBanner>;

  if (q3Authority === "server" && serverSession.status === "anonymous") return <AppShell title="Server 基础资料登录"><PageContainer><ServerLoginCard description="登录后读取 PostgreSQL 基础资料；不会回退到 Browser 设置。" /></PageContainer></AppShell>;
  if (q3Authority === "server" && serverSession.status === "error") return <AppShell title="Server 基础资料不可用"><PageContainer><ErrorState title="无法确认 Server 身份" description={serverSession.error} onRetry={() => void serverSession.refresh()} /></PageContainer></AppShell>;
  if (q3Authority === "server" && serverSession.status !== "authenticated") return <AppShell title="Server 基础资料"><PageContainer><LoadingState label="确认 Server 会话" /></PageContainer></AppShell>;
  if (q3Authority === "server" && !serverSession.hasPermission("quote.view")) return <AppShell title="Server 基础资料"><PageContainer><ErrorState permission title="Server 权限不足" description="需要 quote.view 才能读取报价基础资料。" /></PageContainer></AppShell>;
  if (masterStatus === "error") return <AppShell title="基础资料不可用"><PageContainer><ErrorState title="基础资料读取失败" description={masterError} /></PageContainer></AppShell>;
  if (masterStatus !== "ready") return <AppShell title="载入基础资料"><PageContainer><LoadingState label="读取报价基础资料" /></PageContainer></AppShell>;

  if (isNew) return <AppShell title="新建报价" backTarget={{ href: "/quote-center", label: "返回报价中心" }} onRequestNavigation={requestNavigation}><PageContainer className="qc-create-page qc-quote-create-page">
    {quoteFrozen && <div role="status" className="qc-form-alert">报价迁移冻结 · 只读。现有报价与附件可查看、下载和导出。</div>}
    {q3AuthorityNotice}
    <FormShell className="qc-create-form" submitOnEnter={false} onSubmit={save}>
      <PageHeader
        variant="object"
        eyebrow="CREATE QUOTE"
        title={revision.baseInfo.quoteStyleNo.trim() || "新建报价"}
        description={<><strong>{revision.baseInfo.styleName.trim() || "先建立款式与客户上下文"}</strong><span>创建后进入报价详情继续维护成本、附件与客户确认。</span></>}
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

      <div data-validation-anchor="base-info"><QuoteBaseInfo revision={revision} readOnly={quoteReadOnly} brandOptions={brandOptions} salespersonOptions={salespersonOptions} onBrandChange={requestBrandChange} onSalespersonChange={requestSalespersonChange} onCreateBrand={(query) => setQuickMasterRequest({ kind: "brand", query })} onCreateSalesperson={(query) => setQuickMasterRequest({ kind: "salesperson", query, brandId: revision.baseInfo.brandId })} canCreateBrand={canQ3("settings.brand.edit")} canCreateSalesperson={canQ3("settings.salesperson.edit")} onChange={updateRevision} styleImage={styleImageAsset ? { url: styleImageAsset.url, name: styleImageAsset.attachment.name } : null} onStyleImagePreview={() => revision.styleImageAttachmentId && setAttachmentPreviewId(revision.styleImageAttachmentId)} /></div>

      <FormSection title="初始价格方案" description="PriceVersion 是当前报价快照内的价格方案；成本明细将在创建后继续维护。" columns={2} className="qc-create-pricing-section">
        <FormItem label="报价类型" required><select className="qc-control" value={revision.baseInfo.quoteType} onChange={(event) => updateRevision({ ...revision, baseInfo: { ...revision.baseInfo, quoteType: event.target.value as QuoteRevision["baseInfo"]["quoteType"] } })}><option value="processing">加工报价</option><option value="distribution">经销报价</option></select></FormItem>
        <FormItem label="价格方案名称" required><input className="qc-control" value={activeVersion.name} onChange={(event) => updateActiveVersion((version) => ({ ...version, name: event.target.value }))} /></FormItem>
        <div className="qc-create-readonly"><span>制作口径</span><strong>{activeProductionLabel}</strong><small>当前为报价快照；系统预设后续变化不会回写。</small></div>
        <div className="qc-create-readonly"><span>工价币种 / 成本加成</span><strong>{activeVersion.pricingParameters.laborCurrency} · {activeVersion.pricingParameters.markupRate === null ? "未设置" : `${activeVersion.pricingParameters.markupRate}%`}</strong><Button variant="text" permission="quote.settings.edit" onClick={() => setPricingOpen(true)}>调整报价设置</Button></div>
      </FormSection>

      <section className="qc-create-next-step"><div><strong>创建后继续</strong><span>面料、辅料、工价、其他费用、附件和客户确认仍使用报价详情的正式数据通道。</span></div><small>本页不会预生成 EstimateCost，也不会创建第二套计算逻辑。</small></section>
      {isDirty && <SaveBar state="dirty" message="新建报价有未保存修改" saveLabel="创建报价" onSave={() => void save()} />}
    </FormShell>
    <QuickMasterDataCreate request={quickMasterRequest} state={masterData} authority={q3Authority} canMaster={canQ3} persistMaster={persistMaster} onStateChange={setMasterData} onClose={() => setQuickMasterRequest(null)} onBrandCreated={(brand, nextState) => { setMasterData(nextState); requestBrandChange(brand.id, { label: brand.name }, nextState); }} onSalespersonCreated={(salesperson, nextState) => { setMasterData(nextState); requestSalespersonChange(salesperson.id, { label: salesperson.name }, nextState); }} notify={notify} />
    {masterSwitchModal}
    <QuotePricingSettings open={pricingOpen} priceVersion={activeVersion} settings={masterSettings ?? undefined} readOnly={!can("quote.settings.edit")} onPriceVersionChange={(priceVersion) => { defaultsStateRef.current.rateTouched = true; defaultsStateRef.current.rateAuto = false; updateActiveVersion(() => priceVersion); }} onClose={() => setPricingOpen(false)} />
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
    ...(serverMode ? [{ id: "edit-price-version", label: "编辑价格版本", permission: "quote.edit" as const, variant: "secondary" as const, onClick: () => openVersionModal("edit", activeVersion) }] : []),
    ...(!isNew ? [{ id: "confirmation", label: "客户确认", permission: "quote.confirm" as const, variant: "secondary" as const, onClick: openConfirmation }] : []),
    { id: "export", label: "导出报价", permission: "quote.export", variant: "secondary", onClick: openExport },
    ...(!isNew ? [{ id: "create-order", label: "生成订单", permission: "order.create" as const, variant: "secondary" as const, onClick: () => setQuoteToOrderOpen(true) }] : []),
    ...(!isNew ? [{ id: "delete", label: "删除报价", permission: "quote.delete" as const, variant: "danger" as const, menuVariant: "danger" as const, onClick: () => setDeleteOpen(true) }] : []),
  ];
  const primaryAction: QuoteActionDescriptor | undefined = isHistorical
    ? { id: "update-revision", label: "更新此报价版本", permission: "quote.revision.update", variant: "primary", onClick: () => setRevisionManagerOpen(true) }
    : { id: "save", label: "保存草稿", permission: "quote.edit", variant: "primary", onClick: save };
  const visibleActions: QuoteActionDescriptor[] = [];
  for (const action of contextualActions) {
    if (serverMode && !["revisions", "current-revision", "create-price-version", "edit-price-version"].includes(action.id)) continue;
    if (!serverMode && quoteFrozen && !["revisions", "operation-log", "export", "current-revision"].includes(action.id)) continue;
    visibleActions.push(action);
  }
  const quoteActionBarProps = { actions: visibleActions,
    primaryAction: quoteFrozen ? undefined : primaryAction, quickNavigationItems };

  const headerActions = <div className="qc-quote-header-controls">
    <QuoteActionBar {...quoteActionBarProps} keepPrimaryVisible={serverMode} onModeChange={setHeaderActionMode} />
  </div>;

  return <PermissionAuthorityProvider can={can}><NumberPrecisionContext.Provider value={serverMode ? precision : null}><AppShell title={isNew ? "新建报价" : "款式报价明细"} backTarget={{ href: "/quote-center", label: "返回报价中心" }} onRequestNavigation={requestNavigation}><PageContainer>
    {quoteFrozen && <div role="status" className="qc-form-alert">报价迁移冻结 · 只读。现有报价与附件可查看、下载和导出。</div>}
    {q3AuthorityNotice}
    {serverMode && <AlertBanner tone="info" title={`Server 报价 · v${persistence?.getVersion()}`}>基础信息、价格方案、Revision 工作流、报价设置与附件已接通。Estimate / 客户确认 / 导出 / 整单复制或删除 / Revision 删除 / 转订单 / 日志查看尚未接线，禁用且不调用 Browser。<Button variant="text" disabled={serverBusy} onClick={() => void serverMasters.load().then((loaded) => { setMasterData(loaded.state); setMasterSettings(loaded.settings); setServerSupplierOptions(loaded.supplierOptions); }).catch(() => notify("Server 基础资料刷新失败；没有 fallback"))}>刷新基础资料</Button></AlertBanner>}
    {unsafeNumbers.size > 0 && <ErrorState title="数值无法安全精确读写，保存已阻止" description="请修正输入；系统不会舍入后保存。" />}
    {serverError && <ErrorState title="Server 写入需核对" description={serverError} onRetry={() => { if (window.confirm("放弃当前未保存草稿并重新读取 Server？")) { setIsDirty(false); window.setTimeout(() => window.location.reload(), 100); } }} />}
    <FormShell className="qc-page-form-shell" submitOnEnter={false} onSubmit={() => { if (!quoteReadOnly) return save(); }}>
    <div ref={titleSentinelRef} className="qc-title-sentinel"><PageHeader className="qc-quote-object-header" variant="object" eyebrow="QUOTE WORKSPACE" title={pageTitle} description={<span className="qc-quote-object-description"><strong>{pageSubtitle}</strong><span className="qc-workspace-metadata"><b>{revision.baseInfo.brandName || "未填写品牌"}</b><span>{revision.baseInfo.salespersonName || "未填写客户业务员"}</span><span>{revision.baseInfo.quoteType === "distribution" ? "经销报价" : "加工报价"}</span><span>{quoteStatusLabel}</span><span>报价编号 {quote.quoteCode}</span><span>{quoteFrozen ? "迁移冻结 · 只读" : isHistorical ? "历史只读" : "当前编辑"}</span></span></span>} actions={headerActions} /><QuoteCockpit version={activeVersion} revisionLabel={revision.revisionLabel} priceVersionLabel={activePriceDisplayName} productionLabel={activeProductionLabel} confirmationLabel={activeConfirmationLabel} differenceCount={unconfirmedCostDifferences.length} historical={isHistorical} onDifferenceClick={() => setPriceDifferencesOpen(true)} onFinalQuoteClick={() => setBreakdownOpen(true)} settingsAction={<Button permission="quote.settings.edit" variant="text" onClick={() => setPricingOpen(true)}>报价设置</Button>} /></div>
    <div className={`qc-sticky-header ${stickyVisible ? "is-visible" : ""}`} aria-hidden={!stickyVisible}><div className="qc-sticky-summary"><strong>{pageTitle}</strong><small>{pageSubtitle} · {revision.baseInfo.brandName || "未填写品牌"} · {revision.baseInfo.salespersonName || "未填写业务员"}</small></div><div className="qc-sticky-state"><span>{revision.revisionLabel} · {activePriceDisplayName}</span><span>{activeProductionLabel} · {revision.baseInfo.quoteType === "distribution" ? "经销" : "加工"}</span><span>{activeVersion.quantity === null ? "数量未填写" : `${activeVersion.quantity.toLocaleString("zh-CN")} 件`} · 成衣 {formatFinalGarmentPrice(metrics?.garmentSellingPrice ?? null)}</span><span>工价 {activeVersion.labor.value === null ? "—" : activeVersion.labor.value.toFixed(2)} {activeVersion.pricingParameters.laborCurrency} · {activeConfirmationLabel}</span><b>{isDirty ? "有未保存修改" : "已保存"}</b></div><div className="qc-sticky-actions">{!quoteReadOnly && <Button permission="quote.edit" onClick={save}>保存</Button>}{!isNew && !quoteFrozen && <Button permission="order.create" variant="secondary" onClick={() => setQuoteToOrderOpen(true)}>生成订单</Button>}</div></div>
    <div className="qc-quote-functional-stack">
      <div className={`qc-quick-navigation-normal ${headerActionMode === "full" ? "" : "is-collapsed"}`}><QuoteQuickNavigation items={quickNavigationItems} /></div>
      <ValidationSummary issues={liveRevisionValidationIssues} title={isNew ? "完成新建报价前请完成以下内容" : isHistorical ? "当前报价版本尚有以下资料未完成" : "更新报价版本前请完成以下内容"} onSelect={isHistorical ? undefined : (issue) => { if (issue.priceVersionId) setActivePriceId(issue.priceVersionId); focusQuoteValidationIssue(issue); }} />
      <ValidationSummary issues={confirmationValidationIssues} title="客户确认前请完成以下内容" onSelect={(issue) => { if (issue.priceVersionId) setActivePriceId(issue.priceVersionId); focusQuoteValidationIssue(issue); }} />
    </div>
    <div id="quote-section-base-info" className="qc-editor-surface qc-page-section-anchor" data-validation-anchor="base-info"><QuoteBaseInfo revision={revision} readOnly={quoteReadOnly} readOnlyLabel={quoteFrozen ? "迁移冻结" : isHistorical ? "历史只读" : "权限只读"} brandOptions={brandOptions} salespersonOptions={salespersonOptions} onBrandChange={requestBrandChange} onSalespersonChange={requestSalespersonChange} onCreateBrand={(query) => setQuickMasterRequest({ kind: "brand", query })} onCreateSalesperson={(query) => setQuickMasterRequest({ kind: "salesperson", query, brandId: revision.baseInfo.brandId })} canCreateBrand={canQ3("settings.brand.edit")} canCreateSalesperson={canQ3("settings.salesperson.edit")} onChange={updateRevision} styleImage={styleImageAsset ? { url: styleImageAsset.url, name: styleImageAsset.attachment.name } : null} onStyleImagePreview={() => revision.styleImageAttachmentId && setAttachmentPreviewId(revision.styleImageAttachmentId)} /></div>
    {revision.priceVersions.length >= 2 && <PriceVersionSelector sectionId="quote-section-price-versions" revision={revision} activeId={activeVersion.id} readOnly={isHistorical} canEdit={canEditQuote} onSelect={(id) => serverMode ? void serverVersionAction(undefined, () => setActivePriceId(id)) : setActivePriceId(id)} onEdit={(version) => openVersionModal("edit", version)} />}
    <section id="quote-section-costs" className="qc-cost-heading qc-page-section-anchor"><div><span className="qc-section-index">02</span><div><h2>{activePriceDisplayName} · 成本明细</h2><p>正在{quoteFrozen || isHistorical ? "查看报价版本快照" : "编辑当前价格方案"}；所有物料值均为独立报价快照。</p></div></div></section>
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
    <section id="quote-section-confirmation" className="qc-workspace-reference qc-page-section-anchor"><div><span>客户确认</span><strong>{isHistorical ? (activeVersion.confirmation ? "历史价格方案已确认" : "历史价格方案未确认") : activeServerTerms?.linkage === "linked" ? (linkedCurrentConfirmationComplete ? "Server 共享条款已确认" : "Server 共享条款未确认") : activeVersion.confirmation ? "当前价格方案已确认" : "当前价格方案未确认"}</strong><small>{isHistorical ? "历史快照只读" : activeServerTerms?.linkage === "linked" ? `Server current · v${activeServerTerms.current?.version ?? 0}` : activeServerTermsState === "ready" ? "已证明未关联正式订单 · 保留本地确认流程" : activeServerTermsState === "legacy_pre_activation" ? "Server linkage 未激活 · 保留现有本地确认流程" : "关联状态未知 · 禁止本地确认"} · {revision.revisionLabel} · {activePriceDisplayName}</small></div>{!isNew && !quoteFrozen && <Button permission="quote.confirm" variant="secondary" onClick={openConfirmation}>{activeServerTerms?.linkage === "linked" ? "查看 / 更新共享条款" : activeVersion.confirmation ? "查看 / 更新确认" : "客户确认"}</Button>}</section>
    <div id="quote-section-attachments" className="qc-page-section-anchor"><QuoteAttachmentPanel revision={revision} readOnly={quoteReadOnly} createdBy={revision.baseInfo.salespersonName || currentUser.name} previewAttachmentId={attachmentPreviewId} onPreviewAttachmentIdChange={setAttachmentPreviewId} controller={attachmentController} onBusyChange={serverMode ? setServerBusy : undefined} onMutationError={serverMode ? () => setServerError("附件命令未确认；保留其它草稿并显式核对 Server，不自动重试或回退 IndexedDB。") : undefined} onChange={serverMode ? () => undefined : updateRevision} onAttachmentRemoved={(attachmentId) => { if (!serverMode && !quoteReferencesAttachment(quote, attachmentId, revision.revisionId)) pendingAttachmentDeletesRef.current.add(attachmentId); }} notify={notify} /></div>
    {!isNew && <section id="quote-section-history" className="qc-workspace-reference qc-page-section-anchor"><div><span>报价历史</span><strong>{revision.revisionLabel} · {revision.reason}</strong><small>QuoteRevision 是不可变报价快照；价格方案在当前快照内独立切换。</small></div><Button permission="quote.revision.view" variant="secondary" onClick={() => setRevisionManagerOpen(true)}>查看报价历史</Button></section>}
    </FormShell>
    <QuickMasterDataCreate request={quickMasterRequest} state={masterData} authority={q3Authority} canMaster={canQ3} persistMaster={persistMaster} onStateChange={setMasterData} onClose={() => setQuickMasterRequest(null)} onBrandCreated={(brand, nextState) => { setMasterData(nextState); requestBrandChange(brand.id, { label: brand.name }, nextState); }} onSalespersonCreated={(salesperson, nextState) => { setMasterData(nextState); requestSalespersonChange(salesperson.id, { label: salesperson.name }, nextState); }} notify={notify} />

    <QuotePricingSettings open={pricingOpen} priceVersion={activeVersion} settings={masterSettings ?? undefined} readOnly={quoteFrozen || isHistorical || !can("quote.settings.edit")} onPriceVersionChange={(priceVersion) => { defaultsStateRef.current.rateTouched = true; defaultsStateRef.current.rateAuto = false; updateActiveVersion(() => priceVersion); }} onClose={() => setPricingOpen(false)} />
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
    {masterSwitchModal}
    <Modal open={confirmationOpen} title={`客户确认 · ${activePriceDisplayName}`} description={activeServerTerms?.linkage === "linked" ? "当前数值写入 PostgreSQL 共享商业条款；不会改写 Quote 历史快照。" : `确认结果归属于报价版本 ${revision.revisionLabel} + 当前价格版本，不会覆盖系统测算值。`} onClose={() => setConfirmationOpen(false)} onSubmit={saveConfirmation} footer={<><Button variant="secondary" onClick={() => setConfirmationOpen(false)}>取消</Button><Button type="submit">保存确认</Button></>}>
      <div className="qc-confirmation-quoted"><span><small>系统报价工价</small><strong>{activeVersion.labor.value === null ? "—" : activeVersion.labor.value.toFixed(2)} {activeVersion.pricingParameters.laborCurrency} / 件</strong></span>{revision.baseInfo.quoteType === "distribution" && <span><small>系统报价成衣销售单价</small><strong>{metrics?.garmentSellingPrice === null || metrics?.garmentSellingPrice === undefined ? "—" : `${formatFinalGarmentPrice(metrics.garmentSellingPrice)} RMB / 件`}</strong></span>}</div>
      <div className="qc-modal-form" data-validation-anchor="confirmation-fields"><FormItem label={`客户确认工价（${activeVersion.pricingParameters.laborCurrency} / 件）`} required><input className="qc-control" inputMode="decimal" value={confirmationDraft.labor} onChange={(event) => { if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setConfirmationDraft({ ...confirmationDraft, labor: event.target.value }); }} placeholder="请输入客户确认工价" /></FormItem>{revision.baseInfo.quoteType === "distribution" && <FormItem label="客户确认成衣价格（RMB / 件）" required><input className="qc-control" inputMode="decimal" value={confirmationDraft.garment} onChange={(event) => { if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setConfirmationDraft({ ...confirmationDraft, garment: event.target.value }); }} placeholder="请输入客户确认工价" /></FormItem>}{activeServerTerms?.linkage === "linked" ? <p>确认备注仍属于 Quote 快照，不作为共享 current 条款写入；本次仅保存两个确认金额及工价币种。</p> : <FormItem label="确认备注"><textarea className="qc-control" value={confirmationDraft.note} onChange={(event) => setConfirmationDraft({ ...confirmationDraft, note: event.target.value })} placeholder="可选" /></FormItem>}{confirmationError && <p className="qc-form-alert">{confirmationError}</p>}</div>
    </Modal>
    {!isNew && <RevisionManagerModal serverMode={serverMode} open={revisionManagerOpen} quote={quote} viewedRevisionId={revision.revisionId} onClose={() => setRevisionManagerOpen(false)} canUpdate={!quoteFrozen && !serverBusy && !serverError && can("quote.revision.update")} canViewEstimate={can("estimate.view")} canEditEstimate={!quoteFrozen && can("estimate.edit")} onView={viewRevision} onCanUpdate={canUpdateRevision} onCreate={createRevision} onEstimateChange={changeEstimate} onEstimateGenerate={requestEstimateGeneration} onEstimateIgnoreStale={() => { if (quoteFrozen || serverMode) return; setQuote((current) => ignoreEstimateCostForCurrentRevision(current)); setIsDirty(true); }} onEstimateRestore={restoreEstimate} />}
    {!isNew && !serverMode && <OperationLogModal open={operationLogOpen} quoteId={quote.id} onClose={() => setOperationLogOpen(false)} />}
    {!serverMode && !isNew && !quoteFrozen && quoteToOrderOpen && <QuoteToOrderModal open quote={quote} defaultRevisionId={revision.revisionId} defaultPriceVersionId={activeVersion.id} onClose={() => setQuoteToOrderOpen(false)} />}
    <Modal open={Boolean(pendingEstimateGeneration)} title="重新生成估算成本？" description="当前估算将归档到历史记录，新估算会从所选报价版本重新形成独立快照。" onClose={() => setPendingEstimateGeneration(null)} onSubmit={() => { if (pendingEstimateGeneration) commitEstimateGeneration(pendingEstimateGeneration.source); }} footer={<><Button variant="secondary" onClick={() => setPendingEstimateGeneration(null)}>取消</Button><Button type="submit">确认重新生成</Button></>}><p className="qc-unsaved-message">已有估算成本不会丢失，可随时从历史记录恢复并克隆为新的当前估算。</p></Modal>
    <Drawer open={breakdownOpen} title="最终报价构成" eyebrow="PRICE BREAKDOWN" description={`${activePriceDisplayName} · 所有金额来自正式 PriceVersion Calculator`} onClose={() => setBreakdownOpen(false)}>
      <dl className="qc-price-breakdown">
        <div><dt>面料（加成前）</dt><dd>¥{breakdownMetrics.fabricCost.toFixed(2)}</dd></div>
        <div><dt>辅料（加成前）</dt><dd>¥{breakdownMetrics.trimCost.toFixed(2)}</dd></div>
        <div><dt>工价原币</dt><dd>{activeVersion.pricingParameters.laborCurrency === "USD" ? "$" : "¥"}{breakdownMetrics.laborInput.toFixed(2)} {activeVersion.pricingParameters.laborCurrency}</dd></div>
        <div><dt>工价 RMB 折合</dt><dd>¥{breakdownMetrics.laborRmb.toFixed(2)}</dd></div>
        <div><dt>其他费用</dt><dd>¥{breakdownMetrics.otherCost.toFixed(2)}</dd></div>
        <div><dt>加成前合计</dt><dd>¥{breakdownMetrics.preMarkupTotal.toFixed(2)}</dd></div>
        <div><dt>成本加成率</dt><dd>{activeVersion.pricingParameters.markupRate === null ? "未设置" : `${activeVersion.pricingParameters.markupRate}%`}</dd></div>
        <div className="is-total"><dt>最终报价</dt><dd>{formatFinalGarmentPrice(breakdownMetrics.garmentSellingPrice)} RMB / 件</dd></div>
      </dl>
      <div className="qc-price-breakdown-context"><span>制作国家 <b>{activeVersion.pricingParameters.manufacturingCountry || "未设置"}</b></span><span>加工币种 <b>{activeVersion.pricingParameters.laborCurrency}</b></span>{activeVersion.pricingParameters.laborCurrency === "USD" && <span>USD/CNY 汇率 <b>{activeVersion.pricingParameters.usdCnyRate ?? "未设置"}</b></span>}</div>
    </Drawer>
    <Toast message={toast} />
  </PageContainer></AppShell></NumberPrecisionContext.Provider></PermissionAuthorityProvider>;
}

export function QuoteDetailLoader() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("id") || "quote-001";
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => setQuote(undefined));
    mockQuoteRepository.getById(quoteId).then((next) => { if (active) { setQuote(next); setLoadError(""); } })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "报价读取失败"); });
    return () => { active = false; };
  }, [quoteId]);
  if (loadError) return <AppShell title="报价不可用" backTarget={{ href: "/quote-center", label: "返回报价中心" }}><PageContainer><ErrorState title={loadError} description="已保留原始数据；请在可写版本中确认 canonical source 后再进入冻结窗口。" /></PageContainer></AppShell>;
  if (quote === undefined) return <AppShell title="载入报价" backTarget={{ href: "/quote-center", label: "返回报价中心" }}><PageContainer><div className="loading-screen qc-inline-loading"><div className="loading-mark">纫</div><strong>正在载入报价</strong><span /></div></PageContainer></AppShell>;
  if (!quote) return <AppShell title="报价不存在" backTarget={{ href: "/quote-center", label: "返回报价中心" }}><PageContainer><Card className="qc-not-found"><strong>没有找到这张报价</strong><p>该报价不存在或当前数据源无法读取。</p></Card></PageContainer></AppShell>;
  return <QuoteEditor key={quote.id} initialQuote={quote} />;
}

export function QuoteNewLoader() {
  const quoteFrozen = isBrowserQuoteFrozen();
  const authority = masterSettingsAuthority();
  const session = useServerSession();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (quoteFrozen) return;
    if (started.current) return;
    if (authority === "server" && session.status !== "authenticated") return;
    if (authority === "server" && !session.hasPermission("quote.view")) return;
    started.current = true;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    void Promise.resolve().then(async () => {
      let settings: GlobalQuoteSettings | undefined;
      if (authority === "server") {
        const dependencies = createServerQuoteMasterDependencies(session.permissions);
        const loaded = await dependencies.load();
        const defaults = await dependencies.resolveDefaults();
        settings = {
          ...loaded.settings,
          defaultUsdCnyRate: defaults.usdCnyRate,
          defaultOtherCost: defaults.otherCost,
        };
      }
      return mockQuoteRepository.createDraft(today, settings);
    }).then(setQuote).catch((cause) => {
      if (cause instanceof QuoteMasterServerError && cause.status === 401) session.invalidate();
      setError("新报价默认资料不可用；未读取 Browser 基础资料。");
    });
  }, [authority, session, quoteFrozen]);
  if (quoteFrozen) return <AppShell title="报价迁移冻结 · 只读" backTarget={{ href: "/quote-center", label: "返回报价中心" }}><PageContainer><Card><p>报价数据已进入迁移冻结，只能查看和导出，暂时不能新建报价。</p></Card></PageContainer></AppShell>;
  if (authority === "server" && session.status === "anonymous") return <AppShell title="Server 基础资料登录"><PageContainer><ServerLoginCard description="登录后从 PostgreSQL 读取新报价默认资料。" /></PageContainer></AppShell>;
  if (authority === "server" && session.status === "error") return <AppShell title="Server 基础资料不可用"><PageContainer><ErrorState title="无法确认 Server 身份" description={session.error} onRetry={() => void session.refresh()} /></PageContainer></AppShell>;
  if (authority === "server" && session.status === "authenticated" && !session.hasPermission("quote.view")) return <AppShell title="Server 基础资料"><PageContainer><ErrorState permission title="Server 权限不足" description="读取新报价默认资料需要 quote.view。" /></PageContainer></AppShell>;
  if (error) return <AppShell title="新建报价不可用"><PageContainer><ErrorState title="Server 默认资料读取失败" description={error} /></PageContainer></AppShell>;
  if (!quote) return <AppShell title="新建报价" backTarget={{ href: "/quote-center", label: "返回报价中心" }}><PageContainer><div className="loading-screen qc-inline-loading"><div className="loading-mark">纫</div><strong>正在准备报价草稿</strong><span /></div></PageContainer></AppShell>;
  return <QuoteEditor initialQuote={quote} isNew />;
}
