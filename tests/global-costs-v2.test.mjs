import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { copyPriceVersion } from "../features/quote-center/model/quote-calculations.ts";
import { applySystemDefaultsToNewQuoteRevision, GLOBAL_QUOTE_SETTINGS_STORAGE_KEY, loadGlobalQuoteSettings, normalizeGlobalQuoteSettings } from "../features/quote-center/model/quote-settings.ts";
import { createRevisionFromSnapshot } from "../features/quote-center/model/quote-workflows.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

const settings = (amount = 1.5) => normalizeGlobalQuoteSettings({
  defaultUsdCnyRate: 7.2,
  defaultMarkupRate: 9,
  defaultLaborCurrency: "USD",
  defaultOtherCost: { name: "包装杂费", amount },
  defaultLaborDescription: "裁剪、车缝、整烫、质检包装",
});

test("系统设置只保留一个默认其他费用，并兼容旧多条费用数据的首条启用项", () => {
  const migrated = normalizeGlobalQuoteSettings({ costs: [
    { id: "disabled", name: "停用", amount: 9, enabled: false },
    { id: "freight", name: " 运费 ", amount: 1.2, enabled: true },
    { id: "testing", name: "测试费", amount: 0.35, enabled: true },
  ] });
  assert.deepEqual(migrated.defaultOtherCost, { name: "运费", amount: 1.2 });
  assert.equal("costs" in migrated, false);
});

test("首次迁移报价设置时保留原基础设置中的系统默认参数", () => {
  const values = new Map([["zhixu.basic-settings.v1.5", JSON.stringify({ systemDefaults: {
    usdCnyRate: 7.28,
    markupRate: 11,
    laborCurrency: "USD",
    defaultOtherCost: { name: "旧包装费", amount: 1.8 },
  } })]]);
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  try {
    const migrated = loadGlobalQuoteSettings();
    assert.equal(migrated.defaultUsdCnyRate, 7.28);
    assert.equal(migrated.defaultMarkupRate, 11);
    assert.equal(migrated.defaultLaborCurrency, "USD");
    assert.deepEqual(migrated.defaultOtherCost, { name: "旧包装费", amount: 1.8 });
    assert.ok(values.has(GLOBAL_QUOTE_SETTINGS_STORAGE_KEY));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("系统报价默认参数只在新 Quote 初始化时形成快照", () => {
  const quote = createQuoteDraft("new-default", "QT-DEFAULT", "2026-08-24");
  const initialized = applySystemDefaultsToNewQuoteRevision(getDefaultRevision(quote), settings(), "new-default");
  assert.deepEqual(initialized.priceVersions[0].pricingParameters, {
    manufacturingCountry: "",
    manufacturingPresetId: null,
    manufacturingPresetName: "",
    laborCurrency: "USD",
    usdCnyRate: 7.2,
    markupRate: 9,
    includeFreight: false,
    freightName: "运费",
    freightAmount: null,
  });
  assert.equal(initialized.priceVersions[0].labor.description, "裁剪、车缝、整烫、质检包装");
  assert.equal(initialized.priceVersions[0].otherCosts.length, 1);
  assert.equal(initialized.priceVersions[0].otherCosts[0].amount, 1.5);
});

test("修改系统默认其他费用不会改写已有 Quote、复制 PriceVersion 或新 Revision", () => {
  const quote = createQuoteDraft("snapshot", "QT-SNAPSHOT", "2026-08-24");
  const initial = applySystemDefaultsToNewQuoteRevision(getDefaultRevision(quote), settings(1.5), "snapshot");
  const initializedQuote = { ...quote, revisions: [initial] };
  const copied = copyPriceVersion(initial.priceVersions[0], { id: "price-copy", name: "彩条", quantity: 100, description: "" });
  assert.equal(copied.otherCosts[0].amount, 1.5);
  const withRevision = createRevisionFromSnapshot(initializedQuote, { sourceRevisionId: initial.revisionId, reason: "客户调价", note: "", createdBy: "Alice", nowIso: "2026-08-24T02:00:00.000Z", revisionId: "snapshot-v2" });
  assert.equal(getDefaultRevision(withRevision).priceVersions[0].otherCosts[0].amount, 1.5);
  assert.equal(settings(2).defaultOtherCost.amount, 2);
  assert.equal(initializedQuote.revisions[0].priceVersions[0].otherCosts[0].amount, 1.5);
});

test("报价详情 Header 只显示款号与款式名称；Sticky 与列表维持原数据顺序", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const list = await readFile(new URL("../features/quote-center/components/quote-list.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/quote-center/quote-center.css", import.meta.url), "utf8");
  assert.match(editor, /baseInfo\.quoteStyleNo\.trim\(\).*"未填写款号"/);
  assert.match(editor, /baseInfo\.styleName\.trim\(\).*"未填写款式名称"/);
  assert.match(editor, /title=\{pageTitle\}/);
  assert.match(editor, /qc-quote-object-description[^>]*><strong>\{pageSubtitle\}<\/strong>/);
  assert.doesNotMatch(editor, /title=\{`\$\{quote\.quoteCode\}/);
  assert.doesNotMatch(editor, /qc-header-version-state/);
  assert.match(await readFile(new URL("../app/quote-center/responsive.css", import.meta.url), "utf8"), /qc-title-sentinel \.qc-page-header h1[^}]*white-space:\s*nowrap/);
  assert.match(editor, /<strong>\{pageTitle\}<\/strong><small>\{pageSubtitle\}.*revision\.baseInfo\.brandName/);
  assert.ok(list.indexOf("quoteStyleNo") < list.indexOf("styleName"));
  assert.match(css, /\.qc-sticky-header > \.qc-sticky-summary small/);
  assert.match(css, /\.qc-title-sentinel \.qc-page-header p/);
});
