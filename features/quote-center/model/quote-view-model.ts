export type QuoteAggregateStatus = "draft" | "quoting" | "partially_confirmed" | "confirmed";
export type QuoteType = "distribution" | "processing";
export type LaborCurrency = "CNY" | "USD";
export type NullableNumber = number | null;
export type FabricPurchaseUnit = "kg" | "meter";
export type QuoteRevisionReason =
  | "初始报价"
  | "客户调价"
  | "面料价格变化"
  | "辅料价格变化"
  | "工价调整"
  | "交期变化"
  | "基础信息调整"
  | "其他";

export type AttachmentReference = {
  id: string;
  fileName: string;
  fileType: string;
  url: string;
};

export type CostLine = {
  id: string;
  /** 同一 QuoteRevision 内跨 PriceVersion 对应成本行的稳定关联键。 */
  lineGroupId?: string;
  /** 用户明确要求保留为版本独立差异的字段键。 */
  independentFields?: string[];
  name: string;
  specification: string;
  usage: NullableNumber;
  unit: string;
  lossRate: NullableNumber;
  unitPrice: NullableNumber;
};

export type OtherCostLine = CostLine & {
  amount: NullableNumber;
  source?: "global" | "manual";
  globalSettingId?: string;
  overridden?: boolean;
};

export type FabricCostLine = {
  id: string;
  /** 同一 QuoteRevision 内跨 PriceVersion 对应成本行的稳定关联键。 */
  lineGroupId?: string;
  /** 用户明确要求保留为版本独立差异的字段键。 */
  independentFields?: string[];
  sourceLibraryItemId: string | null;
  name: string;
  composition: string;
  segmentLengthCm: NullableNumber;
  netWidthCm: NullableNumber;
  gsm: NullableNumber;
  lossRate: NullableNumber;
  supplier: string;
  unitPrice: NullableNumber;
  purchaseUnit: FabricPurchaseUnit;
};

export type TrimCostLine = CostLine & {
  sourceLibraryItemId: string | null;
  /** Recorded when defaults/library are explicitly applied; absent on older snapshots. */
  sourceOrigin?: "brand" | "salesperson" | "library";
  supplier: string;
};

export type LaborCost = {
  value: NullableNumber;
  description: string;
};

export type PriceVersionConfirmation = {
  /** Server confirmation evidence; absent on legacy snapshots, never inferred. */
  laborCurrencyAtConfirmation?: LaborCurrency;
  quotedGarmentPrice: number;
  confirmedGarmentPrice: number | null;
  quotedLaborPrice: number;
  confirmedLaborPrice: number | null;
  note: string;
  confirmedAt: string | null;
};

/**
 * PriceVersion-owned pricing snapshot. It is deliberately self-contained so
 * later edits to a system ManufacturingPreset cannot change a saved quote.
 */
export type PriceVersionPricingParameters = {
  /** Creation provenance; absent on legacy PVs, never inferred from technical CNY. */
  configuration?: { schemaVersion: 1; status: "incomplete" | "configured"; sources: Array<{ field: string; source: "unset" | "technical_default" | "explicit" | "preset" | "accepted_default" }> };
  manufacturingCountry: string;
  manufacturingPresetId: string | null;
  manufacturingPresetName: string;
  laborCurrency: LaborCurrency;
  usdCnyRate: NullableNumber;
  markupRate: NullableNumber;
  includeFreight: boolean;
  freightName: string;
  freightAmount: NullableNumber;
};

/** @deprecated Use PriceVersionPricingParameters. Kept for EstimateCost and v2 migration compatibility. */
export type QuotePricingParameters = PriceVersionPricingParameters;

export type PriceVersion = {
  id: string;
  name: string;
  quantity: NullableNumber;
  description: string;
  pricingParameters: PriceVersionPricingParameters;
  fabrics: FabricCostLine[];
  trims: TrimCostLine[];
  labor: LaborCost;
  otherCosts: OtherCostLine[];
  confirmation: PriceVersionConfirmation | null;
};

export type QuoteBaseInfo = {
  brandId: string;
  brandName: string;
  salespersonId: string;
  salespersonName: string;
  quoteType: QuoteType;
  quoteStyleNo: string;
  styleName: string;
  quoteDate: string | null;
  fabricLeadDate: string | null;
  garmentLeadDate: string | null;
  note: string;
};

export type EstimateCost = {
  id: string;
  quoteId: string;
  basedOnRevisionId: string;
  sourcePriceVersionId: string;
  generatedAt: string;
  generatedBy: string;
  ignoredForRevisionId: string | null;
  pricingParameters: QuotePricingParameters;
  fabrics: FabricCostLine[];
  trims: TrimCostLine[];
  labor: LaborCost;
  otherCosts: OtherCostLine[];
};

export type ConfirmationSummary = {
  confirmedCount: number;
  totalCount: number;
};

