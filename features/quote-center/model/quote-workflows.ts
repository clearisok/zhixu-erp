import { calculatePriceVersionMetrics, numberOrZero } from "./quote-calculations.ts";
import { getCurrentRevision, type NullableNumber, type PriceVersionConfirmation, type Quote, type QuoteAggregateStatus, type QuoteRevision, type QuoteRevisionReason, type QuoteType } from "./quote-view-model.ts";
import { getNextRevisionLabel } from "./quote-revision-naming.ts";
import { normalizeRevisionAttachmentReferences } from "./quote-attachments.ts";

export function tokenizeQuoteSearch(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesQuoteSearch(searchable: string, query: string): boolean {
  const tokens = tokenizeQuoteSearch(query);
  if (!tokens.length) return true;
  const haystack = searchable.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export const QUOTE_STRUCTURED_SEARCH_FIELDS = ["报价类型", "品牌", "制作国家", "客户业务员", "报价状态", "款号"] as const;
export type QuoteStructuredSearchField = typeof QUOTE_STRUCTURED_SEARCH_FIELDS[number];
export type QuoteSearchExpression = { ordinaryTokens: string[]; filters: Array<{ field: QuoteStructuredSearchField; value: string }> };

export function parseQuoteSearch(query: string): QuoteSearchExpression {
  const filters: QuoteSearchExpression["filters"] = [];
  const ordinarySource = query.replace(/\/([^\s/:]+):([^\s/]+)/g, (source, rawField: string, rawValue: string) => {
    const field = QUOTE_STRUCTURED_SEARCH_FIELDS.find((candidate) => candidate === rawField);
    if (!field) return source;
    filters.push({ field, value: rawValue.normalize("NFKC").trim() });
    return " ";
  });
  return { ordinaryTokens: tokenizeQuoteSearch(ordinarySource), filters };
}

const aggregateStatusSearchLabel: Record<QuoteAggregateStatus, string[]> = {
  draft: ["草稿"], quoting: ["报价中", "未确认"], partially_confirmed: ["部分确认"], confirmed: ["全部确认", "已确认"],
};

export function matchesQuoteRecordSearch(quote: Quote, query: string): boolean {
  const revision = getCurrentRevision(quote);
  const countries = revision.priceVersions.map((version) => version.pricingParameters.manufacturingCountry).filter(Boolean);
  const searchable = [quote.quoteCode, revision.baseInfo.brandName, revision.baseInfo.quoteStyleNo, revision.baseInfo.styleName, revision.baseInfo.salespersonName, ...countries].join(" ").toLocaleLowerCase("zh-CN");
  const expression = parseQuoteSearch(query);
  if (!expression.ordinaryTokens.every((token) => searchable.includes(token.toLocaleLowerCase("zh-CN")))) return false;
  return expression.filters.every(({ field, value }) => {
    const expected = value.toLocaleLowerCase("zh-CN");
    if (field === "报价类型") return (revision.baseInfo.quoteType === "distribution" ? "经销" : "加工") === value;
    if (field === "品牌") return revision.baseInfo.brandName.toLocaleLowerCase("zh-CN") === expected;
    if (field === "制作国家") return countries.some((country) => country.toLocaleLowerCase("zh-CN") === expected);
    if (field === "客户业务员") return revision.baseInfo.salespersonName.toLocaleLowerCase("zh-CN") === expected;
    if (field === "报价状态") return aggregateStatusSearchLabel[quote.aggregateStatus].some((label) => label === value);
    return revision.baseInfo.quoteStyleNo.toLocaleLowerCase("zh-CN") === expected;
  });
}

export function validateCustomerConfirmation(quoteType: QuoteType, labor: NullableNumber, garment: NullableNumber): string | null {
  if (labor === null) return quoteType === "distribution" ? "经销报价必须填写确认工价和确认成衣价格。" : "加工报价必须填写确认工价。";
  if (quoteType === "distribution" && garment === null) return "经销报价必须填写确认工价和确认成衣价格。";
  return null;
}

export function isQuoteConfirmationComplete(
  quoteType: QuoteType,
  confirmedLaborPrice: string | number | null | undefined,
  customerConfirmedPrice: string | number | null | undefined,
): boolean {
  return confirmedLaborPrice !== null
    && confirmedLaborPrice !== undefined
    && (quoteType === "processing" || (customerConfirmedPrice !== null && customerConfirmedPrice !== undefined));
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function summarizeRevisionConfirmations(revision: Pick<QuoteRevision, "priceVersions">) {
  return {
    confirmedCount: revision.priceVersions.filter((version) => version.confirmation !== null).length,
    totalCount: revision.priceVersions.length,
  };
}

export function confirmationAggregateStatus(summary: { confirmedCount: number; totalCount: number }): QuoteAggregateStatus {
  if (summary.confirmedCount === 0) return "quoting";
  if (summary.totalCount > 0 && summary.confirmedCount === summary.totalCount) return "confirmed";
  return "partially_confirmed";
}

/** Ordinary Revision/PV edits are not a transition from draft to quoting. */
export function aggregateStatusAfterRevisionEdit(current: QuoteAggregateStatus, summary: { confirmedCount: number; totalCount: number }): QuoteAggregateStatus {
  return summary.confirmedCount > 0 || current === "confirmed" || current === "partially_confirmed"
    ? confirmationAggregateStatus(summary) : current;
}

export function confirmationSummaryLabel(summary: { confirmedCount: number; totalCount: number }): string {
  if (summary.confirmedCount === 0) return `未确认 · 0/${summary.totalCount}`;
  if (summary.confirmedCount === summary.totalCount) return `全部确认 · ${summary.confirmedCount}/${summary.totalCount}`;
  return `部分确认 · ${summary.confirmedCount}/${summary.totalCount}`;
}

export function removePriceVersion(revision: QuoteRevision, priceVersionId: string): QuoteRevision {
  if (revision.priceVersions.length <= 1) {
    throw new Error("当前报价至少需要保留一个价格版本，不能删除最后一个价格版本。");
  }
  const priceVersions = revision.priceVersions.filter((version) => version.id !== priceVersionId);
  if (priceVersions.length === revision.priceVersions.length) return revision;
  return { ...revision, priceVersions, confirmationSummary: summarizeRevisionConfirmations({ priceVersions }) };
}

export function applyCustomerConfirmation(quote: Quote, priceVersionId: string, confirmedLaborPrice: number, confirmedGarmentPrice: number | null, note: string): Quote {
  const current = getCurrentRevision(quote);
  const versions = current.priceVersions.map((version) => {
    if (version.id !== priceVersionId) return version;
    const metrics = calculatePriceVersionMetrics(version);
    const confirmation: PriceVersionConfirmation = {
      quotedGarmentPrice: metrics.garmentSellingPrice,
      confirmedGarmentPrice,
      quotedLaborPrice: numberOrZero(version.labor.value),
      confirmedLaborPrice,
      note,
      confirmedAt: new Date().toISOString(),
    };
    return { ...version, confirmation };
  });
  const confirmationSummary = summarizeRevisionConfirmations({ priceVersions: versions });
  const nextRevision = { ...current, priceVersions: versions, confirmationSummary };
  const aggregateStatus = confirmationAggregateStatus(confirmationSummary);
  return { ...quote, aggregateStatus, revisions: quote.revisions.map((revision) => revision.revisionId === current.revisionId ? nextRevision : revision) };
}

export type CreateQuoteRevisionInput = {
  sourceRevisionId: string;
  reason: QuoteRevisionReason;
  note?: string;
  createdBy: string;
  nowIso: string;
  revisionId: string;
};

export function createRevisionFromSnapshot(quote: Quote, input: CreateQuoteRevisionInput): Quote {
  const source = quote.revisions.find((revision) => revision.revisionId === input.sourceRevisionId);
  if (!source) throw new Error("找不到作为新报价版本来源的历史快照");
  const identity = getNextRevisionLabel({ selectedRevision: source, allRevisions: quote.revisions });
  const sourceConfirmation = summarizeRevisionConfirmations(source);
  const next: QuoteRevision = {
    ...clone(normalizeRevisionAttachmentReferences(source)),
    revisionId: input.revisionId,
    revisionLabel: identity.revisionLabel,
    parentRevisionId: identity.parentRevisionId,
    mainlineVersion: identity.mainlineVersion,
    branchSequence: identity.branchSequence,
    basedOnConfirmedRevisionId: sourceConfirmation.confirmedCount > 0 ? source.revisionId : null,
    createdAt: input.nowIso,
    createdBy: input.createdBy,
    reason: input.reason,
    note: input.note?.trim() ?? "",
    revisionNote: undefined,
    readOnly: false,
    priceVersions: clone(source.priceVersions).map((version) => ({ ...version, confirmation: null })),
  };
  const confirmationSummary = summarizeRevisionConfirmations(next);
  next.confirmationSummary = confirmationSummary;
  return {
    ...quote,
    defaultRevisionId: input.revisionId,
    currentRevisionId: input.revisionId,
    aggregateStatus: "quoting",
    revisions: [...quote.revisions.map((revision) => ({ ...revision, readOnly: true })), next],
  };
}

export function createRevisionSnapshot(quote: Quote, revisionNote: string, createdBy: string, nowIso: string, revisionId: string): Quote {
  const current = getCurrentRevision(quote);
  return createRevisionFromSnapshot(quote, {
    sourceRevisionId: current.revisionId,
    reason: "其他",
    note: revisionNote.trim() || `基于 ${current.revisionLabel} 更新`,
    createdBy,
    nowIso,
    revisionId,
  });
}
