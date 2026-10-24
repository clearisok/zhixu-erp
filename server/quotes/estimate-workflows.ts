import { isDeepStrictEqual } from "node:util";
import { HttpError } from "../http/errors.js";
import { canonicalDecimal, type ServerQuote } from "./model.js";
import { BASE_PRICE_VERSION_NAME } from "../../features/quote-center/model/quote-view-model.js";

export type ServerEstimate = NonNullable<ServerQuote["activeEstimateCost"]>;
export type EstimateCommand = { expectedVersion: number } & (
  | { action: "estimate.generate" | "estimate.regenerate"; sourceRevisionId: string; sourcePriceVersionId?: string }
  | { action: "estimate.update"; estimate: ServerEstimate }
  | { action: "estimate.restore" | "estimate.ignore"; estimateId: string }
);
const invalid = () => new HttpError(400, "invalid_estimate_command", "Invalid Estimate command");
export function parseEstimateCommand(body: Record<string, unknown>): EstimateCommand {
  const generation = body.action === "estimate.generate" || body.action === "estimate.regenerate";
  const keys = generation ? ["action", "expectedVersion", "sourceRevisionId", "sourcePriceVersionId"]
    : body.action === "estimate.update" ? ["action", "expectedVersion", "estimate"]
    : body.action === "estimate.restore" || body.action === "estimate.ignore" ? ["action", "expectedVersion", "estimateId"] : null;
  if (!keys || Object.keys(body).some(key => !keys.includes(key)) || keys.filter(k => k !== "sourcePriceVersionId").some(k => !(k in body))
    || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) throw invalid();
  for (const key of ["sourceRevisionId", "sourcePriceVersionId", "estimateId"]) if (key in body && (typeof body[key] !== "string" || !body[key] || String(body[key]).length > 256)) throw invalid();
  if (body.action === "estimate.update" && (!body.estimate || typeof body.estimate !== "object" || Array.isArray(body.estimate))) throw invalid();
  return body as EstimateCommand;
}

const editable = {
  fabrics: ["name", "composition", "segmentLengthCm", "netWidthCm", "gsm", "lossRate", "supplier", "unitPrice", "purchaseUnit"],
  trims: ["name", "specification", "usage", "unit", "lossRate", "unitPrice", "supplier"],
  otherCosts: ["name", "specification", "usage", "unit", "lossRate", "unitPrice"],
  labor: ["value", "description"],
} as const;
const decimals = new Set(["segmentLengthCm", "netWidthCm", "gsm", "lossRate", "unitPrice", "usage", "value"]);
function editValues(before: object, input: object, fields: readonly string[]): object {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid();
  const base = before as Record<string, unknown>, values = input as Record<string, unknown>;
  if (Object.keys(values).some(k => !Object.hasOwn(base, k)) || Object.keys(base).some(k => !Object.hasOwn(values, k))) throw invalid();
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(values)) {
    if (!fields.includes(key)) { if (!isDeepStrictEqual(value, base[key])) throw invalid(); continue; }
    if (decimals.has(key)) {
      if (value !== null && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))) throw invalid();
      result[key] = value === null ? null : canonicalDecimal(value as string);
    } else {
      if (typeof value !== "string" || value.length > 10000 || (key === "purchaseUnit" && !["kg", "meter"].includes(value))) throw invalid();
      result[key] = value;
    }
  }
  return result;
}
/** Full current snapshot input is a mirror, not authority for provenance/structure.
 * Only values exposed by the existing fixed-structure panel may change. */
