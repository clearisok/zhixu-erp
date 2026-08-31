import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTrimCostLineFromLibrary, defaultBasicSettings, resolveQuoteDefaults } from "../features/basic-settings/model/basic-settings.ts";
import { copyQuoteFromDefaultRevision, validateCopyQuoteStyleNo } from "../features/quote-center/model/quote-copy.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

function sourceQuote() {
  const quote = createQuoteDraft("copy-source", "QT-SOURCE", "2026-08-24");
  const revision = getDefaultRevision(quote);
  revision.baseInfo = { ...revision.baseInfo, brandId: "zara", brandName: "ZARA", salespersonId: "sales-linqinghe", salespersonName: "林青禾", quoteStyleNo: "D1935", styleName: "嵌条连衣裙" };
  revision.priceVersions[0].confirmation = { quotedGarmentPrice: 68, confirmedGarmentPrice: 66, quotedLaborPrice: 5, confirmedLaborPrice: 4.8, note: "已确认", confirmedAt: "2026-08-24" };
  revision.confirmationSummary = { confirmedCount: 1, totalCount: 1 };
  revision.imageAttachmentIds = ["image-source"];
  revision.styleImageAttachmentId = "image-source";
  return quote;
}

test("复制报价严格读取 defaultRevisionId，创建全新 Quote 并重置确认与跨 Quote 附件引用", () => {
  const source = sourceQuote();
  source.revisions.push({ ...structuredClone(source.revisions[0]), revisionId: "history-last", revisionLabel: "V99", baseInfo: { ...source.revisions[0].baseInfo, styleName: "数组末尾历史版本" } });
  const copied = copyQuoteFromDefaultRevision(source, { id: "copy-target", quoteCode: "QT-TARGET", createdAt: "2026-08-24T12:00:00.000Z", today: "2026-08-24", createdBy: "管理员", brandId: "zara", brandName: "ZARA", salespersonId: "sales-linqinghe", salespersonName: "林青禾", quoteType: "distribution", quoteStyleNo: "D2088", styleName: "嵌条连衣裙" });
  assert.notEqual(copied.id, source.id);
  assert.equal(copied.revisions.length, 1);
  assert.equal(getDefaultRevision(copied).baseInfo.styleName, "嵌条连衣裙");
  assert.equal(getDefaultRevision(copied).baseInfo.quoteStyleNo, "D2088");
  assert.equal(getDefaultRevision(copied).priceVersions[0].confirmation, null);
  assert.deepEqual(getDefaultRevision(copied).confirmationSummary, { confirmedCount: 0, totalCount: 1 });
  assert.deepEqual(getDefaultRevision(copied).imageAttachmentIds, []);
  assert.equal(getDefaultRevision(copied).styleImageAttachmentId, null);
  assert.equal(getDefaultRevision(source).priceVersions[0].confirmation.confirmedGarmentPrice, 66);
});

test("复制报价款号要求主动输入，并在复制流程内按 trim/case 防止源款号和已有款号重复", () => {
  const source = sourceQuote();
  const existing = createQuoteDraft("existing-copy", "QT-EXISTING", "2026-08-24");
  getDefaultRevision(existing).baseInfo.quoteStyleNo = "D2088";
  assert.equal(validateCopyQuoteStyleNo(source, [source, existing], ""), "required");
  assert.equal(validateCopyQuoteStyleNo(source, [source, existing], " d1935 "), "same-as-source");
  assert.equal(validateCopyQuoteStyleNo(source, [source, existing], " d2088 "), "duplicate");
  assert.equal(validateCopyQuoteStyleNo(source, [source, existing], "D3000"), null);
});

test("品牌与客户业务员固定辅料数量区分 null、0 和 2，并原样形成报价成本行快照", () => {
  const state = structuredClone(defaultBasicSettings);
  const item = state.trimLibrary[0];
  for (const quantity of [null, 0, 2]) {
    const line = createTrimCostLineFromLibrary(item, `row-${quantity}`, { id: `config-${quantity}`, trimLibraryItemId: item.id, quantity, overrideLossRate: null, overrideUnitPrice: null });
    assert.equal(line.usage, quantity);
  }
  state.brands.find((brand) => brand.id === "zara").defaults.defaultTrims[0].quantity = 2;
  assert.equal(resolveQuoteDefaults(state, "zara", "sales-zhouyan").trims[0].usage, 2);
});

test("Quote Center 复制模式与批量导出模式使用独立 Radio / Checkbox 状态", async () => {
  const list = await readFile(new URL("../features/quote-center/components/quote-list.tsx", import.meta.url), "utf8");
  const copyModal = await readFile(new URL("../features/quote-center/components/copy-quote-modal.tsx", import.meta.url), "utf8");
  assert.match(list, /type SelectionMode = "batch-export" \| "copy-quote" \| null/);
  assert.ok(list.indexOf("批量导出</PermissionButton>") < list.indexOf(">复制报价</PermissionButton>"));
  assert.match(list, /selectionMode === "batch-export" && <Checkbox/);
  assert.match(list, /selectionMode === "copy-quote" && <Radio/);
  assert.match(list, /disabled=\{!selectedQuoteId\}/);
  assert.match(copyModal, /validateCopyQuoteStyleNo/);
  assert.match(copyModal, /mockQuoteRepository\.copyFromDefaultRevision/);
});
