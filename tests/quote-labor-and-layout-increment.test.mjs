import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyLaborDescriptionToCurrentQuote, currentQuoteHasCustomLaborDescription, defaultGlobalQuoteSettings, normalizeGlobalQuoteSettings } from "../features/quote-center/model/quote-settings.ts";
import { quoteFixtures } from "../features/quote-center/fixtures/quote-fixtures.ts";

test("T60-T67 默认工序说明使用 Textarea、可持久化并只同步当前默认 Revision", async () => {
  assert.equal(defaultGlobalQuoteSettings.defaultLaborDescription, "裁剪、车缝、整烫、质检包装");
  assert.equal(normalizeGlobalQuoteSettings(null).defaultLaborDescription, defaultGlobalQuoteSettings.defaultLaborDescription);
  const quote = structuredClone(quoteFixtures[0]);
  const historicalBefore = structuredClone(quote.revisions.filter((item) => item.revisionId !== quote.defaultRevisionId));
  const current = quote.revisions.find((item) => item.revisionId === quote.defaultRevisionId);
  current.priceVersions.forEach((version) => { version.labor.description = ""; });
  assert.equal(currentQuoteHasCustomLaborDescription(quote, "旧默认"), false);
  const next = applyLaborDescriptionToCurrentQuote(quote, "新默认说明");
  assert.ok(next.revisions.find((item) => item.revisionId === quote.defaultRevisionId).priceVersions.every((version) => version.labor.description === "新默认说明"));
  assert.deepEqual(next.revisions.filter((item) => item.revisionId !== quote.defaultRevisionId), historicalBefore);
  const ui = await readFile(new URL("../features/quote-center/components/quote-pricing-settings.tsx", import.meta.url), "utf8");
  assert.match(ui, /<textarea[^>]+qc-global-labor-description/);
});

test("T68-T70 自定义工序说明触发三向保护，不会静默覆盖", async () => {
  const quote = structuredClone(quoteFixtures[0]);
  quote.revisions.find((item) => item.revisionId === quote.defaultRevisionId).priceVersions[0].labor.description = "手工工序";
  assert.equal(currentQuoteHasCustomLaborDescription(quote, "旧默认"), true);
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  for (const phrase of [">取消<", "保留当前报价资料", "应用新的工序说明"]) assert.match(editor, new RegExp(phrase));
});

test("T71-T79 Sticky 同步且宽表在宽屏填满 Card、窄屏保持最小宽度与 Portal", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/quote-center/quote-center.css", import.meta.url), "utf8");
  const cost = await readFile(new URL("../features/quote-center/components/cost-table.tsx", import.meta.url), "utf8");
  assert.match(editor, /qc-sticky-header[\s\S]*QuoteQuickNavigation/);
  assert.doesNotMatch(css, /\.qc-quick-navigation \{ position: sticky;/);
  assert.match(css, /\.qc-fabric-cost-table \{ width: 100%; min-width: 1230px; max-width: none;/);
  assert.match(css, /\.qc-trim-cost-table \{ width: 100%; min-width: 1160px; max-width: none;/);
  assert.match(cost, /createPortal/);
  assert.match(cost, /key=\{line\.id\}/);
});
