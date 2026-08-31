import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applySystemDefaultsToNewQuoteRevision, defaultGlobalQuoteSettings, normalizeGlobalQuoteSettings } from "../features/quote-center/model/quote-settings.ts";
import { copyPriceVersion } from "../features/quote-center/model/quote-calculations.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";
import { removePriceVersion } from "../features/quote-center/model/quote-workflows.ts";

test("系统报价设置保存单条默认其他费用，并兼容旧多条设置", () => {
  const normalized = normalizeGlobalQuoteSettings({ costs: [
    { id: " freight ", enabled: true, name: "  运费  ", amount: 1.2, note: " 单件分摊 " },
    { id: "testing", enabled: false, name: "测试费", amount: 0.35 },
  ] });
  assert.deepEqual(normalized.defaultOtherCost, { name: "运费", amount: 1.2 });
  assert.deepEqual(normalizeGlobalQuoteSettings({ otherCost: { enabled: true, name: "运费", amount: 1 } }).defaultOtherCost, { name: "运费", amount: 1 });
  assert.equal(defaultGlobalQuoteSettings.defaultOtherCost, null);
});

test("默认其他费用只初始化新 Quote，后续复制价格版本沿用来源快照", () => {
  const quote = createQuoteDraft("global-cost", "QT-GLOBAL", "2026-08-21");
  const initialized = applySystemDefaultsToNewQuoteRevision(getDefaultRevision(quote), normalizeGlobalQuoteSettings({ defaultOtherCost: { name: "运费", amount: 1.2 } }), "global-cost");
  const source = initialized.priceVersions[0];
  const copied = copyPriceVersion(source, { id: "copy", name: "彩条", quantity: 100, description: "" });
  assert.equal(source.otherCosts.length, 1);
  assert.equal(copied.otherCosts.length, 1);
  assert.equal(copied.otherCosts[0].unitPrice, 1.2);
  assert.notEqual(copied.otherCosts[0].id, source.otherCosts[0].id);
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
  assert.match(editor, /label: "报价版本"/);
  assert.doesNotMatch(editor, /label: "报价版本 <RevisionLabel/);
  assert.match(editor, /删除价格版本/);
  assert.match(editor, /priceVersionDeleteTargetId/);
  assert.match(manager, /是否复制当前报价版本后再进行更新/);
  assert.match(manager, />否<\/Button>/);
  assert.match(manager, />是<\/Button>/);
  assert.match(validation, /initiallyExpanded = false/);
  assert.match(validation, /useState\(initiallyExpanded\)/);
  assert.match(validation, /expanded \? "收起" : "展开"/);
});
