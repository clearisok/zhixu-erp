import type { PoolClient } from "pg";
import { buildAinuokeMaterialApiPreview } from "../../features/style-progress/service/ainuoke-material-api-preview.js";
import { projectMaterialProgress, type ProgressRow } from "../../features/ainuoke-material-progress/projection.js";
import type { TrustedIdentity } from "../auth/session.js";
import { prepareMaterialPortsInTransaction, type SourceReadConfig } from "../ainuoke-source/reader.js";
import { SourceError } from "../ainuoke-source/contract.js";
import { canonicalDecimal } from "../quotes/decimal-projection.js";
import { materialArrivalDemandIdentity, materialArrivalHash } from "./demand-identity.js";

export type ArrivalDemand = ReturnType<typeof materialArrivalDemandIdentity> & {
  sourceDemandId: string; canonicalKey: string; canonicalIdentity: { salesContractNo: string; materialType: "fabric" | "trim"; materialName: string };
  name: string; materialCode: string; color: string; garmentColors: string[]; specification: string;
  requiredQuantity: string | null; unit: string | null; sourceMaterialDueDate: string | null;
  eligibility: "eligible" | "ambiguous" | "unit_unknown" | "quantity_unknown" | "factory_confirmed";
};
export type ArrivalGeneration = NonNullable<ReturnType<Awaited<ReturnType<typeof prepareMaterialPortsInTransaction>>["generation"]>>;
export type ArrivalSource = { status: string; generation: ArrivalGeneration | null; demands: ArrivalDemand[]; factoryExcluded: number };
function exactSourceQuantity(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || Math.abs(value) > Number.MAX_SAFE_INTEGER) return null;
    value = canonicalDecimal(String(value));
  }
  if (typeof value !== "string" || value.length > 128 || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/u.test(value)) return null;
  const result = canonicalDecimal(value.replaceAll(",", "")); return result.length <= 128 ? result : null;
}
export function projectArrivalDemand(orderId: string, row: ProgressRow, quantities: readonly unknown[]): ArrivalDemand {
  const identity = materialArrivalDemandIdentity(orderId, row), values = quantities.map(exactSourceQuantity);
  const requiredQuantity = values.length && values.every(value => value !== null) && new Set(values).size === 1 ? values[0] : null;
  return { ...identity, sourceDemandId: row.demand.id, canonicalKey: row.canonicalKey,
    canonicalIdentity: { salesContractNo: identity.identity.salesContractNo, materialType: identity.identity.materialType, materialName: identity.identity.materialName },
    name: row.demand.materialName, materialCode: row.demand.materialCode, color: row.demand.materialColor,
    garmentColors: [...row.demand.garmentColors], specification: row.demand.specification,
    requiredQuantity, unit: row.unitStatus === "known" ? row.unit : null, sourceMaterialDueDate: row.demand.sourceMaterialDueDate,
    eligibility: row.procurementResponsibility === "factory_confirmed" ? "factory_confirmed" : row.unitStatus !== "known" ? "unit_unknown" : requiredQuantity === null ? "quantity_unknown" : "eligible" };
}
/** Consumes only the accepted local source generation through the existing
 * adapter/pipeline. Quantities are re-read as decimal text from its raw evidence;
 * no procurement prices or raw rows enter the arrival DTO, audit or digest. */
export async function readArrivalSource(client: PoolClient, actor: TrustedIdentity, orderId: string,
  config: SourceReadConfig | null, now: () => number = Date.now): Promise<ArrivalSource> {
  const unavailable = (status: string): ArrivalSource => ({ status, generation: null, demands: [], factoryExcluded: 0 });
  if (!config) return unavailable("not_connected");
  try {
    const prepared = await prepareMaterialPortsInTransaction(client, config, actor, [orderId], now);
    const order = await prepared.ports.resolveVisibleOrder(actor, orderId);
    if (!order) return unavailable("source_missing");
    const source = await prepared.ports.loadSource!(order, actor);
    if (!source || source.issue) return unavailable(source?.issue ?? "source_missing");
    const view = projectMaterialProgress({ salesContractNo: order.salesContractNo!, styleNo: order.styleNo ?? "", insideOrderNo: order.insideOrderNo ?? "" }, source.snapshots,
      await prepared.ports.loadConfirmations!(order, actor));
    const generation = prepared.generation(orderId);
    if (view.sourceStatus !== "ready" || !generation) return unavailable(view.sourceStatus);
    const preview = buildAinuokeMaterialApiPreview({ snapshots: source.snapshots });
    const quantities = new Map<string, unknown[]>();
    for (const row of preview.pipeline.rawRows) if (row.normalizedDemandId) {
      const values = quantities.get(row.normalizedDemandId) ?? []; values.push(row.values.requiredQuantity); quantities.set(row.normalizedDemandId, values);
    }
    const demands = view.rows.map(row => projectArrivalDemand(orderId, row, quantities.get(row.demand.id) ?? []));
    const count = new Map<string, number>(), signatures = new Map<string, Set<string>>();
    for (const row of demands) {
      count.set(row.id, (count.get(row.id) ?? 0) + 1);
      const group = signatures.get(row.canonicalKey) ?? new Set<string>(); group.add(materialArrivalHash(row.canonicalIdentity)); signatures.set(row.canonicalKey, group);
    }
    for (const row of demands) if (count.get(row.id)! > 1 || signatures.get(row.canonicalKey)!.size !== 1) row.eligibility = "ambiguous";
    return { status: "ready", generation, demands, factoryExcluded: view.factoryExcluded };
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    return unavailable("source_unavailable");
  }
}