export type QuoteRevision = {
  revisionId: string;
  revisionLabel: string;
  parentRevisionId: string | null;
  mainlineVersion: number;
  branchSequence: number | null;
  basedOnConfirmedRevisionId: string | null;
  createdAt: string;
  createdBy: string;
  reason: QuoteRevisionReason;
  note: string;
  /** @deprecated 仅用于读取 V1/V2 mock 数据；新代码使用 reason + note。 */
  revisionNote?: string;
  readOnly: boolean;
  baseInfo: QuoteBaseInfo;
  priceVersions: PriceVersion[];
  imageAttachmentIds: string[];
  fileAttachmentIds: string[];
  styleImageAttachmentId: string | null;
  /** @deprecated 兼容旧 mock URL 图片；新代码使用 imageAttachmentIds。 */
  garmentMedia?: AttachmentReference[];
  /** @deprecated 兼容旧 mock URL 文件；新代码使用 fileAttachmentIds。 */
  quoteDocuments?: AttachmentReference[];
  confirmationSummary: ConfirmationSummary;
};

export type Quote = {
  id: string;
  quoteCode: string;
  deletedAt: string | null;
  defaultRevisionId: string;
  /** @deprecated 兼容旧 mock 数据；读取口径统一使用 defaultRevisionId。 */
  currentRevisionId?: string;
  aggregateStatus: QuoteAggregateStatus;
  revisions: QuoteRevision[];
  activeEstimateCost: EstimateCost | null;
  estimateCostHistory: EstimateCost[];
};

export type SelectOption = { value: string; label: string; keywords?: string };

export const BASE_PRICE_VERSION_NAME = "基础价格";

export const createCostLineGroupId = () => globalThis.crypto?.randomUUID?.()
  ?? `line-group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function normalizeSinglePriceVersionName(priceVersions: PriceVersion[]): PriceVersion[] {
  if (priceVersions.length !== 1 || priceVersions[0].name === BASE_PRICE_VERSION_NAME) return priceVersions;
  return [{ ...priceVersions[0], name: BASE_PRICE_VERSION_NAME }];
}

export function getDefaultRevision(quote: Pick<Quote, "revisions" | "defaultRevisionId" | "currentRevisionId">): QuoteRevision {
  return quote.revisions.find((revision) => revision.revisionId === quote.defaultRevisionId)
    ?? quote.revisions.find((revision) => revision.revisionId === quote.currentRevisionId)
    ?? quote.revisions[quote.revisions.length - 1];
}

export const getCurrentRevision = getDefaultRevision;

export function createQuoteDraft(
  id: string,
  quoteCode: string,
  today: string,
  defaults?: { manufacturingCountry?: string; manufacturingPresetId?: string | null; manufacturingPresetName?: string; markupRate?: NullableNumber; laborCurrency?: LaborCurrency; usdCnyRate?: NullableNumber; laborDescription?: string; includeFreight?: boolean; freightName?: string; freightAmount?: NullableNumber },
): Quote {
  return {
    id,
    quoteCode,
    deletedAt: null,
    defaultRevisionId: `${id}-revision-v1`,
    currentRevisionId: `${id}-revision-v1`,
    aggregateStatus: "draft",
    activeEstimateCost: null,
    estimateCostHistory: [],
    revisions: [{
      revisionId: `${id}-revision-v1`,
      revisionLabel: "V1",
      parentRevisionId: null,
      mainlineVersion: 1,
      branchSequence: null,
      basedOnConfirmedRevisionId: null,
      createdAt: new Date().toISOString(),
      createdBy: "当前用户",
      reason: "初始报价",
      note: "",
      readOnly: false,
      baseInfo: {
        brandId: "",
        brandName: "",
        salespersonId: "",
        salespersonName: "",
        quoteType: "distribution",
        quoteStyleNo: "",
        styleName: "",
        quoteDate: today,
        fabricLeadDate: null,
        garmentLeadDate: null,
        note: "",
      },
      priceVersions: [{
        id: `${id}-price-default`,
        name: BASE_PRICE_VERSION_NAME,
        quantity: null,
        description: "",
        pricingParameters: {
          manufacturingCountry: defaults?.manufacturingCountry ?? "",
          manufacturingPresetId: defaults?.manufacturingPresetId ?? null,
          manufacturingPresetName: defaults?.manufacturingPresetName ?? "",
          laborCurrency: defaults?.laborCurrency ?? "CNY",
          usdCnyRate: defaults?.usdCnyRate ?? null,
          markupRate: defaults?.markupRate ?? null,
          includeFreight: defaults?.includeFreight ?? false,
          freightName: defaults?.freightName ?? "运费",
          freightAmount: defaults?.freightAmount ?? null,
        },
        fabrics: [],
        trims: [],
        labor: { value: null, description: defaults?.laborDescription ?? "" },
        otherCosts: [],
        confirmation: null,
      }],
      imageAttachmentIds: [],
      fileAttachmentIds: [],
      styleImageAttachmentId: null,
      confirmationSummary: { confirmedCount: 0, totalCount: 1 },
    }],
  };
}
