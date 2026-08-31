import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { copyPriceVersion } from "../features/quote-center/model/quote-calculations.ts";
import { confirmedPriceSummary, nullablePriceVersionMetrics, summarizeRevisionMetric } from "../features/quote-center/model/quote-presentation.ts";
import { validateCustomerConfirmation, validateDraft, validateRevisionUpdate } from "../features/quote-center/model/quote-validation.ts";
import { confirmationSummaryLabel, createRevisionFromSnapshot } from "../features/quote-center/model/quote-workflows.ts";
import { createQuoteDraft, getCurrentRevision } from "../features/quote-center/model/quote-view-model.ts";

function completeDraft(id = "part3") {
  const quote = createQuoteDraft(id, `QT-${id}`, "2026-08-21");
  const revision = getCurrentRevision(quote);
  revision.baseInfo = { ...revision.baseInfo, brandId: "zara", brandName: "ZARA", salespersonId: "sales-a", salespersonName: "Alice", quoteStyleNo: "T100", styleName: "测试款" };
  revision.priceVersions[0].name = "素色";
  revision.priceVersions[0].quantity = 1000;
  revision.priceVersions[0].labor.value = 12;
  return quote;
}

test("可从任意历史完整快照派生新的当前默认报价版本", () => {
  const quote = completeDraft("revision-history");
  const v2 = createRevisionFromSnapshot(quote, { sourceRevisionId: quote.defaultRevisionId, reason: "客户调价", note: "第二次", createdBy: "Alice", nowIso: "2026-08-21T01:00:00Z", revisionId: "rev-v2" });
  v2.revisions[0].baseInfo.styleName = "历史来源款";
  const branch = createRevisionFromSnapshot(v2, { sourceRevisionId: v2.revisions[0].revisionId, reason: "其他", note: "从历史更新", createdBy: "Bob", nowIso: "2026-08-21T02:00:00Z", revisionId: "rev-v1-2" });
  const current = getCurrentRevision(branch);
  assert.equal(current.revisionLabel, "V1²");
  assert.equal(current.baseInfo.styleName, "历史来源款");
  assert.equal(current.reason, "其他");
  assert.equal(current.note, "从历史更新");
  current.baseInfo.styleName = "只改新版本";
  assert.equal(branch.revisions[0].baseInfo.styleName, "历史来源款");
  assert.equal(branch.defaultRevisionId, "rev-v1-2");
  assert.ok(branch.revisions.slice(0, -1).every((revision) => revision.readOnly));
});

test("复制价格版本深复制所有成本行 ID，且不复制客户确认", () => {
  const source = getCurrentRevision(completeDraft("copy-price")).priceVersions[0];
  source.fabrics = [{ id: "fabric-old", sourceLibraryItemId: null, name: "棉", composition: "100% Cotton", segmentLengthCm: 100, netWidthCm: 150, gsm: 180, lossRate: 3, supplier: "A", unitPrice: 20, purchaseUnit: "kg" }];
  source.trims = [{ id: "trim-old", sourceLibraryItemId: null, name: "主唛", specification: "", supplier: "B", usage: 1, unit: "枚", lossRate: 0, unitPrice: 0.3 }];
  source.otherCosts = [{ id: "other-old", name: "测试费", specification: "", usage: 1, unit: "件", lossRate: 0, unitPrice: 1, amount: 1 }];
  source.confirmation = { quotedGarmentPrice: 30, confirmedGarmentPrice: 29, quotedLaborPrice: 12, confirmedLaborPrice: 11.5, note: "确认", confirmedAt: "2026-08-21" };
  const copied = copyPriceVersion(source, { id: "price-new", name: "彩条", quantity: 500, description: "" });
  assert.notEqual(copied.fabrics[0].id, source.fabrics[0].id);
  assert.notEqual(copied.trims[0].id, source.trims[0].id);
  assert.notEqual(copied.otherCosts[0].id, source.otherCosts[0].id);
  assert.equal(copied.confirmation, null);
});

test("草稿允许不完整，更新报价版本与客户确认执行分层校验", () => {
  const draft = createQuoteDraft("validation", "QT-VALIDATION", "2026-08-21");
  const incomplete = getCurrentRevision(draft);
  assert.equal(validateDraft(incomplete).valid, true);
  assert.equal(validateRevisionUpdate(incomplete).valid, false);
  const complete = getCurrentRevision(completeDraft("validation-complete"));
  assert.equal(validateRevisionUpdate(complete).valid, true);
  assert.equal(validateCustomerConfirmation(complete, complete.priceVersions[0], { labor: null, garment: null }).valid, false);
  assert.equal(validateCustomerConfirmation(complete, complete.priceVersions[0], { labor: 11, garment: 20 }).valid, true);
  complete.baseInfo.quoteType = "processing";
  assert.equal(validateCustomerConfirmation(complete, complete.priceVersions[0], { labor: 11, garment: null }).valid, true);
});

test("确认汇总区分未确认、部分确认、全部确认", () => {
  assert.equal(confirmationSummaryLabel({ confirmedCount: 0, totalCount: 2 }), "未确认 · 0/2");
  assert.equal(confirmationSummaryLabel({ confirmedCount: 1, totalCount: 2 }), "部分确认 · 1/2");
  assert.equal(confirmationSummaryLabel({ confirmedCount: 2, totalCount: 2 }), "全部确认 · 2/2");
});

test("多价格版本列表展示区间或 n/m 确认，不静默读取第一项", () => {
  const quote = completeDraft("list-summary");
  const revision = getCurrentRevision(quote);
  const first = revision.priceVersions[0];
  first.labor.value = 10;
  first.confirmation = { quotedGarmentPrice: 10, confirmedGarmentPrice: 20, quotedLaborPrice: 10, confirmedLaborPrice: 9, note: "", confirmedAt: "2026-08-21" };
  revision.priceVersions.push(copyPriceVersion(first, { id: "second", name: "彩条", quantity: 800, description: "" }));
  revision.priceVersions[1].labor.value = 15;
  assert.equal(summarizeRevisionMetric(revision, (metrics) => metrics.laborInput), "¥10.00 – ¥15.00");
  assert.equal(confirmedPriceSummary(revision, "confirmedLaborPrice"), "1/2 已确认");
});

test("空值展示为破折号，用户明确输入 0 才显示 0.00", () => {
  const revision = getCurrentRevision(createQuoteDraft("null-zero", "QT-NULL", "2026-08-21"));
  const version = revision.priceVersions[0];
  assert.equal(nullablePriceVersionMetrics(version).laborInput, null);
  version.labor.value = 0;
  assert.equal(nullablePriceVersionMetrics(version).laborInput, 0);
});

test("编辑页术语、历史只读、校验摘要与 Dirty Guard 接线存在", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const list = await readFile(new URL("../features/quote-center/components/quote-list.tsx", import.meta.url), "utf8");
  assert.match(editor, /报价版本/);
  assert.match(editor, /更新此报价版本/);
  assert.match(editor, /RevisionManagerModal/);
  assert.match(editor, /fieldset disabled=\{costReadOnly\}/);
  assert.match(editor, /const costReadOnly = isHistorical \|\| !canEditCosts/);
  assert.match(editor, /beforeunload/);
  assert.match(editor, /ValidationSummary/);
  assert.doesNotMatch(editor, />版本更新</);
  assert.doesNotMatch(editor, /RevisionHistory/);
  assert.doesNotMatch(list, /当前 Revision/);
  assert.match(list, /summarizeRevisionMetric/);
});
