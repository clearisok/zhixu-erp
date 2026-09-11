import type { AinuokeDetailReportKey, AinuokeReportQuery, AinuokeReportSnapshot } from "../../ainuoke-api/model/ainuoke-api.ts";
import type { BasicSettingsState } from "../../basic-settings/model/basic-settings.ts";
import type { OperationLog, OperationLogActor, OperationLogDraft } from "../../operation-logs/model/operation-log.ts";
import type { SalesOrder } from "../../order-center/model/order.ts";
import type { OrderActor } from "../../order-center/service/order-service.ts";
import type { StyleProgressData } from "../../style-progress/model/style-progress.ts";
import type { StyleProgressRepository } from "../../style-progress/repository/style-progress-repository.ts";
import {
  commitAinuokeMaterialApiPreview,
  toAinuokeMaterialImportPreview,
  type AinuokeMaterialApiCommitResult,
} from "../../style-progress/service/ainuoke-material-api-commit.ts";
import {
  buildAinuokeMaterialApiPreview,
  type AinuokeMaterialApiPreview,
  type AinuokeMaterialApiPreviewSummary,
} from "../../style-progress/service/ainuoke-material-api-preview.ts";
import type { AinuokeSyncState } from "../model/ainuoke.ts";
import type { AinuokeRepository } from "../repository/ainuoke-repository.ts";
import { stableSourceHash } from "../source/ainuoke-contract-source.ts";
import {
  buildAinuokeContractApiPreview,
  commitAinuokeContractApiPreview,
  type AinuokeContractApiCommitRepositories,
  type AinuokeContractApiPreview,
} from "./ainuoke-contract-api-sync.ts";

export type AinuokeUnifiedChangeState = "no_change" | "changed" | "blocked";

export type AinuokeUnifiedContractSummary = {
  state: AinuokeUnifiedChangeState;
  salesContractNo: string | null;
  quantity: number;
  colorQuantity: number;
  quantityDifference: number;
  colors: number;
  deliveryDate: string | null;
  quantityChanges: number;
  deliveryChanges: number;
  colorChanges: number;
  wouldCreate: number;
  wouldUpdate: number;
  wouldBind: number;
  wouldReview: number;
  unchanged: number;
  blockingErrors: string[];
};

export type AinuokeUnifiedMaterialSummary = Omit<AinuokeMaterialApiPreviewSummary, "errors" | "warnings"> & {
  state: AinuokeUnifiedChangeState;
  snapshotChanged: boolean;
  staleOperationalDemands: number;
  missingCurrentFacts: number;
  blockingErrors: string[];
  warnings: AinuokeMaterialApiPreviewSummary["warnings"];
};

export type AinuokeUnifiedPreview = {
  insideOrderNo: string;
  fetchedAt: string;
  contract: AinuokeContractApiPreview;
  material: AinuokeMaterialApiPreview;
  summary: {
    contract: AinuokeUnifiedContractSummary;
    material: AinuokeUnifiedMaterialSummary;
    blockingErrors: string[];
    confirmRequired: boolean;
  };
  baselineHash: string;
  integrityHash: string;
};

export type AinuokeUnifiedPreviewDependencies = {
  reports: {
    readAllReportPages(
      userId: string,
      reportKey: Exclude<AinuokeDetailReportKey, "garment_color_size_details">,
      input: { pageSize?: number; maxPages?: number; query: AinuokeReportQuery },
    ): Promise<AinuokeReportSnapshot[]>;
  };
  ainuoke: Pick<AinuokeRepository, "load">;
  orders: { list(): Promise<SalesOrder[]> };
  styleProgress: Pick<StyleProgressRepository, "loadAll">;
  loadSettings(): BasicSettingsState;
};

export type AinuokeUnifiedCommitRepositories = AinuokeContractApiCommitRepositories & {
  orders: AinuokeContractApiCommitRepositories["orders"] & { list(): Promise<SalesOrder[]> };
  ainuoke: AinuokeContractApiCommitRepositories["ainuoke"] & Pick<AinuokeRepository, "load">;
  styleProgress: Pick<StyleProgressRepository, "loadAll" | "commitImport">;
  operationLogs: AinuokeContractApiCommitRepositories["operationLogs"] & {
    append(log: OperationLogDraft): Promise<OperationLog>;
  };
};

