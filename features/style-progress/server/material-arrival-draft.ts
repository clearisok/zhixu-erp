import { arrivalQuantity, compareArrivalQuantities, parseArrivalIntent, sumArrivalQuantities, type ArrivalIntent } from "../../../server/material-arrivals/contract";
import type { ArrivalDemand } from "../../../server/material-arrivals/source";
import type { StoredArrivalPlan } from "../../../server/material-arrivals/store";
import type { ArrivalRead } from "./material-arrivals-client";
import { canonicalDecimal } from "../../../server/quotes/decimal-projection";

export type ArrivalDraftBatch = { id: string; expectedArrivalAtHubDate: string; quantities: Record<string, string> };
export const arrivalDrafts = (plan: StoredArrivalPlan | null): ArrivalDraftBatch[] => (plan?.data.batches ?? []).map(batch => ({ id: batch.id,
  expectedArrivalAtHubDate: batch.expectedArrivalAtHubDate, quantities: Object.fromEntries(batch.allocations.map(a => [a.materialDemandId, a.quantity])) }));
export function arrivalDraftIntent(orderId: string, canonicalKey: string, expectedVersion: number, drafts: ArrivalDraftBatch[]): ArrivalIntent {
  return parseArrivalIntent({ action: "replace_arrival_plan", orderId, canonicalKey, expectedVersion, batches: drafts.map(batch => ({ id: batch.id, expectedArrivalAtHubDate: batch.expectedArrivalAtHubDate,
    allocations: Object.entries(batch.quantities).filter(([, value]) => value !== "" && arrivalQuantity(value, false) !== "0").map(([materialDemandId, value]) => ({ materialDemandId, quantity: arrivalQuantity(value) })) })) });
}
function difference(a: string, b: string): string {
  const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const integer = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole + fraction.padEnd(scale, "0")); };
  const raw = (integer(a) - integer(b)).toString().padStart(scale + 1, "0");
  // Derived totals can have more digits than any one bounded input. Their
  // display must not throw or silently truncate while the user fixes excess.
  return canonicalDecimal(scale ? raw.slice(0, -scale) + "." + raw.slice(-scale) : raw);
}
export function arrivalDraftBalance(required: string | null, demandId: string, drafts: readonly ArrivalDraftBatch[]) {
  let allocated: string; try { allocated = sumArrivalQuantities(drafts.map(b => b.quantities[demandId] || "0").map(v => arrivalQuantity(v, false))); }
  catch { return { allocated: null, remaining: null, excess: null }; }
  if (required === null) return { allocated, remaining: null, excess: null };
  const over = compareArrivalQuantities(allocated, required) > 0;
  return { allocated, remaining: over ? "0" : difference(required, allocated), excess: over ? difference(allocated, required) : null };
}
export type ArrivalEditorDemand = { demand: ArrivalDemand; current: ArrivalDemand | null; editable: boolean; message: string };
/** Old units remain old units until explicitly removed and saved. Missing or
 * ambiguous current rows are displayed from saved evidence, never guessed. */
export function arrivalEditorDemands(scope: ArrivalRead, canonicalKey: string): ArrivalEditorDemand[] {
  const saved = scope.plans.find(x => x.plan.canonicalKey === canonicalKey)?.plan.data.demands ?? [], current = scope.source.demands.filter(x => x.canonicalKey === canonicalKey);
  const ids = [...new Set([...saved.map(x => x.id), ...current.map(x => x.id)])];
  return ids.map(id => {
    const prior = saved.find(x => x.id === id), matches = current.filter(x => x.id === id), now = matches.length === 1 ? matches[0] : null;
    const unitChanged = Boolean(prior && now && prior.unit !== now.unit), unavailable = !now || now.eligibility !== "eligible";
    const demand = unitChanged || unavailable ? prior ?? now ?? current.find(x => x.id === id)! : now!;
    const message = unitChanged ? `旧单位${prior!.unit ?? "未知"}，当前来源${now!.unit ?? "未知"}；先移除旧分配并保存。`
      : unavailable ? matches.length > 1 || now?.eligibility === "ambiguous" ? "当前来源无法唯一匹配，只可移除旧分配。" : "当前需求不可新增分配，只可移除旧分配。" : "";
    return { demand, current: now, editable: !unitChanged && !unavailable && scope.source.status === "ready", message };
  });
}
