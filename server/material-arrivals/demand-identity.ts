import { createHash } from "node:crypto";
import type { ProgressRow } from "../../features/ainuoke-material-progress/projection.js";
import { canonicalPlanJson } from "../production-scheduling/canonical-json.js";

const normalized = (value: unknown) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleUpperCase();
export function materialArrivalHash(value: unknown): string { return createHash("sha256").update(canonicalPlanJson(value)).digest("hex"); }
/** A source row hash is evidence, not the durable planning identity. This exact
 * variant tuple excludes mutable quantities, due dates, units and event facts.
 * Two current demands with this same tuple are ambiguous, never aggregated. */
export function materialArrivalDemandIdentity(orderId: string, row: ProgressRow) {
  const demand = row.demand;
  const identity = { schemaVersion: "server-material-demand.v1", orderId,
    salesContractNo: normalized(demand.salesContractNo), materialType: demand.materialType,
    materialCode: normalized(demand.materialCode), materialName: normalized(demand.materialName),
    materialColor: normalized(demand.materialColor), specification: normalized(demand.specification),
    width: normalized(demand.width), gsm: normalized(demand.gsm), garmentColors: [...new Set(demand.garmentColors.map(normalized))].sort() };
  const identityKey = materialArrivalHash(identity), chars = identityKey.slice(0, 32).split("");
  chars[12] = "5"; chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const raw = chars.join(""), id = [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20)].join("-");
  return { id, identityKey, identity };
}
