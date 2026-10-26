import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { HttpError } from "../http/errors.js";
import { productionResourceDate, productionResourceUuid } from "../production-resources/contract.js";
import { canonicalDecimal } from "../quotes/decimal-projection.js";

export const ARRIVAL_READ_PERMISSIONS: readonly PermissionKey[] = ["order.view", "ainuoke.view", "style_progress.read"];
export const ARRIVAL_WRITE_PERMISSIONS: readonly PermissionKey[] = [...ARRIVAL_READ_PERMISSIONS, "style_progress.edit"];
export type ArrivalAllocation = { materialDemandId: string; quantity: string };
export type ArrivalBatch = { id: string; expectedArrivalAtHubDate: string; allocations: ArrivalAllocation[] };
export type ArrivalIntent = { action: "replace_arrival_plan"; orderId: string; canonicalKey: string; expectedVersion: number; batches: ArrivalBatch[] };
export type ArrivalCommand = { requestId: string; intent: ArrivalIntent; previewHash: string };
export const arrivalFail = (status: number, code: string): never => { throw new HttpError(status, code, code); };
const invalid = (): never => arrivalFail(400, "invalid_material_arrival_intent");
function exact(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
export function arrivalUuid(value: unknown): string { try { return productionResourceUuid(value); } catch { return invalid(); } }
export function arrivalKey(value: unknown): string {
  if (typeof value !== "string" || !/^material-(?:fabric|trim)-[a-z0-9]{1,16}$/u.test(value)) return invalid();
  return value;
}
/** Same exact decimal boundary as production quantities. No rounding or floats. */
export function arrivalQuantity(value: unknown, positive = true): string {
  if (typeof value !== "string" || value.length > 128 || !/^\d+(?:\.\d+)?$/u.test(value)) return invalid();
  const result = canonicalDecimal(value);
  if (positive && result === "0") return invalid();
  return result;
}
export function sumArrivalQuantities(values: readonly string[]): string {
  const scale = Math.max(0, ...values.map(value => value.split(".")[1]?.length ?? 0));
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = value.split(".");
    return sum + BigInt(whole + fraction.padEnd(scale, "0"));
  }, BigInt(0)).toString().padStart(scale + 1, "0");
  return canonicalDecimal(scale ? total.slice(0, -scale) + "." + total.slice(-scale) : total);
}
export function compareArrivalQuantities(left: string, right: string): number {
  const scale = Math.max(left.split(".")[1]?.length ?? 0, right.split(".")[1]?.length ?? 0);
  const integer = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole + fraction.padEnd(scale, "0")); };
  const a = integer(left), b = integer(right); return a < b ? -1 : a > b ? 1 : 0;
}
export function parseArrivalIntent(value: unknown): ArrivalIntent {
  const row = exact(value, ["action", "orderId", "canonicalKey", "expectedVersion", "batches"]);
  if (row.action !== "replace_arrival_plan" || typeof row.expectedVersion !== "number" || !Number.isSafeInteger(row.expectedVersion)
    || row.expectedVersion < 0 || row.expectedVersion > 2147483646 || !Array.isArray(row.batches) || row.batches.length > 100) return invalid();
  const batchIds = new Set<string>(); let allocations = 0;
  const batches = row.batches.map(value => {
    const batch = exact(value, ["id", "expectedArrivalAtHubDate", "allocations"]), id = arrivalUuid(batch.id);
    if (batchIds.has(id) || !Array.isArray(batch.allocations) || !batch.allocations.length || batch.allocations.length > 200) return invalid();
    batchIds.add(id); const demands = new Set<string>();
    let date: string; try { date = productionResourceDate(batch.expectedArrivalAtHubDate); } catch { return invalid(); }
    const items = batch.allocations.map(value => {
      const item = exact(value, ["materialDemandId", "quantity"]), materialDemandId = arrivalUuid(item.materialDemandId);
      if (demands.has(materialDemandId) || ++allocations > 200) return invalid();
      demands.add(materialDemandId); return { materialDemandId, quantity: arrivalQuantity(item.quantity) };
    }).sort((a, b) => a.materialDemandId.localeCompare(b.materialDemandId));
    return { id, expectedArrivalAtHubDate: date, allocations: items };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { action: row.action, orderId: arrivalUuid(row.orderId), canonicalKey: arrivalKey(row.canonicalKey), expectedVersion: row.expectedVersion, batches };
}
export function parseArrivalCommand(value: unknown): ArrivalCommand {
  const row = exact(value, ["requestId", "intent", "previewHash"]);
  if (typeof row.previewHash !== "string" || !/^[a-f0-9]{64}$/u.test(row.previewHash)) return invalid();
  const command = { requestId: arrivalUuid(row.requestId), intent: parseArrivalIntent(row.intent), previewHash: row.previewHash };
  // Also bounds future field/cardinality extensions before opening a command
  // transaction. SQL reserves 64KiB including its JSON formatting whitespace.
  if (new TextEncoder().encode(JSON.stringify(command)).byteLength > 60000) return invalid();
  return command;
}
export function parseArrivalHistoryQuery(params: URLSearchParams) {
  const fail = (): never => arrivalFail(400, "invalid_material_arrival_history_query");
  if ([...params.keys()].some(key => !["offset", "asOfVersion"].includes(key) || params.getAll(key).length !== 1)) fail();
  const number = (key: string, max: number) => {
    const raw = params.get(key); if (raw === null) return null;
    if (!/^\d{1,10}$/u.test(raw) || Number(raw) > max) return fail(); return Number(raw);
  };
  return { offset: number("offset", 100000) ?? 0, asOfVersion: number("asOfVersion", 2147483647) };
}
