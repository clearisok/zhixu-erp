import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createQuoteDraft, getCurrentRevision } from "../features/quote-center/model/quote-view-model.ts";
import { defaultQuoteSettings, normalizeQuoteSettings } from "../features/quote-center/model/quote-settings.ts";
import { applyCustomerConfirmation, createRevisionSnapshot, matchesQuoteSearch, tokenizeQuoteSearch, validateCustomerConfirmation } from "../features/quote-center/model/quote-workflows.ts";

test("搜索支持首尾空格、多空格、OR 与大小写不敏感", () => {
  assert.deepEqual(tokenizeQuoteSearch("  T2337   t1821  "), ["t2337", "t1821"]);
  assert.equal(matchesQuoteSearch("ZARA T2337 精梳棉", " T2337   T1821 "), true);
  assert.equal(matchesQuoteSearch("Massimo Dutti t1821 Polo", "T2337 T1821"), true);
  assert.equal(matchesQuoteSearch("OTHER-100", "T2337 T1821"), false);
});

test("列表字段设置被规范化并保留可选成本确认字段", () => {
  const settings = normalizeQuoteSettings({ visibleColumns: ["quote", "fabricCost", "trimCost", "confirmedLabor", "confirmedGarment"], newQuoteDefaults: { markupRate: 5, laborCurrency: "USD" } });
  assert.deepEqual(settings.visibleColumns, ["quote", "fabricCost", "trimCost", "confirmedLabor", "confirmedGarment"]);
  assert.deepEqual(settings.newQuoteDefaults, { markupRate: 5, laborCurrency: "USD" });
});

test("默认加成率只应用到以后新建的报价", () => {
  const existing = createQuoteDraft("existing", "QT-OLD", "2026-08-17", defaultQuoteSettings.newQuoteDefaults);
  const created = createQuoteDraft("new", "QT-NEW", "2026-08-17", { markupRate: 5, laborCurrency: "CNY" });
  assert.equal(getCurrentRevision(existing).priceVersions[0].pricingParameters.markupRate, null);
  assert.equal(getCurrentRevision(created).priceVersions[0].pricingParameters.markupRate, 5);
});

test("客户确认按经销与加工报价执行不同必填规则", () => {
  assert.notEqual(validateCustomerConfirmation("distribution", 10, null), null);
  assert.equal(validateCustomerConfirmation("distribution", 10, 20), null);
  assert.equal(validateCustomerConfirmation("processing", 10, null), null);
  assert.notEqual(validateCustomerConfirmation("processing", null, null), null);
});

test("确认保存在当前 Revision 的当前 PriceVersion 且不覆盖报价值", () => {
  const quote = createQuoteDraft("confirm", "QT-CONFIRM", "2026-08-17");
  const original = getCurrentRevision(quote).priceVersions[0];
  original.labor.value = 12;
  const confirmed = applyCustomerConfirmation(quote, original.id, 11.5, 30, "客户确认");
  const result = getCurrentRevision(confirmed).priceVersions[0];
  assert.equal(result.labor.value, 12);
  assert.equal(result.confirmation.confirmedLaborPrice, 11.5);
  assert.equal(result.confirmation.confirmedGarmentPrice, 30);
  assert.equal(result.confirmation.quotedLaborPrice, 12);
  assert.equal(confirmed.aggregateStatus, "confirmed");
});

test("版本更新保留 V1、创建完整独立 V2 并移动当前指针", () => {
  const quote = createQuoteDraft("revision", "QT-REV", "2026-08-17");
  const next = createRevisionSnapshot(quote, "调整报价", "测试用户", "2026-08-17T10:00:00Z", "revision-v2");
  assert.equal(next.revisions.length, 2);
  assert.equal(next.currentRevisionId, "revision-v2");
  assert.equal(next.revisions[0].revisionLabel, "V1");
  assert.equal(next.revisions[0].readOnly, true);
  assert.equal(next.revisions[1].revisionLabel, "V2");
  next.revisions[1].baseInfo.styleName = "只修改 V2";
  assert.equal(next.revisions[0].baseInfo.styleName, "");
});

test("Modal 只在打开状态变化时执行自动聚焦", async () => {
  const source = await readFile(new URL("../components/foundation/modal.tsx", import.meta.url), "utf8");
  const overlay = await readFile(new URL("../components/foundation/overlay.ts", import.meta.url), "utf8");
  assert.match(source, /useOverlayLifecycle\(\{ open, panelRef: panel, onClose \}\)/);
  assert.match(overlay, /onCloseRef\.current = onClose/);
  assert.match(overlay, /if \(!open\) return/);
  assert.doesNotMatch(overlay, /\[open, onClose\]/);
});