export function editEstimate(before: ServerEstimate, input: ServerEstimate): ServerEstimate {
  const next = structuredClone(before);
  const groups = ["fabrics", "trims", "otherCosts"] as const;
  for (const key of Object.keys(input)) if (!Object.hasOwn(before, key)) throw invalid();
  for (const key of Object.keys(before)) if (!Object.hasOwn(input, key)) throw invalid();
  for (const key of Object.keys(before).filter(k => ![...groups, "labor"].includes(k))) {
    if (!isDeepStrictEqual(input[key as keyof ServerEstimate], before[key as keyof ServerEstimate])) throw invalid();
  }
  const editGroup = <K extends typeof groups[number]>(group: K) => {
    if (!Array.isArray(input[group]) || input[group].length !== before[group].length) throw invalid();
    next[group] = before[group].map((line, i) => editValues(line, input[group][i], editable[group])) as typeof next[typeof group];
  };
  groups.forEach(editGroup);
  next.labor = editValues(before.labor, input.labor, editable.labor) as ServerEstimate["labor"];
  return next;
}

/** Clone only: preserve decimal strings verbatim, never invoke a calculator.
 * Server identity/time and new row IDs replace only lifecycle technical fields. */
export function applyEstimateCommand(quote: ServerQuote, command: EstimateCommand, identity: { id(): string; actor: string; now: string }): ServerQuote {
  // Match the saved-current read boundary; a historical view/source is not authority.
  if (quote.revisions.find(revision => revision.revisionId === quote.defaultRevisionId)?.baseInfo.quoteType === "processing")
    throw new HttpError(409, "estimate_not_applicable", "Estimate commands are unavailable for processing quotes");
  const next = structuredClone(quote);
  const activate = (estimate: ServerEstimate) => {
    if (next.activeEstimateCost) next.estimateCostHistory.push(structuredClone(next.activeEstimateCost));
    next.activeEstimateCost = estimate;
  };
  const cloneRows = (estimate: ServerEstimate): ServerEstimate => ({ ...estimate,
    fabrics: estimate.fabrics.map(row => ({ ...structuredClone(row), id: identity.id() })),
    trims: estimate.trims.map(row => ({ ...structuredClone(row), id: identity.id() })),
    otherCosts: estimate.otherCosts.map(row => ({ ...structuredClone(row), id: identity.id() })),
  });
  if (command.action === "estimate.generate" || command.action === "estimate.regenerate") {
    if (Boolean(next.activeEstimateCost) !== (command.action === "estimate.regenerate")) throw new HttpError(409, "estimate_active_changed", "Explicit active replacement decision required");
    const revision = quote.revisions.find(r => r.revisionId === command.sourceRevisionId);
    const source = command.sourcePriceVersionId !== undefined ? revision?.priceVersions.find(p => p.id === command.sourcePriceVersionId)
      : revision?.priceVersions.find(p => p.name === BASE_PRICE_VERSION_NAME) ?? revision?.priceVersions[0];
    if (!revision || !source) throw new HttpError(404, "estimate_source_not_found", "Estimate source not found");
    activate(cloneRows({ id: identity.id(), quoteId: quote.id, basedOnRevisionId: revision.revisionId, sourcePriceVersionId: source.id,
      generatedAt: identity.now, generatedBy: identity.actor, ignoredForRevisionId: null,
      pricingParameters: structuredClone(source.pricingParameters), fabrics: source.fabrics, trims: source.trims,
      labor: structuredClone(source.labor), otherCosts: source.otherCosts }));
  } else if (command.action === "estimate.restore") {
    const historical = quote.estimateCostHistory.find(e => e.id === command.estimateId);
    if (!historical) throw new HttpError(404, "estimate_history_not_found", "Estimate history not found");
    activate(cloneRows({ ...structuredClone(historical), id: identity.id(), generatedAt: identity.now, generatedBy: identity.actor, ignoredForRevisionId: null }));
  } else if (command.action === "estimate.update" || command.action === "estimate.ignore") {
    const active = quote.activeEstimateCost;
    if (!active || active.id !== (command.action === "estimate.update" ? command.estimate.id : command.estimateId)) throw new HttpError(409, "estimate_active_changed", "Current Estimate changed");
    next.activeEstimateCost = command.action === "estimate.update" ? editEstimate(active, command.estimate) : { ...active, ignoredForRevisionId: quote.defaultRevisionId };
  }
  return next;
}
