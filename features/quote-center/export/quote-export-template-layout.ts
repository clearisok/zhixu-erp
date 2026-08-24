import type { Worksheet } from "exceljs";

export type TemplateSectionKey = "fabric" | "trim" | "labor" | "outsourcing" | "otherCost";

export type CellPoint = { row: number; column: number };
export type CellRange = { startRow: number; startColumn: number; endRow: number; endColumn: number };

export type TemplateSection = {
  key: TemplateSectionKey;
  anchor: CellPoint;
  dataStartRow: number;
  subtotal: CellPoint;
  reservedCapacity: number;
  templateDataRow: number;
  columns: {
    name: number;
    description: number;
    supplier?: number;
    initialUnit?: number;
    initialQuantity?: number;
    unitPrice?: number;
    estimatedCost: number;
    actualCost?: number;
  };
};

export type QuoteExportTemplateLayout = {
  formalRange: CellRange;
  sections: Record<TemplateSectionKey, TemplateSection>;
  base: {
    brand: CellPoint;
    styleName: CellPoint;
    garmentLeadDate: CellPoint;
    quoteStyleNo: CellPoint;
    quantity: CellPoint;
    quoteDate: CellPoint;
  };
  summary: {
    anchor: CellPoint;
    preMarkupTotal: CellPoint;
    markupRate: CellPoint;
    garmentSellingPrice: CellPoint;
    finalQuote: CellPoint;
    customerTargetPrice: CellPoint;
    customerConfirmedPrice: CellPoint;
    styleImageLabel: CellPoint;
    styleImageArea: CellRange;
  };
};

export type ExpandedRowPlan = {
  rowMap: Map<number, number>;
  insertedRows: Array<{ section: TemplateSectionKey; sourceStyleRow: number; destinationRow: number }>;
  lastRow: number;
  sections: Record<TemplateSectionKey, { dataStartRow: number; subtotalRow: number; capacity: number }>;
  styleImageArea: CellRange;
};

const REQUIRED_SECTION_ANCHORS: Record<TemplateSectionKey, string> = {
  fabric: "直接成本 - 面料说明",
  trim: "直接成本 - 辅料说明",
  labor: "直接成本 - 加工费说明",
  outsourcing: "直接成本 - 外协",
  otherCost: "间接费用说明",
};

function normalized(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function cellText(worksheet: Worksheet, row: number, column: number): string {
  const cell = worksheet.getCell(row, column);
  const value = cell.isMerged ? cell.master.value : cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value && value.result !== undefined && value.result !== null) return String(value.result);
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return String(value);
}

export function columnNumberToName(column: number): string {
  let remaining = column;
  let result = "";
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

export function parseCellRange(address: string): CellRange {
  const [startAddress, endAddress = startAddress] = address.split(":");
  const parse = (cellAddress: string): CellPoint => {
    const match = /^([A-Z]+)(\d+)$/i.exec(cellAddress);
    if (!match) throw new Error(`无法解析模板单元格地址：${cellAddress}`);
    const column = match[1].toUpperCase().split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
    return { row: Number(match[2]), column };
  };
  const start = parse(startAddress);
  const end = parse(endAddress);
  return { startRow: start.row, startColumn: start.column, endRow: end.row, endColumn: end.column };
}

function worksheetMerges(worksheet: Worksheet): CellRange[] {
  return (worksheet.model.merges ?? []).map(parseCellRange);
}

function mergedRangeContaining(worksheet: Worksheet, point: CellPoint): CellRange {
  return worksheetMerges(worksheet).find((range) => (
    point.row >= range.startRow && point.row <= range.endRow
    && point.column >= range.startColumn && point.column <= range.endColumn
  )) ?? { startRow: point.row, startColumn: point.column, endRow: point.row, endColumn: point.column };
}

function findCell(worksheet: Worksheet, text: string, bounds?: Partial<CellRange>): CellPoint {
  const target = normalized(text);
  let found: CellPoint | null = null;
  const startRow = bounds?.startRow ?? 1;
  const endRow = bounds?.endRow ?? worksheet.rowCount;
  const startColumn = bounds?.startColumn ?? 1;
  const endColumn = bounds?.endColumn ?? 12;
  for (let row = startRow; row <= endRow && !found; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      if (normalized(cellText(worksheet, row, column)) === target) {
        found = { row, column };
        break;
      }
    }
  }
  if (!found) throw new Error(`报价 Excel 模板缺少关键锚点：“${text}”`);
  return found;
}

