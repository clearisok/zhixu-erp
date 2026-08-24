import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyGlobalCostsToPriceVersion, defaultGlobalQuoteSettings, normalizeGlobalQuoteSettings } from "../features/quote-center/model/quote-settings.ts";
import { copyPriceVersion } from "../features/quote-center/model/quote-calculations.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";
import { removePriceVersion } from "../features/quote-center/model/quote-workflows.ts";

test("全局费用保存稳定 ID、名称、金额、启用状态和说明，并兼容旧单条设置", () => {
  const normalized = normalizeGlobalQuoteSettings({ costs: [
    { id: " freight ", enabled: true, name: "  运费  ", amount: 1.2, note: " 单件分摊 " },
    { id: "testing", enabled: false, name: "测试费", amount: 0.35 },
  ] });
  assert.deepEqual(normalized.costs, [
    { id: "freight", enabled: true, name: "运费", amount: 1.2, note: "单件分摊" },
    { id: "testing", enabled: false, name: "测试费", amount: 0.35, note: "" },
  ]);
  assert.equal(normalizeGlobalQuoteSettings({ otherCost: { enabled: true, name: "运费", amount: 1 } }).costs.length, 1);
  assert.deepEqual(defaultGlobalQuoteSettings.costs, []);
});

test("新价格版本按 globalSettingId 初始化全局费用，不覆盖同名手工费用或来源快照", () => {
  const quote = createQuoteDraft("global-cost", "QT-GLOBAL", "2026-08-21");
  const source = getDefaultRevision(quote).priceVersions[0];
  source.otherCosts = [{ id: "old", name: "运费", specification: "旧值", usage: 1, unit: "件", lossRate: 0, unitPrice: 0.8, amount: 0.8 }];
  const copied = copyPriceVersion(source, { id: "copy", name: "彩条", quantity: 100, description: "" });
  const initialized = applyGlobalCostsToPriceVersion(copied, { costs: [{ id: "freight", enabled: true, name: "运费", amount: 1.2, note: "新标准" }] }, "global-row", { resetGlobalOverrides: true });
  assert.equal(source.otherCosts[0].unitPrice, 0.8);
  assert.equal(initialized.otherCosts.length, 2);
  assert.equal(initialized.otherCosts[0].unitPrice, 0.8);
  assert.equal(initialized.otherCosts[1].unitPrice, 1.2);
  assert.equal(initialized.otherCosts[1].specification, "新标准");
  assert.equal(initialized.otherCosts[1].globalSettingId, "freight");
  assert.equal(initialized.otherCosts[1].source, "global");
});

test("删除价格版本保留至少一个并刷新确认汇总", () => {
  const quote = createQuoteDraft("delete-version", "QT-DELETE", "2026-08-21");
  const revision = getDefaultRevision(quote);
  assert.throws(() => removePriceVersion(revision, revision.priceVersions[0].id), /不能删除最后一个价格版本/);
  const second = copyPriceVersion(revision.priceVersions[0], { id: "second", name: "彩条", quantity: 20, description: "" });
  second.confirmation = { quotedGarmentPrice: 1, confirmedGarmentPrice: 1, quotedLaborPrice: 1, confirmedLaborPrice: 1, note: "", confirmedAt: "2026-08-21" };
  const next = removePriceVersion({ ...revision, priceVersions: [...revision.priceVersions, second], confirmationSummary: { confirmedCount: 1, totalCount: 2 } }, "second");
  assert.equal(next.priceVersions.length, 1);
  assert.deepEqual(next.confirmationSummary, { confirmedCount: 0, totalCount: 1 });
});

test("版本入口、删除确认、更新前复制确认与折叠校验条均已接线", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const manager = await readFile(new URL("../features/quote-center/components/revision-manager-modal.tsx", import.meta.url), "utf8");
  const validation = await readFile(new URL("../features/quote-center/components/validation-summary.tsx", import.meta.url), "utf8");
  assert.match(editor, />报价版本<\/Button>/);
  assert.doesNotMatch(editor, /<Button[^>]*>报价版本 <RevisionLabel/);
  assert.match(editor, /删除价格版本/);
  assert.match(editor, /priceVersionDeleteTargetId/);
  assert.match(manager, /是否复制当前报价版本后再进行更新/);
  assert.match(manager, />否<\/Button>/);
  assert.match(manager, />是<\/Button>/);
  assert.match(validation, /useState\(false\)/);
  assert.match(validation, /expanded \? "收起" : "展开"/);
});
