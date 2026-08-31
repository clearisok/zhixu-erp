import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";

import { buildQuoteExcel } from "../features/quote-center/export/quote-excel-exporter.ts";
import { formatFinalQuote, quoteExportFileName, sanitizeSheetName, uniqueSheetName } from "../features/quote-center/export/quote-export-formatters.ts";
import { calculateContainedImageLayout } from "../features/quote-center/export/quote-image-layout.ts";
import { fabricDescription, mapPriceVersionForExport } from "../features/quote-center/export/quote-export-mappers.ts";
import { createExpandedRowPlan, parseQuoteExportTemplateLayout } from "../features/quote-center/export/quote-export-template-layout.ts";
import { nullablePriceVersionMetrics } from "../features/quote-center/model/quote-presentation.ts";
import { truncateFinalQuoteValue } from "../features/quote-center/model/final-quote-format.ts";
import { quoteFixtures } from "../features/quote-center/fixtures/quote-fixtures.ts";

const templateUrl = new URL("../templates/quote-export-template-v1.xlsx", import.meta.url);
const templateBytes = await readFile(templateUrl);
const templateArrayBuffer = templateBytes.buffer.slice(templateBytes.byteOffset, templateBytes.byteOffset + templateBytes.byteLength);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stressRevision() {
  const revision = clone(quoteFixtures[0].revisions.find((item) => item.revisionId === "quote-001-v2"));
  const base = clone(revision.priceVersions[0]);
  base.name = "基础/价格";
  base.fabrics = Array.from({ length: 7 }, (_, index) => ({
    ...clone(base.fabrics[index % base.fabrics.length]),
    id: `stress-fabric-${index}`,
    name: index === 0 ? "超长面料名称用于验证正式报价模板动态换行能力" : `面料 ${index + 1}`,
    composition: index === 0 ? "100% Cotton 高支精梳长绒棉并包含非常长的工艺、门幅、克重和损耗说明用于验证自动换行与行高增长" : "100% Cotton",
    purchaseUnit: index === 1 ? "meter" : "kg",
  }));
  base.trims = Array.from({ length: 10 }, (_, index) => ({
    ...clone(base.trims[index % base.trims.length]),
    id: `stress-trim-${index}`,
    name: `辅料 ${index + 1}`,
    specification: index === 0 ? "超长辅料规格说明，包含材质、颜色、尺寸、包装方式、环保标准与供应商特别要求，用于验证内容不会被截断" : `规格 ${index + 1}`,
    usage: index === 8 ? null : index === 9 ? 0 : 1,
    unitPrice: index === 9 ? 0 : 0.25 + index / 100,
  }));
  base.otherCosts = Array.from({ length: 5 }, (_, index) => ({
    id: `stress-other-${index}`,
    name: index % 2 ? `手工费用 ${index + 1}` : `全局费用 ${index + 1}`,
    specification: `费用说明 ${index + 1}`,
    usage: 1,
    unit: "件",
    lossRate: 0,
    unitPrice: index + 0.5,
    amount: index + 0.5,
    source: index % 2 ? "manual" : "global",
    globalSettingId: index % 2 ? undefined : `global-${index}`,
  }));
  const second = clone(base);
  second.id = "stress-second";
  second.name = "基础:价格";
  second.confirmation = null;
  revision.priceVersions = [base, second];
  return revision;
}

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

async function templateLayout() {
  const workbook = await loadWorkbook(templateArrayBuffer);
  return parseQuoteExportTemplateLayout(workbook.worksheets[0]);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("R1-R4 PriceVersion 按名称生成 Sheet，并处理非法字符、长度和同名", async () => {
  const revision = stressRevision();
  const one = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision, priceVersions: [revision.priceVersions[0]], now: new Date(2026, 7, 22) });
  assert.deepEqual(one.diagnostics.sheetNames, ["基础 价格"]);
  const many = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision, priceVersions: revision.priceVersions, now: new Date(2026, 7, 22) });
  assert.deepEqual(many.diagnostics.sheetNames, ["基础 价格", "基础 价格 (2)"]);
  assert.equal(sanitizeSheetName("a/b?c*d[e]f:g"), "a b c d e f g");
  const names = new Set();
  assert.equal(uniqueSheetName("123456789012345678901234567890123", names).length, 31);
});

