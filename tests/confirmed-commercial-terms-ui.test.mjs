import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";
import { applyCustomerConfirmation, createRevisionFromSnapshot } from "../features/quote-center/model/quote-workflows.ts";

const quoteEditor = await readFile("features/quote-center/components/quote-editor.tsx", "utf8");
const orderDetail = await readFile("features/order-center/components/server-sales-order-detail-page.tsx", "utf8");
const workflows = await readFile("features/quote-center/model/quote-workflows.ts", "utf8");

test("linked Quote confirmation uses Server truth and has no local numeric fallback", () => {
  const linkedBranchStart = quoteEditor.indexOf('if (activeServerTerms?.linkage === "linked")');
  const legacyWriter = quoteEditor.indexOf("const next = applyCustomerConfirmation", linkedBranchStart);
  const linkedReturn = quoteEditor.indexOf("return;", linkedBranchStart);
  assert.ok(linkedBranchStart > 0);
  assert.ok(linkedReturn > linkedBranchStart && linkedReturn < legacyWriter);
  assert.match(quoteEditor.slice(linkedBranchStart, legacyWriter), /updateByQuote/u);
  assert.doesNotMatch(quoteEditor.slice(linkedBranchStart, linkedReturn), /mockQuoteRepository\.save/u);
  assert.match(quoteEditor, /activeServerTermsState !== "ready"/u);
  assert.match(quoteEditor, /未写入本地确认值/u);
});

test("unlinked Quote keeps the legacy confirmation path while historical revisions stay snapshots", () => {
  assert.match(quoteEditor, /applyCustomerConfirmation\(quote, activeVersion\.id/u);
  assert.match(quoteEditor, /await mockQuoteRepository\.save\(next\)/u);
  assert.match(quoteEditor, /isHistorical \? "历史快照只读"/u);
  assert.match(workflows, /confirmation: null/u);

  const original = createQuoteDraft("quote-history", "QT-HISTORY", "2026-09-14");
  const originalRevision = getDefaultRevision(original);
  const confirmed = applyCustomerConfirmation(original, originalRevision.priceVersions[0].id, 8.125, 25.375, "historical evidence");
  const historicalBefore = structuredClone(getDefaultRevision(confirmed));
  const derived = createRevisionFromSnapshot(confirmed, {
    sourceRevisionId: historicalBefore.revisionId,
    reason: "客户调价",
    note: "new current revision",
    createdBy: "test",
    nowIso: "2026-09-14T01:00:00.000Z",
    revisionId: "quote-history-revision-2",
  });
  const preservedHistorical = derived.revisions.find((revision) => revision.revisionId === historicalBefore.revisionId);
  const newCurrent = getDefaultRevision(derived);
  assert.deepEqual(preservedHistorical, { ...historicalBefore, readOnly: true });
  assert.equal(newCurrent.priceVersions[0].confirmation, null);
  assert.deepEqual(newCurrent.priceVersions[0].pricingParameters, historicalBefore.priceVersions[0].pricingParameters);
  assert.deepEqual(newCurrent.priceVersions[0].fabrics, historicalBefore.priceVersions[0].fabrics);
  assert.deepEqual(newCurrent.priceVersions[0].trims, historicalBefore.priceVersions[0].trims);
  assert.deepEqual(newCurrent.priceVersions[0].otherCosts, historicalBefore.priceVersions[0].otherCosts);
});

test("formal Order Detail reads and edits only Server ConfirmedCommercialTerms", () => {
  assert.match(orderDetail, /SERVER CURRENT TERMS/u);
  assert.match(orderDetail, /客户确认价格/u);
  assert.match(orderDetail, /确认工价/u);
  assert.match(orderDetail, /serverSession\.hasPermission\("order\.edit"\)/u);
  assert.match(orderDetail, /value === null \? "未确认"/u);
  assert.match(orderDetail, /updateBySalesOrder/u);
  assert.doesNotMatch(orderDetail, /orderRepository|OrderPriceVersion|salePrice|processingUnitPrice/u);
  assert.doesNotMatch(orderDetail, /DeliveryPlan/u);
});