function valueCellAfterLabel(worksheet: Worksheet, label: string): CellPoint {
  const labelCell = findCell(worksheet, label);
  const labelRange = mergedRangeContaining(worksheet, labelCell);
  return { row: labelCell.row, column: labelRange.endColumn + 1 };
}

function rowIsBlank(worksheet: Worksheet, row: number, lastColumn: number): boolean {
  for (let column = 1; column <= lastColumn; column += 1) {
    if (worksheet.getCell(row, column).value !== null) return false;
  }
  return true;
}

function sectionColumns(worksheet: Worksheet, key: TemplateSectionKey, anchorRow: number, dataStartRow: number): TemplateSection["columns"] {
  const bounds = { startRow: anchorRow + 1, endRow: dataStartRow - 1, startColumn: 1, endColumn: 12 };
  if (key === "fabric" || key === "trim") {
    const prefix = key === "fabric" ? "面料" : "辅料";
    const name = findCell(worksheet, `${prefix}品名`, bounds).column;
    const description = findCell(worksheet, `${prefix}说明`, bounds).column;
    const supplier = findCell(worksheet, "供应商", bounds).column;
    const initialUsage = mergedRangeContaining(worksheet, findCell(worksheet, "初步单耗", bounds));
    const unitPrice = findCell(worksheet, `${prefix}单价(RMB)`, bounds).column;
    const estimatedCost = findCell(worksheet, "评估成本(RMB/件)", bounds).column;
    const actualCost = findCell(worksheet, "实际成本(RMB/件)", bounds).column;
    return {
      name,
      description,
      supplier,
      initialUnit: initialUsage.startColumn,
      initialQuantity: initialUsage.endColumn,
      unitPrice,
      estimatedCost,
      actualCost,
    };
  }
  if (key === "labor" || key === "outsourcing") {
    const name = findCell(worksheet, "工序名称", bounds).column;
    const description = findCell(worksheet, "工序说明", bounds).column;
    const supplier = findCell(worksheet, "加工厂", bounds).column;
    const estimatedCost = findCell(worksheet, "RMB/件", bounds).column;
    const actualCost = findCell(worksheet, "USD/件", bounds).column;
    return { name, description, supplier, estimatedCost, actualCost };
  }
  return {
    name: findCell(worksheet, "费用项目", bounds).column,
    description: findCell(worksheet, "费用说明", bounds).column,
    estimatedCost: findCell(worksheet, "RMB/件", bounds).column,
    actualCost: findCell(worksheet, "实际成本", bounds).column,
  };
}

function parseSection(worksheet: Worksheet, key: TemplateSectionKey, nextAnchorRow: number, lastColumn: number): TemplateSection {
  const anchor = findCell(worksheet, REQUIRED_SECTION_ANCHORS[key]);
  const subtotal = findCell(worksheet, "小计", { startRow: anchor.row + 1, endRow: nextAnchorRow - 1, startColumn: 1, endColumn: lastColumn });
  let dataStartRow = -1;
  for (let row = anchor.row + 1; row < subtotal.row; row += 1) {
    if (rowIsBlank(worksheet, row, lastColumn)) {
      dataStartRow = row;
      break;
    }
  }
  if (dataStartRow < 0) throw new Error(`报价 Excel 模板“${REQUIRED_SECTION_ANCHORS[key]}”缺少标准数据行`);
  return {
    key,
    anchor,
    dataStartRow,
    subtotal,
    reservedCapacity: subtotal.row - dataStartRow,
    templateDataRow: dataStartRow,
    columns: sectionColumns(worksheet, key, anchor.row, dataStartRow),
  };
}

