import ExcelJS, { type Cell, type Row, type Worksheet } from "exceljs";
import type { AttachmentRepository } from "../repository/attachment-repository.ts";
import type { PriceVersion, Quote, QuoteRevision } from "../model/quote-view-model.ts";
import { BUILTIN_FORMAL_TEMPLATE, getDefaultQuoteCustomerTemplate } from "../../template-settings/repository/indexeddb-template-repository.ts";
import type { TemplateDefinition } from "../../template-settings/model/template-definition.ts";
import { excelDate, quoteExportFileName, uniqueSheetName } from "./quote-export-formatters.ts";
import { calculateContainedImageLayout } from "./quote-image-layout.ts";
import { mapPriceVersionForExport, type ExportCostRow, type ExportPriceVersionData } from "./quote-export-mappers.ts";
import {
  columnNumberToName,
  createExpandedRowPlan,
  parseCellRange,
  parseQuoteExportTemplateLayout,
  type CellPoint,
  type ExpandedRowPlan,
  type QuoteExportTemplateLayout,
  type TemplateSection,
  type TemplateSectionKey,
} from "./quote-export-template-layout.ts";

const TEMPLATE_URL = new URL("../../../templates/quote-export-template-v1.xlsx", import.meta.url);
const FORMAL_LAST_COLUMN = 12;
const MONEY_FORMAT = "#,##0.00";
const QUANTITY_FORMAT = "0.0000";

export type QuoteExcelImage = {
  base64: string;
  extension: "jpeg" | "png";
  width: number;
  height: number;
};

export type QuoteExcelBuildInput = {
  template: ArrayBuffer;
  quote: Pick<Quote, "quoteCode">;
  revision: QuoteRevision;
  priceVersions: PriceVersion[];
  styleImage?: QuoteExcelImage | null;
  now?: Date;
  mapPriceVersion?: (priceVersion: PriceVersion, revision: QuoteRevision) => ExportPriceVersionData;
};

export type QuoteExcelBuildResult = {
  buffer: ArrayBuffer;
  fileName: string;
  warnings: string[];
  diagnostics: {
    sheetNames: string[];
    printAreas: string[];
    rowCounts: number[];
  };
};

export type BrowserExportInput = Omit<QuoteExcelBuildInput, "template" | "styleImage"> & {
  attachmentRepository: AttachmentRepository;
};

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

function cloneTemplateWithExpansion(
  source: Worksheet,
  target: Worksheet,
  layout: QuoteExportTemplateLayout,
  plan: ExpandedRowPlan,
): void {
  target.properties = clone(source.properties);
  target.views = clone(source.views);
  target.headerFooter = clone(source.headerFooter);
  target.state = source.state;
  target.autoFilter = source.autoFilter ? clone(source.autoFilter) : undefined;
  target.pageSetup = clone(source.pageSetup);
  for (let column = 1; column <= layout.formalRange.endColumn; column += 1) {
    const sourceColumn = source.getColumn(column);
    const targetColumn = target.getColumn(column);
    targetColumn.width = sourceColumn.width;
    targetColumn.hidden = sourceColumn.hidden;
    targetColumn.outlineLevel = sourceColumn.outlineLevel;
    targetColumn.style = clone(sourceColumn.style);
  }

  const insertedByDestination = new Map(plan.insertedRows.map((inserted) => [inserted.destinationRow, inserted]));
  let destinationRow = 1;
  for (let sourceRow = layout.formalRange.startRow; sourceRow <= layout.formalRange.endRow; sourceRow += 1) {
    while (insertedByDestination.has(destinationRow)) {
      const inserted = insertedByDestination.get(destinationRow)!;
      cloneRow(source.getRow(inserted.sourceStyleRow), target.getRow(destinationRow), layout.formalRange.endColumn);
      destinationRow += 1;
    }
    cloneRow(source.getRow(sourceRow), target.getRow(destinationRow), layout.formalRange.endColumn);
    destinationRow += 1;
  }

  const sourceMerges = (source.model.merges ?? []).map(parseCellRange);
  sourceMerges.forEach((range) => {
    if (range.endColumn > layout.formalRange.endColumn || range.endRow > layout.formalRange.endRow) return;
    const startRow = plan.rowMap.get(range.startRow);
    const endRow = plan.rowMap.get(range.endRow);
    if (!startRow || !endRow) return;
    target.mergeCells(startRow, range.startColumn, endRow, range.endColumn);
  });
  plan.insertedRows.forEach((inserted) => {
    sourceMerges
      .filter((range) => range.startRow === inserted.sourceStyleRow && range.endRow === inserted.sourceStyleRow)
      .forEach((range) => target.mergeCells(inserted.destinationRow, range.startColumn, inserted.destinationRow, range.endColumn));
  });

  target.pageSetup = {
    ...target.pageSetup,
    printArea: `A1:${columnNumberToName(layout.formalRange.endColumn)}${plan.lastRow}`,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

function mappedPoint(point: CellPoint, plan: ExpandedRowPlan): CellPoint {
  const row = plan.rowMap.get(point.row);
  if (!row) throw new Error(`模板锚点行 ${point.row} 无法映射`);
  return { row, column: point.column };
}

function setCellValue(worksheet: Worksheet, point: CellPoint, value: ExcelJS.CellValue, numberFormat?: string): void {
  const cell = worksheet.getCell(point.row, point.column);
  cell.value = value;
  if (numberFormat) cell.numFmt = numberFormat;
}

function clearRows(worksheet: Worksheet, startRow: number, endRow: number): void {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = 1; column <= FORMAL_LAST_COLUMN; column += 1) worksheet.getCell(row, column).value = null;
  }
}

