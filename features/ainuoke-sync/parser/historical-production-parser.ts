import ExcelJS from "exceljs";
import type { OperationsSettingsState, OutsourceFactory, ProductionGroup } from "../../operations-settings/model/operations-settings.ts";
import { DEFAULT_CAMBODIA_SITE_ID } from "../../operations-settings/model/operations-settings.ts";
import { getCurrentPriceVersion, type SalesOrder } from "../../order-center/model/order.ts";
import type { ClosingAllocation, ClosingState } from "../../closing-center/model/closing.ts";
import type { ProductionSchedulingState, ScheduleAssignment } from "../../production-scheduling/model/production-scheduling.ts";
import type { AinuokeImportReview } from "../model/ainuoke.ts";
import { normalizeBrandText, normalizeStyleNo } from "../model/style-normalizer.ts";
import { stableSourceHash } from "./ainuoke-excel-parser.ts";

type SourceRow = { sourceFile: string; sourceSheet: string; sourceRow: number; sourceHash: string };
export type HistoricalScheduleRow = SourceRow & { executionType: "internal" | "outsource"; executorName: string; brand: string; styleNo: string; quantity: number; plannedStartDate: string | null; plannedEndDate: string | null; productionDays: number; averageDailyOutput: number | null; outsourceUnitPrice: number | null; colorHint: string; remark: string; dateCorrected: boolean };
export type HistoricalClosingRow = SourceRow & { month: string; executionType: "internal" | "outsource" | null; executorName: string | null; brand: string; styleNo: string; colorHint: string; quantity: number; customerProcessingUnitPrice: number; outsourceUnitPrice: number | null; shipmentDate: string | null; remark: string };
export type HistoricalImportReport = { scheduleSourceRows: number; scheduleMatched: number; scheduleUnresolved: number; scheduleAdded: number; scheduleInvalidExistingRemoved: number; productionGroupMatches: number; outsourceFactoryMatches: number; closingSourceRows: number; closingMatched: number; closingUnresolved: number; closingAdded: number; closingInvalidExistingRemoved: number; closingOutsourceMissingFactoryReview: number; closingAmbiguousReview: number; closingNoContractReview: number; correctedDateCount: number };
export type HistoricalImportResult = { scheduling: ProductionSchedulingState; closing: ClosingState; settings: OperationsSettingsState; reviews: AinuokeImportReview[]; report: HistoricalImportReport };

