import { HttpError } from "../http/errors.js";
import {
  invalidProductionResourceCommand as invalid, parseProductionResourceEnvelope,
  productionResourceCommon as common, productionResourceFields as fields,
  productionResourceInteger as integer, productionResourceUuid,
  PRODUCTION_RESOURCE_LIMITS, type ProductionResourceCommandBase, type ProductionResourceCommon,
} from "./contract.js";

export const LOGISTICS_RESOURCE_LIMITS = { modes: 100, transitDays: 3650 } as const;
export type SupplyHubInput = ProductionResourceCommon;
export type TransportModeInput = ProductionResourceCommon & {
  modeId: string | null; transitDays: number; sortOrder: number;
};
export type TransportPlanInput = ProductionResourceCommon & {
  supplyHubId: string; productionSiteId: string; modes: TransportModeInput[];
};
export type LogisticsResourceCommand = ProductionResourceCommandBase & (
  { kind: "hubs"; data: SupplyHubInput } | { kind: "transport-plans"; data: TransportPlanInput }
);
export type TransportPlanCommand = Extract<LogisticsResourceCommand, { kind: "transport-plans" }>;
const commonKeys = ["name", "enabled", "remark"];

function transportPlan(value: unknown, create: boolean): TransportPlanInput {
  const raw = fields(value, [...commonKeys, "supplyHubId", "productionSiteId", "modes"]);
  if (!Array.isArray(raw.modes) || !raw.modes.length || raw.modes.length > LOGISTICS_RESOURCE_LIMITS.modes) invalid();
  const seen = new Set<string>();
  const modes = Array.from(raw.modes, value => {
    const item = fields(value, [...commonKeys, "modeId", "transitDays", "sortOrder"]);
    const modeId = item.modeId === null ? null : productionResourceUuid(item.modeId);
    if (modeId !== null) {
      if (create || seen.has(modeId)) invalid();
      seen.add(modeId);
    }
    if (typeof item.sortOrder !== "number" || !Number.isFinite(item.sortOrder)
      || Math.abs(item.sortOrder) > PRODUCTION_RESOURCE_LIMITS.sortMagnitude) invalid();
    return { ...common(item), modeId,
      transitDays: integer(item.transitDays, 0, LOGISTICS_RESOURCE_LIMITS.transitDays), sortOrder: item.sortOrder };
  });
  return { ...common(raw), supplyHubId: productionResourceUuid(raw.supplyHubId),
    productionSiteId: productionResourceUuid(raw.productionSiteId), modes };
}

/** This contract does not register an HTTP kind or establish parent availability. */
export function parseLogisticsResourceCommand(value: unknown): LogisticsResourceCommand {
  const { base, kind, data } = parseProductionResourceEnvelope(value);
  if (kind === "hubs") return { ...base, kind, data: common(fields(data, commonKeys)) };
  if (kind === "transport-plans") return { ...base, kind, data: transportPlan(data, base.action === "create") };
  return invalid();
}

/** The transaction must supply the complete locked child IDs, including disabled modes.
 * Existing identities are retained; a new child uses null until the server allocates it. */
export function assertTransportPlanModeMembership(command: TransportPlanCommand, currentModeIds: readonly string[]): void {
  const conflict = (): never => { throw new HttpError(409, "logistics_mode_membership_conflict", "Transport mode membership changed"); };
  if (!Array.isArray(currentModeIds) || currentModeIds.length > LOGISTICS_RESOURCE_LIMITS.modes) conflict();
  let current: string[];
  try { current = Array.from(currentModeIds, productionResourceUuid); } catch { return conflict(); }
  const expected = new Set(current);
  if (expected.size !== current.length || (command.action === "create" && expected.size !== 0)) conflict();
  const submitted = command.data.modes.flatMap(mode => mode.modeId === null ? [] : [mode.modeId]);
  if (submitted.length !== expected.size || submitted.some(id => !expected.has(id))) conflict();
}