function mergedWidth(worksheet: Worksheet, row: number, column: number): number {
  const match = (worksheet.model.merges ?? []).map(parseCellRange).find((range) => (
    row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn
  ));
  const start = match?.startColumn ?? column;
  const end = match?.endColumn ?? column;
  let width = 0;
  for (let current = start; current <= end; current += 1) width += worksheet.getColumn(current).width ?? 8.43;
  return width;
}

function displayLength(value: string): number {
  return [...value].reduce((total, character) => total + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1), 0);
}

function estimatedLines(text: string, width: number): number {
  const charactersPerLine = Math.max(6, Math.floor(width * 1.55));
  return Math.max(1, ...text.split(/\r?\n/).map((line) => Math.ceil(displayLength(line) / charactersPerLine) || 1));
}

function applyWrappedRowHeight(worksheet: Worksheet, rowNumber: number, textColumns: Array<{ column: number; text: string }>): void {
  let lines = 1;
  textColumns.forEach(({ column, text }) => {
    if (!text) return;
    const cell = worksheet.getCell(rowNumber, column);
    cell.alignment = { ...cell.alignment, wrapText: true, vertical: "middle" };
    lines = Math.max(lines, estimatedLines(text, mergedWidth(worksheet, rowNumber, column)));
  });
  const base = worksheet.getRow(rowNumber).height ?? 24;
  worksheet.getRow(rowNumber).height = Math.min(96, Math.max(base, 8 + lines * 16));
}

function writeCostRows(
  worksheet: Worksheet,
  section: TemplateSection,
  destination: ExpandedRowPlan["sections"][TemplateSectionKey],
  rows: ExportCostRow[],
): void {
  clearRows(worksheet, destination.dataStartRow, destination.subtotalRow - 1);
  rows.forEach((row, index) => {
    const rowNumber = destination.dataStartRow + index;
    setCellValue(worksheet, { row: rowNumber, column: section.columns.name }, row.name || null);
    setCellValue(worksheet, { row: rowNumber, column: section.columns.description }, row.description || null);
    if (section.key === "fabric") {
      const descriptionCell = worksheet.getCell(rowNumber, section.columns.description);
      descriptionCell.font = { ...descriptionCell.font, name: "宋体", size: 9 };
    }
    if (section.columns.supplier) setCellValue(worksheet, { row: rowNumber, column: section.columns.supplier }, row.supplier || null);
    if (section.columns.initialUnit) setCellValue(worksheet, { row: rowNumber, column: section.columns.initialUnit }, row.unit || null);
    if (section.columns.initialQuantity) setCellValue(worksheet, { row: rowNumber, column: section.columns.initialQuantity }, row.quantity, QUANTITY_FORMAT);
    if (section.columns.unitPrice) setCellValue(worksheet, { row: rowNumber, column: section.columns.unitPrice }, row.unitPrice, MONEY_FORMAT);
    setCellValue(worksheet, { row: rowNumber, column: section.columns.estimatedCost }, row.estimatedCost, MONEY_FORMAT);
    if (section.columns.actualCost) setCellValue(worksheet, { row: rowNumber, column: section.columns.actualCost }, row.actualCost, MONEY_FORMAT);
    applyWrappedRowHeight(worksheet, rowNumber, [
      { column: section.columns.name, text: row.name },
      { column: section.columns.description, text: row.description },
      ...(section.columns.supplier ? [{ column: section.columns.supplier, text: row.supplier }] : []),
    ]);
  });
}

