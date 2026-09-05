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

const normalizeText = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalizeKey = (value: unknown) => normalizeText(value).toLocaleUpperCase();
type SemanticField =
  | "styleNo" | "materialType" | "companyHeader" | "salesContractNo" | "brand" | "salesperson" | "owner" | "factoryStyleNo"
  | "garmentColors" | "relatedGarmentColors" | "garmentQuantity" | "customerName" | "contractDeliveryDate"
  | "materialCode" | "materialName" | "sourceActualName" | "plannedConsumption" | "lossRate" | "totalConsumption" | "width" | "gsm"
  | "materialColor" | "specification" | "supplyMethod" | "requiredQuantity" | "sampleQuantity"
  | "purchaseOrderNo" | "purchaseDate" | "supplier" | "purchaseEntity" | "sourceMaterialDueDate" | "currency" | "purchaser"
  | "purchasedMaterialName" | "invoiceName" | "purchaseActualName" | "purchaseSpecification" | "purchaseColor" | "purchaseQuantity"
  | "purchaseSampleQuantity" | "purchaseUnitPrice" | "purchaseAmount" | "purchaseExtraCost"
  | "inboundDocumentNo" | "inboundDate" | "inboundQuantity" | "shipmentDocumentNo" | "shipmentDate" | "transportMode" | "shipmentQuantity"
  | "outboundQuantity" | "outboundDocumentNo" | "outboundDate" | "actualConsumption";

const FIELD_ALIASES: Record<Exclude<SemanticField, "purchaseQuantity">, string[]> = {
  styleNo: ["款号"], materialType: ["类型", "物料类型"], companyHeader: ["公司抬头"], salesContractNo: ["销售合同号", "销售合同"], brand: ["客户品牌", "品牌"],
  salesperson: ["业务员"], owner: ["跟单人", "负责人"], factoryStyleNo: ["工厂款号"], garmentColors: ["成衣颜色"], relatedGarmentColors: ["对应成衣颜色"], garmentQuantity: ["成衣数量", "订单数量"],
  customerName: ["客户名称"], contractDeliveryDate: ["销售交期", "合同交期"], materialCode: ["面辅料编码", "物料编码"], materialName: ["面辅料名称", "物料名称"], sourceActualName: ["申购实际名称"],
  plannedConsumption: ["单耗", "计划单耗"], lossRate: ["损耗", "损耗率"], totalConsumption: ["总耗"], width: ["门幅"], gsm: ["克重"], materialColor: ["颜色"], specification: ["规格成分", "申购规格"],
  supplyMethod: ["提供方式", "供应方式"], requiredQuantity: ["需求数量"], sampleQuantity: ["样衣用量"], purchaseOrderNo: ["采购单号"], purchaseDate: ["采购日期"], supplier: ["供应商"], purchaseEntity: ["采购抬头", "采购主体"],
  sourceMaterialDueDate: ["采购交期", "来源交期"], currency: ["币种"], purchaser: ["采购人"], purchasedMaterialName: ["采购面辅料名称"], invoiceName: ["开票名称"], purchaseActualName: ["实际名称", "采购实际名称"],
  purchaseSpecification: ["采购规格"], purchaseColor: ["采购颜色"], purchaseSampleQuantity: ["采购样衣用量"], purchaseUnitPrice: ["采购价格", "采购单价"], purchaseAmount: ["采购金额"], purchaseExtraCost: ["额外费用"],
  inboundDocumentNo: ["入库单号"], inboundDate: ["入库日期"], inboundQuantity: ["入库数", "入库数量"], shipmentDocumentNo: ["出运单号"], shipmentDate: ["出运日期"], transportMode: ["运输方式"], shipmentQuantity: ["出运数量"],
  outboundQuantity: ["出库数量"], outboundDocumentNo: ["出库单号"], outboundDate: ["出库日期"], actualConsumption: ["厂供", "实际用量", "实际单耗"],
};
const REQUIRED_FIELDS = new Set<SemanticField>([
  "styleNo", "materialType", "salesContractNo", "materialCode", "materialName", "requiredQuantity",
  "purchaseOrderNo", "purchaseQuantity", "inboundDocumentNo", "inboundQuantity", "shipmentDocumentNo", "shipmentQuantity", "outboundDocumentNo", "outboundQuantity",
]);

export type MaterialFollowUpColumnMap = Record<SemanticField, number | null>;

