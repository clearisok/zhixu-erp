"use client";

import { quoteFixtures } from "../fixtures/quote-fixtures";
import { createQuoteDraft, getDefaultRevision, normalizeSinglePriceVersionName, type Quote, type QuoteRevision, type QuoteRevisionReason } from "../model/quote-view-model";
import { parseLegacyRevisionLabel } from "../model/quote-revision-naming";
import { applyGlobalCostsToRevision, loadGlobalQuoteSettings } from "../model/quote-settings";
import { normalizeRevisionAttachmentReferences } from "../model/quote-attachments";
import { loadBasicSettings } from "../../basic-settings/repository/basic-settings-repository";
import type { QuoteRepository } from "./quote-repository";

const STORAGE_KEY = "zhixu.quote-center.slice-1.2";
let memoryQuotes: Quote[] | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const revisionReasons = new Set<QuoteRevisionReason>(["初始报价", "客户调价", "面料价格变化", "辅料价格变化", "工价调整", "交期变化", "基础信息调整", "其他"]);

function normalizeRevision(revision: QuoteRevision, defaultRevisionId: string, revisions: QuoteRevision[]): QuoteRevision {
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
  const priceVersions = normalizeSinglePriceVersionName(revision.priceVersions);
  const inferredParent = branchSequence === null && mainlineVersion > 1
    ? revisions.find((candidate) => parseLegacyRevisionLabel(candidate.revisionLabel).mainlineVersion === mainlineVersion - 1 && parseLegacyRevisionLabel(candidate.revisionLabel).branchSequence === null)?.revisionId ?? null
    : branchSequence !== null
      ? revisions.find((candidate) => parseLegacyRevisionLabel(candidate.revisionLabel).mainlineVersion === mainlineVersion && parseLegacyRevisionLabel(candidate.revisionLabel).branchSequence === null)?.revisionId ?? null
      : null;
  return normalizeRevisionAttachmentReferences({
    ...revision,
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

function normalizeQuote(quote: Quote): Quote {
  const defaultRevisionId = quote.defaultRevisionId ?? quote.currentRevisionId ?? quote.revisions[quote.revisions.length - 1]?.revisionId ?? "";
  return { ...quote, defaultRevisionId, currentRevisionId: defaultRevisionId, deletedAt: quote.deletedAt ?? null, activeEstimateCost: quote.activeEstimateCost ?? null, estimateCostHistory: quote.estimateCostHistory ?? [], revisions: quote.revisions.map((revision) => normalizeRevision(revision, defaultRevisionId, quote.revisions)) };
}

function readQuotes(): Quote[] {
  if (memoryQuotes) return memoryQuotes;
  if (typeof window !== "undefined") {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { memoryQuotes = (JSON.parse(stored) as Quote[]).map(normalizeQuote); } catch { memoryQuotes = null; }
    }
  }
  memoryQuotes = memoryQuotes ?? clone(quoteFixtures).map(normalizeQuote);
  return memoryQuotes;
}

function writeQuotes(quotes: Quote[]) {
  memoryQuotes = clone(quotes);
  if (typeof window !== "undefined") window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryQuotes));
}

export const mockQuoteRepository: QuoteRepository = {
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
    const defaults = loadBasicSettings().systemDefaults;
    const globalSettings = loadGlobalQuoteSettings();
    const quote = createQuoteDraft(id, `QT-2026-0817-${suffix}`, today, { ...defaults, laborDescription: globalSettings.defaultLaborDescription });
    const current = getDefaultRevision(quote);
    const initialized = applyGlobalCostsToRevision(current, globalSettings, `${current.revisionId}-global-other`);
    return clone({ ...quote, revisions: quote.revisions.map((revision) => revision.revisionId === initialized.revisionId ? initialized : revision) });
  },
};
