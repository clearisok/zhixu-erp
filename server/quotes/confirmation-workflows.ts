import { HttpError } from "../http/errors.js";
import { canonicalDecimal, isWritableDefaultRevision, type ServerQuote } from "./model.js";
import { projectForBrowser } from "../../features/quote-center/model/exact-decimal-view.js";
import { calculatePriceVersionMetrics } from "../../features/quote-center/model/quote-calculations.js";
import { validateCustomerConfirmation } from "../../features/quote-center/model/quote-validation.js";
import { summarizeRevisionConfirmations, confirmationAggregateStatus } from "../../features/quote-center/model/quote-workflows.js";
import type { QuoteRevision } from "../../features/quote-center/model/quote-view-model.js";

export type QuoteConfirmationCommand = {
  action: "confirmation.save"; expectedVersion: number; revisionId: string; priceVersionId: string;
  confirmedLaborPrice: string; confirmedGarmentPrice: string | null; note: string;
};
const invalid = () => new HttpError(400, "invalid_quote_confirmation_command", "Invalid confirmation command");
export function parseQuoteConfirmationCommand(body: Record<string, unknown>): QuoteConfirmationCommand {
  const keys = ["action", "expectedVersion", "revisionId", "priceVersionId", "confirmedLaborPrice", "confirmedGarmentPrice", "note"];
  const decimal = (value: unknown) => typeof value === "string" && value.length <= 200 && /^\d+(?:\.\d+)?$/.test(value);
  if (Object.keys(body).some(key => !keys.includes(key)) || keys.some(key => !(key in body)) || body.action !== "confirmation.save"
    || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1
    || [body.revisionId, body.priceVersionId].some(value => typeof value !== "string" || !value || value.length > 200)
    || !decimal(body.confirmedLaborPrice) || (body.confirmedGarmentPrice !== null && !decimal(body.confirmedGarmentPrice))
    || typeof body.note !== "string" || body.note.length > 2000) throw invalid();
  return { ...body, confirmedLaborPrice: canonicalDecimal(body.confirmedLaborPrice as string),
    confirmedGarmentPrice: body.confirmedGarmentPrice === null ? null : canonicalDecimal(body.confirmedGarmentPrice as string) } as QuoteConfirmationCommand;
}

export function applyQuoteConfirmation(quote: ServerQuote, command: QuoteConfirmationCommand, now: string): ServerQuote {
  const revision = quote.revisions.find(r => r.revisionId === command.revisionId);
  if (!revision) throw new HttpError(404, "quote_revision_not_found", "Revision not found in Quote");
  if (!isWritableDefaultRevision(quote, revision.revisionId)) throw new HttpError(409, "quote_revision_read_only", "Only current writable Revision may be confirmed");
  const pv = revision.priceVersions.find(p => p.id === command.priceVersionId);
  if (!pv) throw new HttpError(404, "quote_price_version_not_found", "PriceVersion not found in Revision");
  if (revision.baseInfo.quoteType === "processing" && command.confirmedGarmentPrice !== null) throw invalid();
  // Validate presence using shared rules, preserving exact submitted amounts.
  const view = projectForBrowser(revision) as QuoteRevision;
  const version = view.priceVersions.find(p => p.id === pv.id)!;
  if (!validateCustomerConfirmation(view, version, { labor: 0, garment: command.confirmedGarmentPrice === null ? null : 0 }).valid)
    throw new HttpError(400, "quote_confirmation_incomplete", "Complete saved Quote fields and required confirmation amounts");
  const metrics = revision.baseInfo.quoteType==='processing'?null:calculatePriceVersionMetrics(version);
  const next = structuredClone(quote);
  const target = next.revisions.find(r => r.revisionId === revision.revisionId)!;
  target.priceVersions.find(p => p.id === pv.id)!.confirmation = {
    quotedGarmentPrice: revision.baseInfo.quoteType==='processing'?(pv.confirmation?.quotedGarmentPrice??'0'):canonicalDecimal(String(metrics!.garmentSellingPrice)),
    quotedLaborPrice: pv.labor.value!, confirmedLaborPrice: command.confirmedLaborPrice,
    confirmedGarmentPrice: revision.baseInfo.quoteType==='processing'?(pv.confirmation?.confirmedGarmentPrice??null):command.confirmedGarmentPrice, note: command.note, confirmedAt: now,
  };
  target.confirmationSummary = summarizeRevisionConfirmations(target as unknown as QuoteRevision);
  next.aggregateStatus = confirmationAggregateStatus(target.confirmationSummary);
  return next;
}