export function resolveMaterialFollowUpColumns(headers: string[]): MaterialFollowUpColumnMap {
  const normalizedHeaders = headers.map(normalizeText);
  const columns = {} as MaterialFollowUpColumnMap;
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [Exclude<SemanticField, "purchaseQuantity">, string[]][]) {
    const matches = normalizedHeaders.flatMap((header, index) => aliases.includes(header) ? [index + 1] : []);
    if (matches.length > 1) throw new Error(`关键表头无法唯一识别：${aliases.join(" / ")}`);
    if (!matches.length && REQUIRED_FIELDS.has(field)) throw new Error(`缺少必需列：${aliases[0]}`);
    columns[field] = matches[0] ?? null;
  }
  const purchaseQuantityMatches = normalizedHeaders.flatMap((header, index) => header === "采购数量" ? [index + 1] : []);
  const purchaseStart = columns.purchaseOrderNo;
  const purchaseEnd = columns.inboundDocumentNo;
  const eventQuantityMatches = purchaseStart && purchaseEnd
    ? purchaseQuantityMatches.filter((column) => column > purchaseStart && column < purchaseEnd)
    : [];
  if (eventQuantityMatches.length !== 1) {
    if (!eventQuantityMatches.length) throw new Error("缺少必需列：采购数量（采购事件）");
    throw new Error("关键表头无法唯一识别：采购数量（采购事件）");
  }
  columns.purchaseQuantity = eventQuantityMatches[0];
  return columns;
}
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
  return [...new Set(normalizeText(value).split(/[\/／,，;；、\r\n]+/).map((item) => item.trim()).filter(Boolean))];
}

type ParsedRow = { sourceRow: number; values: unknown[]; get: (field: SemanticField) => unknown };

