import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isQuoteTermsServerLinkageActivated, resolveQuoteTermsConfirmationAuthority } from "../features/confirmed-commercial-terms/model.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";
import { applyCustomerConfirmation, createRevisionFromSnapshot, isQuoteConfirmationComplete } from "../features/quote-center/model/quote-workflows.ts";

const quoteEditor = await readFile("features/quote-center/components/quote-editor.tsx", "utf8");
const orderDetail = await readFile("features/order-center/components/server-sales-order-detail-page.tsx", "utf8");
const workflows = await readFile("features/quote-center/model/quote-workflows.ts", "utf8");
const persistence = await readFile("features/quote-center/server/quote-editor-persistence.ts", "utf8");

test("linked Quote confirmation uses Server truth and has no local numeric fallback", () => {
  const linkedBranchStart = quoteEditor.indexOf('if (activeConfirmationAuthority === "linked_server"');
  const legacyWriter = quoteEditor.indexOf("const next = applyCustomerConfirmation", linkedBranchStart);
  const linkedReturn = quoteEditor.indexOf("return;", linkedBranchStart);
  assert.ok(linkedBranchStart > 0);
  assert.ok(linkedReturn > linkedBranchStart && linkedReturn < legacyWriter);
  assert.match(quoteEditor.slice(linkedBranchStart, legacyWriter), /没有可核验的 Server 来源版本/u);
  assert.doesNotMatch(quoteEditor.slice(linkedBranchStart, linkedReturn), /mockQuoteRepository\.save/u);
  assert.doesNotMatch(quoteEditor.slice(linkedBranchStart, legacyWriter), /updateByQuote/u, "Legacy source cannot invoke a weaker linked writer");
  assert.match(quoteEditor, /await persistence\.linkedConfirmation\(target/u);
  assert.match(persistence, /termsClient\.updateByQuote/u);
  assert.match(persistence, /expectedQuoteVersion: record\.expectedVersion/u);
  assert.match(persistence, /result\.verifiedQuoteVersion !== record\.expectedVersion/u);
  assert.match(quoteEditor, /resolveQuoteTermsConfirmationAuthority/u);
  assert.match(quoteEditor, /未写入本地确认值/u);
  assert.match(quoteEditor, /NEXT_PUBLIC_ZHIXU_CONFIRMED_TERMS_QUOTE_LINKAGE/u);
  assert.match(quoteEditor, /activeConfirmationAuthority === "linked_server"/u);
  assert.match(quoteEditor, /activeConfirmationAuthority === "unknown_blocked"/u);
});

test("unlinked Quote keeps the legacy confirmation path while historical revisions stay snapshots", () => {
  assert.equal(isQuoteTermsServerLinkageActivated(undefined), false);
  assert.equal(isQuoteTermsServerLinkageActivated("false"), false);
  assert.equal(isQuoteTermsServerLinkageActivated("true"), true);
  assert.equal(resolveQuoteTermsConfirmationAuthority({ activated: false, lookupReady: false, linkage: null }), "legacy_local_pre_activation");
  assert.equal(resolveQuoteTermsConfirmationAuthority({ activated: true, lookupReady: true, linkage: "unlinked" }), "proven_unlinked_local");
  assert.equal(resolveQuoteTermsConfirmationAuthority({ activated: true, lookupReady: true, linkage: "linked" }), "linked_server");
  assert.equal(resolveQuoteTermsConfirmationAuthority({ activated: true, lookupReady: false, linkage: null }), "unknown_blocked");
  assert.match(quoteEditor, /applyCustomerConfirmation\(readableEstimateQuote\(quote\), activeVersion\.id/u);
  assert.match(quoteEditor, /await mockQuoteRepository\.save\(next\)/u);
  assert.match(quoteEditor, /setServerTermsState\("legacy_pre_activation"\)/u);
  assert.match(quoteEditor, /Server linkage 未激活 · 保留现有本地确认流程/u);
  assert.match(quoteEditor, /关联状态未知 · 禁止本地确认/u);
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

test("formal Order Detail uses explicit Server commercial adoption instead of direct price editing", async () => {
  const card=await readFile("features/order-center/components/order-business-source-button.tsx","utf8");
  assert.match(orderDetail,/OrderBusinessSourceButton/u);
  assert.doesNotMatch(orderDetail,/updateBySalesOrder|编辑确认商业条款/u);
  assert.match(card,/order\.commercial\.adopt/u);
  assert.match(card,/预览来源与价格/u);assert.match(card,/确认维护来源/u);
  assert.match(card,/expectedVersion:preview\.current\.commercial\.version/u);
  assert.match(card,/fingerprint:preview\.fingerprint/u);
  assert.match(card,/save\(pending\)/u);
  assert.doesNotMatch(card,/localStorage|mockQuoteRepository|orderRepository/u);
});

test("processing linked confirmation requires labor only", () => {
  assert.equal(isQuoteConfirmationComplete("processing", "8.50", null), true);
});

test("distribution linked confirmation rejects labor only", () => {
  assert.equal(isQuoteConfirmationComplete("distribution", "8.50", null), false);
});

test("distribution linked confirmation rejects garment only", () => {
  assert.equal(isQuoteConfirmationComplete("distribution", null, "35.00"), false);
});

test("distribution linked confirmation requires both amounts", () => {
  assert.equal(isQuoteConfirmationComplete("distribution", "8.50", "35.00"), true);
});
