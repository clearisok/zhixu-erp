import type { AinuokeReportSnapshot } from "../../ainuoke-api/model/ainuoke-api.ts";
import { isFactorySupplied, resolveCanonicalMaterialIdentity } from "../model/style-progress.ts";
import { normalizeMaterialSourceRows, stableMaterialHash, type MaterialNormalizationPreview } from "../parser/material-normalization-pipeline.ts";
import { adaptAinuokeMaterialApiSnapshots, type AinuokeMaterialApiSourceMetadata } from "../source/ainuoke-material-api-adapter.ts";

export type MaterialPreviewIssue = { code: string; message: string; count: number };

export type AinuokeMaterialApiPreviewSummary = {
  normalizedRows: number;
  rejectedRows: number;
  canonicalMaterialGroups: number;
  fabricGroups: number;
  trimGroups: number;
  vendorSupplySourceRows: number;
  operationalMaterialGroups: number;
  demands: number;
  purchaseEvents: number;
  inboundEvents: number;
  shipmentEvents: number;
  outboundEvents: number;
  duplicateDemandRowsPrevented: number;
  duplicateEventRowsPrevented: number;
  duplicateSourceRowsPrevented: number;
  sourceIdentityCollisions: number;
  errors: MaterialPreviewIssue[];
  warnings: MaterialPreviewIssue[];
};

export type AinuokeMaterialApiPreview = {
  source: AinuokeMaterialApiSourceMetadata;
  pipeline: MaterialNormalizationPreview;
  summary: AinuokeMaterialApiPreviewSummary;
};

function issueSummary(pipeline: MaterialNormalizationPreview): MaterialPreviewIssue[] {
  const counts = new Map<string, number>();
  for (const issue of pipeline.rawRows.flatMap((row) => row.validationIssues)) counts.set(issue, (counts.get(issue) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([message, count]) => ({ code: `row_validation:${stableMaterialHash([message])}`, message, count }));
}

export function buildAinuokeMaterialApiPreview(input: {
  snapshots: AinuokeReportSnapshot[];
  now?: string;
}): AinuokeMaterialApiPreview {
  const source = adaptAinuokeMaterialApiSnapshots(input.snapshots);
  const pageHashes = source.metadata.pages.map((page) => page.snapshotHash).sort();
  const sourceArtifactHash = `6087050:${stableMaterialHash(pageHashes)}`;
  const pipeline = normalizeMaterialSourceRows({
    rows: source.rows,
    batchId: `material-preview-api-${stableMaterialHash([source.metadata.query.insideOrderNo, ...pageHashes])}`,
    sourceArtifactHash,
    now: input.now ?? source.metadata.fetchedAt,
  });
  const purchaseEventsByDemand = new Map<string, typeof pipeline.purchaseEvents>();
  for (const event of pipeline.purchaseEvents) purchaseEventsByDemand.set(event.materialDemandId, [...(purchaseEventsByDemand.get(event.materialDemandId) ?? []), event]);
  const canonicalGroups = new Map<string, typeof pipeline.demands>();
  for (const demand of pipeline.demands) {
    const key = resolveCanonicalMaterialIdentity(demand, purchaseEventsByDemand.get(demand.id) ?? []).key;
    canonicalGroups.set(key, [...(canonicalGroups.get(key) ?? []), demand]);
  }
  const demandById = new Map(pipeline.demands.map((demand) => [demand.id, demand]));
  const vendorSupplySourceRows = pipeline.rawRows.filter((row) => {
    const demand = row.normalizedDemandId ? demandById.get(row.normalizedDemandId) : null;
    return demand ? isFactorySupplied(demand) : false;
  }).length;
  return {
    source: source.metadata,
    pipeline,
    summary: {
      normalizedRows: pipeline.stats.validRowCount,
      rejectedRows: pipeline.stats.invalidRowCount,
      canonicalMaterialGroups: canonicalGroups.size,
      fabricGroups: [...canonicalGroups.values()].filter((demands) => demands[0]?.materialType === "fabric").length,
      trimGroups: [...canonicalGroups.values()].filter((demands) => demands[0]?.materialType === "trim").length,
      vendorSupplySourceRows,
      operationalMaterialGroups: [...canonicalGroups.values()].filter((demands) => demands.some((demand) => !isFactorySupplied(demand))).length,
      demands: pipeline.demands.length,
      purchaseEvents: pipeline.purchaseEvents.length,
      inboundEvents: pipeline.inboundEvents.length,
      shipmentEvents: pipeline.shipmentEvents.length,
      outboundEvents: pipeline.outboundEvents.length,
      duplicateDemandRowsPrevented: pipeline.stats.duplicateDemandRows,
      duplicateEventRowsPrevented: pipeline.stats.duplicateEventRows,
      duplicateSourceRowsPrevented: source.metadata.duplicateSourceRowsPrevented,
      sourceIdentityCollisions: source.metadata.sourceIdentityCollisions,
      errors: issueSummary(pipeline),
      warnings: [{
        code: "actual_consumption_unmapped",
        message: "6087050 尚无充分证据证明与 Excel 数值列“厂供”等义的字段；actualConsumption 保持 null。",
        count: pipeline.demands.length,
      }],
    },
  };
}
