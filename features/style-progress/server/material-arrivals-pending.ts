import { canonicalPlanJson } from "../../../server/production-scheduling/canonical-json";
import { arrivalUuid, parseArrivalCommand, type ArrivalCommand } from "../../../server/material-arrivals/contract";

type Scope = { userId: string };
type ReadStorage = Pick<Storage, "getItem">;
const unavailable = (): never => { throw new Error("material_arrival_pending_unavailable"); };
/** Only an unresolved Server request, never a Browser business record. One slot
 * per actor/tab prevents a new request from hiding an unknown earlier result. */
export const materialArrivalPendingKey = (scope: Scope) => "zhixu.server.material-arrival.pending.v1." + arrivalUuid(scope.userId);
export function readMaterialArrivalPending(storage: ReadStorage, scope: Scope): ArrivalCommand | null {
  const raw = storage.getItem(materialArrivalPendingKey(scope)); if (raw === null) return null;
  if (new TextEncoder().encode(raw).byteLength > 65536) return unavailable();
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return unavailable(); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return unavailable();
  const r = parsed as Record<string, unknown>;
  if (Object.keys(r).length !== 4 || !["schemaVersion", "userId", "savedAt", "command"].every(k => Object.hasOwn(r, k)) || r.schemaVersion !== 1
    || r.userId !== arrivalUuid(scope.userId) || typeof r.savedAt !== "string" || !Number.isFinite(Date.parse(r.savedAt)) || new Date(r.savedAt).toISOString() !== r.savedAt) return unavailable();
  let command; try { command = parseArrivalCommand(r.command); } catch { return unavailable(); }
  if (canonicalPlanJson(command) !== canonicalPlanJson(r.command)) return unavailable(); return command;
}
export function saveMaterialArrivalPending(storage: ReadStorage & Pick<Storage, "setItem">, scope: Scope, value: ArrivalCommand) {
  const command = parseArrivalCommand(value), prior = readMaterialArrivalPending(storage, scope);
  if (prior) { if (canonicalPlanJson(prior) !== canonicalPlanJson(command)) throw new Error("material_arrival_pending_locked"); return prior; }
  const raw = JSON.stringify({ schemaVersion: 1, userId: arrivalUuid(scope.userId), savedAt: new Date().toISOString(), command });
  if (new TextEncoder().encode(raw).byteLength > 65536) return unavailable();
  storage.setItem(materialArrivalPendingKey(scope), raw); if (storage.getItem(materialArrivalPendingKey(scope)) !== raw) return unavailable(); return command;
}
export function acknowledgeMaterialArrivalPending(storage: ReadStorage & Pick<Storage, "removeItem">, scope: Scope, value: ArrivalCommand) {
  const command = parseArrivalCommand(value), prior = readMaterialArrivalPending(storage, scope); if (!prior) return;
  if (canonicalPlanJson(prior) !== canonicalPlanJson(command)) throw new Error("material_arrival_pending_locked");
  storage.removeItem(materialArrivalPendingKey(scope)); if (storage.getItem(materialArrivalPendingKey(scope)) !== null) return unavailable();
}
