import { HttpError } from "../http/errors.js";
import { canonicalDecimal, isWritableDefaultRevision, type ServerQuote } from "./model.js";
import type { Quote, PriceVersion, QuoteRevision, QuoteRevisionReason } from "../../features/quote-center/model/quote-view-model.js";
import { normalizeSinglePriceVersionName } from "../../features/quote-center/model/quote-view-model.js";
import { createRevisionFromSnapshot, removePriceVersion, summarizeRevisionConfirmations, confirmationAggregateStatus } from "../../features/quote-center/model/quote-workflows.js";
import { validateRevisionUpdate } from "../../features/quote-center/model/quote-validation.js";
import { copyPriceVersion } from "../../features/quote-center/model/quote-calculations.js";
import { ensurePriceVersionLineGroups } from "../../features/quote-center/model/price-version-cost-sync.js";

export type QuoteVersionCommand = { expectedVersion: number } & (
  | { action: "revision.create"; sourceRevisionId: string; reason: QuoteRevisionReason; note: string }
  | { action: "price.create" | "price.update"; revisionId: string; priceVersionId: string; name: string; quantity: string; description: string }
  | { action: "price.delete"; revisionId: string; priceVersionId: string }
);
const invalid = () => new HttpError(400, "invalid_quote_version_command", "Invalid Quote version command");
export function parseQuoteVersionCommand(body: Record<string, unknown>): QuoteVersionCommand {
  const action = body.action;
  const keys = action === "revision.create" ? ["action", "expectedVersion", "sourceRevisionId", "reason", "note"]
    : action === "price.create" || action === "price.update" ? ["action", "expectedVersion", "revisionId", "priceVersionId", "name", "quantity", "description"]
    : action === "price.delete" ? ["action", "expectedVersion", "revisionId", "priceVersionId"] : null;
  if (!keys || Object.keys(body).some(key => !keys.includes(key)) || keys.some(key => !(key in body))
    || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1
    || keys.filter(key => key !== "expectedVersion").some(key => typeof body[key] !== "string")) throw invalid();
  if (action === "revision.create") {
    if (!["客户调价", "面料价格变化", "辅料价格变化", "工价调整", "交期变化", "基础信息调整", "其他"].includes(String(body.reason))) throw invalid();
  } else if (action !== "price.delete") {
    if (!String(body.name).trim() || !/^\d+(?:\.\d+)?$/u.test(String(body.quantity))) throw invalid();
    body = { ...body, quantity: canonicalDecimal(String(body.quantity)), name: String(body.name).trim() };
  }
  return body as QuoteVersionCommand;
}

/** These shared rules only clone/assign, count confirmations and validate presence.
 * Structural views do NOT convert any decimal strings or invoke a calculator. */
export function applyQuoteVersionCommand(quote: ServerQuote, command: QuoteVersionCommand, identity: { id: () => string; actor: string; now: string }): ServerQuote {
  if (command.action === "revision.create") {
    const source = quote.revisions.find(r => r.revisionId === command.sourceRevisionId);
    if (!source) throw new HttpError(404, "quote_revision_not_found", "Source Revision not found in this Quote");
    if (!validateRevisionUpdate(source as unknown as QuoteRevision).valid) throw new HttpError(400, "quote_revision_incomplete", "Complete the source Revision before updating");
    return createRevisionFromSnapshot(quote as unknown as Quote, { sourceRevisionId: source.revisionId, reason: command.reason, note: command.note, createdBy: identity.actor, nowIso: identity.now, revisionId: identity.id() }) as unknown as ServerQuote;
  }
  if (!isWritableDefaultRevision(quote, command.revisionId)) throw new HttpError(409, "quote_revision_read_only", "Only the writable default Revision may change");
  const next = structuredClone(quote);
  const revision = next.revisions.find(r => r.revisionId === command.revisionId)!;
  const source = revision.priceVersions.find(p => p.id === command.priceVersionId);
  if (!source) throw new HttpError(404, "quote_price_version_not_found", "PriceVersion not found in this Revision");
  if (command.action === "price.create") {
    const versions = normalizeSinglePriceVersionName(revision.priceVersions as unknown as PriceVersion[]);
    const linked = ensurePriceVersionLineGroups(versions.find(p => p.id === source.id)!, identity.id);
    const copied = copyPriceVersion(linked, { id: identity.id(), name: command.name, quantity: command.quantity as unknown as number, description: command.description });
    revision.priceVersions = [...versions.map(p => p.id === source.id ? linked : p), copied] as unknown as typeof revision.priceVersions;
  } else if (command.action === "price.update") {
    Object.assign(source, { name: command.name, quantity: command.quantity, description: command.description });
  } else {
    if (revision.priceVersions.length === 1) throw new HttpError(409, "quote_last_price_version", "Cannot delete the last PriceVersion");
    revision.priceVersions = normalizeSinglePriceVersionName(removePriceVersion(revision as unknown as QuoteRevision, source.id).priceVersions) as unknown as typeof revision.priceVersions;
  }
  revision.confirmationSummary = summarizeRevisionConfirmations(revision as unknown as QuoteRevision);
  next.aggregateStatus = confirmationAggregateStatus(revision.confirmationSummary);
  return next;
}
