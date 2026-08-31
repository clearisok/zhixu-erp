"use client";

import { quoteFixtures } from "../fixtures/quote-fixtures.ts";
import { createQuoteDraft, getDefaultRevision, normalizeSinglePriceVersionName, type PriceVersion, type PriceVersionPricingParameters, type Quote, type QuotePricingParameters, type QuoteRevision, type QuoteRevisionReason } from "../model/quote-view-model.ts";
import { parseLegacyRevisionLabel } from "../model/quote-revision-naming.ts";
import { applySystemDefaultsToNewQuoteRevision, loadGlobalQuoteSettings } from "../model/quote-settings.ts";
import { normalizeRevisionAttachmentReferences } from "../model/quote-attachments.ts";
import type { QuoteRepository } from "./quote-repository.ts";
import { copyQuoteFromDefaultRevision, validateCopyQuoteStyleNo } from "../model/quote-copy.ts";
import {
  browserLocalDataStore,
  LEGACY_LOCAL_DATA_KEYS,
  type LocalDataStore,
  type LocalStorageLike,
} from "../../data-management/repository/local-data-store.ts";

export const LEGACY_QUOTE_STORAGE_KEY = LEGACY_LOCAL_DATA_KEYS.quotes;
export const QUOTE_STORAGE_NAME = "quotes";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const revisionReasons = new Set<QuoteRevisionReason>(["初始报价", "客户调价", "面料价格变化", "辅料价格变化", "工价调整", "交期变化", "基础信息调整", "其他"]);

type LegacyPriceVersion = Omit<PriceVersion, "pricingParameters"> & { pricingParameters?: Partial<PriceVersionPricingParameters> };
type LegacyQuoteRevision = Omit<QuoteRevision, "priceVersions"> & {
  pricingParameters?: Partial<QuotePricingParameters>;
  priceVersions: LegacyPriceVersion[];
};

function inferredPresetName(presetId: string | null, country: string): string {
  if (presetId === "preset-china") return "中国制作";
  if (presetId === "preset-cambodia") return "柬埔寨制作";
  return country ? `${country}制作` : "";
}

function normalizePriceVersion(version: LegacyPriceVersion, legacy: Partial<QuotePricingParameters>): PriceVersion {
  const own = version.pricingParameters ?? {};
  const manufacturingCountry = own.manufacturingCountry ?? legacy.manufacturingCountry ?? "";
  const manufacturingPresetId = Object.hasOwn(own, "manufacturingPresetId")
    ? own.manufacturingPresetId ?? null
    : legacy.manufacturingPresetId ?? null;
  const freight = version.otherCosts.find((line) => line.globalSettingId?.startsWith("manufacturing-preset:"));
  const pricingParameters: PriceVersionPricingParameters = {
    manufacturingCountry,
    manufacturingPresetId,
    manufacturingPresetName: own.manufacturingPresetName ?? legacy.manufacturingPresetName ?? inferredPresetName(manufacturingPresetId, manufacturingCountry),
    laborCurrency: own.laborCurrency ?? legacy.laborCurrency ?? "CNY",
    usdCnyRate: Object.hasOwn(own, "usdCnyRate") ? own.usdCnyRate ?? null : legacy.usdCnyRate ?? null,
    markupRate: Object.hasOwn(own, "markupRate") ? own.markupRate ?? null : legacy.markupRate ?? null,
    includeFreight: own.includeFreight ?? legacy.includeFreight ?? Boolean(freight),
    freightName: own.freightName ?? legacy.freightName ?? freight?.name ?? "运费",
    freightAmount: Object.hasOwn(own, "freightAmount")
      ? own.freightAmount ?? null
      : Object.hasOwn(legacy, "freightAmount") ? legacy.freightAmount ?? null : freight?.amount ?? null,
  };
  return { ...version, pricingParameters };
}

