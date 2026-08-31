import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { quoteFixtures } from "../features/quote-center/fixtures/quote-fixtures.ts";
import { buildQuoteSummaryExcel } from "../features/quote-center/export/quote-batch-exporter.ts";

test("T14-T20 Selection Mode 不永久显示 Checkbox，并支持当前筛选全选与退出清空", async () => {
  const list = await readFile(new URL("../features/quote-center/components/quote-list.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/quote-center/quote-center.css", import.meta.url), "utf8");
  assert.match(list, /selectionMode === "batch-export" && <Checkbox/);
  assert.match(list, /全选当前筛选结果/);
  assert.match(list, /setSelectionMode\(null\); setSelectedIds\(\[\]\)/);
  assert.match(css, /\.qc-checkbox \{ width: 18px; height: 18px;/);
  assert.match(css, /tbody tr\.is-selected td \{ background: #f0f8f4;/);
});

test("T24-T30 报价汇总每款一行复用可见列与 aggregate，每价格版本一行自动增加列", async () => {
  const quote = structuredClone(quoteFixtures[0]);
  const perQuote = await buildQuoteSummaryExcel({ quotes: [quote], visibleColumns: ["style", "quantity", "fabricCost", "garmentPrice"], rowMode: "quote", now: new Date("2026-08-22") });
  assert.equal(perQuote.rowCount, 1);
  assert.deepEqual(perQuote.headers, ["报价款号 / 款式", "总数量", "面料成本", "成衣销售单价"]);
  const perVersion = await buildQuoteSummaryExcel({ quotes: [quote], visibleColumns: ["style", "quantity", "fabricCost"], rowMode: "price-version", now: new Date("2026-08-22") });
  assert.equal(perVersion.rowCount, quote.revisions.find((item) => item.revisionId === quote.defaultRevisionId).priceVersions.length);
  assert.equal(perVersion.headers[1], "价格版本");
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(perVersion.buffer);
  assert.equal(workbook.worksheets[0].getRow(2).getCell(2).value, quote.revisions.find((item) => item.revisionId === quote.defaultRevisionId).priceVersions[0].name);
});

test("T31-T32 估算字段默认不导出，选择后无 EstimateCost 留空", async () => {
  const quote = structuredClone(quoteFixtures[1]);
  const normal = await buildQuoteSummaryExcel({ quotes: [quote], visibleColumns: ["quote"], rowMode: "quote" });
  assert.deepEqual(normal.headers, ["报价编号"]);
  const internal = await buildQuoteSummaryExcel({ quotes: [quote], visibleColumns: ["quote"], rowMode: "quote", estimateColumns: ["estimateTotal", "estimateRevision", "estimateDifference"] });
  assert.deepEqual(internal.headers.slice(-3), ["估算总成本", "估算成本来源报价版本", "销售价与估算成本差额"]);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(internal.buffer);
  assert.equal(workbook.worksheets[0].getRow(2).getCell(2).value, null);
});

test("T21-T23 ZIP 流程动态使用 JSZip、defaultRevisionId 和现有正式 exporter", async () => {
  const source = await readFile(new URL("../features/quote-center/export/quote-batch-exporter.ts", import.meta.url), "utf8");
  assert.match(source, /await import\("jszip"\)/);
  assert.match(source, /getDefaultRevision\(quote\)/);
  assert.match(source, /buildDefaultQuoteRevisionExcel/);
  assert.match(source, /success/); assert.match(source, /failed/);
});