function writeSectionSubtotal(worksheet: Worksheet, section: TemplateSection, plan: ExpandedRowPlan, value: number | null): void {
  const subtotalRow = plan.sections[section.key].subtotalRow;
  setCellValue(worksheet, { row: subtotalRow, column: section.columns.estimatedCost }, value, MONEY_FORMAT);
  if (section.columns.actualCost) setCellValue(worksheet, { row: subtotalRow, column: section.columns.actualCost }, null);
}

function writeBaseInfo(
  worksheet: Worksheet,
  layout: QuoteExportTemplateLayout,
  plan: ExpandedRowPlan,
  revision: QuoteRevision,
  data: ExportPriceVersionData,
): void {
  setCellValue(worksheet, mappedPoint(layout.base.brand, plan), revision.baseInfo.brandName || null);
  setCellValue(worksheet, mappedPoint(layout.base.styleName, plan), revision.baseInfo.styleName || null);
  setCellValue(worksheet, mappedPoint(layout.base.garmentLeadDate, plan), excelDate(revision.baseInfo.garmentLeadDate), "yyyy-mm-dd");
  setCellValue(worksheet, mappedPoint(layout.base.quoteStyleNo, plan), revision.baseInfo.quoteStyleNo || null);
  setCellValue(worksheet, mappedPoint(layout.base.quantity, plan), data.priceVersion.quantity, "#,##0");
  setCellValue(worksheet, mappedPoint(layout.base.quoteDate, plan), excelDate(revision.baseInfo.quoteDate), "yyyy-mm-dd");
}

function writeSummary(
  worksheet: Worksheet,
  layout: QuoteExportTemplateLayout,
  plan: ExpandedRowPlan,
  data: ExportPriceVersionData,
): void {
  setCellValue(worksheet, mappedPoint(layout.summary.preMarkupTotal, plan), data.summary.preMarkupTotal, MONEY_FORMAT);
  setCellValue(
    worksheet,
    mappedPoint(layout.summary.markupRate, plan),
    data.summary.markupRate === null ? null : data.summary.markupRate / 100,
    "0%",
  );
  setCellValue(worksheet, mappedPoint(layout.summary.garmentSellingPrice, plan), data.summary.garmentSellingPrice, MONEY_FORMAT);
  setCellValue(worksheet, mappedPoint(layout.summary.finalQuote, plan), data.summary.finalQuote);
  setCellValue(worksheet, mappedPoint(layout.summary.customerTargetPrice, plan), data.summary.customerTargetPrice, MONEY_FORMAT);
  setCellValue(worksheet, mappedPoint(layout.summary.customerConfirmedPrice, plan), data.summary.customerConfirmedPrice, MONEY_FORMAT);
}

function columnWidthPixels(worksheet: Worksheet, column: number): number {
  return Math.max(1, Math.round((worksheet.getColumn(column).width ?? 8.43) * 7 + 5));
}

function rowHeightPixels(worksheet: Worksheet, row: number): number {
  return Math.max(1, (worksheet.getRow(row).height ?? worksheet.properties.defaultRowHeight ?? 15) * (96 / 72));
}

