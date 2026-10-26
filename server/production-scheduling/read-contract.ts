import { HttpError } from "../http/errors.js";

export const PLAN_ALLOCATION_STATES = ["unassigned", "partial", "allocated", "overassigned", "unknown"] as const;
export type PlanAllocationState = typeof PLAN_ALLOCATION_STATES[number];
export type PlanListQuery = { search: string; offset: number; limit: number } & (
  { kind: "orders"; allocation: "all" | "remaining" | PlanAllocationState } |
  { kind: "groups"; status: "relevant" | "enabled" | "disabled" | "all" }
);
const invalid = (code: string): never => { throw new HttpError(400, code, code); };
function integer(params: URLSearchParams, key: string, fallback: number, min: number, max: number, code: string) {
  const raw = params.get(key); if (raw === null) return fallback;
  if (!/^\d{1,10}$/u.test(raw)) return invalid(code);
  const value = Number(raw); if (!Number.isSafeInteger(value) || value < min || value > max) return invalid(code); return value;
}
export function parsePlanListQuery(params: URLSearchParams, kind: "orders" | "groups"): PlanListQuery {
  const code = "invalid_production_plan_query", selector = kind === "orders" ? "allocation" : "status";
  if ([...params.keys()].some(key => !["search", "offset", "limit", selector].includes(key) || params.getAll(key).length !== 1)) invalid(code);
  const search = (params.get("search") ?? "").trim();
  if (search.length > 200 || search.includes("\0") || search.split(/\s+/u).length > 10) invalid(code);
  const common = { search, offset: integer(params, "offset", 0, 0, 100000, code), limit: integer(params, "limit", 50, 1, 100, code) };
  if (kind === "orders") {
    const allocation = params.get("allocation") ?? "remaining";
    if (!["all", "remaining", ...PLAN_ALLOCATION_STATES].includes(allocation)) invalid(code);
    return { ...common, kind, allocation: allocation as Extract<PlanListQuery, { kind: "orders" }>["allocation"] };
  }
  const status = params.get("status") ?? "relevant";
  if (!["relevant", "enabled", "disabled", "all"].includes(status)) invalid(code);
  return { ...common, kind, status: status as Extract<PlanListQuery, { kind: "groups" }>["status"] };
}
export function parsePlanHistoryQuery(params: URLSearchParams) {
  const code = "invalid_production_history_query";
  if ([...params.keys()].some(key => !["offset", "asOfVersion"].includes(key) || params.getAll(key).length !== 1)) invalid(code);
  return { offset: integer(params, "offset", 0, 0, 100000, code),
    asOfVersion: params.has("asOfVersion") ? integer(params, "asOfVersion", 1, 1, 2147483647, code) : null };
}
export function planPageInfo(total: number, offset: number, count: number, limit: number) {
  const hasMore = offset + count < total;
  if (hasMore && offset + count > 100000) throw new HttpError(422, "production_order_projection_limit", "production_order_projection_limit");
  return { total, offset, limit, hasMore };
}
