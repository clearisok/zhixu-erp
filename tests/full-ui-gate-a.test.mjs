import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { quoteFixtures } from "../features/quote-center/fixtures/quote-fixtures.ts";
import { matchesQuoteRecordSearch, matchesQuoteSearch, parseQuoteSearch } from "../features/quote-center/model/quote-workflows.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Quote 普通搜索 token 使用 AND", () => {
  assert.equal(matchesQuoteSearch("OYSHO 柬埔寨", "OYSHO 柬埔寨"), true);
  assert.equal(matchesQuoteSearch("OYSHO 中国", "OYSHO 柬埔寨"), false);
});

test("Slash structured parser 保留普通 token 并支持多个精确字段", () => {
  assert.deepEqual(parseQuoteSearch("/报价类型:经销 OYSHO /制作国家:柬埔寨"), {
    ordinaryTokens: ["oysho"],
    filters: [{ field: "报价类型", value: "经销" }, { field: "制作国家", value: "柬埔寨" }],
  });
});

test("制作国家精确与模糊搜索扫描当前 Revision 的 PriceVersion", () => {
  const quote = quoteFixtures.find((item) => item.revisions.some((revision) => revision.priceVersions.some((version) => version.pricingParameters.manufacturingCountry === "柬埔寨")));
  assert.ok(quote);
  assert.equal(matchesQuoteRecordSearch(quote, "/制作国家:柬埔寨"), true);
  assert.equal(matchesQuoteRecordSearch(quote, "柬埔寨"), true);
  assert.equal(matchesQuoteRecordSearch(quote, "/制作国家:中国"), false);
});

test("Gate A 使用统一 Portal 层、第五项指标、Drawer、缩略图与直接粘贴", async () => {
  const [foundation, toast, list, editor, metrics, attachment, settings, responsive] = await Promise.all([
    read("components/foundation/floating-menu.tsx"), read("components/foundation/toast.tsx"), read("features/quote-center/components/quote-list.tsx"), read("features/quote-center/components/quote-editor.tsx"), read("features/quote-center/model/quote-metrics-view-model.ts"), read("features/quote-center/components/attachment-panel.tsx"), read("features/basic-settings/components/basic-settings-pages.tsx"), read("app/quote-center/responsive.css"),
  ]);
  assert.match(foundation, /createPortal/); assert.match(foundation, /Escape/); assert.match(toast, /createPortal/);
  assert.match(list, /QuoteStyleThumbnail/); assert.match(list, /QUOTE_STRUCTURED_SEARCH_FIELDS/);
  assert.match(metrics, /label: "其他费用"/); assert.match(editor, /title="最终报价构成"/); assert.match(editor, /calculatePriceVersionMetrics/);
  assert.match(attachment, /qc-direct-paste-area/); assert.doesNotMatch(attachment, /qc-paste-image-modal/);
  assert.doesNotMatch(settings, /回退品牌值/); assert.match(settings, /source: `品牌 \$\{brand\.name\}`/);
  assert.match(responsive, /> \.qc-page-back \{ grid-column: 1; grid-row: 1; \}/);
});
