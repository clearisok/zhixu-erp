export type AinuokeValidationStatus = "valid" | "quantity_mismatch" | "missing_color_detail";
export type AinuokeMatchDisposition = "synced" | "auto_bound" | "recommended" | "review_required" | "auto_created" | "blocked";

export type AinuokeSourceTrace = {
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  sourceHash: string;
};

export type AinuokeSizeDetail = { sizeName: string; quantity: number };

export type AinuokeColorMirrorRow = AinuokeSourceTrace & {
  salesContractNo: string;
  styleNoRaw: string;
  factoryStyleNo: string;
  poNo: string;
  colorName: string;
  quantity: number;
  deliveryDate: string | null;
  sizes: AinuokeSizeDetail[];
};

export type AinuokeColorLine = {
  colorName: string;
  quantity: number;
  deliveryDate: string | null;
  sourceRows: number[];
};

export type AinuokeDeliveryLine = {
  deliveryDate: string;
  quantity: number;
};

export type AinuokeContractMirror = AinuokeSourceTrace & {
  salesContractNo: string;
  statusRaw: string;
  companyName: string;
  customerName: string;
  brandRaw: string;
  brandNormalized: string;
  styleNoRaw: string;
  strictStyleKey: string;
  baseStyleKey: string;
  factoryStyleNo: string;
  poNo: string;
  quantity: number;
  contractDate: string | null;
  contractDeliveryDate: string | null;
  colorRows: AinuokeColorMirrorRow[];
  colorLines: AinuokeColorLine[];
  deliveryLines: AinuokeDeliveryLine[];
  colorQuantity: number;
  quantityDifference: number;
  validationStatus: AinuokeValidationStatus;
  boundOrderId: string | null;
  lastDisposition: AinuokeMatchDisposition | null;
  syncedAt: string;
};

export type AinuokeImportReview = {
  id: string;
  kind: "order_match" | "schedule_match" | "closing_match" | "data_anomaly";
  sourceKey: string;
  salesContractNo: string | null;
  candidateOrderIds: string[];
  reason: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
};

export type AinuokeImportRun = {
  id: string;
  sourceFiles: string[];
  sourceHashes: string[];
  mode: "dry_run" | "commit";
  contractsSeen: number;
  contractsChanged: number;
  colorRowsSeen: number;
  mismatchCount: number;
  autoBoundCount: number;
  reviewCount: number;
  autoCreatedCount: number;
  duplicatePreventedCount: number;
  scheduleCount: number;
  closingCount: number;
  correctedDateCount: number;
  createdAt: string;
  createdBy: string;
};

export type AinuokeSyncState = {
  contracts: AinuokeContractMirror[];
  reviews: AinuokeImportReview[];
  importRuns: AinuokeImportRun[];
};

export const emptyAinuokeSyncState = (): AinuokeSyncState => ({ contracts: [], reviews: [], importRuns: [] });

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label}存在重复值`);
}

export function validateAinuokeSyncState(value: unknown): AinuokeSyncState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("艾诺科同步镜像格式无效");
  const source = value as Partial<AinuokeSyncState>;
  const state: AinuokeSyncState = {
    contracts: structuredClone(Array.isArray(source.contracts) ? source.contracts : []),
    reviews: structuredClone(Array.isArray(source.reviews) ? source.reviews : []),
    importRuns: structuredClone(Array.isArray(source.importRuns) ? source.importRuns : []),
  };
  unique(state.contracts.map((item) => item.salesContractNo), "艾诺科销售合同号");
  unique(state.reviews.map((item) => item.id), "艾诺科待确认记录 ID");
  unique(state.importRuns.map((item) => item.id), "艾诺科导入批次 ID");
  for (const contract of state.contracts) {
    if (!contract.salesContractNo.trim() || !Number.isFinite(contract.quantity) || contract.quantity < 0) throw new Error("艾诺科销售合同镜像字段无效");
    if (!Number.isFinite(contract.colorQuantity) || !Number.isFinite(contract.quantityDifference)) throw new Error(`艾诺科合同 ${contract.salesContractNo} 分色校验无效`);
    if (contract.colorLines.some((line) => !line.colorName.trim() || !Number.isFinite(line.quantity) || line.quantity < 0)) throw new Error(`艾诺科合同 ${contract.salesContractNo} 颜色汇总无效`);
  }
  return state;
}
