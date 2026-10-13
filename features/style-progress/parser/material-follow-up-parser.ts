import ExcelJS from "exceljs";
import type { MaterialImportBatch, MaterialImportPreview, MaterialRawSnapshot, RawCellValue } from "../model/style-progress.ts";
import type { MaterialSemanticField, MaterialSourceRow } from "../source/material-source-row.ts";
import { normalizeMaterialSourceRows } from "./material-normalization-pipeline.ts";

export { splitGarmentColors, stableMaterialHash } from "./material-normalization-pipeline.ts";

const normalizeText = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
type SemanticField = MaterialSemanticField;
const FIELD_ALIASES: Record<Exclude<SemanticField, "purchaseQuantity">, string[]> = {
  styleNo: ["款号"], materialType: ["类型", "物料类型"], companyHeader: ["公司抬头"], salesContractNo: ["销售合同号", "销售合同"], brand: ["客户品牌", "品牌"],
  salesperson: ["业务员"], owner: ["跟单人", "负责人"], factoryStyleNo: ["工厂款号"], garmentColors: ["成衣颜色"], relatedGarmentColors: ["对应成衣颜色"], garmentQuantity: ["成衣数量", "订单数量"],
  customerName: ["客户名称"], contractDeliveryDate: ["销售交期", "合同交期"], materialCode: ["面辅料编码", "物料编码"], materialName: ["面辅料名称", "物料名称"], sourceActualName: ["申购实际名称"],
  plannedConsumption: ["单耗", "计划单耗"], lossRate: ["损耗", "损耗率"], totalConsumption: ["总耗"], width: ["门幅"], gsm: ["克重"], materialColor: ["颜色"], specification: ["规格成分", "申购规格"],
  // Historical Excel has no independently verified equivalent of 6087050 QtyUnit.
  supplyMethod: ["提供方式", "供应方式"], requiredQuantity: ["需求数量"], quantityUnit: [], sampleQuantity: ["样衣用量"], purchaseOrderNo: ["采购单号"], purchaseDate: ["采购日期"], supplier: ["供应商"], purchaseEntity: ["采购抬头", "采购主体"],
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
  const eventQuantityMatches = purchaseStart && purchaseEnd ? purchaseQuantityMatches.filter((column) => column > purchaseStart && column < purchaseEnd) : [];
  if (eventQuantityMatches.length !== 1) {
    if (!eventQuantityMatches.length) throw new Error("缺少必需列：采购数量（采购事件）");
    throw new Error("关键表头无法唯一识别：采购数量（采购事件）");
  }
  columns.purchaseQuantity = eventQuantityMatches[0];
  return columns;
}

const rawValue = (value: unknown): RawCellValue => value instanceof Date ? value.toISOString() : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : value === null || value === undefined ? null : normalizeText(value);

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
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
  const sourceRows: MaterialSourceRow[] = [];
  for (let sourceRow = 4; sourceRow <= sheet.rowCount; sourceRow += 1) {
    const worksheetRow = sheet.getRow(sourceRow);
    const worksheetValues = Array.from({ length: sheet.columnCount }, (_, index) => worksheetRow.getCell(index + 1).value);
    if (!worksheetValues.some((value) => value !== null && value !== undefined && normalizeText(value) !== "")) continue;
    const values = Object.fromEntries((Object.keys(columns) as SemanticField[]).map((field) => [field, columns[field] ? worksheetValues[columns[field]! - 1] : null]));
    const rawFields = Object.fromEntries(headers.map((header, index) => [`${index + 1}:${header || "未命名"}`, rawValue(worksheetValues[index])]));
    sourceRows.push({
      trace: { sourceKind: "excel", fileHash, fileName: input.fileName, sheetName: sheet.name, sourceRow },
      rawFields,
      values,
    });
  }
  const normalized = normalizeMaterialSourceRows({ rows: sourceRows, batchId, sourceArtifactHash: fileHash, now });
  const stats = normalized.stats;
  const batch: MaterialImportBatch = {
    id: batchId,
    fileName: input.fileName,
    fileHash,
    sheetName: sheet.name,
    usedRange: usedRange(sheet.rowCount, sheet.columnCount),
    ...stats,
    status: "preview",
    createdAt: now,
    createdBy: input.actorName,
    committedAt: null,
  };
  const rawSnapshots: MaterialRawSnapshot[] = normalized.rawRows.map((row) => {
    if (row.trace.sourceKind !== "excel") throw new Error("Excel parser 收到非 Excel Source Trace");
    return {
      id: row.id,
      importBatchId: batchId,
      fileHash: row.trace.fileHash,
      fileName: row.trace.fileName,
      sheetName: row.trace.sheetName,
      sourceRow: row.trace.sourceRow,
      rawFields: row.rawFields,
      normalizedDemandId: row.normalizedDemandId,
      validationIssues: row.validationIssues,
    };
  });
  return {
    dataVersion: 4,
    batch,
    batches: [batch],
    rawSnapshots,
    demands: normalized.demands,
    purchaseEvents: normalized.purchaseEvents,
    inboundEvents: normalized.inboundEvents,
    shipmentEvents: normalized.shipmentEvents,
    outboundEvents: normalized.outboundEvents,
    expectedArrivalBatches: [],
  };
}
