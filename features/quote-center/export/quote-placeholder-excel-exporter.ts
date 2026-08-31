import ExcelJS, { type Cell, type Row, type Worksheet } from "exceljs";
import { calculateContainedImageLayout } from "./quote-image-layout.ts";
import { excelDate, quoteExportFileName, uniqueSheetName } from "./quote-export-formatters.ts";
import { mapPriceVersionForExport, type ExportCostRow, type ExportPriceVersionData } from "./quote-export-mappers.ts";
import { placeholdersInText, validateQuoteCustomerTemplate } from "../../template-settings/model/template-definition.ts";
import { truncateFinalQuoteValue } from "../model/final-quote-format.ts";
import type { PriceVersion } from "../model/quote-view-model.ts";
import type { QuoteExcelBuildInput, QuoteExcelBuildResult } from "./quote-excel-exporter.ts";

type DynamicGroup = "fabric" | "trim" | "labor" | "otherCost";
type DynamicRegion = { group: DynamicGroup; templateRow: number; endRow: number };

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneCell(source: Cell, target: Cell): void {
  if (source.value instanceof Date) target.value = new Date(source.value.getTime());
  else target.value = clone(source.value);
  target.style = clone(source.style);
  if (source.note) target.note = clone(source.note);
}

function cloneRow(source: Row, target: Row, lastColumn: number): void {
  target.height = source.height;
  target.hidden = source.hidden;
  target.outlineLevel = source.outlineLevel;
  for (let column = 1; column <= lastColumn; column += 1) cloneCell(source.getCell(column), target.getCell(column));
}

function lastContentColumn(sheet: Worksheet): number {
  let lastColumn = 1;
  sheet.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell, column) => {
    if (cell.value !== null && cell.value !== undefined && String(cell.value).trim()) lastColumn = Math.max(lastColumn, column);
  }));
  return lastColumn;
}

function columnName(column: number): string {
  let value = column;
  let name = "";
  while (value > 0) { value -= 1; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
  return name;
}

function rowHasContent(sheet: Worksheet, rowNumber: number): boolean {
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const value = sheet.getCell(rowNumber, column).value;
    if (value !== null && value !== undefined && String(value).trim()) return true;
  }
  return false;
}

function dynamicRegions(sheet: Worksheet): DynamicRegion[] {
  const groups: DynamicGroup[] = ["fabric", "trim", "labor", "otherCost"];
  const result: DynamicRegion[] = [];
  groups.forEach((group) => {
    let templateRow = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (templateRow) return;
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === "string" && placeholdersInText(cell.value).some((placeholder) => placeholder.startsWith(`${group}.`))) templateRow = rowNumber;
      });
    });
    if (!templateRow) return;
    let endRow = templateRow;
    while (endRow + 1 <= sheet.rowCount && !rowHasContent(sheet, endRow + 1)) endRow += 1;
    result.push({ group, templateRow, endRow });
  });
  return result.sort((a, b) => a.templateRow - b.templateRow);
}

function dynamicRows(group: DynamicGroup, data: ExportPriceVersionData): ExportCostRow[] {
  if (group === "fabric") return data.fabricRows;
  if (group === "trim") return data.trimRows;
  if (group === "labor") return data.laborRows;
  return data.otherCostRows;
}

function dynamicValue(group: DynamicGroup, field: string, row: ExportCostRow): ExcelJS.CellValue {
  if (group === "fabric") {
    const map: Record<string, ExcelJS.CellValue> = {
      name: row.name || null, description: row.description || null, supplier: row.supplier || null,
      consumptionKg: row.unit === "kg" ? row.quantity : null,
      consumptionMeter: row.unit === "m" ? row.quantity : null,
      unitPrice: row.unitPrice, quotedCost: row.estimatedCost,
    };
    return map[field] ?? null;
  }
  if (group === "trim") {
    const map: Record<string, ExcelJS.CellValue> = { name: row.name || null, specification: row.description || null, supplier: row.supplier || null, quantity: row.quantity, unit: row.unit || null, unitPrice: row.unitPrice, quotedCost: row.estimatedCost };
    return map[field] ?? null;
  }
  if (group === "labor") {
    const map: Record<string, ExcelJS.CellValue> = { description: row.description || null, costRmb: row.estimatedCost, costUsd: row.actualCost };
    return map[field] ?? null;
  }
  const map: Record<string, ExcelJS.CellValue> = { name: row.name || null, note: row.description || null, amount: row.estimatedCost };
  return map[field] ?? null;
}

