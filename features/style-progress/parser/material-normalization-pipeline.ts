import type {
  MaterialDemand,
  MaterialInboundEvent,
  MaterialOutboundEvent,
  MaterialPurchaseEvent,
  MaterialShipmentEvent,
  MaterialType,
} from "../model/style-progress.ts";
import type { MaterialNormalizedSourceRow, MaterialSemanticField, MaterialSourceRow, MaterialSourceTrace } from "../source/material-source-row.ts";

const normalizeText = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalizeKey = (value: unknown) => normalizeText(value).toLocaleUpperCase();
const numberValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const dateValue = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const source = normalizeText(value);
  const match = source.match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : null;
};

export function stableMaterialHash(parts: unknown[]): string {
  let hash = 2166136261;
  for (const character of parts.map((part) => normalizeText(part)).join("\u001f")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function splitGarmentColors(value: unknown): string[] {
  return [...new Set(normalizeText(value).split(/[\/／,，;；、\r\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function demandIdentity(get: (field: MaterialSemanticField) => unknown): unknown[] {
  return [
    normalizeKey(get("salesContractNo")), normalizeKey(get("materialType")), normalizeKey(get("materialCode")), normalizeText(get("materialName")), normalizeText(get("sourceActualName")),
    normalizeText(get("materialColor")), normalizeText(get("garmentColors")), normalizeText(get("specification")), normalizeText(get("supplyMethod")),
    numberValue(get("garmentQuantity")), numberValue(get("plannedConsumption")), numberValue(get("lossRate")), numberValue(get("totalConsumption")),
    normalizeText(get("width")), normalizeText(get("gsm")), numberValue(get("requiredQuantity")), numberValue(get("sampleQuantity")),
  ];
}

function eventId(kind: string, demandId: string, parts: unknown[]) {
  return `material-${kind}-${stableMaterialHash([demandId, ...parts])}`;
}

function materialType(value: unknown): MaterialType | null {
  const normalized = normalizeText(value);
  return normalized === "面料" ? "fabric" : normalized === "辅料" ? "trim" : null;
}

function traceReference(trace: MaterialSourceTrace): string {
  return trace.sourceKind === "excel" ? String(trace.sourceRow) : trace.sourceRowIdentity;
}

function traceSortOrder(trace: MaterialSourceTrace, apiOrder: Map<string, number>): number {
  return trace.sourceKind === "excel" ? trace.sourceRow : apiOrder.get(trace.sourceRowIdentity) ?? 0;
}

function rawRowId(row: MaterialSourceRow, sourceArtifactHash: string): string {
  return row.trace.sourceKind === "excel"
    ? `material-raw-${stableMaterialHash([row.trace.fileHash, row.trace.sheetName, row.trace.sourceRow])}`
    : `material-raw-api-${stableMaterialHash([sourceArtifactHash, row.trace.sourceRowIdentity])}`;
}

export type MaterialPipelineStats = {
  rawRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  demandCount: number;
  purchaseEventCount: number;
  inboundEventCount: number;
  shipmentEventCount: number;
  outboundEventCount: number;
  duplicateDemandRows: number;
  duplicateEventRows: number;
};

export type MaterialNormalizationPreview = {
  rawRows: MaterialNormalizedSourceRow[];
  demands: MaterialDemand[];
  purchaseEvents: MaterialPurchaseEvent[];
  inboundEvents: MaterialInboundEvent[];
  shipmentEvents: MaterialShipmentEvent[];
  outboundEvents: MaterialOutboundEvent[];
  stats: MaterialPipelineStats;
};

export function normalizeMaterialSourceRows(input: {
  rows: MaterialSourceRow[];
  batchId: string;
  sourceArtifactHash: string;
  now: string;
}): MaterialNormalizationPreview {
  const apiIdentities = input.rows.flatMap((row) => row.trace.sourceKind === "api" ? [row.trace.sourceRowIdentity] : []).sort();
  const apiOrder = new Map(apiIdentities.map((identity, index) => [identity, index + 1]));
  const rawRows: MaterialNormalizedSourceRow[] = [];
  const demands = new Map<string, MaterialDemand>();
  const purchaseEvents = new Map<string, MaterialPurchaseEvent>();
  const inboundEvents = new Map<string, MaterialInboundEvent>();
  const shipmentEvents = new Map<string, MaterialShipmentEvent>();
  const outboundEvents = new Map<string, MaterialOutboundEvent>();
  let validRowCount = 0;
  let invalidRowCount = 0;
  let duplicateDemandRows = 0;
  let duplicateEventRows = 0;

  for (const source of input.rows) {
    const get = (field: MaterialSemanticField) => source.values[field];
    const issues: string[] = [];
    const salesContractNo = normalizeKey(get("salesContractNo"));
    const type = materialType(get("materialType"));
    const requiredQuantity = numberValue(get("requiredQuantity"));
    if (!salesContractNo) issues.push("销售合同号为空");
    if (!type) issues.push("类型必须为面料或辅料");
    if (!normalizeText(get("materialCode"))) issues.push("面辅料编码为空");
    if (!normalizeText(get("materialName"))) issues.push("面辅料名称为空");
    if (requiredQuantity === null || requiredQuantity < 0) issues.push("需求数量无效");
    const demandId = issues.length ? null : `material-demand-${stableMaterialHash(demandIdentity(get))}`;
    rawRows.push({ ...source, id: rawRowId(source, input.sourceArtifactHash), normalizedDemandId: demandId, validationIssues: issues });
    if (issues.length || !demandId || !type || requiredQuantity === null) { invalidRowCount += 1; continue; }
    validRowCount += 1;
    const sourceDue = dateValue(get("sourceMaterialDueDate"));
    if (!demands.has(demandId)) {
      const garmentColors = [...new Set([...splitGarmentColors(get("garmentColors")), ...splitGarmentColors(get("relatedGarmentColors"))])];
      demands.set(demandId, {
        id: demandId,
        salesContractNo,
        materialType: type,
        materialCode: normalizeText(get("materialCode")),
        materialName: normalizeText(get("materialName")),
        sourceActualName: normalizeText(get("sourceActualName")),
        materialColor: normalizeText(get("materialColor")),
        garmentColors,
        specification: normalizeText(get("specification")),
        supplyMethod: normalizeText(get("supplyMethod")) || null,
        garmentQuantity: numberValue(get("garmentQuantity")),
        plannedConsumption: numberValue(get("plannedConsumption")),
        actualConsumption: numberValue(get("actualConsumption")),
        lossRate: numberValue(get("lossRate")),
        totalConsumption: numberValue(get("totalConsumption")),
        width: normalizeText(get("width")),
        gsm: normalizeText(get("gsm")),
        requiredQuantity,
        sampleQuantity: numberValue(get("sampleQuantity")),
        sourceMaterialDueDate: sourceDue,
        expectedMaterialReadyDate: sourceDue,
        expectedDateSource: "source",
        sourceSortNo: traceSortOrder(source.trace, apiOrder),
        sourceStyleNoSnapshot: normalizeText(get("styleNo")),
        sourceFactoryStyleNoSnapshot: normalizeText(get("factoryStyleNo")),
        sourceBrandSnapshot: normalizeText(get("brand")),
        sourceOwnerSnapshot: normalizeText(get("owner")) || normalizeText(get("salesperson")),
        sourceCustomerSnapshot: normalizeText(get("customerName")),
        sourceOrderQuantitySnapshot: numberValue(get("garmentQuantity")),
        sourceContractDeliveryDateSnapshot: dateValue(get("contractDeliveryDate")),
        lastImportBatchId: input.batchId,
        sourceKind: source.trace.sourceKind,
        sourceArtifactHash: input.sourceArtifactHash,
        sourceFileHash: source.trace.sourceKind === "excel" ? source.trace.fileHash : input.sourceArtifactHash,
        createdAt: input.now,
        updatedAt: input.now,
      });
    } else {
      duplicateDemandRows += 1;
      const current = demands.get(demandId)!;
      if (sourceDue && (!current.sourceMaterialDueDate || sourceDue > current.sourceMaterialDueDate)) {
        current.sourceMaterialDueDate = sourceDue;
        current.expectedMaterialReadyDate = sourceDue;
      }
    }

    const reference = traceReference(source.trace);
    const addEvent = <T extends { id: string; sourceRows: number[]; sourceReferences?: string[] }>(target: Map<string, T>, event: T) => {
      const existing = target.get(event.id);
      if (existing) {
        if (source.trace.sourceKind === "excel") existing.sourceRows = [...new Set([...existing.sourceRows, source.trace.sourceRow])];
        else existing.sourceReferences = [...new Set([...(existing.sourceReferences ?? []), reference])];
        duplicateEventRows += 1;
      } else target.set(event.id, event);
    };
    const traceFields = source.trace.sourceKind === "excel" ? { sourceRows: [source.trace.sourceRow] } : { sourceRows: [], sourceReferences: [reference] };
    const purchaseOrderNo = normalizeText(get("purchaseOrderNo"));
    const purchaseQuantity = numberValue(get("purchaseQuantity"));
    if (purchaseOrderNo && purchaseQuantity !== null) {
      const parts = [purchaseOrderNo, dateValue(get("purchaseDate")), normalizeText(get("purchaseColor")), purchaseQuantity, numberValue(get("purchaseSampleQuantity")), numberValue(get("purchaseUnitPrice")), numberValue(get("purchaseAmount")), numberValue(get("purchaseExtraCost"))];
      addEvent(purchaseEvents, { id: eventId("purchase", demandId, parts), materialDemandId: demandId, purchaseOrderNo, purchaseDate: dateValue(get("purchaseDate")), supplier: normalizeText(get("supplier")), purchaseEntity: normalizeText(get("purchaseEntity")), sourceMaterialDueDate: sourceDue, currency: normalizeText(get("currency")), purchaser: normalizeText(get("purchaser")), purchasedMaterialName: normalizeText(get("purchasedMaterialName")), invoiceName: normalizeText(get("invoiceName")), actualName: normalizeText(get("purchaseActualName")), specification: normalizeText(get("purchaseSpecification")), color: normalizeText(get("purchaseColor")), quantity: purchaseQuantity, sampleQuantity: numberValue(get("purchaseSampleQuantity")), unitPrice: numberValue(get("purchaseUnitPrice")), amount: numberValue(get("purchaseAmount")), extraCost: numberValue(get("purchaseExtraCost")), importBatchId: input.batchId, ...traceFields });
    }
    const inboundNo = normalizeText(get("inboundDocumentNo"));
    const inboundQuantity = numberValue(get("inboundQuantity"));
    if (inboundNo && inboundQuantity !== null) addEvent(inboundEvents, { id: eventId("inbound", demandId, [inboundNo, dateValue(get("inboundDate")), inboundQuantity]), materialDemandId: demandId, documentNo: inboundNo, eventDate: dateValue(get("inboundDate")), quantity: inboundQuantity, importBatchId: input.batchId, ...traceFields });
    const shipmentNo = normalizeText(get("shipmentDocumentNo"));
    const shipmentQuantity = numberValue(get("shipmentQuantity"));
    if (shipmentNo && shipmentQuantity !== null) addEvent(shipmentEvents, { id: eventId("shipment", demandId, [shipmentNo, dateValue(get("shipmentDate")), normalizeText(get("transportMode")), shipmentQuantity]), materialDemandId: demandId, documentNo: shipmentNo, eventDate: dateValue(get("shipmentDate")), quantity: shipmentQuantity, transportModeSnapshot: normalizeText(get("transportMode")), importBatchId: input.batchId, ...traceFields });
    const outboundNo = normalizeText(get("outboundDocumentNo"));
    const outboundQuantity = numberValue(get("outboundQuantity"));
    if (outboundNo && outboundQuantity !== null) addEvent(outboundEvents, { id: eventId("outbound", demandId, [outboundNo, dateValue(get("outboundDate")), outboundQuantity]), materialDemandId: demandId, documentNo: outboundNo, eventDate: dateValue(get("outboundDate")), quantity: outboundQuantity, importBatchId: input.batchId, ...traceFields });
  }

  return {
    rawRows,
    demands: [...demands.values()],
    purchaseEvents: [...purchaseEvents.values()],
    inboundEvents: [...inboundEvents.values()],
    shipmentEvents: [...shipmentEvents.values()],
    outboundEvents: [...outboundEvents.values()],
    stats: {
      rawRowCount: input.rows.length,
      validRowCount,
      invalidRowCount,
      demandCount: demands.size,
      purchaseEventCount: purchaseEvents.size,
      inboundEventCount: inboundEvents.size,
      shipmentEventCount: shipmentEvents.size,
      outboundEventCount: outboundEvents.size,
      duplicateDemandRows,
      duplicateEventRows,
    },
  };
}
