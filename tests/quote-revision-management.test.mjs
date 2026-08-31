import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { summarizeRevisionMetric } from "../features/quote-center/model/quote-presentation.ts";
import { getNextRevisionLabel } from "../features/quote-center/model/quote-revision-naming.ts";
import { createRevisionFromSnapshot } from "../features/quote-center/model/quote-workflows.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

function completeQuote(id = "revision-management") {
  const quote = createQuoteDraft(id, `QT-${id}`, "2026-08-21");
  const revision = getDefaultRevision(quote);
  revision.baseInfo = { ...revision.baseInfo, brandId: "brand", brandName: "ZARA", salespersonId: "sales", salespersonName: "Alice", quoteStyleNo: "T100", styleName: "测试款" };
  revision.priceVersions[0].name = "素色";
  revision.priceVersions[0].quantity = 1000;
  revision.priceVersions[0].labor.value = 12;
  return quote;
}

function derive(quote, sourceRevisionId, revisionId, nowIso) {
  return createRevisionFromSnapshot(quote, { sourceRevisionId, reason: "客户调价", note: "测试", createdBy: "Alice", nowIso, revisionId });
}

test("报价版本命名覆盖主线与历史分支规则", () => {
  const v1Quote = completeQuote("labels");
  const v1 = getDefaultRevision(v1Quote);
  assert.deepEqual(getNextRevisionLabel({ selectedRevision: v1, allRevisions: v1Quote.revisions }), {
    revisionLabel: "V2", mainlineVersion: 2, branchSequence: null, parentRevisionId: v1.revisionId,
  });
  const v2Quote = derive(v1Quote, v1.revisionId, "v2", "2026-08-21T01:00:00Z");
  const v2 = getDefaultRevision(v2Quote);
  assert.equal(getNextRevisionLabel({ selectedRevision: v2, allRevisions: v2Quote.revisions }).revisionLabel, "V3");
  assert.equal(getNextRevisionLabel({ selectedRevision: v1, allRevisions: v2Quote.revisions }).revisionLabel, "V1²");
  const v1SquaredQuote = derive(v2Quote, v1.revisionId, "v1-2", "2026-08-21T02:00:00Z");
  assert.equal(getNextRevisionLabel({ selectedRevision: v1, allRevisions: v1SquaredQuote.revisions }).revisionLabel, "V1³");
  const v3Quote = derive(v2Quote, v2.revisionId, "v3", "2026-08-21T03:00:00Z");
  assert.equal(getNextRevisionLabel({ selectedRevision: v2, allRevisions: v3Quote.revisions }).revisionLabel, "V2²");
});

test("从任意来源创建报价版本会深复制完整快照并保留父子关系", () => {
  const quote = completeQuote("deep-copy");
  const source = getDefaultRevision(quote);
  source.priceVersions[0].fabrics.push({ id: "fabric", sourceLibraryItemId: null, name: "棉", composition: "100% Cotton", segmentLengthCm: 100, netWidthCm: 150, gsm: 180, lossRate: 3, supplier: "A", unitPrice: 20, purchaseUnit: "kg" });
  source.imageAttachmentIds.push("media");
  source.styleImageAttachmentId = "media";
  const nextQuote = derive(quote, source.revisionId, "v2", "2026-08-21T01:00:00Z");
  const next = getDefaultRevision(nextQuote);
  assert.equal(next.parentRevisionId, source.revisionId);
  assert.notEqual(next.baseInfo, source.baseInfo);
  assert.notEqual(next.priceVersions, source.priceVersions);
  assert.notEqual(next.priceVersions[0].fabrics, source.priceVersions[0].fabrics);
  assert.notEqual(next.imageAttachmentIds, source.imageAttachmentIds);
  assert.deepEqual(next.imageAttachmentIds, ["media"]);
  assert.equal(next.styleImageAttachmentId, "media");
  next.priceVersions[0].fabrics[0].name = "只改新快照";
  assert.equal(source.priceVersions[0].fabrics[0].name, "棉");
});