function scalarValue(placeholder: string, input: QuoteExcelBuildInput, version: PriceVersion, data: ExportPriceVersionData): ExcelJS.CellValue {
  const values: Record<string, ExcelJS.CellValue> = {
    "quote.brandName": input.revision.baseInfo.brandName || null,
    "quote.styleName": input.revision.baseInfo.styleName || null,
    "quote.styleNo": input.revision.baseInfo.quoteStyleNo || null,
    "quote.salespersonName": input.revision.baseInfo.salespersonName || null,
    "quote.quoteDate": excelDate(input.revision.baseInfo.quoteDate),
    "revision.displayName": input.revision.revisionLabel,
    "priceVersion.name": version.name,
    "priceVersion.quantity": version.quantity,
    "summary.totalCost": data.summary.preMarkupTotal,
    "summary.markupRate": data.summary.markupRate === null ? null : data.summary.markupRate / 100,
    "summary.garmentSalesPrice": data.summary.garmentSellingPrice === null ? null : truncateFinalQuoteValue(data.summary.garmentSellingPrice),
    "summary.finalQuote": data.summary.finalQuote,
    "customer.confirmedPrice": data.summary.customerConfirmedPrice,
    "styleImage": null,
  };
  return values[placeholder] ?? null;
}

function replaceCellPlaceholders(cell: Cell, resolver: (placeholder: string) => ExcelJS.CellValue): void {
  if (typeof cell.value !== "string") return;
  const placeholders = placeholdersInText(cell.value);
  if (!placeholders.length) return;
  const trimmed = cell.value.trim();
  if (placeholders.length === 1 && trimmed === `{{${placeholders[0]}}}`) {
    cell.value = resolver(placeholders[0]);
    return;
  }
  let next = cell.value;
  placeholders.forEach((placeholder) => { next = next.replace(new RegExp(`\\{\\{\\s*${placeholder.replaceAll(".", "\\.")}\\s*\\}\\}`, "g"), String(resolver(placeholder) ?? "")); });
  cell.value = next;
}

function translateFormulaRows(formula: string, regions: DynamicRegion[], rowMap: Map<number, number>, data: ExportPriceVersionData): string {
  const mapRow = (sourceRow: number) => {
    const region = regions.find((item) => sourceRow >= item.templateRow && sourceRow <= item.endRow);
    if (region) {
      const start = rowMap.get(region.templateRow) ?? region.templateRow;
      const count = Math.max(1, dynamicRows(region.group, data).length);
      if (sourceRow === region.templateRow) return start;
      return start + count - 1;
    }
    return rowMap.get(sourceRow) ?? sourceRow;
  };
  return formula.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g, (_match, column: string, row: string) => `${column}${mapRow(Number(row))}`);
}