const richText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("result" in value) return richText(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text.trim();
  }
  return String(value).trim();
};
const numeric = (value: ExcelJS.CellValue): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = richText(value).replaceAll(",", "").trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?-\d+(?:\.\d+)?$/.test(raw)) return Number(raw.split("-").at(-1));
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const isoDate = (value: ExcelJS.CellValue): string | null => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  const raw = richText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};
const addYear = (date: string) => `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;
const correctCrossYear = (start: string | null, end: string | null) => start && end && end < start && Number(start.slice(5, 7)) >= 9 && Number(end.slice(5, 7)) <= 3 ? { end: addYear(end), corrected: true } : { end, corrected: false };
const load = async (buffer: ArrayBuffer) => { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer); return workbook; };
const columns = (row: ExcelJS.Row) => { const map = new Map<string, number>(); row.eachCell({ includeEmpty: false }, (cell, column) => map.set(richText(cell.value).replaceAll(/\s+/g, ""), column)); return map; };
const findColumn = (map: Map<string, number>, names: string[], fallback = 0) => [...map].find(([header]) => names.some((name) => header.includes(name)))?.[1] ?? fallback;
const cellValue = (row: ExcelJS.Row, column: number): ExcelJS.CellValue => column > 0 ? row.getCell(column).value : null;
const source = (file: string, sheet: string, row: number, values: Array<string | number | null>): SourceRow => ({ sourceFile: file, sourceSheet: sheet, sourceRow: row, sourceHash: stableSourceHash([file, sheet, row, ...values]) });

export async function parseHistoricalScheduleWorkbook(buffer: ArrayBuffer, fileName: string): Promise<HistoricalScheduleRow[]> {
  const workbook = await load(buffer); const result: HistoricalScheduleRow[] = [];
  for (const sheet of workbook.worksheets) {
    const isInternal = sheet.name === "计划1"; const isOutsource = ["艺丰", "锦新", "PT"].includes(sheet.name);
    if (!isInternal && !isOutsource) continue;
    let headerRow = 0; let header = new Map<string, number>();
    for (let rowNo = 1; rowNo <= Math.min(10, sheet.rowCount); rowNo += 1) { const candidate = columns(sheet.getRow(rowNo)); if (findColumn(candidate, ["款号"]) && findColumn(candidate, ["数量"])) { headerRow = rowNo; header = candidate; break; } }
    if (!headerRow) continue;
    const styleCol = findColumn(header, ["款号"]); const brandCol = findColumn(header, ["客户"]); const groupCol = findColumn(header, ["组别", "工厂"]);
    const quantityCol = findColumn(header, isInternal ? ["排入产量"] : ["数量"], findColumn(header, ["数量"]));
    const startCol = findColumn(header, ["上线时间"]); const endCol = findColumn(header, ["下线时间"]); const daysCol = findColumn(header, ["天"]); const averageCol = findColumn(header, ["平均日产"]); const noteCol = findColumn(header, ["备注"]);
    for (let rowNo = headerRow + 1; rowNo <= sheet.rowCount; rowNo += 1) {
      const row = sheet.getRow(rowNo); const styleNo = richText(cellValue(row, styleCol)); const quantity = numeric(cellValue(row, quantityCol));
      if (!styleNo || quantity === null || quantity <= 0) continue;
      const start = isoDate(cellValue(row, startCol)); const corrected = correctCrossYear(start, isoDate(cellValue(row, endCol)));
      const days = numeric(cellValue(row, daysCol)); const average = numeric(cellValue(row, averageCol));
      const executorName = isInternal ? richText(cellValue(row, groupCol)) : sheet.name === "PT" ? richText(cellValue(row, groupCol)) || "PT" : sheet.name;
      const note = richText(cellValue(row, noteCol)); const outsourceUnitPrice = isOutsource ? numeric(cellValue(row, noteCol)) : null;
      const brand = richText(cellValue(row, brandCol)); const values = [executorName, brand, styleNo, quantity, start, corrected.end, days, average, note];
      result.push({ ...source(fileName, sheet.name, rowNo, values), executionType: isInternal ? "internal" : "outsource", executorName, brand, styleNo, quantity, plannedStartDate: start, plannedEndDate: corrected.end, productionDays: Math.max(1, Math.ceil(days ?? (average ? quantity / average : 1))), averageDailyOutput: average && average > 0 ? average : null, outsourceUnitPrice, colorHint: note, remark: note, dateCorrected: corrected.corrected });
    }
  }
  return result;
}

export async function parseHistoricalClosingWorkbook(buffer: ArrayBuffer, fileName: string): Promise<HistoricalClosingRow[]> {
  const workbook = await load(buffer); const result: HistoricalClosingRow[] = [];
  for (const sheet of workbook.worksheets) {
    if (!/^20\d{2}\.\d{2}$/.test(sheet.name)) continue;
    let headerRow = 0; let header = new Map<string, number>();
    for (let rowNo = 1; rowNo <= Math.min(10, sheet.rowCount); rowNo += 1) { const candidate = columns(sheet.getRow(rowNo)); if (findColumn(candidate, ["品牌"]) && findColumn(candidate, ["款号"]) && findColumn(candidate, ["加工单价"])) { headerRow = rowNo; header = candidate; break; } }
    if (!headerRow) continue;
    const brandCol = findColumn(header, ["品牌"]); const styleCol = findColumn(header, ["款号"]); const quantityCol = findColumn(header, ["数量"]); const priceCol = findColumn(header, ["加工单价"]); const shipmentCol = findColumn(header, ["出运日期"]); const groupCol = findColumn(header, ["组别"]); const noteCol = findColumn(header, ["备注"]);
    let outsource = false;
    for (let rowNo = headerRow + 1; rowNo <= sheet.rowCount; rowNo += 1) {
      const row = sheet.getRow(rowNo); const rowValues = Array.isArray(row.values) ? row.values : []; const rowText = rowValues.slice(1).map((value: ExcelJS.CellValue) => richText(value));
      if (rowText.some((value) => value.includes("外发工厂"))) { outsource = true; continue; }
      const styleNo = richText(cellValue(row, styleCol)); const brand = richText(cellValue(row, brandCol)); const quantity = numeric(cellValue(row, quantityCol)); const unitPrice = numeric(cellValue(row, priceCol));
      if (!styleNo || !brand || quantity === null || quantity <= 0 || unitPrice === null || unitPrice < 0 || styleNo.includes("合计")) continue;
      const executorName = outsource ? richText(cellValue(row, 8)) || null : richText(cellValue(row, groupCol)) || null;
      const externalPrice = outsource ? numeric(cellValue(row, 7)) : null; const colorHint = richText(cellValue(row, 9)); const remark = richText(cellValue(row, noteCol));
      result.push({ ...source(fileName, sheet.name, rowNo, [brand, styleNo, quantity, unitPrice, executorName, externalPrice]), month: sheet.name.replace(".", "-"), executionType: outsource ? "outsource" : executorName ? "internal" : null, executorName, brand, styleNo, colorHint, quantity, customerProcessingUnitPrice: unitPrice, outsourceUnitPrice: externalPrice, shipmentDate: isoDate(cellValue(row, shipmentCol)), remark });
    }
  }
  return result;
}

function matchOrder(styleNo: string, brand: string, quantity: number | null, orders: SalesOrder[]): { order: SalesOrder | null; candidates: SalesOrder[] } {
  const style = normalizeStyleNo(styleNo); const brandKey = normalizeBrandText(brand);
  const baseCandidates = orders.filter((order) => Boolean(order.salesContractNo) && normalizeStyleNo(order.styleNo).baseStyleKey === style.baseStyleKey);
  let candidates = baseCandidates.filter((order) => normalizeBrandText(order.brandNameSnapshot) === brandKey);
  // Brand is supporting evidence, not a hard identity key. Legacy sheets contain known
  // aliases/typos (for example MSD vs MSD-女装外销 and KAIBI vs KIABI). A unique
  // normalized style across all sales contracts is deterministic even when that label differs.
  if (!candidates.length && baseCandidates.length === 1) candidates = baseCandidates;
  if (candidates.length > 1) {
    const strict = candidates.filter((order) => normalizeStyleNo(order.styleNo).strictStyleKey === style.strictStyleKey); if (strict.length) candidates = strict;
  }
  if (candidates.length > 1 && quantity !== null) {
    const quantityMatched = candidates.filter((order) => order.initialQuantity + order.quantityChanges.reduce((sum, item) => sum + item.delta, 0) === quantity); if (quantityMatched.length) candidates = quantityMatched;
  }
  return { order: candidates.length === 1 ? candidates[0] : null, candidates };
}
const deterministicReview = (kind: "schedule_match" | "closing_match", row: SourceRow, candidates: SalesOrder[], reason: string, now: string): AinuokeImportReview => ({ id: `ainuoke-review-${kind}-${row.sourceHash}`, kind, sourceKey: `${row.sourceSheet}!${row.sourceRow}`, salesContractNo: null, candidateOrderIds: candidates.map((item) => item.id), reason, resolvedAt: null, resolvedBy: null, createdAt: now });
const ensureGroup = (settings: OperationsSettingsState, name: string, now: string): { settings: OperationsSettingsState; group: ProductionGroup } => {
  const existing = settings.productionGroups.find((item) => item.name.normalize("NFKC").trim() === name.normalize("NFKC").trim()); if (existing) return { settings, group: existing };
  const group: ProductionGroup = { id: `production-group-history-${stableSourceHash([name])}`, name, shortName: name, productionSiteId: settings.productionSites[0]?.id ?? DEFAULT_CAMBODIA_SITE_ID, enabled: true, sortOrder: settings.productionGroups.length + 1, remark: "历史排单导入", createdAt: now, updatedAt: now };
  return { settings: { ...settings, productionGroups: [...settings.productionGroups, group] }, group };
};
const ensureFactory = (settings: OperationsSettingsState, name: string, now: string): { settings: OperationsSettingsState; factory: OutsourceFactory } => {
  const existing = settings.outsourceFactories.find((item) => item.name.normalize("NFKC").trim() === name.normalize("NFKC").trim()); if (existing) return { settings, factory: existing };
  const factory: OutsourceFactory = { id: `outsource-factory-history-${stableSourceHash([name])}`, name, shortName: name, enabled: true, contactPerson: "", phone: "", remark: "历史生产数据导入", createdAt: now, updatedAt: now };
  return { settings: { ...settings, outsourceFactories: [...settings.outsourceFactories, factory] }, factory };
};

export function buildHistoricalProductionImport(input: { scheduleRows: HistoricalScheduleRow[]; closingRows: HistoricalClosingRow[]; orders: SalesOrder[]; scheduling: ProductionSchedulingState; closing: ClosingState; settings: OperationsSettingsState; actor: { id: string; name: string }; now?: string }): HistoricalImportResult {
  const now = input.now ?? new Date().toISOString(); let settings = structuredClone(input.settings); const scheduling = structuredClone(input.scheduling); const closing = structuredClone(input.closing); const reviews: AinuokeImportReview[] = [];
  const report: HistoricalImportReport = { scheduleSourceRows: input.scheduleRows.length, scheduleMatched: 0, scheduleUnresolved: 0, scheduleAdded: 0, scheduleInvalidExistingRemoved: 0, productionGroupMatches: 0, outsourceFactoryMatches: 0, closingSourceRows: input.closingRows.length, closingMatched: 0, closingUnresolved: 0, closingAdded: 0, closingInvalidExistingRemoved: 0, closingOutsourceMissingFactoryReview: 0, closingAmbiguousReview: 0, closingNoContractReview: 0, correctedDateCount: input.scheduleRows.filter((row) => row.dateCorrected).length };
  const linkedOrderIds = new Set(input.orders.filter((order) => Boolean(order.salesContractNo)).map((order) => order.id));
  const scheduleCountBeforeReconcile = scheduling.scheduleAssignments.length;
  scheduling.scheduleAssignments = scheduling.scheduleAssignments.filter((item) => !item.id.startsWith("schedule-history-") || linkedOrderIds.has(item.salesOrderId));
  report.scheduleInvalidExistingRemoved = scheduleCountBeforeReconcile - scheduling.scheduleAssignments.length;
  const closingCountBeforeReconcile = closing.allocations.length;
  closing.allocations = closing.allocations.filter((item) => !item.id.startsWith("closing-history-") || linkedOrderIds.has(item.salesOrderId));
  report.closingInvalidExistingRemoved = closingCountBeforeReconcile - closing.allocations.length;
  for (const row of input.scheduleRows) {
    const match = matchOrder(row.styleNo, row.brand, row.quantity, input.orders); if (!match.order) { report.scheduleUnresolved += 1; reviews.push(deterministicReview("schedule_match", row, match.candidates, match.candidates.length ? "历史排单存在多个候选" : "历史排单未找到唯一销售合同订单", now)); continue; }
    report.scheduleMatched += 1; let group: ProductionGroup | null = null; let factory: OutsourceFactory | null = null;
    if (row.executionType === "internal") { const ensured = ensureGroup(settings, row.executorName, now); settings = ensured.settings; group = ensured.group; report.productionGroupMatches += 1; }
    else { const ensured = ensureFactory(settings, row.executorName, now); settings = ensured.settings; factory = ensured.factory; report.outsourceFactoryMatches += 1; }
    const id = `schedule-history-${row.sourceHash}`; if (scheduling.scheduleAssignments.some((item) => item.id === id)) continue;
    const colorLine = match.order.orderColorLines.find((line) => row.colorHint.includes(line.colorName)) ?? null;
    const assignment: ScheduleAssignment = { id, salesOrderId: match.order.id, executionType: row.executionType, productionGroupId: group?.id ?? null, outsourceFactoryId: factory?.id ?? null, colorLineId: colorLine?.id ?? null, colorNameSnapshot: colorLine?.colorName ?? null, outsourceUnitPrice: row.outsourceUnitPrice, queueSequence: row.executionType === "internal" ? scheduling.scheduleAssignments.filter((item) => item.productionGroupId === group?.id).length + 1 : null, plannedQuantity: row.quantity, durationMode: row.averageDailyOutput ? "average_daily_output" : "workdays", averageDailyOutputSnapshot: row.averageDailyOutput, requiredWorkdays: row.productionDays, plannedStartDate: row.plannedStartDate, plannedEndDate: row.plannedEndDate, nonWorkingDayCount: 0, completedQuantity: 0, actualStartDate: null, actualCompletedDate: null, dateMode: "manual_fixed", status: "planned", remark: `${row.remark}${row.remark ? "；" : ""}来源 ${row.sourceSheet}!${row.sourceRow}`, createdAt: now, updatedAt: now, createdBy: input.actor.name, updatedBy: input.actor.name };
    scheduling.scheduleAssignments.push(assignment); report.scheduleAdded += 1;
  }
  for (const row of input.closingRows) {
    const match = matchOrder(row.styleNo, row.brand, null, input.orders); if (!match.order) { report.closingUnresolved += 1; if (match.candidates.length) report.closingAmbiguousReview += 1; else report.closingNoContractReview += 1; reviews.push(deterministicReview("closing_match", row, match.candidates, match.candidates.length ? "历史关账存在多个销售合同候选" : "历史关账未找到唯一销售合同订单", now)); continue; }
    if (row.executionType === "outsource" && !row.executorName) { report.closingUnresolved += 1; report.closingOutsourceMissingFactoryReview += 1; reviews.push(deterministicReview("closing_match", row, [match.order], "历史外发记录缺少可确定的外发厂快照", now)); continue; }
    report.closingMatched += 1;
    let period = closing.periods.find((item) => item.month === row.month);
    if (!period) { period = { id: `closing-period-history-${row.month}`, month: row.month, status: "locked", taxRateSnapshot: 13, remark: "历史生产预警 Sheet 导入", confirmedAt: now, confirmedBy: input.actor.id, confirmedByName: input.actor.name, lockedAt: now, lockedBy: input.actor.id, lockedByName: input.actor.name, reopenedAt: null, reopenedBy: null, reopenedByName: null, reopenReason: null, createdAt: now, updatedAt: now, createdBy: input.actor.id, createdByName: input.actor.name, updatedBy: input.actor.id, updatedByName: input.actor.name }; closing.periods.push(period); }
    const id = `closing-history-${row.sourceHash}`; if (closing.allocations.some((item) => item.id === id)) continue;
    let factory: OutsourceFactory | null = null; let group: ProductionGroup | null = null;
    if (row.executionType === "outsource" && row.executorName) { const ensured = ensureFactory(settings, row.executorName, now); settings = ensured.settings; factory = ensured.factory; }
    if (row.executionType === "internal" && row.executorName) { const ensured = ensureGroup(settings, row.executorName, now); settings = ensured.settings; group = ensured.group; }
    const price = getCurrentPriceVersion(match.order); const factoryPrice = match.order.factorySettlementUnitPrice ?? row.customerProcessingUnitPrice;
    const allocation: ClosingAllocation = { id, closingPeriodId: period.id, salesOrderId: match.order.id, scheduleAssignmentId: null, quantity: row.quantity, orderTypeSnapshot: match.order.orderType, salePriceSnapshot: price.salePrice, closingProcessingUnitPrice: row.customerProcessingUnitPrice, processingCurrencySnapshot: "USD", fxRateSnapshot: null, currencySnapshot: "USD", legacyFxRateApplied: false, salesContractNoSnapshot: match.order.salesContractNo, customerProcessingUnitPriceSnapshot: row.customerProcessingUnitPrice, purchasedTrimUnitCostSnapshot: match.order.purchasedTrimUnitCostSnapshot, factorySettlementUnitPriceSnapshot: factoryPrice, taxRateSnapshot: period.taxRateSnapshot, executionTypeSnapshot: row.executionType, productionGroupIdSnapshot: group?.id ?? null, productionGroupNameSnapshot: group?.name ?? null, outsourceFactoryIdSnapshot: factory?.id ?? null, outsourceFactoryNameSnapshot: factory?.name ?? null, scheduleBasisSnapshot: null, staleAcknowledgedFingerprint: null, staleAcknowledgedAt: null, staleAcknowledgedBy: null, staleAcknowledgedByName: null, staleAcknowledgedReason: null, remark: `${row.remark}${row.remark ? "；" : ""}历史来源 ${row.sourceSheet}!${row.sourceRow}`, status: "active", voidedAt: null, voidedBy: null, voidedByName: null, voidReason: null, createdAt: now, updatedAt: now, createdBy: input.actor.id, createdByName: input.actor.name, updatedBy: input.actor.id, updatedByName: input.actor.name };
    closing.allocations.push(allocation); report.closingAdded += 1;
  }
  return { scheduling, closing, settings, reviews, report };
}
