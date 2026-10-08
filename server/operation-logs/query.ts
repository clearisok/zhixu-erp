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

/** Response projection only: persisted historical events remain unchanged. */
export function projectOperationLogResponse(actor: TrustedIdentity, log: ServerOperationLog): ServerOperationLog {
  if (actor.permissions.includes("estimate.view")) return log;
  const projected = omitEstimateSummary(log) as ServerOperationLog;
  projected.changes = projected.changes.filter(change => change.field !== "estimateHistoryCount");
  return projected;
}