test("R5-R10 五个成本区可同时扩容并整体移动下方锚点", async () => {
  const layout = await templateLayout();
  const plan = createExpandedRowPlan(layout, { fabric: 7, trim: 10, labor: 5, outsourcing: 3, otherCost: 5 });
  assert.equal(plan.sections.fabric.capacity, 7);
  assert.equal(plan.sections.trim.capacity, 10);
  assert.equal(plan.sections.labor.capacity, 5);
  assert.equal(plan.sections.outsourcing.capacity, 3);
  assert.equal(plan.sections.otherCost.capacity, 5);
  assert.ok(plan.sections.trim.dataStartRow > layout.sections.trim.dataStartRow);
  assert.ok(plan.sections.otherCost.subtotalRow < plan.styleImageArea.startRow);
  assert.equal(plan.lastRow, 60);
});

test("R11-R13 新增行继承格式，长说明开启换行并增加行高", async () => {
  const revision = stressRevision();
  const result = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision, priceVersions: [revision.priceVersions[0]] });
  const workbook = await loadWorkbook(result.buffer);
  const sheet = workbook.worksheets[0];
  const layout = await templateLayout();
  const data = mapPriceVersionForExport(revision.priceVersions[0], revision);
  const plan = createExpandedRowPlan(layout, { fabric: data.fabricRows.length, trim: data.trimRows.length, labor: data.laborRows.length, outsourcing: 0, otherCost: data.otherCostRows.length });
  const first = sheet.getCell(plan.sections.fabric.dataStartRow, 1);
  const inserted = sheet.getCell(plan.sections.fabric.dataStartRow + 6, 1);
  assert.deepEqual(inserted.border, first.border);
  assert.deepEqual(inserted.fill, first.fill);
  assert.equal(sheet.getCell(plan.sections.fabric.dataStartRow, layout.sections.fabric.columns.description).alignment.wrapText, true);
  assert.equal(sheet.getCell(plan.sections.fabric.dataStartRow, layout.sections.fabric.columns.description).font.name, "宋体");
  assert.equal(sheet.getCell(plan.sections.fabric.dataStartRow, layout.sections.fabric.columns.description).font.size, 9);
  assert.equal(sheet.getCell(plan.sections.fabric.dataStartRow + 6, layout.sections.fabric.columns.description).font.name, "宋体");
  assert.equal(sheet.getCell(plan.sections.fabric.dataStartRow + 6, layout.sections.fabric.columns.description).font.size, 9);
  assert.ok(sheet.getRow(plan.sections.fabric.dataStartRow).height > 24);
});

test("R38-R43 面料说明只组合成分、净门幅和克重，空字段不产生垃圾分隔符", () => {
  const revision = stressRevision();
  const line = clone(revision.priceVersions[0].fabrics[0]);
  line.composition = "100% Cotton";
  line.segmentLengthCm = 72;
  line.netWidthCm = 145;
  line.gsm = 180;
  line.lossRate = 8;
  assert.equal(fabricDescription(line), "100% Cotton / 净门幅 145cm / 克重 180gsm");
  assert.doesNotMatch(fabricDescription(line), /段长|损耗/);
  line.netWidthCm = null;
  assert.equal(fabricDescription(line), "100% Cotton / 克重 180gsm");
  line.composition = "  ";
  line.gsm = null;
  assert.equal(fabricDescription(line), "");
  assert.doesNotMatch(fabricDescription(line), /undefined|null|\/\s*\/|^\s*\/|\/\s*$/);
});