function cloneTemplateSheet(source: Worksheet, target: Worksheet, data: ExportPriceVersionData, input: QuoteExcelBuildInput, version: PriceVersion): { rowMap: Map<number, number>; styleImagePoint: { row: number; column: number } | null } {
  const regions = dynamicRegions(source);
  const lastColumn = lastContentColumn(source);
  const regionByStart = new Map(regions.map((region) => [region.templateRow, region]));
  const skipped = new Set(regions.flatMap((region) => Array.from({ length: Math.max(0, region.endRow - region.templateRow) }, (_, index) => region.templateRow + index + 1)));
  const rowMap = new Map<number, number>();
  const repeatedRows: Array<{ sourceRow: number; targetRow: number }> = [];
  let targetRow = 1;
  for (let sourceRow = 1; sourceRow <= source.rowCount; sourceRow += 1) {
    if (skipped.has(sourceRow)) continue;
    const region = regionByStart.get(sourceRow);
    const count = region ? Math.max(1, dynamicRows(region.group, data).length) : 1;
    rowMap.set(sourceRow, targetRow);
    for (let repeat = 0; repeat < count; repeat += 1) {
      cloneRow(source.getRow(sourceRow), target.getRow(targetRow), lastColumn);
      repeatedRows.push({ sourceRow, targetRow });
      targetRow += 1;
    }
  }
  target.properties = clone(source.properties);
  target.views = clone(source.views);
  target.headerFooter = clone(source.headerFooter);
  target.pageSetup = clone(source.pageSetup);
  for (let column = 1; column <= lastColumn; column += 1) {
    target.getColumn(column).width = source.getColumn(column).width;
    target.getColumn(column).style = clone(source.getColumn(column).style);
  }
  const sourceMerges = (source.model.merges ?? []).map((address) => {
    const match = address.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
    const col = (value: string) => [...value].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
    return { startColumn: col(match[1]), startRow: Number(match[2]), endColumn: col(match[3]), endRow: Number(match[4]) };
  });
  sourceMerges.forEach((merge) => {
    const region = regionByStart.get(merge.startRow);
    if (region && merge.endRow === merge.startRow) {
      const count = Math.max(1, dynamicRows(region.group, data).length);
      const start = rowMap.get(merge.startRow)!;
      for (let index = 0; index < count; index += 1) target.mergeCells(start + index, merge.startColumn, start + index, merge.endColumn);
      return;
    }
    const start = rowMap.get(merge.startRow);
    const end = rowMap.get(merge.endRow);
    if (start && end) target.mergeCells(start, merge.startColumn, end, merge.endColumn);
  });
  let styleImagePoint: { row: number; column: number } | null = null;
  repeatedRows.forEach(({ sourceRow, targetRow: outputRow }) => {
    const region = regionByStart.get(sourceRow);
    const repeatIndex = region ? outputRow - rowMap.get(sourceRow)! : 0;
    const sourceData = region ? dynamicRows(region.group, data)[repeatIndex] : null;
    if (sourceData) {
      const textLength = `${sourceData.name ?? ""}${sourceData.description ?? ""}${sourceData.supplier ?? ""}`.length;
      target.getRow(outputRow).height = Math.max(target.getRow(outputRow).height ?? 15, textLength > 44 ? 38 : textLength > 24 ? 30 : 22);
    }
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = target.getCell(outputRow, column);
      const placeholders = typeof cell.value === "string" ? placeholdersInText(cell.value) : [];
      if (cell.value && typeof cell.value === "object" && "formula" in cell.value && typeof cell.value.formula === "string") {
        cell.value = { ...cell.value, formula: translateFormulaRows(cell.value.formula, regions, rowMap, data), result: undefined };
      }
      if (typeof cell.value === "string" && placeholdersInText(cell.value).includes("styleImage")) styleImagePoint = { row: outputRow, column };
      replaceCellPlaceholders(cell, (placeholder) => {
        if (region && placeholder.startsWith(`${region.group}.`)) return sourceData ? dynamicValue(region.group, placeholder.slice(region.group.length + 1), sourceData) : null;
        return scalarValue(placeholder, input, version, data);
      });
      if (placeholders.some((placeholder) => placeholder === "fabric.consumptionKg" || placeholder === "fabric.consumptionMeter")) {
        cell.numFmt = "0.0000";
      }
    }
  });
  const productionCountry = version.pricingParameters.manufacturingCountry.trim();
  if (productionCountry) target.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
    if (typeof cell.value === "string" && /报价表（[^）]*）/.test(cell.value)) {
      cell.value = cell.value.replace(/报价表（[^）]*）/, `报价表（${productionCountry}）`);
    }
  }));
  target.pageSetup = { ...target.pageSetup, printArea: `A1:${columnName(lastColumn)}${targetRow - 1}`, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return { rowMap, styleImagePoint };
}

