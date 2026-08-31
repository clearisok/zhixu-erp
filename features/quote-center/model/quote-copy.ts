import { copyPriceVersion } from "./quote-calculations.ts";
import type { Quote, QuoteRevision, QuoteType } from "./quote-view-model.ts";

export type CopyQuoteInput = {
  brandId: string;
  brandName: string;
  salespersonId: string;
  salespersonName: string;
  quoteType: QuoteType;
  quoteStyleNo: string;
  styleName: string;
  today: string;
  createdBy: string;
};

export type CopyQuoteIdentityIssue = "required" | "same-as-source" | "duplicate";

export function normalizeCopyQuoteStyleNo(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

export function validateCopyQuoteStyleNo(source: Quote, quotes: Quote[], value: string): CopyQuoteIdentityIssue | null {
  const normalized = normalizeCopyQuoteStyleNo(value);
  if (!normalized) return "required";
  const sourceRevision = source.revisions.find((revision) => revision.revisionId === source.defaultRevisionId);
  if (sourceRevision && normalizeCopyQuoteStyleNo(sourceRevision.baseInfo.quoteStyleNo) === normalized) return "same-as-source";
  return quotes.some((quote) => quote.id !== source.id && quote.deletedAt === null && quote.revisions.some((revision) => revision.revisionId === quote.defaultRevisionId && normalizeCopyQuoteStyleNo(revision.baseInfo.quoteStyleNo) === normalized))
    ? "duplicate"
    : null;
}

export function copyQuoteFromDefaultRevision(source: Quote, input: CopyQuoteInput & { id: string; quoteCode: string; createdAt: string }): Quote {
  const sourceRevision = source.revisions.find((revision) => revision.revisionId === source.defaultRevisionId);
  if (!sourceRevision) throw new Error("复制来源的默认报价版本不存在");

  const revisionId = `${input.id}-revision-v1`;
  const priceVersions = sourceRevision.priceVersions.map((version, index) => copyPriceVersion(version, {
    id: `${input.id}-price-${index + 1}`,
    name: version.name,
    quantity: version.quantity,
    description: version.description,
  }));
  const revision: QuoteRevision = {
    ...structuredClone(sourceRevision),
    revisionId,
    revisionLabel: "V1",
    parentRevisionId: null,
    mainlineVersion: 1,
    branchSequence: null,
    basedOnConfirmedRevisionId: null,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    reason: "初始报价",
    note: "",
    revisionNote: undefined,
    readOnly: false,
    baseInfo: {
      ...structuredClone(sourceRevision.baseInfo),
      brandId: input.brandId,
      brandName: input.brandName,
      salespersonId: input.salespersonId,
      salespersonName: input.salespersonName,
      quoteType: input.quoteType,
      quoteStyleNo: input.quoteStyleNo.trim(),
      styleName: input.styleName.trim(),
      quoteDate: input.today,
    },
    priceVersions,
    imageAttachmentIds: [],
    fileAttachmentIds: [],
    styleImageAttachmentId: null,
    garmentMedia: undefined,
    quoteDocuments: undefined,
    confirmationSummary: { confirmedCount: 0, totalCount: priceVersions.length },
  };

  return {
    id: input.id,
    quoteCode: input.quoteCode,
    deletedAt: null,
    defaultRevisionId: revisionId,
    currentRevisionId: revisionId,
    aggregateStatus: "draft",
    revisions: [revision],
    activeEstimateCost: null,
    estimateCostHistory: [],
  };
}
