import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createQuoteOperationLogs } from "../features/operation-logs/model/operation-log.ts";
import { copyPriceVersion } from "../features/quote-center/model/quote-calculations.ts";
import { createEmptyFabricCostLine, createEmptyOtherCostLine, createEmptyTrimCostLine } from "../features/quote-center/model/quote-editor-state.ts";
import {
  applyCostSyncDecisions,
  createCostSyncCandidates,
  detectUnconfirmedCostDifferences,
  ensurePriceVersionLineGroups,
} from "../features/quote-center/model/price-version-cost-sync.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

function threeVersionRevision(values = [1.5, 1.5, 1.5]) {
  const quote = createQuoteDraft("sync-quote", "QT-SYNC", "2026-08-25");
  const revision = getDefaultRevision(quote);
  const source = revision.priceVersions[0];
  source.name = "基础价格";
  source.trims = [{ id: "trim-a", lineGroupId: "group-pack", sourceLibraryItemId: null, name: "包装材料", specification: "常规", supplier: "A厂", usage: 1, unit: "套", lossRate: 0, unitPrice: values[0] }];
  const stripe = copyPriceVersion(source, { id: "price-stripe", name: "彩条", quantity: 100, description: "" });
  const print = copyPriceVersion(source, { id: "price-print", name: "印花", quantity: 100, description: "" });
  stripe.trims[0].unitPrice = values[1];
  print.trims[0].unitPrice = values[2];
  source.confirmation = { quotedGarmentPrice: 20, confirmedGarmentPrice: 21, quotedLaborPrice: 2, confirmedLaborPrice: 2.1, note: "已确认", confirmedAt: "2026-08-25" };
  stripe.confirmation = structuredClone(source.confirmation);
  print.confirmation = structuredClone(source.confirmation);
  revision.priceVersions = [source, stripe, print];
  return revision;
}

function changedCandidate(values) {
  const saved = threeVersionRevision(values);
  const current = structuredClone(saved);
  current.priceVersions[0].trims[0].unitPrice = 1.8;
  const candidates = createCostSyncCandidates(saved, current, current.priceVersions[0].id);
  return { saved, current, candidate: candidates.find((item) => item.field === "unitPrice"), candidates };
}

test("新建成本行生成 lineGroupId，复制 PriceVersion 保留 group 但重建 row id", () => {
  const rows = [createEmptyFabricCostLine("fabric-a"), createEmptyTrimCostLine("trim-a"), createEmptyOtherCostLine("other-a")];
  assert.ok(rows.every((row) => typeof row.lineGroupId === "string" && row.lineGroupId.length > 0));
  const revision = threeVersionRevision();
  assert.notEqual(revision.priceVersions[0].trims[0].id, revision.priceVersions[1].trims[0].id);
  assert.equal(revision.priceVersions[0].trims[0].lineGroupId, revision.priceVersions[1].trims[0].lineGroupId);
});

test("旧数据只在明确复制准备时安全补 group，不按名称关联", () => {
  const saved = threeVersionRevision();
  const current = structuredClone(saved);
  delete saved.priceVersions[0].trims[0].lineGroupId;
  delete current.priceVersions[0].trims[0].lineGroupId;
  const prepared = ensurePriceVersionLineGroups(current.priceVersions[0], () => "explicit-copy-group");
  assert.equal(prepared.trims[0].lineGroupId, "explicit-copy-group");
  current.priceVersions[0].trims[0].unitPrice = 1.8;
  assert.equal(createCostSyncCandidates(saved, current, current.priceVersions[0].id).length, 0);
});

test("单价格版本与历史只读 Revision 不生成同步候选", () => {
  const singleSaved = threeVersionRevision();
  singleSaved.priceVersions = [singleSaved.priceVersions[0]];
  const singleCurrent = structuredClone(singleSaved);
  singleCurrent.priceVersions[0].trims[0].unitPrice = 1.8;
  assert.equal(createCostSyncCandidates(singleSaved, singleCurrent, singleCurrent.priceVersions[0].id).length, 0);
  const historicalSaved = threeVersionRevision();
  const historicalCurrent = structuredClone(historicalSaved);
  historicalCurrent.readOnly = true;
  historicalCurrent.priceVersions[0].trims[0].unitPrice = 1.8;
  assert.equal(createCostSyncCandidates(historicalSaved, historicalCurrent, historicalCurrent.priceVersions[0].id).length, 0);
});

test("全部原值一致时智能推荐全部价格版本", () => {
  const { current, candidate, candidates } = changedCandidate([1.5, 1.5, 1.5]);
  assert.equal(candidate.recommendedScope, "all");
  const applied = applyCostSyncDecisions(current, candidates, { [candidate.id]: { scope: "all", selectedVersionIds: [] } });
  assert.deepEqual(applied.revision.priceVersions.map((version) => version.trims[0].unitPrice), [1.8, 1.8, 1.8]);
});

test("已有差异时智能推荐同步同值版本，不覆盖已经不同的版本", () => {
  const { current, candidate, candidates } = changedCandidate([1.5, 1.5, 1.7]);
  assert.equal(candidate.recommendedScope, "matching");
  const applied = applyCostSyncDecisions(current, candidates, { [candidate.id]: { scope: "matching", selectedVersionIds: candidate.matchingVersionIds } });
  assert.deepEqual(applied.revision.priceVersions.map((version) => version.trims[0].unitPrice), [1.8, 1.8, 1.7]);
  assert.equal(detectUnconfirmedCostDifferences(applied.revision).some((item) => item.field === "unitPrice"), true);
});

