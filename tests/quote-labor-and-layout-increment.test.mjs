import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applySystemDefaultsToNewQuoteRevision, defaultGlobalQuoteSettings, normalizeGlobalQuoteSettings } from "../features/quote-center/model/quote-settings.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

test("默认工序说明使用系统设置 Textarea，并只在新报价初始化时进入快照", async () => {
  assert.equal(defaultGlobalQuoteSettings.defaultLaborDescription, "裁剪、车缝、整烫、质检包装");
  const quote = createQuoteDraft("labor-default", "QT-LABOR", "2026-08-24");
  const initialized = applySystemDefaultsToNewQuoteRevision(getDefaultRevision(quote), normalizeGlobalQuoteSettings(null), "labor-default");
  assert.equal(initialized.priceVersions[0].labor.description, defaultGlobalQuoteSettings.defaultLaborDescription);
  const ui = await readFile(new URL("../features/quote-center/components/global-quote-settings-page.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  assert.match(ui, /<textarea[^>]+qc-global-labor-description/);
  assert.doesNotMatch(editor, /applyLaborDescriptionToCurrentQuote|pendingLaborDefault/);
});

test("Sticky 同步且宽表按内容区比例填满 Card、窄屏使用 Compact 与 Portal", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/quote-center/quote-center.css", import.meta.url), "utf8");
  const cost = await readFile(new URL("../features/quote-center/components/cost-table.tsx", import.meta.url), "utf8");
  assert.match(editor, /qc-sticky-header[\s\S]*QuoteQuickNavigation/);
  assert.doesNotMatch(css, /\.qc-quick-navigation \{ position: sticky;/);
  assert.match(css, /\.qc-fabric-cost-table, \.qc-trim-cost-table, \.qc-other-cost-table \{ width: 100%; min-width: 0; max-width: none; table-layout: fixed;/);
  assert.match(css, /@container qc-cost-section \(max-width: 1039px\)/);
  assert.match(cost, /createPortal/);
  assert.match(cost, /key=\{line\.id\}/);
});
