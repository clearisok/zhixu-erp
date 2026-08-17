export type QuoteAggregateStatus = "draft" | "quoting" | "partially_confirmed" | "confirmed";
export type QuoteType = "distribution" | "processing";
export type LaborCurrency = "CNY" | "USD";
export type NullableNumber = number | null;

export type AttachmentReference = {
  id: string;
  fileName: string;
  fileType: string;
  url: string;
};

export type CostLine = {
  id: string;
  name: string;
  specification: string;
  usage: NullableNumber;
  unit: string;
  lossRate: NullableNumber;
  unitPrice: NullableNumber;
};

export type LaborCost = {
  value: NullableNumber;
  description: string;
};

export type PriceVersionConfirmation = {
  quotedGarmentPrice: number;
  confirmedGarmentPrice: number | null;
  quotedLaborPrice: number;
  confirmedLaborPrice: number | null;
  note: string;
  confirmedAt: string | null;
};

export type PriceVersion = {
  id: string;
  name: string;
  quantity: NullableNumber;
  description: string;
  fabrics: CostLine[];
  trims: CostLine[];
  labor: LaborCost;
  otherCosts: CostLine[];
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

export type QuotePricingParameters = {
  laborCurrency: LaborCurrency;
  usdCnyRate: NullableNumber;
  markupRate: NullableNumber;
};

export type ConfirmationSummary = {
  confirmedCount: number;
  totalCount: number;
};

export type QuoteRevision = {
  revisionId: string;
  revisionLabel: string;
  createdAt: string;
  createdBy: string;
  revisionNote: string;
  readOnly: boolean;
  baseInfo: QuoteBaseInfo;
  pricingParameters: QuotePricingParameters;
  priceVersions: PriceVersion[];
  garmentMedia: AttachmentReference[];
  quoteDocuments: AttachmentReference[];
  confirmationSummary: ConfirmationSummary;
};

export type Quote = {
  id: string;
  quoteCode: string;
  currentRevisionId: string;
  aggregateStatus: QuoteAggregateStatus;
  revisions: QuoteRevision[];
};

export type SelectOption = { value: string; label: string; keywords?: string };

export function getCurrentRevision(quote: Quote): QuoteRevision {
  return quote.revisions.find((revision) => revision.revisionId === quote.currentRevisionId) ?? quote.revisions[quote.revisions.length - 1];
}

export function createQuoteDraft(id: string, quoteCode: string, today: string, defaults?: { markupRate?: NullableNumber; laborCurrency?: LaborCurrency; usdCnyRate?: NullableNumber }): Quote {
  return {
    id,
    quoteCode,
    currentRevisionId: `${id}-revision-v1`,
    aggregateStatus: "draft",
    revisions: [{
      revisionId: `${id}-revision-v1`,
      revisionLabel: "V1",
      createdAt: new Date().toISOString(),
      createdBy: "当前用户",
      revisionNote: "初始报价",
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
      pricingParameters: { laborCurrency: defaults?.laborCurrency ?? "CNY", usdCnyRate: defaults?.usdCnyRate ?? null, markupRate: defaults?.markupRate ?? null },
      priceVersions: [{
        id: `${id}-price-default`,
        name: "默认价格",
        quantity: null,
        description: "",
        fabrics: [],
        trims: [],
        labor: { value: null, description: "" },
        otherCosts: [],
        confirmation: null,
      }],
      garmentMedia: [],
      quoteDocuments: [],
      confirmationSummary: { confirmedCount: 0, totalCount: 1 },
    }],
  };
}