test("R14-R18 null 保持空白、明确 0 保持为 0，并按采购单位逐条导出成本", async () => {
  const revision = stressRevision();
  const data = mapPriceVersionForExport(revision.priceVersions[0], revision);
  assert.equal(data.fabricRows[0].unit, "kg");
  assert.equal(data.fabricRows[1].unit, "m");
  assert.equal(data.trimRows[8].quantity, null);
  assert.equal(data.trimRows[9].quantity, 0);
  assert.equal(data.otherCostRows.length, 5);
  assert.ok(data.otherCostRows.some((row) => row.name.startsWith("全局费用")));
  assert.ok(data.otherCostRows.some((row) => row.name.startsWith("手工费用")));
  const result = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision, priceVersions: [revision.priceVersions[0]] });
  const workbook = await loadWorkbook(result.buffer);
  const sheet = workbook.worksheets[0];
  const layout = await templateLayout();
  const plan = createExpandedRowPlan(layout, { fabric: 7, trim: 10, labor: 1, outsourcing: 0, otherCost: 5 });
  const fabricQuantityColumn = layout.sections.fabric.columns.initialQuantity;
  const firstFabricQuantity = sheet.getCell(plan.sections.fabric.dataStartRow, fabricQuantityColumn);
  const insertedFabricQuantity = sheet.getCell(plan.sections.fabric.dataStartRow + 6, fabricQuantityColumn);
  assert.equal(typeof firstFabricQuantity.value, "number");
  assert.equal(firstFabricQuantity.value, data.fabricRows[0].quantity);
  assert.equal(firstFabricQuantity.numFmt, "0.0000");
  assert.equal(typeof insertedFabricQuantity.value, "number");
  assert.equal(insertedFabricQuantity.value, data.fabricRows[6].quantity);
  assert.equal(insertedFabricQuantity.numFmt, "0.0000");
  const trimQuantityColumn = layout.sections.trim.columns.initialQuantity;
  assert.equal(sheet.getCell(plan.sections.trim.dataStartRow + 8, trimQuantityColumn).value, null);
  assert.equal(sheet.getCell(plan.sections.trim.dataStartRow + 9, trimQuantityColumn).value, 0);
});

test("R19-R24 汇总沿用系统 Metrics、加成率为百分比、最终报价一位小数且确认价不串版本", async () => {
  const revision = stressRevision();
  const version = revision.priceVersions[0];
  const data = mapPriceVersionForExport(version, revision);
  const metrics = nullablePriceVersionMetrics(version);
  assert.equal(data.summary.garmentSellingPrice, metrics.garmentSellingPrice);
  assert.equal(data.summary.preMarkupTotal, metrics.preMarkupTotal);
  assert.equal(formatFinalQuote(88), "FOB RMB 88.0");
  assert.equal(formatFinalQuote(88.24), "FOB RMB 88.2");
  assert.equal(formatFinalQuote(88.25), "FOB RMB 88.2");
  assert.equal(mapPriceVersionForExport(revision.priceVersions[1], revision).summary.customerConfirmedPrice, null);
  const result = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision, priceVersions: [version] });
  const workbook = await loadWorkbook(result.buffer);
  const sheet = workbook.worksheets[0];
  const layout = await templateLayout();
  const plan = createExpandedRowPlan(layout, { fabric: 7, trim: 10, labor: 1, outsourcing: 0, otherCost: 5 });
  const markup = plan.rowMap.get(layout.summary.markupRate.row);
  const price = plan.rowMap.get(layout.summary.garmentSellingPrice.row);
  const final = plan.rowMap.get(layout.summary.finalQuote.row);
  assert.equal(sheet.getCell(markup, layout.summary.markupRate.column).value, version.pricingParameters.markupRate / 100);
  assert.equal(sheet.getCell(price, layout.summary.garmentSellingPrice.column).value, truncateFinalQuoteValue(metrics.garmentSellingPrice));
  assert.match(String(sheet.getCell(final, layout.summary.finalQuote.column).value), /^FOB RMB \d+\.\d$/);
  assert.equal(sheet.getCell(plan.sections.labor.subtotalRow, layout.sections.labor.columns.actualCost).value, null);
  assert.equal(sheet.getCell(plan.sections.outsourcing.subtotalRow, layout.sections.outsourcing.columns.actualCost).value, null);
  const quoteDate = sheet.getCell(plan.rowMap.get(layout.base.quoteDate.row), layout.base.quoteDate.column).value;
  assert.equal(quoteDate.getUTCDate(), 17);
});