test("新报价版本成为 defaultRevisionId，读取不依赖数组末项或创建时间", () => {
  const quote = completeQuote("default-pointer");
  const v1 = getDefaultRevision(quote);
  const next = derive(quote, v1.revisionId, "v2", "2026-08-21T01:00:00Z");
  next.revisions.reverse();
  next.revisions[0].createdAt = "2030-01-01T00:00:00Z";
  assert.equal(next.defaultRevisionId, "v2");
  assert.equal(getDefaultRevision(next).revisionId, "v2");
});

test("客户确认属于来源报价版本，新版本全部重置为未确认", () => {
  const quote = completeQuote("confirmation-reset");
  const source = getDefaultRevision(quote);
  source.priceVersions[0].confirmation = { quotedGarmentPrice: 30, confirmedGarmentPrice: 29, quotedLaborPrice: 12, confirmedLaborPrice: 11.5, note: "确认", confirmedAt: "2026-08-21" };
  source.confirmationSummary = { confirmedCount: 1, totalCount: 1 };
  const nextQuote = derive(quote, source.revisionId, "v2", "2026-08-21T01:00:00Z");
  const next = getDefaultRevision(nextQuote);
  assert.equal(source.priceVersions[0].confirmation?.confirmedLaborPrice, 11.5);
  assert.equal(next.priceVersions[0].confirmation, null);
  assert.deepEqual(next.confirmationSummary, { confirmedCount: 0, totalCount: 1 });
  assert.equal(next.basedOnConfirmedRevisionId, source.revisionId);
});

test("报价版本摘要保持范围、相同值与空值语义", () => {
  const quote = completeQuote("summary");
  const revision = getDefaultRevision(quote);
  revision.priceVersions.push(structuredClone(revision.priceVersions[0]));
  revision.priceVersions[1].id = "stripe";
  revision.priceVersions[1].name = "彩条";
  revision.priceVersions[0].labor.value = 0;
  revision.priceVersions[1].labor.value = 15;
  assert.equal(summarizeRevisionMetric(revision, (metrics) => metrics.laborInput), "¥0.00 – ¥15.00");
  revision.priceVersions[1].labor.value = 0;
  assert.equal(summarizeRevisionMetric(revision, (metrics) => metrics.laborInput), "¥0.00");
  revision.priceVersions.forEach((version) => { version.labor.value = null; });
  assert.equal(summarizeRevisionMetric(revision, (metrics) => metrics.laborInput), "—");
});

test("详情页只保留统一报价版本入口，历史模式移除编辑操作", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const manager = await readFile(new URL("../features/quote-center/components/revision-manager-modal.tsx", import.meta.url), "utf8");
  const pricing = await readFile(new URL("../features/quote-center/components/quote-pricing-settings.tsx", import.meta.url), "utf8");
  assert.match(editor, /RevisionManagerModal/);
  assert.doesNotMatch(editor, /RevisionHistory/);
  assert.doesNotMatch(editor, /报价版本历史/);
  assert.match(editor, /历史只读/);
  assert.match(editor, /返回当前版本/);
  assert.match(editor, /更新此报价版本/);
  assert.match(editor, /id: "save", label: "保存草稿", permission: "quote\.edit"/);
  assert.match(editor, /id: "confirmation", label: "客户确认", permission: "quote\.confirm"/);
  assert.match(pricing, /readOnly/);
  assert.match(manager, /确认创建新报价版本/);
  assert.doesNotMatch(manager, /恢复/);
});

test("报价中心列表字段统一经 defaultRevisionId 读取", async () => {
  const list = await readFile(new URL("../features/quote-center/components/quote-list.tsx", import.meta.url), "utf8");
  const model = await readFile(new URL("../features/quote-center/model/quote-view-model.ts", import.meta.url), "utf8");
  assert.match(list, /getCurrentRevision\(quote\)/);
  assert.match(model, /quote\.defaultRevisionId/);
  assert.doesNotMatch(list, /revisions\[quote\.revisions\.length - 1\]/);
  assert.doesNotMatch(list, /sort\([^)]*createdAt/);
});