function columnPositionFromOffset(worksheet: Worksheet, startColumn: number, endColumn: number, offset: number): number {
  let remaining = offset;
  for (let column = startColumn; column <= endColumn; column += 1) {
    const width = columnWidthPixels(worksheet, column);
    if (remaining <= width) return column - 1 + remaining / width;
    remaining -= width;
  }
  return endColumn;
}

function rowPositionFromOffset(worksheet: Worksheet, startRow: number, endRow: number, offset: number): number {
  let remaining = offset;
  for (let row = startRow; row <= endRow; row += 1) {
    const height = rowHeightPixels(worksheet, row);
    if (remaining <= height) return row - 1 + remaining / height;
    remaining -= height;
  }
  return endRow;
}

function addStyleImage(workbook: ExcelJS.Workbook, worksheet: Worksheet, plan: ExpandedRowPlan, image: QuoteExcelImage): void {
  const area = plan.styleImageArea;
  let areaWidth = 0;
  let areaHeight = 0;
  for (let column = area.startColumn; column <= area.endColumn; column += 1) areaWidth += columnWidthPixels(worksheet, column);
  for (let row = area.startRow; row <= area.endRow; row += 1) areaHeight += rowHeightPixels(worksheet, row);
  const contained = calculateContainedImageLayout(image.width, image.height, areaWidth, areaHeight);
  const imageId = workbook.addImage({ base64: image.base64, extension: image.extension });
  worksheet.addImage(imageId, {
    tl: {
      col: columnPositionFromOffset(worksheet, area.startColumn, area.endColumn, contained.offsetX),
      row: rowPositionFromOffset(worksheet, area.startRow, area.endRow, contained.offsetY),
    },
    ext: { width: contained.width, height: contained.height },
    editAs: "oneCell",
  });
}

function dataRowCounts(data: ExportPriceVersionData): Record<TemplateSectionKey, number> {
  return {
    fabric: data.fabricRows.length,
    trim: data.trimRows.length,
    labor: data.laborRows.length,
    outsourcing: data.outsourcingRows.length,
    otherCost: data.otherCostRows.length,
  };
}

function arrayBufferFrom(value: ExcelJS.Buffer): ArrayBuffer {
  return new Uint8Array(value as ArrayBuffer).slice().buffer;
}

export async function buildQuoteExcel(input: QuoteExcelBuildInput): Promise<QuoteExcelBuildResult> {
  if (!input.priceVersions.length) throw new Error("当前报价版本没有可导出的价格版本");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input.template);
  const templateSheet = workbook.worksheets[0];
  if (!templateSheet) throw new Error("报价 Excel 模板没有母版 Sheet");
  const layout = parseQuoteExportTemplateLayout(templateSheet);
  const usedNames = new Set<string>();
  const diagnostics: QuoteExcelBuildResult["diagnostics"] = { sheetNames: [], printAreas: [], rowCounts: [] };
  for (const priceVersion of input.priceVersions) {
    const data = (input.mapPriceVersion ?? mapPriceVersionForExport)(priceVersion, input.revision);
    const sheetName = uniqueSheetName(priceVersion.name, usedNames);
    const worksheet = workbook.addWorksheet(sheetName);
    const plan = createExpandedRowPlan(layout, dataRowCounts(data));
    cloneTemplateWithExpansion(templateSheet, worksheet, layout, plan);
    writeBaseInfo(worksheet, layout, plan, input.revision, data);
    writeCostRows(worksheet, layout.sections.fabric, plan.sections.fabric, data.fabricRows);
    writeCostRows(worksheet, layout.sections.trim, plan.sections.trim, data.trimRows);
    writeCostRows(worksheet, layout.sections.labor, plan.sections.labor, data.laborRows);
    writeCostRows(worksheet, layout.sections.outsourcing, plan.sections.outsourcing, data.outsourcingRows);
    writeCostRows(worksheet, layout.sections.otherCost, plan.sections.otherCost, data.otherCostRows);
    writeSectionSubtotal(worksheet, layout.sections.fabric, plan, data.summary.fabricCost);
    writeSectionSubtotal(worksheet, layout.sections.trim, plan, data.summary.trimCost);
    writeSectionSubtotal(worksheet, layout.sections.labor, plan, data.summary.laborRmb);
    writeSectionSubtotal(worksheet, layout.sections.outsourcing, plan, null);
    writeSectionSubtotal(worksheet, layout.sections.otherCost, plan, data.summary.otherCost);
    writeSummary(worksheet, layout, plan, data);
    if (input.styleImage) addStyleImage(workbook, worksheet, plan, input.styleImage);
    diagnostics.sheetNames.push(sheetName);
    diagnostics.printAreas.push(worksheet.pageSetup.printArea ?? "");
    diagnostics.rowCounts.push(plan.lastRow);
  }
  workbook.removeWorksheet(templateSheet.id);
  const buffer = arrayBufferFrom(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    fileName: quoteExportFileName(input.quote, input.revision, input.now),
    warnings: [],
    diagnostics,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取款式图失败"));
    reader.readAsDataURL(blob);
  });
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法解析款式图尺寸")); };
    image.src = url;
  });
}