function addImage(workbook: ExcelJS.Workbook, sheet: Worksheet, point: { row: number; column: number }, image: NonNullable<QuoteExcelBuildInput["styleImage"]>): void {
  const merge = (sheet.model.merges ?? []).find((address) => {
    const range = sheet.getCell(address.split(":")[0]);
    return Number(range.row) === point.row && Number(range.col) === point.column;
  });
  const end = merge ? sheet.getCell(merge.split(":")[1]) : sheet.getCell(point.row + 4, point.column + 1);
  let width = 0; let height = 0;
  for (let column = point.column; column <= Number(end.col); column += 1) width += Math.round((sheet.getColumn(column).width ?? 8.43) * 7 + 5);
  for (let row = point.row; row <= Number(end.row); row += 1) height += Math.max(1, (sheet.getRow(row).height ?? 15) * 96 / 72);
  const contained = calculateContainedImageLayout(image.width, image.height, width, height);
  const columnPosition = (offset: number) => {
    let remaining = offset;
    for (let column = point.column; column <= Number(end.col); column += 1) {
      const cellWidth = Math.round((sheet.getColumn(column).width ?? 8.43) * 7 + 5);
      if (remaining <= cellWidth) return column - 1 + remaining / cellWidth;
      remaining -= cellWidth;
    }
    return Number(end.col);
  };
  const rowPosition = (offset: number) => {
    let remaining = offset;
    for (let row = point.row; row <= Number(end.row); row += 1) {
      const cellHeight = Math.max(1, (sheet.getRow(row).height ?? 15) * 96 / 72);
      if (remaining <= cellHeight) return row - 1 + remaining / cellHeight;
      remaining -= cellHeight;
    }
    return Number(end.row);
  };
  const imageId = workbook.addImage({ base64: image.base64, extension: image.extension });
  sheet.addImage(imageId, { tl: { col: columnPosition(contained.offsetX), row: rowPosition(contained.offsetY) }, ext: { width: contained.width, height: contained.height }, editAs: "oneCell" });
}

export async function buildQuotePlaceholderExcel(input: QuoteExcelBuildInput): Promise<QuoteExcelBuildResult> {
  const validation = await validateQuoteCustomerTemplate("template.xlsx", input.template);
  if (!validation.valid) throw new Error(validation.errors.join("；"));
  if (!input.priceVersions.length) throw new Error("当前报价版本没有可导出的价格版本");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input.template);
  const source = workbook.worksheets[0];
  const usedNames = new Set<string>();
  const diagnostics: QuoteExcelBuildResult["diagnostics"] = { sheetNames: [], printAreas: [], rowCounts: [] };
  for (const version of input.priceVersions) {
    const data = (input.mapPriceVersion ?? mapPriceVersionForExport)(version, input.revision);
    const sheetName = uniqueSheetName(version.name, usedNames);
    const target = workbook.addWorksheet(sheetName);
    const cloned = cloneTemplateSheet(source, target, data, input, version);
    if (input.styleImage && cloned.styleImagePoint) addImage(workbook, target, cloned.styleImagePoint, input.styleImage);
    diagnostics.sheetNames.push(sheetName);
    diagnostics.printAreas.push(target.pageSetup.printArea ?? "");
    diagnostics.rowCounts.push(target.rowCount);
  }
  workbook.removeWorksheet(source.id);
  const output = await workbook.xlsx.writeBuffer();
  return { buffer: new Uint8Array(output as ArrayBuffer).slice().buffer, fileName: quoteExportFileName(input.quote, input.revision, input.now), warnings: validation.warnings, diagnostics };
}