test("R25-R31 款式图 contain 计算覆盖横图、竖图、方图，并随动态区域移动", async () => {
  for (const [width, height] of [[1200, 600], [600, 1200], [800, 800]]) {
    const image = calculateContainedImageLayout(width, height, 240, 180);
    assert.ok(image.width <= 224 && image.height <= 164);
    assert.ok(Math.abs(image.width / image.height - width / height) < 1e-10);
    assert.ok(image.offsetX >= 0 && image.offsetY >= 0);
  }
  const revision = stressRevision();
  const image = { base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", extension: "png", width: 1200, height: 600 };
  const withImage = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision, priceVersions: [revision.priceVersions[0]], styleImage: image });
  const imageWorkbook = await loadWorkbook(withImage.buffer);
  assert.equal(imageWorkbook.worksheets[0].getImages().length, 1);
  const withoutImage = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision, priceVersions: [revision.priceVersions[0]], styleImage: null });
  const blankWorkbook = await loadWorkbook(withoutImage.buffer);
  assert.equal(blankWorkbook.worksheets[0].getImages().length, 0);
  const layout = await templateLayout();
  const blankPlan = createExpandedRowPlan(layout, { fabric: 7, trim: 10, labor: 1, outsourcing: 0, otherCost: 5 });
  for (let row = blankPlan.styleImageArea.startRow; row <= blankPlan.styleImageArea.endRow; row += 1) {
    for (let column = blankPlan.styleImageArea.startColumn; column <= blankPlan.styleImageArea.endColumn; column += 1) assert.equal(blankWorkbook.worksheets[0].getCell(row, column).value, null);
  }
  const expanded = createExpandedRowPlan(layout, { fabric: 7, trim: 10, labor: 5, outsourcing: 3, otherCost: 5 });
  assert.ok(expanded.styleImageArea.startRow > layout.summary.styleImageArea.startRow);
});

test("R32 历史 Revision 导出使用被查看的历史快照", async () => {
  const quote = clone(quoteFixtures[0]);
  const historical = quote.revisions.find((revision) => revision.revisionId === "quote-001-v1");
  const current = quote.revisions.find((revision) => revision.revisionId === quote.defaultRevisionId);
  assert.notEqual(historical.revisionId, current.revisionId);
  const result = await buildQuoteExcel({ template: templateArrayBuffer, quote, revision: historical, priceVersions: historical.priceVersions, now: new Date(2026, 7, 22) });
  assert.match(result.fileName, /_V1_20260822\.xlsx$/);
  const workbook = await loadWorkbook(result.buffer);
  const layout = await templateLayout();
  const plan = createExpandedRowPlan(layout, { fabric: 2, trim: 2, labor: 1, outsourcing: 0, otherCost: 1 });
  assert.equal(workbook.worksheets[0].getCell(plan.rowMap.get(layout.summary.customerConfirmedPrice.row), layout.summary.customerConfirmedPrice.column).value, null);
});

test("R33-R34 dirty Modal 提供三按钮，保存成功后才调用导出", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const modal = await readFile(new URL("../features/quote-center/components/quote-export-modal.tsx", import.meta.url), "utf8");
  assert.match(modal, /取消/);
  assert.match(modal, /导出已保存版本/);
  assert.match(modal, /保存并导出/);
  const saveAndExport = editor.slice(editor.indexOf("const saveAndExportRevision"), editor.indexOf("const saveAndNavigate"));
  const executeExport = editor.slice(editor.indexOf("const executeExport"), editor.indexOf("const exportCurrentRevision"));
  assert.match(saveAndExport, /await requestPersist\("export"\)/);
  assert.ok(executeExport.indexOf("await resolveTarget()") < executeExport.indexOf("await runExcelExport"));
});

