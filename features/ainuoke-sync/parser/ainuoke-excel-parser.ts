import ExcelJS from "exceljs";
import type { AinuokeColorMirrorRow, AinuokeContractMirror, AinuokeSourceTrace } from "../model/ainuoke.ts";
import { normalizeBrandText, normalizeStyleNo, resolveBrandAlias } from "../model/style-normalizer.ts";

type ParsedSalesContract = Omit<AinuokeContractMirror, "brandNormalized" | "strictStyleKey" | "baseStyleKey" | "colorRows" | "colorLines" | "deliveryLines" | "colorQuantity" | "quantityDifference" | "validationStatus" | "boundOrderId" | "lastDisposition" | "syncedAt">;

const text = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((item) => item.text).join("").trim();
    if ("result" in value) return text(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text.trim();
  }
  return String(value).trim();
};

const number = (value: ExcelJS.CellValue): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(text(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const date = (value: ExcelJS.CellValue): string | null => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

export function stableSourceHash(parts: ReadonlyArray<string | number | null>): string {
  const input = JSON.stringify(parts);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function headersFor(worksheet: ExcelJS.Worksheet, required: string[]): { row: number; columns: Map<string, number> } {
  for (let rowNo = 1; rowNo <= Math.min(worksheet.rowCount, 20); rowNo += 1) {
    const row = worksheet.getRow(rowNo);
    const columns = new Map<string, number>();
    row.eachCell({ includeEmpty: false }, (cell, column) => columns.set(text(cell.value), column));
    if (required.every((header) => columns.has(header))) return { row: rowNo, columns };
  }
  throw new Error(`工作表 ${worksheet.name} 缺少必要表头：${required.join("、")}`);
}

const trace = (fileName: string, sheetName: string, row: number, parts: ReadonlyArray<string | number | null>): AinuokeSourceTrace => ({ sourceFile: fileName, sourceSheet: sheetName, sourceRow: row, sourceHash: stableSourceHash(parts) });

async function loadWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

export async function parseSalesContractsWorkbook(buffer: ArrayBuffer, fileName: string): Promise<ParsedSalesContract[]> {
  const workbook = await loadWorkbook(buffer);
  const worksheet = workbook.getWorksheet("销售合同") ?? workbook.worksheets[0];
  if (!worksheet) throw new Error("销售合同工作簿没有可读取的工作表");
  const { row: headerRow, columns } = headersFor(worksheet, ["销售合同号", "客户品牌", "款号", "数量", "交货期"]);
  const cell = (row: ExcelJS.Row, name: string): ExcelJS.CellValue => { const column = columns.get(name); return column ? row.getCell(column).value : null; };
  const result: ParsedSalesContract[] = [];
  for (let rowNo = headerRow + 1; rowNo <= worksheet.rowCount; rowNo += 1) {
    const row = worksheet.getRow(rowNo);
    const salesContractNo = text(cell(row, "销售合同号")).normalize("NFKC").toLocaleUpperCase();
    if (!salesContractNo) continue;
    const quantity = number(cell(row, "数量"));
    if (quantity === null || quantity < 0) throw new Error(`销售合同 ${salesContractNo} 的数量无效（第 ${rowNo} 行）`);
    const values = [salesContractNo, text(cell(row, "客户品牌")), text(cell(row, "款号")), text(cell(row, "工厂款号")), quantity, date(cell(row, "交货期"))];
    result.push({
      ...trace(fileName, worksheet.name, rowNo, values),
      salesContractNo,
      statusRaw: text(cell(row, "状态")),
      companyName: text(cell(row, "公司抬头")),
      customerName: text(cell(row, "客户")),
      brandRaw: text(cell(row, "客户品牌")),
      styleNoRaw: text(cell(row, "款号")),
      factoryStyleNo: text(cell(row, "工厂款号")),
      poNo: text(cell(row, "PO")),
      quantity,
      contractDate: date(cell(row, "合同日期")),
      contractDeliveryDate: date(cell(row, "交货期")),
    });
  }
  const unique = new Set(result.map((item) => item.salesContractNo));
  if (unique.size !== result.length) throw new Error("销售合同文件存在重复销售合同号");
  return result;
}

export async function parseColorDetailsWorkbook(buffer: ArrayBuffer, fileName: string): Promise<AinuokeColorMirrorRow[]> {
  const workbook = await loadWorkbook(buffer);
  const worksheet = workbook.getWorksheet("成衣分色分码明细") ?? workbook.worksheets[0];
  if (!worksheet) throw new Error("成衣分色工作簿没有可读取的工作表");
  const { row: headerRow, columns } = headersFor(worksheet, ["销售合同号", "款号", "颜色", "数量", "交期"]);
  const cell = (row: ExcelJS.Row, name: string): ExcelJS.CellValue => { const column = columns.get(name); return column ? row.getCell(column).value : null; };
  const sizeColumns = [...columns].filter(([name]) => /^Size\d+$/i.test(name)).sort((left, right) => left[1] - right[1]);
  const result: AinuokeColorMirrorRow[] = [];
  for (let rowNo = headerRow + 1; rowNo <= worksheet.rowCount; rowNo += 1) {
    const row = worksheet.getRow(rowNo);
    const salesContractNo = text(cell(row, "销售合同号")).normalize("NFKC").toLocaleUpperCase();
    if (!salesContractNo) continue;
    const quantity = number(cell(row, "数量"));
    if (quantity === null || quantity < 0) throw new Error(`分色明细 ${salesContractNo} 的数量无效（第 ${rowNo} 行）`);
    const colorName = text(cell(row, "颜色")) || "未命名颜色";
    const sizes = sizeColumns.flatMap(([sizeName, column]) => {
      const sizeQuantity = number(row.getCell(column).value);
      return sizeQuantity === null ? [] : [{ sizeName, quantity: sizeQuantity }];
    });
    const values = [salesContractNo, text(cell(row, "款号")), colorName, quantity, date(cell(row, "交期")), ...sizes.flatMap((item) => [item.sizeName, item.quantity])];
    result.push({ ...trace(fileName, worksheet.name, rowNo, values), salesContractNo, styleNoRaw: text(cell(row, "款号")), factoryStyleNo: text(cell(row, "工厂款号")), poNo: text(cell(row, "PO")), colorName, quantity, deliveryDate: date(cell(row, "交期")), sizes });
  }
  return result;
}

export function buildAinuokeMirror(input: { contracts: ParsedSalesContract[]; colorRows: AinuokeColorMirrorRow[]; aliases?: ReadonlyArray<{ alias: string; canonicalName: string; enabled?: boolean }>; syncedAt?: string }): AinuokeContractMirror[] {
  const syncedAt = input.syncedAt ?? new Date().toISOString();
  const colorByContract = new Map<string, AinuokeColorMirrorRow[]>();
  for (const row of input.colorRows) colorByContract.set(row.salesContractNo, [...(colorByContract.get(row.salesContractNo) ?? []), row]);
  const contracts = input.contracts.map((contract) => {
    const colorRows = colorByContract.get(contract.salesContractNo) ?? [];
    const colorGroups = new Map<string, AinuokeColorMirrorRow[]>();
    for (const row of colorRows) colorGroups.set(row.colorName.normalize("NFKC").trim(), [...(colorGroups.get(row.colorName.normalize("NFKC").trim()) ?? []), row]);
    const colorLines = [...colorGroups.entries()].map(([colorName, rows]) => ({ colorName, quantity: rows.reduce((sum, row) => sum + row.quantity, 0), deliveryDate: [...new Set(rows.map((row) => row.deliveryDate).filter((value): value is string => Boolean(value)))].sort()[0] ?? null, sourceRows: rows.map((row) => row.sourceRow) }));
    const deliveryGroups = new Map<string, number>();
    for (const row of colorRows) if (row.deliveryDate) deliveryGroups.set(row.deliveryDate, (deliveryGroups.get(row.deliveryDate) ?? 0) + row.quantity);
    const deliveryLines = [...deliveryGroups].sort(([left], [right]) => left.localeCompare(right)).map(([deliveryDate, quantity]) => ({ deliveryDate, quantity }));
    const colorQuantity = colorLines.reduce((sum, line) => sum + line.quantity, 0);
    const quantityDifference = colorQuantity - contract.quantity;
    const keys = normalizeStyleNo(contract.styleNoRaw);
    const brandNormalized = resolveBrandAlias(contract.brandRaw, input.aliases ?? []);
    return { ...contract, ...keys, brandNormalized: brandNormalized || normalizeBrandText(contract.brandRaw), colorRows, colorLines, deliveryLines, colorQuantity, quantityDifference, validationStatus: !colorRows.length ? "missing_color_detail" as const : quantityDifference === 0 ? "valid" as const : "quantity_mismatch" as const, boundOrderId: null, lastDisposition: null, syncedAt };
  });
  const contractSet = new Set(contracts.map((item) => item.salesContractNo));
  const orphan = input.colorRows.find((row) => !contractSet.has(row.salesContractNo));
  if (orphan) throw new Error(`分色明细中的销售合同号 ${orphan.salesContractNo} 不存在于销售合同文件`);
  return contracts;
}

export async function parseAinuokeWorkbooks(input: { salesBuffer: ArrayBuffer; salesFileName: string; colorBuffer: ArrayBuffer; colorFileName: string; aliases?: ReadonlyArray<{ alias: string; canonicalName: string; enabled?: boolean }>; syncedAt?: string }): Promise<AinuokeContractMirror[]> {
  const [contracts, colorRows] = await Promise.all([parseSalesContractsWorkbook(input.salesBuffer, input.salesFileName), parseColorDetailsWorkbook(input.colorBuffer, input.colorFileName)]);
  return buildAinuokeMirror({ contracts, colorRows, aliases: input.aliases, syncedAt: input.syncedAt });
}