test("全部不同默认仅当前；用户仍可强制全部同步", () => {
  const { current, candidate, candidates } = changedCandidate([1.5, 1.6, 1.7]);
  assert.equal(candidate.recommendedScope, "current");
  const currentOnly = applyCostSyncDecisions(current, candidates, { [candidate.id]: { scope: "current", selectedVersionIds: [candidate.sourcePriceVersionId] } });
  assert.deepEqual(currentOnly.revision.priceVersions.map((version) => version.trims[0].unitPrice), [1.8, 1.6, 1.7]);
  assert.ok(currentOnly.revision.priceVersions[0].trims[0].independentFields.includes("unitPrice"));
  const all = applyCostSyncDecisions(currentOnly.revision, candidates, { [candidate.id]: { scope: "all", selectedVersionIds: [] } });
  assert.deepEqual(all.revision.priceVersions.map((version) => version.trims[0].unitPrice), [1.8, 1.8, 1.8]);
  assert.ok(all.revision.priceVersions.every((version) => !version.trims[0].independentFields?.includes("unitPrice")));
});

test("选择价格版本只同步所选项，并把明确排除的差异标记为独立", () => {
  const { current, candidate, candidates } = changedCandidate([1.5, 1.5, 1.5]);
  const selected = applyCostSyncDecisions(current, candidates, { [candidate.id]: { scope: "selected", selectedVersionIds: [current.priceVersions[0].id, current.priceVersions[1].id] } });
  assert.deepEqual(selected.revision.priceVersions.map((version) => version.trims[0].unitPrice), [1.8, 1.8, 1.5]);
  assert.ok(selected.revision.priceVersions[2].trims[0].independentFields.includes("unitPrice"));
  assert.equal(detectUnconfirmedCostDifferences(selected.revision).length, 0);
});

test("null、0、2 严格区分，同值判断不会把 null 当作 0", () => {
  const saved = threeVersionRevision([null, 0, 2]);
  const current = structuredClone(saved);
  current.priceVersions[0].trims[0].unitPrice = 3;
  const candidate = createCostSyncCandidates(saved, current, current.priceVersions[0].id).find((item) => item.field === "unitPrice");
  assert.equal(candidate.recommendedScope, "current");
  assert.deepEqual(candidate.versions.map((item) => item.value), [null, 0, 2]);
});

test("跨版本同步不覆盖客户确认，派生成本继续由现有计算函数读取原始输入", () => {
  const { current, candidate, candidates } = changedCandidate([1.5, 1.5, 1.5]);
  const confirmations = current.priceVersions.map((version) => structuredClone(version.confirmation));
  const applied = applyCostSyncDecisions(current, candidates, { [candidate.id]: { scope: "all", selectedVersionIds: [] } });
  assert.deepEqual(applied.revision.priceVersions.map((version) => version.confirmation), confirmations);
  assert.ok(applied.revision.priceVersions.every((version) => !Object.hasOwn(version.trims[0], "amount")));
});

test("其他费用同步原始输入后重新计算 amount，不复制来源版本的派生结果", () => {
  const saved = threeVersionRevision();
  saved.priceVersions.forEach((version, index) => {
    version.otherCosts = [{ id: `other-${index}`, lineGroupId: "group-other", name: "包装费", specification: "", usage: 1, unit: "件", lossRate: 0, unitPrice: 1, amount: 1, source: "manual" }];
  });
  const current = structuredClone(saved);
  current.priceVersions[0].otherCosts[0].unitPrice = 2;
  current.priceVersions[0].otherCosts[0].amount = 2;
  const candidates = createCostSyncCandidates(saved, current, current.priceVersions[0].id);
  const unitPrice = candidates.find((item) => item.category === "otherCosts" && item.field === "unitPrice");
  const applied = applyCostSyncDecisions(current, [unitPrice], { [unitPrice.id]: { scope: "all", selectedVersionIds: [] } });
  assert.deepEqual(applied.revision.priceVersions.map((version) => version.otherCosts[0].amount), [2, 2, 2]);
});

test("同步多个 PriceVersion 后，现有 OperationLog 记录每个受影响版本且共用一次 operation", () => {
  const quoteBefore = createQuoteDraft("sync-audit", "QT-SYNC-AUDIT", "2026-08-25");
  const beforeRevision = getDefaultRevision(quoteBefore);
  const prepared = threeVersionRevision([1.5, 1.5, 1.5]);
  quoteBefore.revisions = [{ ...prepared, revisionId: beforeRevision.revisionId }];
  const quoteAfter = structuredClone(quoteBefore);
  const afterRevision = getDefaultRevision(quoteAfter);
  afterRevision.priceVersions.forEach((version) => { version.trims[0].unitPrice = 1.8; });
  const logs = createQuoteOperationLogs(quoteBefore, quoteAfter, { userId: "admin", userName: "管理员" }, "2026-08-25T10:00:00.000Z", "operation-sync");
  const trimLogs = logs.filter((log) => log.entityType === "TrimCostLine");
  assert.deepEqual(trimLogs.map((log) => log.afterData.priceVersionName), ["基础价格", "彩条", "印花"]);
  assert.ok(logs.every((log) => log.operationId === "operation-sync"));
});

test("保存时同步 UI 保留取消、当前版本、批量推荐、差异与导出提醒入口", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const modal = await readFile(new URL("../features/quote-center/components/price-version-cost-sync-modal.tsx", import.meta.url), "utf8");
  assert.match(editor, /createCostSyncCandidates\(savedRevision, revision, activeVersion\.id\)/);
  assert.match(editor, /setPriceSyncRequest\(\{ candidates, intent \}\)/);
  assert.match(editor, /onClose=\{\(\) => setPriceSyncRequest\(null\)\}/);
  assert.match(editor, /发现未确认的价格版本差异/);
  assert.match(modal, /智能推荐/);
  assert.match(modal, /仅保存当前版本/);
  assert.match(modal, /同步并保存/);
  assert.match(modal, /选择价格版本/);
});