function normalizeRevision(revision: LegacyQuoteRevision, defaultRevisionId: string, revisions: LegacyQuoteRevision[]): QuoteRevision {
  const legacyNote = revision.revisionNote?.trim() ?? "";
  const legacyReason = revision.reason as QuoteRevisionReason | "交期调整";
  const reason: QuoteRevisionReason = legacyReason === "交期调整"
    ? "交期变化"
    : revisionReasons.has(legacyReason as QuoteRevisionReason)
      ? legacyReason as QuoteRevisionReason
      : revision.revisionLabel === "V1" ? "初始报价" : "其他";
  const confirmedCount = revision.priceVersions.filter((version) => version.confirmation !== null).length;
  const coordinates = parseLegacyRevisionLabel(revision.revisionLabel);
  const mainlineVersion = revision.mainlineVersion ?? coordinates.mainlineVersion;
  const branchSequence = revision.branchSequence ?? coordinates.branchSequence;
  const legacyPricing = revision.pricingParameters ?? {};
  const priceVersions = normalizeSinglePriceVersionName(revision.priceVersions.map((version) => normalizePriceVersion(version, legacyPricing)));
  const inferredParent = branchSequence === null && mainlineVersion > 1
    ? revisions.find((candidate) => parseLegacyRevisionLabel(candidate.revisionLabel).mainlineVersion === mainlineVersion - 1 && parseLegacyRevisionLabel(candidate.revisionLabel).branchSequence === null)?.revisionId ?? null
    : branchSequence !== null
      ? revisions.find((candidate) => parseLegacyRevisionLabel(candidate.revisionLabel).mainlineVersion === mainlineVersion && parseLegacyRevisionLabel(candidate.revisionLabel).branchSequence === null)?.revisionId ?? null
      : null;
  const revisionWithoutLegacyPricing = { ...revision };
  delete revisionWithoutLegacyPricing.pricingParameters;
  return normalizeRevisionAttachmentReferences({
    ...revisionWithoutLegacyPricing,
    parentRevisionId: revision.parentRevisionId ?? inferredParent,
    mainlineVersion,
    branchSequence,
    basedOnConfirmedRevisionId: revision.basedOnConfirmedRevisionId ?? null,
    reason,
    note: revision.note ?? legacyNote,
    readOnly: revision.revisionId !== defaultRevisionId,
    priceVersions,
    confirmationSummary: { confirmedCount, totalCount: priceVersions.length },
  });
}

export function normalizeQuote(quote: Quote): Quote {
  const defaultRevisionId = quote.defaultRevisionId ?? quote.currentRevisionId ?? quote.revisions[quote.revisions.length - 1]?.revisionId ?? "";
  return { ...quote, defaultRevisionId, currentRevisionId: defaultRevisionId, deletedAt: quote.deletedAt ?? null, activeEstimateCost: quote.activeEstimateCost ?? null, estimateCostHistory: quote.estimateCostHistory ?? [], revisions: quote.revisions.map((revision) => normalizeRevision(revision, defaultRevisionId, quote.revisions)) };
}

export function migrateQuoteCollection(value: unknown): Quote[] {
  if (!Array.isArray(value)) throw new Error("报价本地数据格式无效");
  return value.map((quote) => normalizeQuote(quote as Quote));
}

function mergeLegacyQuoteCollection(stableQuotes: Quote[], legacyQuotes: Quote[]): Quote[] {
  const normalizedSeeds = new Map(clone(quoteFixtures).map(normalizeQuote).map((quote) => [quote.id, JSON.stringify(quote)]));
  const merged = stableQuotes.map((quote) => clone(quote));
  for (const legacyQuote of legacyQuotes) {
    const index = merged.findIndex((quote) => quote.id === legacyQuote.id);
    if (index < 0) {
      merged.push(clone(legacyQuote));
      continue;
    }
    const stableQuote = merged[index];
    if (normalizedSeeds.get(stableQuote.id) === JSON.stringify(stableQuote)) {
      merged[index] = clone(legacyQuote);
      continue;
    }
    const stableRevisionIds = new Set(stableQuote.revisions.map((revision) => revision.revisionId));
    const missingLegacyRevisions = legacyQuote.revisions.filter((revision) => !stableRevisionIds.has(revision.revisionId));
    if (missingLegacyRevisions.length) merged[index] = { ...stableQuote, revisions: [...stableQuote.revisions, ...clone(missingLegacyRevisions)] };
  }
  return merged;
}

