import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import type { ServerOperationLog } from "./repository.js";

export type OperationLogQuery = {
  limit: number;
  offset: number;
  quoteId?: string;
  module?: string;
  action?: string;
  from?: string;
  to?: string;
};

const invalid = () => new HttpError(400, "invalid_operation_log_query", "Invalid operation log query");
const fields = new Set(["limit", "offset", "quoteId", "module", "action", "from", "to"]);

function integer(value: string | null, fallback: number, minimum: number, maximum: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/u.test(value) || value.length > 10) throw invalid();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw invalid();
  return number;
}

function text(value: string | null, maximum: number): string | undefined {
  if (value === null) return undefined;
  if (!value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw invalid();
  return value;
}

function timestamp(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) || value.startsWith("0000")) throw invalid();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) throw invalid();
  return value;
}

export function parseOperationLogQuery(params: URLSearchParams): OperationLogQuery {
  for (const key of params.keys()) if (!fields.has(key) || params.getAll(key).length !== 1) throw invalid();
  const query: OperationLogQuery = {
    limit: integer(params.get("limit"), 50, 1, 100),
    offset: integer(params.get("offset"), 0, 0, 1_000_000),
    quoteId: text(params.get("quoteId"), 256),
    module: text(params.get("module"), 128),
    action: text(params.get("action"), 128),
    from: timestamp(params.get("from")),
    to: timestamp(params.get("to")),
  };
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) throw invalid();
  return query;
}

function omitEstimateSummary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitEstimateSummary);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "estimateHistoryCount")
    .map(([key, child]) => [key, omitEstimateSummary(child)]));
  return value;
}

const costKeys=new Set(["fabrics","trims","labor","otherCosts","pricingParameters","confirmation","unitPrice","amount","usage","lossRate","value","usdCnyRate","markupRate","freightAmount","quotedGarmentPrice","confirmedGarmentPrice","quotedLaborPrice","confirmedLaborPrice"]);
function omitCost(value:unknown):unknown {
 if(Array.isArray(value))return value.map(omitCost);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([key])=>!costKeys.has(key)).map(([key,child])=>[key,omitCost(child)]));
 return value;
}
const saleKeys = new Set(["customerConfirmedPrice", "customerConfirmedPriceCurrency", "confirmedGarmentPrice", "quotedGarmentPrice", "garmentSellingPrice", "garmentPrice", "finalQuote"]);
const laborKeys = new Set(["confirmedLaborPrice", "laborCurrency"]);
function omitFields(value: unknown, keys: Set<string>): unknown {
 if (Array.isArray(value)) return value.map(item => omitFields(item, keys));
 if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.has(key)).map(([key, child]) => [key, omitFields(child, keys)]));
 return value;
}
/** Persisted audit facts stay complete; each HTTP read uses current grants. */
export function projectOperationLogResponse(actor: TrustedIdentity, log: ServerOperationLog): ServerOperationLog {
 let projected=log;
 if(!actor.permissions.includes("estimate.view")||!actor.permissions.includes("quote.cost.view")){
  projected=omitEstimateSummary(projected) as ServerOperationLog;
  projected.changes=projected.changes.filter(change=>change.field!=="estimateHistoryCount");
 }
 if(!actor.permissions.includes("quote.cost.view")&&(log.entityType==="Quote"||log.entityType==="EstimateCost")){
  projected=omitCost(projected) as ServerOperationLog;
  projected.changes=projected.changes.filter(change=>!change.field.split(/[.\[\]]/).some(key=>costKeys.has(key)));
  projected.costVisibility="restricted";
 }
 const restricted = new Set<string>();
 if (!actor.permissions.includes("commercial.sale.view")) for (const key of saleKeys) restricted.add(key);
 if (!actor.permissions.includes("commercial.labor.view")) for (const key of laborKeys) restricted.add(key);
 if (restricted.size) {
  projected = omitFields(projected, restricted) as ServerOperationLog;
  projected.changes = projected.changes.filter(change => !change.field.split(/[.\[\]]/).some(key => restricted.has(key)));
 }
 return projected;
}
