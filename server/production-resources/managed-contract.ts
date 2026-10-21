import { parseProductionResourceCommand, parseProductionResourceEnvelope, PRODUCTION_RESOURCE_TYPES, type ProductionResourceCommand, type ProductionResourceInputs, type ProductionResourceType } from "./contract.js";
import { LOGISTICS_RESOURCE_TYPES, parseLogisticsResourceCommand, type LogisticsResourceCommand, type LogisticsResourceType, type SupplyHubInput, type TransportPlanInput } from "./logistics-contract.js";
import { HttpError } from "../http/errors.js";

export type ManagedResourceType = ProductionResourceType | LogisticsResourceType;
export type ManagedResourceCommand = ProductionResourceCommand | LogisticsResourceCommand;
export type ManagedResourceInputMap = ProductionResourceInputs & { hubs: SupplyHubInput; "transport-plans": TransportPlanInput };
export function managedResourceKind(value: unknown): ManagedResourceType {
  if (typeof value === "string" && [...PRODUCTION_RESOURCE_TYPES, ...LOGISTICS_RESOURCE_TYPES].some(kind => kind === value)) return value as ManagedResourceType;
  throw new HttpError(400, "invalid_production_resource_kind", "Invalid production resource kind");
}

/** One HTTP/transaction command envelope. Existing four-kind UI clients keep their contract. */
export function parseManagedResourceCommand(value: unknown): ManagedResourceCommand {
  const { kind } = parseProductionResourceEnvelope(value);
  return kind === "hubs" || kind === "transport-plans" ? parseLogisticsResourceCommand(value) : parseProductionResourceCommand(value);
}
