import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculatePriceVersionMetrics, copyPriceVersion } from "../features/quote-center/model/quote-calculations.ts";
import {
  applyGlobalCostsToCurrentQuote,
  applyGlobalCostsToPriceVersion,
  applyGlobalCostsToRevision,
  enabledGlobalCosts,
} from "../features/quote-center/model/quote-settings.ts";
import { createRevisionFromSnapshot } from "../features/quote-center/model/quote-workflows.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

const settings = (freight = 1.2, testing = 0.35) => ({ costs: [
  { id: "freight", name: "运费", amount: freight, enabled: true, note: "单件分摊" },
  { id: "testing", name: "测试费", amount: testing, enabled: true, note: "" },
  { id: "disabled", name: "停用费用", amount: 9, enabled: false, note: "" },
] });

function quoteWithTwoPrices() {
  const quote = createQuoteDraft("global-v2", "QT-GLOBAL-V2", "2026-08-21");
  const revision = getDefaultRevision(quote);
  const second = copyPriceVersion(revision.priceVersions[0], { id: "stripe", name: "彩条", quantity: 100, description: "" });
  quote.revisions[0] = { ...revision, priceVersions: [...revision.priceVersions, second] };
  return quote;
}

test("多条 enabled 全局费用同步当前 Revision 的所有 PriceVersion，并防止重复", () => {
  const quote = quoteWithTwoPrices();
  const once = applyGlobalCostsToCurrentQuote(quote, settings(), "sync-1");
  const twice = applyGlobalCostsToCurrentQuote(once, settings(), "sync-2");
  const revision = getDefaultRevision(twice);
  assert.equal(enabledGlobalCosts(settings()).length, 2);
  for (const version of revision.priceVersions) {
    assert.equal(version.otherCosts.length, 2);
    assert.deepEqual(version.otherCosts.map((line) => line.globalSettingId), ["freight", "testing"]);
    assert.equal(new Set(version.otherCosts.map((line) => line.globalSettingId)).size, 2);
  }
});

test("当前报价立即重算指标；global overridden 保留，未修改费用继续同步", () => {
  const initialized = applyGlobalCostsToCurrentQuote(quoteWithTwoPrices(), settings(), "initial");
  const current = getDefaultRevision(initialized);
  const first = current.priceVersions[0];
  const overridden = {
    ...initialized,
    revisions: initialized.revisions.map((revision) => revision.revisionId !== initialized.defaultRevisionId ? revision : ({
      ...revision,
      priceVersions: revision.priceVersions.map((version) => version.id !== first.id ? version : ({
        ...version,
        otherCosts: version.otherCosts.map((line) => line.globalSettingId === "freight" ? { ...line, unitPrice: 1.5, amount: 1.5, overridden: true } : line),
      })),
    })),
  };
  const synced = applyGlobalCostsToCurrentQuote(overridden, settings(1.3), "updated");
  const syncedRevision = getDefaultRevision(synced);
  const firstFreight = syncedRevision.priceVersions[0].otherCosts.find((line) => line.globalSettingId === "freight");
  const secondFreight = syncedRevision.priceVersions[1].otherCosts.find((line) => line.globalSettingId === "freight");
  assert.equal(firstFreight.unitPrice, 1.5);
  assert.equal(firstFreight.overridden, true);
  assert.equal(secondFreight.unitPrice, 1.3);
  const metrics = calculatePriceVersionMetrics(syncedRevision.priceVersions[1], "CNY", null, 0);
  assert.equal(metrics.otherCost, 1.65);
  assert.equal(metrics.garmentSellingPrice, 1.65);
});

test("停用或删除只移除未 override global 行，手工费用与 override 行共存", () => {
  const initialized = applyGlobalCostsToPriceVersion(getDefaultRevision(createQuoteDraft("disable", "QT-D", "2026-08-21")).priceVersions[0], settings(), "row");
  const mixed = {
    ...initialized,
    otherCosts: [
      ...initialized.otherCosts.map((line) => line.globalSettingId === "freight" ? { ...line, unitPrice: 1.5, amount: 1.5, overridden: true } : line),
      { id: "manual", name: "特殊包装费", specification: "", usage: 1, unit: "件", lossRate: 0, unitPrice: 0.8, amount: 0.8, source: "manual" },
    ],
  };
  const removed = applyGlobalCostsToPriceVersion(mixed, { costs: [] }, "disabled");
  assert.deepEqual(removed.otherCosts.map((line) => line.name), ["运费", "特殊包装费"]);
  assert.equal(removed.otherCosts[0].overridden, true);
  assert.equal(removed.otherCosts[1].source, "manual");
});

test("新 Quote、PriceVersion 与 Revision 继承当前全局费用，历史 Revision 不变", () => {
  const quote = createQuoteDraft("inherit", "QT-INHERIT", "2026-08-21");
  const initialRevision = applyGlobalCostsToRevision(getDefaultRevision(quote), settings(), "new-quote");
  const initializedQuote = { ...quote, revisions: [initialRevision] };
  assert.equal(initialRevision.priceVersions[0].otherCosts.length, 2);

  const copied = applyGlobalCostsToPriceVersion(
    copyPriceVersion(initialRevision.priceVersions[0], { id: "copy", name: "彩条", quantity: 10, description: "" }),
    settings(1.3),
    "new-price",
    { resetGlobalOverrides: true },
  );
  assert.equal(copied.otherCosts.find((line) => line.globalSettingId === "freight").unitPrice, 1.3);

  const v2Quote = createRevisionFromSnapshot(initializedQuote, {
    sourceRevisionId: initialRevision.revisionId,
    reason: "客户调价",
    note: "新版本",
    createdBy: "Alice",
    nowIso: "2026-08-21T02:00:00.000Z",
    revisionId: "inherit-v2",
  });
  const synced = applyGlobalCostsToCurrentQuote(v2Quote, settings(1.3), "new-revision");
  assert.equal(synced.revisions[0].priceVersions[0].otherCosts.find((line) => line.globalSettingId === "freight").unitPrice, 1.2);
  assert.equal(getDefaultRevision(synced).priceVersions[0].otherCosts.find((line) => line.globalSettingId === "freight").unitPrice, 1.3);
});

test("报价详情 Header 只显示款号与款式名称；Sticky 与列表维持原数据顺序", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const list = await readFile(new URL("../features/quote-center/components/quote-list.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/quote-center/quote-center.css", import.meta.url), "utf8");
  assert.match(editor, /baseInfo\.quoteStyleNo\.trim\(\).*"未填写款号"/);
  assert.match(editor, /baseInfo\.styleName\.trim\(\).*"未填写款式名称"/);
  assert.match(editor, /title=\{`\$\{pageTitle\} · \$\{pageSubtitle\}`\}/);
  assert.doesNotMatch(editor, /title=\{`\$\{quote\.quoteCode\}/);
  assert.match(editor, /qc-header-version-state/);
  assert.match(editor, /<strong>\{pageTitle\}<\/strong><small>\{pageSubtitle\}<\/small>/);
  assert.ok(list.indexOf("quoteStyleNo") < list.indexOf("styleName"));
  assert.match(css, /\.qc-sticky-header > div small/);
  assert.match(css, /\.qc-title-sentinel \.qc-page-header p/);
});
