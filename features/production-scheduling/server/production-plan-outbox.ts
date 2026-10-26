import { canonicalPlanJson } from "../../../server/production-scheduling/canonical-json";
import { parsePlanCommand, type PlanCommand } from "../../../server/production-scheduling/contract";
import { productionResourceUuid } from "../../../server/production-resources/contract";

type ReadStorage = Pick<Storage, "getItem">;
type Scope = { userId: string };
const maxBytes = 1024 * 1024;
const unavailable = (): never => { throw new Error("production_plan_pending_unavailable"); };
/** One unresolved planning command per actor/tab, including multi-order replans. */
export const productionPlanPendingKey = (scope: Scope) => "zhixu.server.production-plan.pending.v1." + productionResourceUuid(scope.userId);
export function readProductionPlanPending(storage: ReadStorage, scope: Scope): PlanCommand | null {
  const raw = storage.getItem(productionPlanPendingKey(scope)); if (raw === null) return null;
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return unavailable();
  let value: unknown; try { value = JSON.parse(raw); } catch { return unavailable(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return unavailable();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4 || !["schemaVersion", "userId", "savedAt", "command"].every(key => Object.hasOwn(record, key))
    || record.schemaVersion !== 1 || record.userId !== productionResourceUuid(scope.userId) || typeof record.savedAt !== "string"
    || !Number.isFinite(Date.parse(record.savedAt)) || new Date(record.savedAt).toISOString() !== record.savedAt) return unavailable();
  let command: PlanCommand; try { command = parsePlanCommand(record.command); } catch { return unavailable(); }
  if (canonicalPlanJson(command) !== canonicalPlanJson(record.command)) return unavailable();
  return command;
}
/** Pending request evidence only; never reads or writes a Browser business key. */
export function saveProductionPlanPending(storage: ReadStorage & Pick<Storage, "setItem">, scope: Scope, value: PlanCommand) {
  const command = parsePlanCommand(value), previous = readProductionPlanPending(storage, scope);
  if (previous) { if (canonicalPlanJson(previous) !== canonicalPlanJson(command)) throw new Error("production_plan_pending_locked"); return previous; }
  const raw = JSON.stringify({ schemaVersion: 1, userId: productionResourceUuid(scope.userId), savedAt: new Date().toISOString(), command });
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return unavailable();
  storage.setItem(productionPlanPendingKey(scope), raw); if (storage.getItem(productionPlanPendingKey(scope)) !== raw) return unavailable();
  return command;
}
export function acknowledgeProductionPlanPending(storage: ReadStorage & Pick<Storage, "removeItem">, scope: Scope, value: PlanCommand) {
  const command = parsePlanCommand(value), previous = readProductionPlanPending(storage, scope);
  if (!previous) return;
  if (canonicalPlanJson(previous) !== canonicalPlanJson(command)) throw new Error("production_plan_pending_locked");
  storage.removeItem(productionPlanPendingKey(scope)); if (storage.getItem(productionPlanPendingKey(scope)) !== null) return unavailable();
}