test("R35-R37 模板 hash 不变、输出无公式错误且 Print Area 仅覆盖 A:L", async () => {
  const before = sha256(templateBytes);
  const revision = stressRevision();
  const result = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision, priceVersions: revision.priceVersions, now: new Date(2026, 7, 22) });
  const after = sha256(await readFile(templateUrl));
  assert.equal(after, before);
  const workbook = await loadWorkbook(result.buffer);
  assert.equal(workbook.worksheets.length, 2);
  for (const sheet of workbook.worksheets) {
    assert.match(sheet.pageSetup.printArea, /^A1:L\d+$/);
    assert.ok(!sheet.name.toLowerCase().includes("sheet1"));
    sheet.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      assert.notEqual(cell.type, ExcelJS.ValueType.Error);
      assert.doesNotMatch(String(cell.value ?? ""), /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/);
    }));
  }
  assert.equal(quoteExportFileName(quoteFixtures[0], revision, new Date(2026, 7, 22)), "T2337_V2_20260822.xlsx");
});

test("R25-R29 CNY 只输出 RMB；USD 同时输出系统 RMB 与原始 USD，且 null/0 不混淆", async () => {
  const baseRevision = stressRevision();
  const version = baseRevision.priceVersions[0];
  version.labor.description = "车缝加工";
  version.pricingParameters.usdCnyRate = 7.29;

  version.pricingParameters.laborCurrency = "CNY";
  version.labor.value = 15.31;
  const cnyData = mapPriceVersionForExport(version, baseRevision);
  assert.equal(cnyData.laborRows[0].estimatedCost, 15.31);
  assert.equal(cnyData.laborRows[0].actualCost, null);
  const cnyResult = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision: baseRevision, priceVersions: [version] });
  const cnyWorkbook = await loadWorkbook(cnyResult.buffer);
  const layout = await templateLayout();
  const cnyPlan = createExpandedRowPlan(layout, { fabric: cnyData.fabricRows.length, trim: cnyData.trimRows.length, labor: 1, outsourcing: 0, otherCost: cnyData.otherCostRows.length });
  assert.equal(cnyWorkbook.worksheets[0].getCell(cnyPlan.sections.labor.dataStartRow, layout.sections.labor.columns.estimatedCost).value, 15.31);
  assert.equal(cnyWorkbook.worksheets[0].getCell(cnyPlan.sections.labor.dataStartRow, layout.sections.labor.columns.actualCost).value, null);

  version.pricingParameters.laborCurrency = "USD";
  version.labor.value = 2.10;
  const usdData = mapPriceVersionForExport(version, baseRevision);
  const systemMetrics = nullablePriceVersionMetrics(version);
  assert.equal(usdData.laborRows[0].estimatedCost, systemMetrics.laborRmb);
  assert.equal(usdData.laborRows[0].actualCost, 2.10);
  const usdResult = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision: baseRevision, priceVersions: [version] });
  const usdWorkbook = await loadWorkbook(usdResult.buffer);
  const usdPlan = createExpandedRowPlan(layout, { fabric: usdData.fabricRows.length, trim: usdData.trimRows.length, labor: 1, outsourcing: 0, otherCost: usdData.otherCostRows.length });
  const laborRow = usdPlan.sections.labor.dataStartRow;
  assert.equal(usdWorkbook.worksheets[0].getCell(laborRow, layout.sections.labor.columns.estimatedCost).value, systemMetrics.laborRmb);
  assert.equal(usdWorkbook.worksheets[0].getCell(laborRow, layout.sections.labor.columns.actualCost).value, 2.10);

  version.labor.value = null;
  assert.deepEqual(mapPriceVersionForExport(version, baseRevision).laborRows, [{
    name: "加工费", description: "车缝加工", supplier: "", unit: "RMB/件", quantity: null,
    unitPrice: null, estimatedCost: null, actualCost: null,
  }]);
  version.labor.value = 0;
  assert.equal(mapPriceVersionForExport(version, baseRevision).laborRows[0].actualCost, 0);

  const mapperSource = await readFile(new URL("../features/quote-center/export/quote-export-mappers.ts", import.meta.url), "utf8");
  const exporterSource = await readFile(new URL("../features/quote-center/export/quote-excel-exporter.ts", import.meta.url), "utf8");
  assert.doesNotMatch(`${mapperSource}\n${exporterSource}`, /revision\.pricingParameters/);
});