async function convertWebpToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("当前浏览器无法转换 WEBP 款式图"); }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((png) => png ? resolve(png) : reject(new Error("WEBP 款式图转换失败")), "image/png"));
}

export async function loadStyleImage(revision: QuoteRevision, repository: AttachmentRepository): Promise<{ image: QuoteExcelImage | null; warnings: string[] }> {
  if (!revision.styleImageAttachmentId) return { image: null, warnings: [] };
  try {
    const attachment = await repository.get(revision.styleImageAttachmentId);
    const originalBlob = await repository.getBlob(revision.styleImageAttachmentId);
    if (!attachment || !originalBlob) return { image: null, warnings: ["款式图附件不可用，Excel 款式图区已留空"] };
    const isWebp = attachment.mimeType === "image/webp" || /\.webp$/i.test(attachment.name);
    const blob = isWebp ? await convertWebpToPng(originalBlob) : originalBlob;
    const dimensions = await imageDimensions(blob);
    const isPng =
      blob.type === "image/png" || attachment.mimeType === "image/png" || /\.png$/i.test(attachment.name);
    const extension: QuoteExcelImage["extension"] = isWebp || isPng ? "png" : "jpeg";
    return { image: { base64: await blobToDataUrl(blob), extension, ...dimensions }, warnings: [] };
  } catch (error) {
    console.warn("Quote Excel style image warning", error);
    return { image: null, warnings: ["款式图附件不可用，Excel 款式图区已留空"] };
  }
}

export async function buildDefaultQuoteRevisionExcel(input: BrowserExportInput): Promise<QuoteExcelBuildResult> {
  let selected: Awaited<ReturnType<typeof getDefaultQuoteCustomerTemplate>>;
  try { selected = await getDefaultQuoteCustomerTemplate(); }
  catch {
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) throw new Error(`无法读取正式报价模板（${response.status}）`);
    selected = { definition: BUILTIN_FORMAL_TEMPLATE, buffer: await response.arrayBuffer() };
  }
  return buildQuoteRevisionExcelWithTemplate(input, selected.definition, selected.buffer);
}

export async function buildQuoteRevisionExcelWithTemplate(input: BrowserExportInput, definition: TemplateDefinition, template: ArrayBuffer): Promise<QuoteExcelBuildResult> {
  const styleImage = await loadStyleImage(input.revision, input.attachmentRepository);
  const result = definition.id === BUILTIN_FORMAL_TEMPLATE.id
    ? await buildQuoteExcel({ ...input, template, styleImage: styleImage.image })
    : await (await import("./quote-placeholder-excel-exporter.ts")).buildQuotePlaceholderExcel({ ...input, template, styleImage: styleImage.image });
  return { ...result, warnings: [...result.warnings, ...styleImage.warnings] };
}

export async function exportQuoteRevisionExcel(input: BrowserExportInput): Promise<QuoteExcelBuildResult> {
  const result = await buildDefaultQuoteRevisionExcel(input);
  const blob = new Blob([result.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return result;
}
