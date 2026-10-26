import { parseProductionResourceCommand, productionResourceUuid, PRODUCTION_RESOURCE_TYPES, type ProductionResourceCommand, type ProductionResourceType } from "../../../server/production-resources/contract";
type Scope = { userId: string; kind: ProductionResourceType };
type StorageRead = Pick<Storage, "getItem">;
const prefix = "zhixu.server.production-resource.pending.v1.";
const maxBytes = 1024 * 1024;
const unavailable = (): never => { throw new Error("production_resource_pending_unavailable"); };
export function resourcePendingKey(scope: Scope) {
  if (!PRODUCTION_RESOURCE_TYPES.includes(scope.kind)) return unavailable();
  return prefix + productionResourceUuid(scope.userId) + "." + scope.kind;
}
export function readResourcePending(storage: StorageRead, scope: Scope): ProductionResourceCommand | null {
  const raw = storage.getItem(resourcePendingKey(scope)); if (raw === null) return null;
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return unavailable();
  let value: unknown; try { value = JSON.parse(raw); } catch { return unavailable(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return unavailable();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 5 || !["schemaVersion", "userId", "kind", "savedAt", "command"].every(key => Object.hasOwn(record, key))
    || record.schemaVersion !== 1 || record.userId !== productionResourceUuid(scope.userId) || record.kind !== scope.kind
    || typeof record.savedAt !== "string" || !Number.isFinite(Date.parse(record.savedAt))) return unavailable();
  let command: ProductionResourceCommand; try { command = parseProductionResourceCommand(record.command); } catch { return unavailable(); }
  if (command.kind !== scope.kind || JSON.stringify(command) !== JSON.stringify(record.command)) return unavailable();
  return command;
}
/** Temporary unresolved command only. No Browser business namespace is touched. */
export function saveResourcePending(storage: StorageRead & Pick<Storage, "setItem">, scope: Scope, value: ProductionResourceCommand) {
  const command = parseProductionResourceCommand(value); if (command.kind !== scope.kind) return unavailable();
  const previous = readResourcePending(storage, scope);
  if (previous) { if (JSON.stringify(previous) !== JSON.stringify(command)) throw new Error("production_resource_pending_locked"); return previous; }
  const raw = JSON.stringify({ schemaVersion: 1, userId: productionResourceUuid(scope.userId), kind: scope.kind, savedAt: new Date().toISOString(), command });
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return unavailable();
  storage.setItem(resourcePendingKey(scope), raw); if (storage.getItem(resourcePendingKey(scope)) !== raw) return unavailable();
  return command;
}
export function acknowledgeResourcePending(storage: StorageRead & Pick<Storage, "removeItem">, scope: Scope, value: ProductionResourceCommand) {
  const command = parseProductionResourceCommand(value), previous = readResourcePending(storage, scope);
  if (!previous) return;
  if (JSON.stringify(previous) !== JSON.stringify(command)) throw new Error("production_resource_pending_locked");
  storage.removeItem(resourcePendingKey(scope)); if (storage.getItem(resourcePendingKey(scope)) !== null) return unavailable();
}
