import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { quoteFixtures } from "../features/quote-center/fixtures/quote-fixtures.ts";
import { activateEstimateCost, createEstimateCostFromRevision, estimateCostIsStale, ignoreEstimateCostForCurrentRevision, patchEstimateFabricLine, restoreHistoricalEstimateCost } from "../features/quote-center/model/estimate-cost.ts";
import { getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

const clone = (value) => structuredClone(value);
const make = (quote, revision, id = "estimate-a") => createEstimateCostFromRevision({ quoteId: quote.id, revision, id, generatedAt: "2026-08-22T10:00:00.000Z", generatedBy: "测试员" });

test("T33-T40 EstimateCost 不预生成，主动生成后复制选定 Revision 的完整成本结构", () => {
  const quote = clone(quoteFixtures[0]);
  assert.equal(quote.activeEstimateCost, null);
  const revision = getDefaultRevision(quote);
  const estimate = make(quote, revision);
  assert.equal(estimate.basedOnRevisionId, revision.revisionId);
  assert.equal(estimate.fabrics.length, revision.priceVersions[0].fabrics.length);
  assert.equal(estimate.trims.length, revision.priceVersions[0].trims.length);
  assert.deepEqual(estimate.labor, revision.priceVersions[0].labor);
  assert.equal(estimate.otherCosts.length, revision.priceVersions[0].otherCosts.length);
  assert.notEqual(estimate.fabrics[0]?.id, revision.priceVersions[0].fabrics[0]?.id);
});

test("T41-T44 EstimateCost 行结构固定，编辑值不修改 QuoteRevision，也不属于 PriceVersion", () => {
  const quote = clone(quoteFixtures[0]);
  const revision = getDefaultRevision(quote);
  const estimate = make(quote, revision);
  const original = structuredClone(revision);
  const first = estimate.fabrics[0];
  if (first) {
    const patched = patchEstimateFabricLine(estimate, first.id, { unitPrice: 999 });
    assert.equal(patched.fabrics.length, estimate.fabrics.length);
    assert.equal(patched.fabrics[0].id, first.id);
  }
  assert.deepEqual(revision, original);
  assert.equal("activeEstimateCost" in revision, false);
});

test("T45-T48 stale 和 ignore 只对当前 defaultRevisionId 生效", () => {
  let quote = clone(quoteFixtures[0]);
  const revision = getDefaultRevision(quote);
  quote = activateEstimateCost(quote, make(quote, revision));
  quote.defaultRevisionId = quote.revisions[0].revisionId === revision.revisionId ? "future-v3" : quote.revisions[0].revisionId;
  assert.equal(estimateCostIsStale(quote, quote.activeEstimateCost), true);
  quote = ignoreEstimateCostForCurrentRevision(quote);
  assert.equal(estimateCostIsStale(quote, quote.activeEstimateCost), false);
  quote.defaultRevisionId = "future-v4";
  assert.equal(estimateCostIsStale(quote, quote.activeEstimateCost), true);
});

test("T49-T57 重新生成归档；恢复历史通过 Clone 创建新 active 并保留来源 Revision", () => {
  let quote = clone(quoteFixtures[0]);
  const revision = getDefaultRevision(quote);
  quote = activateEstimateCost(quote, make(quote, revision, "estimate-1"));
  quote = activateEstimateCost(quote, make(quote, revision, "estimate-2"));
  assert.equal(quote.estimateCostHistory.length, 1);
  const historicalBefore = structuredClone(quote.estimateCostHistory[0]);
  quote = restoreHistoricalEstimateCost(quote, "estimate-1", { id: "estimate-restored", generatedAt: "2026-08-23T00:00:00.000Z", generatedBy: "恢复者" });
  assert.equal(quote.activeEstimateCost.id, "estimate-restored");
  assert.equal(quote.activeEstimateCost.basedOnRevisionId, historicalBefore.basedOnRevisionId);
  assert.notEqual(quote.activeEstimateCost.fabrics[0]?.id, historicalBefore.fabrics[0]?.id);
  assert.deepEqual(quote.estimateCostHistory[0], historicalBefore);
});

test("EstimateCost UI 将成本入口置于 V1 前，固定结构没有新增或删除入口", async () => {
  const revisionUi = await readFile(new URL("../features/quote-center/components/revision-manager-modal.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../features/quote-center/components/estimate-cost-panel.tsx", import.meta.url), "utf8");
  assert.ok(revisionUi.indexOf(">成本<") < revisionUi.indexOf("revisions.map"));
  assert.match(panel, /<FabricCostTable fixedStructure/);
  assert.match(panel, /<TrimCostTable fixedStructure/);
  assert.match(panel, /<CostTable fixedStructure/);
  assert.doesNotMatch(panel, /onAdd=/);
  assert.doesNotMatch(panel, /onDelete=/);
});

test("从成本页签发起更新时先回到当前默认 Revision，更新表单不会被成本分支遮挡", async () => {
  const source = await readFile(new URL("../features/quote-center/components/revision-manager-modal.tsx", import.meta.url), "utf8");
  assert.match(source, /const beginUpdate = \(\) => \{\s*setSelectedId\(quote\.defaultRevisionId\);\s*setCopyDecisionOpen\(true\);/);
});