function demandIdentity(row: ParsedRow): unknown[] {
  return [
    normalizeKey(row.get("salesContractNo")), normalizeKey(row.get("materialType")), normalizeKey(row.get("materialCode")), normalizeText(row.get("materialName")), normalizeText(row.get("sourceActualName")),
    normalizeText(row.get("materialColor")), normalizeText(row.get("garmentColors")), normalizeText(row.get("specification")), normalizeText(row.get("supplyMethod")),
    numberValue(row.get("garmentQuantity")), numberValue(row.get("plannedConsumption")), numberValue(row.get("lossRate")), numberValue(row.get("totalConsumption")),
    normalizeText(row.get("width")), normalizeText(row.get("gsm")), numberValue(row.get("requiredQuantity")), numberValue(row.get("sampleQuantity")),
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
  const columns = resolveMaterialFollowUpColumns(headers);
  const fileHash = await sha256Hex(input.buffer);
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
    const row: ParsedRow = { sourceRow, values, get: (field) => columns[field] ? values[columns[field]! - 1] : null };
    const issues: string[] = [];
    const salesContractNo = normalizeKey(row.get("salesContractNo"));
    const type = materialType(row.get("materialType"));
    const requiredQuantity = numberValue(row.get("requiredQuantity"));
    if (!salesContractNo) issues.push("销售合同号为空");
    if (!type) issues.push("类型必须为面料或辅料");
    if (!normalizeText(row.get("materialCode"))) issues.push("面辅料编码为空");
    if (requiredQuantity === null || requiredQuantity < 0) issues.push("需求数量无效");
    const demandId = issues.length ? null : `material-demand-${stableMaterialHash(demandIdentity(row))}`;
    const rawFields = Object.fromEntries(headers.map((header, index) => [`${index + 1}:${header || "未命名"}`, rawValue(values[index])]));
    rawSnapshots.push({ id: `material-raw-${stableMaterialHash([fileHash, sheet.name, sourceRow])}`, importBatchId: batchId, fileHash, fileName: input.fileName, sheetName: sheet.name, sourceRow, rawFields, normalizedDemandId: demandId, validationIssues: issues });
    if (issues.length || !demandId || !type || requiredQuantity === null) { batch.invalidRowCount += 1; continue; }
    batch.validRowCount += 1;
    const sourceDue = dateValue(row.get("sourceMaterialDueDate"));
    if (!demands.has(demandId)) {
      const plannedConsumption = numberValue(row.get("plannedConsumption"));
      const supplyMethod = normalizeText(row.get("supplyMethod")) || null;
      const actualConsumption = numberValue(row.get("actualConsumption"));
      const garmentColors = [...new Set([
        ...splitGarmentColors(row.get("garmentColors")),
        ...splitGarmentColors(row.get("relatedGarmentColors")),
      ])];
      demands.set(demandId, {
        id: demandId, salesContractNo, materialType: type, materialCode: normalizeText(row.get("materialCode")), materialName: normalizeText(row.get("materialName")), sourceActualName: normalizeText(row.get("sourceActualName")),
        materialColor: normalizeText(row.get("materialColor")), garmentColors, specification: normalizeText(row.get("specification")), supplyMethod,
        garmentQuantity: numberValue(row.get("garmentQuantity")), plannedConsumption, actualConsumption, lossRate: numberValue(row.get("lossRate")), totalConsumption: numberValue(row.get("totalConsumption")), width: normalizeText(row.get("width")), gsm: normalizeText(row.get("gsm")),
        requiredQuantity, sampleQuantity: numberValue(row.get("sampleQuantity")), sourceMaterialDueDate: sourceDue, expectedMaterialReadyDate: sourceDue, expectedDateSource: "source", sourceSortNo: sourceRow,
        sourceStyleNoSnapshot: normalizeText(row.get("styleNo")), sourceFactoryStyleNoSnapshot: normalizeText(row.get("factoryStyleNo")), sourceBrandSnapshot: normalizeText(row.get("brand")), sourceOwnerSnapshot: normalizeText(row.get("owner")) || normalizeText(row.get("salesperson")), sourceCustomerSnapshot: normalizeText(row.get("customerName")), sourceOrderQuantitySnapshot: numberValue(row.get("garmentQuantity")), sourceContractDeliveryDateSnapshot: dateValue(row.get("contractDeliveryDate")),
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
    const purchaseOrderNo = normalizeText(row.get("purchaseOrderNo"));
    const purchaseQuantity = numberValue(row.get("purchaseQuantity"));
    if (purchaseOrderNo && purchaseQuantity !== null) {
      const parts = [purchaseOrderNo, dateValue(row.get("purchaseDate")), normalizeText(row.get("purchaseColor")), purchaseQuantity, numberValue(row.get("purchaseSampleQuantity")), numberValue(row.get("purchaseUnitPrice")), numberValue(row.get("purchaseAmount")), numberValue(row.get("purchaseExtraCost"))];
      addEvent(purchaseEvents, { id: eventId("purchase", demandId, parts), materialDemandId: demandId, purchaseOrderNo, purchaseDate: dateValue(row.get("purchaseDate")), supplier: normalizeText(row.get("supplier")), purchaseEntity: normalizeText(row.get("purchaseEntity")), sourceMaterialDueDate: sourceDue, currency: normalizeText(row.get("currency")), purchaser: normalizeText(row.get("purchaser")), purchasedMaterialName: normalizeText(row.get("purchasedMaterialName")), invoiceName: normalizeText(row.get("invoiceName")), actualName: normalizeText(row.get("purchaseActualName")), specification: normalizeText(row.get("purchaseSpecification")), color: normalizeText(row.get("purchaseColor")), quantity: purchaseQuantity, sampleQuantity: numberValue(row.get("purchaseSampleQuantity")), unitPrice: numberValue(row.get("purchaseUnitPrice")), amount: numberValue(row.get("purchaseAmount")), extraCost: numberValue(row.get("purchaseExtraCost")), importBatchId: batchId, sourceRows: [sourceRow] });
    }
    const inboundNo = normalizeText(row.get("inboundDocumentNo")); const inboundQuantity = numberValue(row.get("inboundQuantity"));
    if (inboundNo && inboundQuantity !== null) addEvent(inboundEvents, { id: eventId("inbound", demandId, [inboundNo, dateValue(row.get("inboundDate")), inboundQuantity]), materialDemandId: demandId, documentNo: inboundNo, eventDate: dateValue(row.get("inboundDate")), quantity: inboundQuantity, importBatchId: batchId, sourceRows: [sourceRow] });
    const shipmentNo = normalizeText(row.get("shipmentDocumentNo")); const shipmentQuantity = numberValue(row.get("shipmentQuantity"));
    if (shipmentNo && shipmentQuantity !== null) addEvent(shipmentEvents, { id: eventId("shipment", demandId, [shipmentNo, dateValue(row.get("shipmentDate")), normalizeText(row.get("transportMode")), shipmentQuantity]), materialDemandId: demandId, documentNo: shipmentNo, eventDate: dateValue(row.get("shipmentDate")), quantity: shipmentQuantity, transportModeSnapshot: normalizeText(row.get("transportMode")), importBatchId: batchId, sourceRows: [sourceRow] });
    const outboundNo = normalizeText(row.get("outboundDocumentNo")); const outboundQuantity = numberValue(row.get("outboundQuantity"));
    if (outboundNo && outboundQuantity !== null) addEvent(outboundEvents, { id: eventId("outbound", demandId, [outboundNo, dateValue(row.get("outboundDate")), outboundQuantity]), materialDemandId: demandId, documentNo: outboundNo, eventDate: dateValue(row.get("outboundDate")), quantity: outboundQuantity, importBatchId: batchId, sourceRows: [sourceRow] });
  }

  batch.demandCount = demands.size; batch.purchaseEventCount = purchaseEvents.size; batch.inboundEventCount = inboundEvents.size; batch.shipmentEventCount = shipmentEvents.size; batch.outboundEventCount = outboundEvents.size; batch.duplicateEventRows = duplicateEventRows;
  return { dataVersion: 3, batch, batches: [batch], rawSnapshots, demands: [...demands.values()], purchaseEvents: [...purchaseEvents.values()], inboundEvents: [...inboundEvents.values()], shipmentEvents: [...shipmentEvents.values()], outboundEvents: [...outboundEvents.values()], expectedArrivalBatches: [] };
}
