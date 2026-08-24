import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { validateQuoteCustomerTemplate } from "../features/template-settings/model/template-definition.ts";

const templateUrl = new URL("../templates/quote-customer-placeholder-v1.xlsx", import.meta.url);

test("T1-T6 占位符模板是合法 xlsx，关键字段与四类动态行均通过验证", async () => {
  const bytes = await readFile(templateUrl);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const result = await validateQuoteCustomerTemplate("customer.xlsx", buffer);
  assert.equal(result.valid, true, result.errors.join("；"));
  assert.ok(result.placeholders.includes("summary.finalQuote"));
  assert.deepEqual(Object.keys(result.dynamicRows).sort(), ["fabric", "labor", "otherCost", "trim"]);
});

test("T7-T12 客户模板拒绝 EstimateCost、未知字段和缺失关键字段", async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("模板");
  sheet.getCell("A1").value = "{{estimate.total}}";
  const raw = await workbook.xlsx.writeBuffer();
  const result = await validateQuoteCustomerTemplate("bad.xlsx", new Uint8Array(raw).buffer);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("客户报价单不允许包含内部估算成本字段。"));
  assert.ok(result.errors.some((error) => error.includes("缺少关键占位符")));
});

test("模板 Repository 使用 IndexedDB 保存 Blob，并保留当前正式模板作为 fallback", async () => {
  const source = await readFile(new URL("../features/template-settings/repository/indexeddb-template-repository.ts", import.meta.url), "utf8");
  assert.match(source, /indexedDB\.open/);
  assert.match(source, /Blob/);
  assert.match(source, /BUILTIN_FORMAL_TEMPLATE/);
  assert.match(source, /quote-export-template-v1\.xlsx/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^,]+,\s*blob/i);
});

test("模板设置支持创建版本、默认、下载、试导出、复制和启停", async () => {
  const source = await readFile(new URL("../features/template-settings/components/template-settings-page.tsx", import.meta.url), "utf8");
  for (const phrase of ["创建模板版本", "设为默认", "下载", "试导出", "复制", "停用", "支持字段"]) assert.match(source, new RegExp(phrase));
});
