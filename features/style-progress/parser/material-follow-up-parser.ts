import ExcelJS from "exceljs";
import type {
  MaterialDemand,
  MaterialImportBatch,
  MaterialImportPreview,
  MaterialInboundEvent,
  MaterialOutboundEvent,
  MaterialPurchaseEvent,
  MaterialRawSnapshot,
  MaterialShipmentEvent,
  MaterialType,
  RawCellValue,
} from "../model/style-progress.ts";

const REQUIRED_HEADERS = ["款号", "类型", "销售合同号", "面辅料编码", "面辅料名称", "需求数量", "采购单号", "入库单号", "出运单号", "出库单号"];
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
const rawValue = (value: unknown): RawCellValue => value instanceof Date ? value.toISOString() : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : value === null || value === undefined ? null : normalizeText(value);

export function stableMaterialHash(parts: unknown[]): string {
  let hash = 2166136261;
  for (const character of parts.map((part) => normalizeText(part)).join("\u001f")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function splitGarmentColors(value: unknown): string[] {
  return [...new Set(normalizeText(value).split(/[\/／,，;；、\s]+/).map((item) => item.trim()).filter(Boolean))];
}

type ParsedRow = { sourceRow: number; values: unknown[]; get: (column: number) => unknown };

function demandIdentity(row: ParsedRow): unknown[] {
  return [
    normalizeKey(row.get(4)), normalizeKey(row.get(2)), normalizeKey(row.get(13)), normalizeText(row.get(14)), normalizeText(row.get(15)),
    normalizeText(row.get(21)), normalizeText(row.get(9)), normalizeText(row.get(22)), normalizeText(row.get(23)),
    numberValue(row.get(10)), numberValue(row.get(16)), numberValue(row.get(17)), numberValue(row.get(18)),
    normalizeText(row.get(19)), normalizeText(row.get(20)), numberValue(row.get(24)), numberValue(row.get(25)),
  ];
}

function eventId(kind: string, demandId: string, parts: unknown[]) {
  return `material-${kind}-${stableMaterialHash([demandId, ...parts])}`;
}

function materialType(value: unknown): MaterialType | null {
  const normalized = normalizeText(value);
  return normalized === "面料" ? "fabric" : normalized === "辅料" ? "trim" : null;
}

function usedRange(rowCount: number, columnCount: number): string {
  let number = columnCount;
  let letters = "";
  while (number > 0) { number -= 1; letters = String.fromCharCode(65 + number % 26) + letters; number = Math.floor(number / 26); }
  return `A1:${letters}${rowCount}`;
}

export async function parseMaterialFollowUpWorkbook(input: { buffer: ArrayBuffer; fileName: string; actorName: string; now?: string }): Promise<MaterialImportPreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input.buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("工作簿没有可读取的 Sheet");
  const headerRow = sheet.getRow(3);
  const headers = Array.from({ length: sheet.columnCount }, (_, index) => normalizeText(headerRow.getCell(index + 1).value));
  for (const required of REQUIRED_HEADERS) if (!headers.includes(required)) throw new Error(`缺少必需列：${required}`);
  const fileHash = await sha256Hex(input.buffer);
  const columnFor = (...names: string[]): number | null => {
    const index = headers.findIndex((header) => names.includes(header));
    return index < 0 ? null : index + 1;
  };
  const actualConsumptionColumn = columnFor("厂供", "实际用量", "实际单耗");
  const supplyMethodColumn = columnFor("提供方式", "供应方式");
  const now = input.now ?? new Date().toISOString();
  const batchId = `material-import-${fileHash.toLocaleLowerCase()}`;
  const batch: MaterialImportBatch = {
    id: batchId, fileName: input.fileName, fileHash, sheetName: sheet.name, usedRange: usedRange(sheet.rowCount, sheet.columnCount),
    rawRowCount: 0, validRowCount: 0, invalidRowCount: 0, demandCount: 0, purchaseEventCount: 0, inboundEventCount: 0,
    shipmentEventCount: 0, outboundEventCount: 0, duplicateDemandRows: 0, duplicateEventRows: 0,
    status: "preview", createdAt: now, createdBy: input.actorName, committedAt: null,
  };
  const rawSnapshots: MaterialRawSnapshot[] = [];
  const demands = new Map<string, MaterialDemand>();
  const purchaseEvents = new Map<string, MaterialPurchaseEvent>();
  const inboundEvents = new Map<string, MaterialInboundEvent>();
  const shipmentEvents = new Map<string, MaterialShipmentEvent>();
  const outboundEvents = new Map<string, MaterialOutboundEvent>();
  let duplicateEventRows = 0;

  for (let sourceRow = 4; sourceRow <= sheet.rowCount; sourceRow += 1) {
    const worksheetRow = sheet.getRow(sourceRow);
    const values = Array.from({ length: sheet.columnCount }, (_, index) => worksheetRow.getCell(index + 1).value);
    if (!values.some((value) => value !== null && value !== undefined && normalizeText(value) !== "")) continue;
    batch.rawRowCount += 1;
    const row: ParsedRow = { sourceRow, values, get: (column) => values[column - 1] };
    const issues: string[] = [];
    const salesContractNo = normalizeKey(row.get(4));
    const type = materialType(row.get(2));
    const requiredQuantity = numberValue(row.get(24));
    if (!salesContractNo) issues.push("销售合同号为空");
    if (!type) issues.push("类型必须为面料或辅料");
    if (!normalizeText(row.get(13))) issues.push("面辅料编码为空");
    if (requiredQuantity === null || requiredQuantity < 0) issues.push("需求数量无效");
    const demandId = issues.length ? null : `material-demand-${stableMaterialHash(demandIdentity(row))}`;
    const rawFields = Object.fromEntries(headers.map((header, index) => [`${index + 1}:${header || "未命名"}`, rawValue(values[index])]));
    rawSnapshots.push({ id: `material-raw-${stableMaterialHash([fileHash, sheet.name, sourceRow])}`, importBatchId: batchId, fileHash, fileName: input.fileName, sheetName: sheet.name, sourceRow, rawFields, normalizedDemandId: demandId, validationIssues: issues });
    if (issues.length || !demandId || !type || requiredQuantity === null) { batch.invalidRowCount += 1; continue; }
    batch.validRowCount += 1;
    const sourceDue = dateValue(row.get(32));
    if (!demands.has(demandId)) {
      const plannedConsumption = numberValue(row.get(16));
      const supplyMethod = supplyMethodColumn ? normalizeText(row.get(supplyMethodColumn)) || null : null;
      const actualConsumption = actualConsumptionColumn ? numberValue(row.get(actualConsumptionColumn)) : null;
      demands.set(demandId, {
        id: demandId, salesContractNo, materialType: type, materialCode: normalizeText(row.get(13)), materialName: normalizeText(row.get(14)), sourceActualName: normalizeText(row.get(15)),
        materialColor: normalizeText(row.get(21)), garmentColors: splitGarmentColors(row.get(9)), specification: normalizeText(row.get(22)), supplyMethod,
        garmentQuantity: numberValue(row.get(10)), plannedConsumption, actualConsumption, lossRate: numberValue(row.get(17)), totalConsumption: numberValue(row.get(18)), width: normalizeText(row.get(19)), gsm: normalizeText(row.get(20)),
        requiredQuantity, sampleQuantity: numberValue(row.get(25)), sourceMaterialDueDate: sourceDue, expectedMaterialReadyDate: sourceDue, expectedDateSource: "source", sourceSortNo: sourceRow,
        sourceStyleNoSnapshot: normalizeText(row.get(1)), sourceFactoryStyleNoSnapshot: normalizeText(row.get(8)), sourceBrandSnapshot: normalizeText(row.get(5)), sourceOwnerSnapshot: normalizeText(row.get(7)) || normalizeText(row.get(6)), sourceCustomerSnapshot: normalizeText(row.get(11)), sourceOrderQuantitySnapshot: numberValue(row.get(10)), sourceContractDeliveryDateSnapshot: dateValue(row.get(12)),
        lastImportBatchId: batchId, sourceFileHash: fileHash, createdAt: now, updatedAt: now,
      });
    } else {
      batch.duplicateDemandRows += 1;
      const current = demands.get(demandId)!;
      if (sourceDue && (!current.sourceMaterialDueDate || sourceDue > current.sourceMaterialDueDate)) { current.sourceMaterialDueDate = sourceDue; current.expectedMaterialReadyDate = sourceDue; }
    }

    const addEvent = <T extends { id: string; sourceRows: number[] }>(target: Map<string, T>, event: T) => {
      const existing = target.get(event.id);
      if (existing) { existing.sourceRows = [...new Set([...existing.sourceRows, sourceRow])]; duplicateEventRows += 1; }
      else target.set(event.id, event);
    };
    const purchaseOrderNo = normalizeText(row.get(28));
    const purchaseQuantity = numberValue(row.get(40));
    if (purchaseOrderNo && purchaseQuantity !== null) {
      const parts = [purchaseOrderNo, dateValue(row.get(29)), normalizeText(row.get(39)), purchaseQuantity, numberValue(row.get(41)), numberValue(row.get(42)), numberValue(row.get(43)), numberValue(row.get(44))];
      addEvent(purchaseEvents, { id: eventId("purchase", demandId, parts), materialDemandId: demandId, purchaseOrderNo, purchaseDate: dateValue(row.get(29)), supplier: normalizeText(row.get(30)), purchaseEntity: normalizeText(row.get(31)), sourceMaterialDueDate: sourceDue, currency: normalizeText(row.get(33)), purchaser: normalizeText(row.get(34)), purchasedMaterialName: normalizeText(row.get(35)), invoiceName: normalizeText(row.get(36)), actualName: normalizeText(row.get(37)), specification: normalizeText(row.get(38)), color: normalizeText(row.get(39)), quantity: purchaseQuantity, sampleQuantity: numberValue(row.get(41)), unitPrice: numberValue(row.get(42)), amount: numberValue(row.get(43)), extraCost: numberValue(row.get(44)), importBatchId: batchId, sourceRows: [sourceRow] });
    }
    const inboundNo = normalizeText(row.get(46)); const inboundQuantity = numberValue(row.get(48));
    if (inboundNo && inboundQuantity !== null) addEvent(inboundEvents, { id: eventId("inbound", demandId, [inboundNo, dateValue(row.get(47)), inboundQuantity]), materialDemandId: demandId, documentNo: inboundNo, eventDate: dateValue(row.get(47)), quantity: inboundQuantity, importBatchId: batchId, sourceRows: [sourceRow] });
    const shipmentNo = normalizeText(row.get(50)); const shipmentQuantity = numberValue(row.get(53));
    if (shipmentNo && shipmentQuantity !== null) addEvent(shipmentEvents, { id: eventId("shipment", demandId, [shipmentNo, dateValue(row.get(51)), normalizeText(row.get(52)), shipmentQuantity]), materialDemandId: demandId, documentNo: shipmentNo, eventDate: dateValue(row.get(51)), quantity: shipmentQuantity, transportModeSnapshot: normalizeText(row.get(52)), importBatchId: batchId, sourceRows: [sourceRow] });
    const outboundNo = normalizeText(row.get(55)); const outboundQuantity = numberValue(row.get(54));
    if (outboundNo && outboundQuantity !== null) addEvent(outboundEvents, { id: eventId("outbound", demandId, [outboundNo, dateValue(row.get(56)), outboundQuantity]), materialDemandId: demandId, documentNo: outboundNo, eventDate: dateValue(row.get(56)), quantity: outboundQuantity, importBatchId: batchId, sourceRows: [sourceRow] });
  }

  batch.demandCount = demands.size; batch.purchaseEventCount = purchaseEvents.size; batch.inboundEventCount = inboundEvents.size; batch.shipmentEventCount = shipmentEvents.size; batch.outboundEventCount = outboundEvents.size; batch.duplicateEventRows = duplicateEventRows;
  return { batch, batches: [batch], rawSnapshots, demands: [...demands.values()], purchaseEvents: [...purchaseEvents.values()], inboundEvents: [...inboundEvents.values()], shipmentEvents: [...shipmentEvents.values()], outboundEvents: [...outboundEvents.values()] };
}