export function parseQuoteExportTemplateLayout(worksheet: Worksheet): QuoteExportTemplateLayout {
  const summaryAnchor = findCell(worksheet, "单件/制造总成本 - 预估/报价");
  const formalRange: CellRange = { startRow: 1, startColumn: 1, endRow: worksheet.rowCount, endColumn: 12 };
  const sectionAnchors = Object.fromEntries(Object.entries(REQUIRED_SECTION_ANCHORS).map(([key, label]) => [key, findCell(worksheet, label)])) as Record<TemplateSectionKey, CellPoint>;
  const orderedKeys: TemplateSectionKey[] = ["fabric", "trim", "labor", "outsourcing", "otherCost"];
  const sections = {} as Record<TemplateSectionKey, TemplateSection>;
  orderedKeys.forEach((key, index) => {
    const nextRow = index + 1 < orderedKeys.length ? sectionAnchors[orderedKeys[index + 1]].row : summaryAnchor.row;
    sections[key] = parseSection(worksheet, key, nextRow, formalRange.endColumn);
  });
  const styleImageLabel = findCell(worksheet, "款式图片", { startRow: summaryAnchor.row, endRow: formalRange.endRow, startColumn: 1, endColumn: formalRange.endColumn });
  const styleImageArea = mergedRangeContaining(worksheet, { row: styleImageLabel.row + 1, column: styleImageLabel.column });
  if (styleImageArea.startRow !== styleImageLabel.row + 1) throw new Error("报价 Excel 模板的款式图片区结构无效");
  return {
    formalRange,
    sections,
    base: {
      brand: valueCellAfterLabel(worksheet, "品牌："),
      styleName: valueCellAfterLabel(worksheet, "款式名称："),
      garmentLeadDate: valueCellAfterLabel(worksheet, "成衣交期："),
      quoteStyleNo: valueCellAfterLabel(worksheet, "报价款号："),
      quantity: valueCellAfterLabel(worksheet, "数量："),
      quoteDate: valueCellAfterLabel(worksheet, "报价日期："),
    },
    summary: {
      anchor: summaryAnchor,
      preMarkupTotal: valueCellAfterLabel(worksheet, "利润前总成本"),
      markupRate: valueCellAfterLabel(worksheet, "成本加成率"),
      garmentSellingPrice: valueCellAfterLabel(worksheet, "成衣销售单价"),
      finalQuote: valueCellAfterLabel(worksheet, "最终报价"),
      customerTargetPrice: valueCellAfterLabel(worksheet, "客户目标价"),
      customerConfirmedPrice: valueCellAfterLabel(worksheet, "客户确认价"),
      styleImageLabel,
      styleImageArea,
    },
  };
}

export function createExpandedRowPlan(
  layout: QuoteExportTemplateLayout,
  rowCounts: Record<TemplateSectionKey, number>,
): ExpandedRowPlan {
  const extraBySubtotal = new Map<number, { key: TemplateSectionKey; count: number; sourceStyleRow: number }>();
  (Object.keys(layout.sections) as TemplateSectionKey[]).forEach((key) => {
    const section = layout.sections[key];
    extraBySubtotal.set(section.subtotal.row, {
      key,
      count: Math.max(0, rowCounts[key] - section.reservedCapacity),
      sourceStyleRow: section.templateDataRow,
    });
  });
  const rowMap = new Map<number, number>();
  const insertedRows: ExpandedRowPlan["insertedRows"] = [];
  let destinationRow = 0;
  for (let sourceRow = layout.formalRange.startRow; sourceRow <= layout.formalRange.endRow; sourceRow += 1) {
    const insertion = extraBySubtotal.get(sourceRow);
    if (insertion) {
      for (let index = 0; index < insertion.count; index += 1) {
        destinationRow += 1;
        insertedRows.push({ section: insertion.key, sourceStyleRow: insertion.sourceStyleRow, destinationRow });
      }
    }
    destinationRow += 1;
    rowMap.set(sourceRow, destinationRow);
  }
  const mapRow = (sourceRow: number): number => {
    const mapped = rowMap.get(sourceRow);
    if (!mapped) throw new Error(`模板行 ${sourceRow} 无法映射到导出工作表`);
    return mapped;
  };
  const sectionDestinations = {} as ExpandedRowPlan["sections"];
  (Object.keys(layout.sections) as TemplateSectionKey[]).forEach((key) => {
    const section = layout.sections[key];
    sectionDestinations[key] = {
      dataStartRow: mapRow(section.dataStartRow),
      subtotalRow: mapRow(section.subtotal.row),
      capacity: Math.max(section.reservedCapacity, rowCounts[key]),
    };
  });
  return {
    rowMap,
    insertedRows,
    lastRow: destinationRow,
    sections: sectionDestinations,
    styleImageArea: {
      ...layout.summary.styleImageArea,
      startRow: mapRow(layout.summary.styleImageArea.startRow),
      endRow: mapRow(layout.summary.styleImageArea.endRow),
    },
  };
}