test("R30 加工费动态扩行后每行 RMB/USD 列仍写入对应导出值", async () => {
  const revision = stressRevision();
  const version = revision.priceVersions[0];
  const baseData = mapPriceVersionForExport(version, revision);
  const laborRows = Array.from({ length: 5 }, (_, index) => ({
    name: `工序 ${index + 1}`,
    description: `说明 ${index + 1}`,
    supplier: `工厂 ${index + 1}`,
    unit: "RMB/件",
    quantity: null,
    unitPrice: null,
    estimatedCost: 10 + index,
    actualCost: 1 + index / 10,
  }));
  const result = await buildQuoteExcel({
    template: templateArrayBuffer,
    quote: quoteFixtures[0],
    revision,
    priceVersions: [version],
    mapPriceVersion: () => ({ ...baseData, laborRows }),
  });
  const workbook = await loadWorkbook(result.buffer);
  const layout = await templateLayout();
  const plan = createExpandedRowPlan(layout, { fabric: baseData.fabricRows.length, trim: baseData.trimRows.length, labor: 5, outsourcing: 0, otherCost: baseData.otherCostRows.length });
  laborRows.forEach((row, index) => {
    const outputRow = plan.sections.labor.dataStartRow + index;
    assert.equal(workbook.worksheets[0].getCell(outputRow, layout.sections.labor.columns.estimatedCost).value, row.estimatedCost);
    assert.equal(workbook.worksheets[0].getCell(outputRow, layout.sections.labor.columns.actualCost).value, row.actualCost);
  });
});

test("每个 PriceVersion Sheet 使用自己的制作国家、币种、加成率和工价折算快照", async () => {
  const revision = stressRevision();
  const [cambodia, china] = revision.priceVersions;
  cambodia.name = "V1";
  cambodia.pricingParameters = { ...cambodia.pricingParameters, manufacturingCountry: "柬埔寨", manufacturingPresetName: "柬埔寨制作", laborCurrency: "USD", usdCnyRate: 6.7, markupRate: 5 };
  cambodia.labor = { ...cambodia.labor, value: 2.1 };
  china.name = "V2";
  china.pricingParameters = { ...china.pricingParameters, manufacturingCountry: "中国", manufacturingPresetName: "中国制作", laborCurrency: "CNY", markupRate: 13 };
  china.labor = { ...china.labor, value: 15.31 };
  const result = await buildQuoteExcel({ template: templateArrayBuffer, quote: quoteFixtures[0], revision, priceVersions: [cambodia, china] });
  const workbook = await loadWorkbook(result.buffer);
  const layout = await templateLayout();
  const cambodiaData = mapPriceVersionForExport(cambodia, revision);
  const chinaData = mapPriceVersionForExport(china, revision);
  assert.match(String(workbook.worksheets[0].getCell("A1").value), /柬埔寨/);
  assert.match(String(workbook.worksheets[1].getCell("A1").value), /中国/);
  for (const [index, version, data] of [[0, cambodia, cambodiaData], [1, china, chinaData]]) {
    const plan = createExpandedRowPlan(layout, { fabric: data.fabricRows.length, trim: data.trimRows.length, labor: data.laborRows.length, outsourcing: 0, otherCost: data.otherCostRows.length });
    const sheet = workbook.worksheets[index];
    assert.equal(sheet.getCell(plan.rowMap.get(layout.summary.markupRate.row), layout.summary.markupRate.column).value, version.pricingParameters.markupRate / 100);
    assert.equal(sheet.getCell(plan.sections.labor.dataStartRow, layout.sections.labor.columns.estimatedCost).value, data.summary.laborRmb);
    assert.equal(sheet.getCell(plan.sections.labor.dataStartRow, layout.sections.labor.columns.actualCost).value, version.pricingParameters.laborCurrency === "USD" ? version.labor.value : null);
  }
});