export function createMockQuoteRepository(options: {
  store?: LocalDataStore;
  legacySessionStorage?: LocalStorageLike | null;
} = {}): QuoteRepository {
  const store = options.store ?? browserLocalDataStore;
  let memoryQuotes: Quote[] | null = null;
  const legacySessionStorage = () => options.legacySessionStorage === undefined
    ? typeof window === "undefined" ? null : window.sessionStorage
    : options.legacySessionStorage;
  const readQuotes = (): Quote[] => {
    if (memoryQuotes) return memoryQuotes;
    const legacyStorage = legacySessionStorage();
    const stableQuotes = store.initialize(QUOTE_STORAGE_NAME, {
      seed: () => clone(quoteFixtures).map(normalizeQuote),
      legacySources: [{ key: LEGACY_QUOTE_STORAGE_KEY, storage: legacyStorage }],
      migrate: migrateQuoteCollection,
    });
    const legacyRaw = legacyStorage?.getItem(LEGACY_QUOTE_STORAGE_KEY);
    if (legacyRaw) {
      const legacyQuotes = migrateQuoteCollection(JSON.parse(legacyRaw) as unknown);
      const merged = mergeLegacyQuoteCollection(stableQuotes, legacyQuotes);
      memoryQuotes = store.save(QUOTE_STORAGE_NAME, merged);
      legacyStorage?.removeItem?.(LEGACY_QUOTE_STORAGE_KEY);
    } else memoryQuotes = stableQuotes;
    return memoryQuotes;
  };
  const writeQuotes = (quotes: Quote[]) => {
    memoryQuotes = store.save(QUOTE_STORAGE_NAME, migrateQuoteCollection(quotes));
  };

  return {
  async list() {
    return clone(readQuotes().filter((quote) => !quote.deletedAt));
  },
  async getById(id) {
    return clone(readQuotes().find((quote) => quote.id === id && !quote.deletedAt) ?? null);
  },
  async save(quote) {
    const quotes = readQuotes();
    const index = quotes.findIndex((item) => item.id === quote.id);
    if (index >= 0) quotes[index] = clone(quote);
    else quotes.unshift(clone(quote));
    writeQuotes(quotes);
  },
  async delete(id, options) {
    if (options?.mode === "soft") {
      const deletedAt = options.deletedAt ?? new Date().toISOString();
      writeQuotes(readQuotes().map((quote) => quote.id === id ? { ...quote, deletedAt } : quote));
      return;
    }
    writeQuotes(readQuotes().filter((quote) => quote.id !== id));
  },
  async createDraft(today) {
    const suffix = String(readQuotes().length + 1).padStart(3, "0");
    const id = `quote-draft-${Date.now()}`;
    const globalSettings = loadGlobalQuoteSettings();
    const quote = createQuoteDraft(id, `QT-2026-0817-${suffix}`, today, {
      usdCnyRate: globalSettings.defaultUsdCnyRate,
      markupRate: globalSettings.defaultMarkupRate,
      laborCurrency: globalSettings.defaultLaborCurrency,
      laborDescription: globalSettings.defaultLaborDescription,
    });
    const current = getDefaultRevision(quote);
    const initialized = applySystemDefaultsToNewQuoteRevision(current, globalSettings, current.revisionId);
    return clone({ ...quote, revisions: quote.revisions.map((revision) => revision.revisionId === initialized.revisionId ? initialized : revision) });
  },
  async copyFromDefaultRevision(sourceQuoteId, input) {
    const quotes = readQuotes();
    const source = quotes.find((quote) => quote.id === sourceQuoteId && !quote.deletedAt);
    if (!source) throw new Error("复制来源报价不存在");
    const styleNoIssue = validateCopyQuoteStyleNo(source, quotes, input.quoteStyleNo);
    if (styleNoIssue === "required") throw new Error("请填写新款号");
    if (styleNoIssue === "same-as-source" || styleNoIssue === "duplicate") throw new Error("该款号已存在，请输入新的款号");
    const suffix = String(quotes.filter((quote) => !quote.deletedAt).length + 1).padStart(3, "0");
    const id = `quote-copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const quoteCode = `QT-${input.today.replaceAll("-", "")}-${suffix}`;
    const copied = copyQuoteFromDefaultRevision(source, { ...input, id, quoteCode, createdAt: new Date().toISOString() });
    writeQuotes([copied, ...quotes]);
    return clone(copied);
  },
  };
}

export const mockQuoteRepository: QuoteRepository = createMockQuoteRepository();