export type AinuokeUnifiedDomainCommitResult<T> = {
  status: "skipped" | "success" | "failed" | "not_attempted";
  result: T | null;
  error: string | null;
};

export type AinuokeUnifiedCommitResult = {
  status: "no_change" | "success" | "partial_failure" | "failed";
  contract: AinuokeUnifiedDomainCommitResult<Awaited<ReturnType<typeof commitAinuokeContractApiPreview>>>;
  material: AinuokeUnifiedDomainCommitResult<AinuokeMaterialApiCommitResult>;
  retrySafe: boolean;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

const normalizedInsideOrderNo = (value: string): string => value.normalize("NFKC").trim().toLocaleUpperCase();

function semanticReview(value: AinuokeSyncState["reviews"][number]) {
  return {
    id: value.id,
    kind: value.kind,
    sourceKey: value.sourceKey,
    salesContractNo: value.salesContractNo,
    candidateOrderIds: [...value.candidateOrderIds].sort(),
    reason: value.reason,
    resolvedAt: value.resolvedAt,
    resolvedBy: value.resolvedBy,
  };
}

function contractSummary(input: {
  preview: AinuokeContractApiPreview;
  currentState: AinuokeSyncState;
  currentOrders: SalesOrder[];
}): AinuokeUnifiedContractSummary {
  const report = input.preview.sync.report;
  const sourceContract = input.preview.sync.state.contracts[0] ?? null;
  const currentContracts = new Map(input.currentState.contracts.map((item) => [item.salesContractNo, item]));
  const sourceChanged = input.preview.sync.state.contracts.some((next) => {
    const current = currentContracts.get(next.salesContractNo);
    return !current
      || current.sourceHash !== next.sourceHash
      || current.boundOrderId !== next.boundOrderId;
  });
  const currentReviews = canonicalJson(input.currentState.reviews.map(semanticReview).sort((left, right) => left.id.localeCompare(right.id)));
  const nextReviews = canonicalJson(input.preview.sync.state.reviews.map(semanticReview).sort((left, right) => left.id.localeCompare(right.id)));
  const reviewChanged = currentReviews !== nextReviews;
  const currentOrderById = new Map(input.currentOrders.map((order) => [order.id, order]));
  let deliveryChanges = 0;
  for (const next of input.preview.sync.orders) {
    const current = currentOrderById.get(next.id);
    if (current && current.contractDeliveryDate !== next.contractDeliveryDate) deliveryChanges += 1;
  }
  const colorChanges = input.preview.sync.operationLogs.filter((log) => log.action === "艾诺科分色变更").length;
  const hasChanges = sourceChanged
    || reviewChanged
    || report.updatedExistingCount > 0
    || report.autoBoundCount > 0
    || report.autoCreatedCount > 0;
  const blockingErrors = report.mismatchCount > 0
    ? [`${report.mismatchCount} 份合同未通过数量校验`]
    : [];
  return {
    state: blockingErrors.length ? "blocked" : hasChanges ? "changed" : "no_change",
    salesContractNo: sourceContract?.salesContractNo ?? null,
    quantity: sourceContract?.quantity ?? 0,
    colorQuantity: sourceContract?.colorQuantity ?? 0,
    quantityDifference: sourceContract?.quantityDifference ?? 0,
    colors: sourceContract?.colorLines.length ?? 0,
    deliveryDate: sourceContract?.contractDeliveryDate ?? null,
    quantityChanges: report.quantityChangeCount,
    deliveryChanges,
    colorChanges,
    wouldCreate: report.autoCreatedCount,
    wouldUpdate: report.updatedExistingCount,
    wouldBind: report.autoBoundCount,
    wouldReview: report.manualReviewCount,
    unchanged: report.unchangedExistingCount,
    blockingErrors,
  };
}

export function analyzeAinuokeMaterialApiChange(input: {
  preview: AinuokeMaterialApiPreview;
  current: StyleProgressData;
}): Pick<AinuokeUnifiedMaterialSummary, "snapshotChanged" | "staleOperationalDemands" | "missingCurrentFacts"> & { hasChanges: boolean } {
  const materialImport = toAinuokeMaterialImportPreview(input.preview, "unified-preview");
  const incomingDemandIds = new Set(materialImport.demands.map((item) => item.id));
  const affectedContracts = new Set(materialImport.replaceSourceScope?.affectedSalesContractNos ?? []);
  const staleDemandIds = new Set(input.current.demands
    .filter((item) => affectedContracts.has(item.salesContractNo) && !incomingDemandIds.has(item.id))
    .map((item) => item.id));
  const currentIds = {
    demands: new Set(input.current.demands.map((item) => item.id)),
    rawSnapshots: new Set(input.current.rawSnapshots.map((item) => item.id)),
    purchaseEvents: new Set(input.current.purchaseEvents.map((item) => item.id)),
    inboundEvents: new Set(input.current.inboundEvents.map((item) => item.id)),
    shipmentEvents: new Set(input.current.shipmentEvents.map((item) => item.id)),
    outboundEvents: new Set(input.current.outboundEvents.map((item) => item.id)),
  };
  const missingCurrentFacts = materialImport.demands.filter((item) => !currentIds.demands.has(item.id)).length
    + materialImport.rawSnapshots.filter((item) => !currentIds.rawSnapshots.has(item.id)).length
    + materialImport.purchaseEvents.filter((item) => !currentIds.purchaseEvents.has(item.id)).length
    + materialImport.inboundEvents.filter((item) => !currentIds.inboundEvents.has(item.id)).length
    + materialImport.shipmentEvents.filter((item) => !currentIds.shipmentEvents.has(item.id)).length
    + materialImport.outboundEvents.filter((item) => !currentIds.outboundEvents.has(item.id)).length;
  const affectedDemandIds = new Set([...incomingDemandIds, ...staleDemandIds]);
  const staleOperationalEvents = ([
    [input.current.purchaseEvents, materialImport.purchaseEvents],
    [input.current.inboundEvents, materialImport.inboundEvents],
    [input.current.shipmentEvents, materialImport.shipmentEvents],
    [input.current.outboundEvents, materialImport.outboundEvents],
  ] as const).reduce((total, [current, incoming]) => {
    const incomingIds = new Set(incoming.map((item) => item.id));
    return total + current.filter((item) => affectedDemandIds.has(item.materialDemandId) && !incomingIds.has(item.id)).length;
  }, 0);
  const batchCommitted = input.current.batches.some((batch) => batch.id === materialImport.batch.id && batch.status === "committed");
  const snapshotChanged = !batchCommitted;
  return {
    snapshotChanged,
    staleOperationalDemands: staleDemandIds.size,
    missingCurrentFacts,
    hasChanges: snapshotChanged || staleDemandIds.size > 0 || staleOperationalEvents > 0 || missingCurrentFacts > 0,
  };
}

function materialSummary(preview: AinuokeMaterialApiPreview, current: StyleProgressData): AinuokeUnifiedMaterialSummary {
  const blockingErrors = [
    ...preview.summary.errors.map((issue) => `${issue.message} × ${issue.count}`),
    ...(preview.summary.sourceIdentityCollisions > 0 ? [`Source identity collision × ${preview.summary.sourceIdentityCollisions}`] : []),
  ];
  const change = blockingErrors.length
    ? { snapshotChanged: true, staleOperationalDemands: 0, missingCurrentFacts: 0, hasChanges: false }
    : analyzeAinuokeMaterialApiChange({ preview, current });
  const counts = {
    normalizedRows: preview.summary.normalizedRows,
    rejectedRows: preview.summary.rejectedRows,
    canonicalMaterialGroups: preview.summary.canonicalMaterialGroups,
    fabricGroups: preview.summary.fabricGroups,
    trimGroups: preview.summary.trimGroups,
    vendorSupplySourceRows: preview.summary.vendorSupplySourceRows,
    operationalMaterialGroups: preview.summary.operationalMaterialGroups,
    demands: preview.summary.demands,
    purchaseEvents: preview.summary.purchaseEvents,
    inboundEvents: preview.summary.inboundEvents,
    shipmentEvents: preview.summary.shipmentEvents,
    outboundEvents: preview.summary.outboundEvents,
    duplicateDemandRowsPrevented: preview.summary.duplicateDemandRowsPrevented,
    duplicateEventRowsPrevented: preview.summary.duplicateEventRowsPrevented,
    duplicateSourceRowsPrevented: preview.summary.duplicateSourceRowsPrevented,
    sourceIdentityCollisions: preview.summary.sourceIdentityCollisions,
  };
  return {
    ...counts,
    state: blockingErrors.length ? "blocked" : change.hasChanges ? "changed" : "no_change",
    snapshotChanged: change.snapshotChanged,
    staleOperationalDemands: change.staleOperationalDemands,
    missingCurrentFacts: change.missingCurrentFacts,
    blockingErrors,
    warnings: preview.summary.warnings,
  };
}

function relevantStyleProgressBaseline(preview: AinuokeMaterialApiPreview, current: StyleProgressData) {
  const affectedContracts = new Set(preview.pipeline.demands.map((item) => item.salesContractNo));
  const demandIds = new Set(current.demands.filter((item) => affectedContracts.has(item.salesContractNo)).map((item) => item.id));
  const incomingRawIds = new Set(preview.pipeline.rawRows.map((item) => item.id));
  return {
    batches: current.batches.map((item) => ({ id: item.id, status: item.status })).sort((left, right) => left.id.localeCompare(right.id)),
    rawSnapshotIds: current.rawSnapshots.filter((item) => incomingRawIds.has(item.id)).map((item) => item.id).sort(),
    demands: current.demands.filter((item) => affectedContracts.has(item.salesContractNo)).sort((left, right) => left.id.localeCompare(right.id)),
    purchaseEvents: current.purchaseEvents.filter((item) => demandIds.has(item.materialDemandId)).sort((left, right) => left.id.localeCompare(right.id)),
    inboundEvents: current.inboundEvents.filter((item) => demandIds.has(item.materialDemandId)).sort((left, right) => left.id.localeCompare(right.id)),
    shipmentEvents: current.shipmentEvents.filter((item) => demandIds.has(item.materialDemandId)).sort((left, right) => left.id.localeCompare(right.id)),
    outboundEvents: current.outboundEvents.filter((item) => demandIds.has(item.materialDemandId)).sort((left, right) => left.id.localeCompare(right.id)),
    expectedArrivalBatches: current.expectedArrivalBatches.filter((item) => affectedContracts.has(item.salesContractNo)).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function createBaselineHash(input: {
  contract: AinuokeContractApiPreview;
  material: AinuokeMaterialApiPreview;
  state: AinuokeSyncState;
  orders: SalesOrder[];
  styleProgress: StyleProgressData;
}): string {
  return stableSourceHash([canonicalJson({
    state: input.state,
    orders: input.orders,
    styleProgress: relevantStyleProgressBaseline(input.material, input.styleProgress),
  })]);
}

function createIntegrityHash(input: Omit<AinuokeUnifiedPreview, "integrityHash">): string {
  return stableSourceHash([canonicalJson({
    insideOrderNo: input.insideOrderNo,
    contractSnapshots: input.contract.source.snapshotHashes,
    materialArtifact: input.material.sourceArtifactHash,
    summary: input.summary,
    baselineHash: input.baselineHash,
  })]);
}

export async function runAinuokeUnifiedPreview(input: {
  userId: string;
  insideOrderNo: string;
  canView: boolean;
  actor: OrderActor & OperationLogActor;
  dependencies: AinuokeUnifiedPreviewDependencies;
  timestamp?: string;
}): Promise<AinuokeUnifiedPreview> {
  if (!input.canView) throw new Error("缺少 ainuoke.view 权限，不能刷新艾诺科");
  const insideOrderNo = normalizedInsideOrderNo(input.insideOrderNo);
  if (!insideOrderNo) throw new Error("请输入 InsideOrderNo");
  const query = { insideOrderNo };
  const [state, orders, styleProgress, contractSnapshots, colorSnapshots, materialSnapshots] = await Promise.all([
    input.dependencies.ainuoke.load(),
    input.dependencies.orders.list(),
    input.dependencies.styleProgress.loadAll(),
    input.dependencies.reports.readAllReportPages(input.userId, "sales_contracts", { pageSize: 50, maxPages: 100, query }),
    input.dependencies.reports.readAllReportPages(input.userId, "sales_contract_color_sizes", { pageSize: 50, maxPages: 100, query }),
    input.dependencies.reports.readAllReportPages(input.userId, "material_purchase_statistics", { pageSize: 50, maxPages: 100, query }),
  ]);
  const timestamp = input.timestamp ?? new Date().toISOString();
  const contract = buildAinuokeContractApiPreview({
    contractSnapshots,
    colorSnapshots,
    state,
    orders,
    settings: input.dependencies.loadSettings(),
    actor: input.actor,
    timestamp,
  });
  const material = buildAinuokeMaterialApiPreview({ snapshots: materialSnapshots, now: timestamp });
  const contractChange = contractSummary({ preview: contract, currentState: state, currentOrders: orders });
  const materialChange = materialSummary(material, styleProgress);
  const blockingErrors = [...contractChange.blockingErrors, ...materialChange.blockingErrors];
  const summary = {
    contract: contractChange,
    material: materialChange,
    blockingErrors,
    confirmRequired: !blockingErrors.length && (contractChange.state === "changed" || materialChange.state === "changed"),
  };
  const baselineHash = createBaselineHash({ contract, material, state, orders, styleProgress });
  const withoutIntegrity = {
    insideOrderNo,
    fetchedAt: timestamp,
    contract,
    material,
    summary,
    baselineHash,
  };
  return { ...withoutIntegrity, integrityHash: createIntegrityHash(withoutIntegrity) };
}

const failedDomain = <T>(error: unknown): AinuokeUnifiedDomainCommitResult<T> => ({
  status: "failed",
  result: null,
  error: error instanceof Error ? error.message : "领域提交失败",
});

const skippedDomain = <T>(status: "skipped" | "not_attempted" = "skipped"): AinuokeUnifiedDomainCommitResult<T> => ({ status, result: null, error: null });

export async function commitAinuokeUnifiedPreview(input: {
  preview: AinuokeUnifiedPreview;
  canSyncContracts: boolean;
  canImportMaterials: boolean;
  actor: OperationLogActor;
  repositories: AinuokeUnifiedCommitRepositories;
  timestamp?: string;
}): Promise<AinuokeUnifiedCommitResult> {
  const { integrityHash, ...withoutIntegrity } = input.preview;
  if (createIntegrityHash(withoutIntegrity) !== integrityHash) throw new Error("统一 Preview 已变化，请重新刷新艾诺科");
  if (input.preview.summary.blockingErrors.length) throw new Error("统一 Preview 存在阻断错误，不能确认同步");
  if (!input.preview.summary.confirmRequired) {
    return { status: "no_change", contract: skippedDomain(), material: skippedDomain(), retrySafe: true };
  }
  const missingPermissions = [
    ...(input.preview.summary.contract.state === "changed" && !input.canSyncContracts ? ["ainuoke.sync（合同）"] : []),
    ...(input.preview.summary.material.state === "changed" && !input.canImportMaterials ? ["style_progress.import（物料）"] : []),
  ];
  if (missingPermissions.length) throw new Error(`缺少确认权限：${missingPermissions.join("、")}`);

  const [state, orders, styleProgress] = await Promise.all([
    input.repositories.ainuoke.load(),
    input.repositories.orders.list(),
    input.repositories.styleProgress.loadAll(),
  ]);
  const currentBaselineHash = createBaselineHash({
    contract: input.preview.contract,
    material: input.preview.material,
    state,
    orders,
    styleProgress,
  });
  if (currentBaselineHash !== input.preview.baselineHash) throw new Error("统一 Preview 后本地业务数据已变化，请重新刷新艾诺科");

  let contract: AinuokeUnifiedCommitResult["contract"] = skippedDomain();
  let material: AinuokeUnifiedCommitResult["material"] = skippedDomain();
  if (input.preview.summary.contract.state === "changed") {
    try {
      const result = await commitAinuokeContractApiPreview({
        preview: input.preview.contract,
        canSync: input.canSyncContracts,
        actorName: input.actor.userName,
        repositories: input.repositories,
        timestamp: input.timestamp,
      });
      contract = { status: "success", result, error: null };
    } catch (error) {
      return { status: "failed", contract: failedDomain(error), material: skippedDomain("not_attempted"), retrySafe: true };
    }
  }
  if (input.preview.summary.material.state === "changed") {
    try {
      const result = await commitAinuokeMaterialApiPreview({
        preview: input.preview.material,
        canImport: input.canImportMaterials,
        actor: input.actor,
        repositories: input.repositories,
      });
      material = { status: "success", result, error: null };
    } catch (error) {
      return {
        status: contract.status === "success" ? "partial_failure" : "failed",
        contract,
        material: failedDomain(error),
        retrySafe: true,
      };
    }
  }
  return { status: "success", contract, material, retrySafe: true };
}
