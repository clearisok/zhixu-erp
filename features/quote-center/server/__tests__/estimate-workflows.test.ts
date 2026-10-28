import assert from "node:assert/strict";
import test from "node:test";
import { applyEstimateCommand, parseEstimateCommand, type EstimateCommand } from "../../../../server/quotes/estimate-workflows";
import { createSyntheticQuoteFixture } from "../../../../server/integration/quote-fixture";
import { quoteSnapshotFromBrowser } from "../../../../server/quotes/model";
import { createQuoteEditorPersistence } from "../quote-editor-persistence";
import { quoteServerClient } from "../quote-server-client";
import { estimateCostIsStale } from "../../model/estimate-cost";

let n = 0;
const identity = { id: () => `synthetic-${++n}`, actor: "Trusted test", now: "2026-10-08T12:00:00.000Z" };
for (const action of ["estimate.generate", "estimate.regenerate", "estimate.update", "estimate.restore", "estimate.ignore"] as const) {
  test(`current processing default rejects ${action} before cloning or allocating identities`, () => {
    const quote = quoteSnapshotFromBrowser(createSyntheticQuoteFixture(`processing-${action}`, "processing"));
    quote.revisions[0].baseInfo.quoteType = "distribution";
    quote.currentRevisionId = quote.revisions[0].revisionId;
    if (action === "estimate.generate") quote.activeEstimateCost = null;
    const command: EstimateCommand = action === "estimate.generate" || action === "estimate.regenerate"
      ? { action, expectedVersion: 1, sourceRevisionId: quote.revisions[0].revisionId }
      : action === "estimate.update" ? { action, expectedVersion: 1, estimate: structuredClone(quote.activeEstimateCost!) }
        : { action, expectedVersion: 1, estimateId: action === "estimate.restore" ? quote.estimateCostHistory[0].id : quote.activeEstimateCost!.id };
    const before = structuredClone(quote); let allocations = 0;
    assert.throws(() => applyEstimateCommand(quote, command, { ...identity, id() { allocations++; return "unexpected"; } }),
      (error: unknown) => Boolean(error && typeof error === "object" && "status" in error && error.status === 409 && "code" in error && error.code === "estimate_not_applicable"));
    assert.equal(allocations, 0); assert.deepEqual(quote, before);
  });
}
function fixture() {
  const quote = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("estimate-unit"));
  quote.activeEstimateCost = null; quote.estimateCostHistory = []; quote.aggregateStatus = "draft";
  quote.revisions.at(-1)!.priceVersions[0].fabrics[0].unitPrice = "9007199254740993.123456789";
  return quote;
}
test("generation is explicit, exact, independent and no implicit active replacement", () => {
  const quote = fixture(); const source = quote.revisions.at(-1)!;
  const next = applyEstimateCommand(quote, { action: "estimate.generate", expectedVersion: 1, sourceRevisionId: source.revisionId }, identity);
  const estimate = next.activeEstimateCost!;
  assert.equal(quote.activeEstimateCost, null); assert.equal(next.aggregateStatus, "draft"); assert.deepEqual(next.revisions, quote.revisions);
  assert.equal(estimate.fabrics[0].unitPrice, "9007199254740993.123456789"); assert.equal(estimate.fabrics[0].segmentLengthCm, null); assert.equal(estimate.labor.value, "0");
  assert.notEqual(estimate.fabrics[0].id, source.priceVersions[0].fabrics[0].id); assert.equal(estimate.sourcePriceVersionId, source.priceVersions[0].id);
  assert.throws(() => applyEstimateCommand(next, { action: "estimate.generate", expectedVersion: 2, sourceRevisionId: source.revisionId }, identity));
  assert.throws(() => applyEstimateCommand(quote, { action: "estimate.generate", expectedVersion: 1, sourceRevisionId: source.revisionId, sourcePriceVersionId: "foreign" }, identity));
});
test("archive, clone restore after source PV removal, stale and scoped ignore", () => {
  let quote = fixture(); const source = quote.revisions[0];
  quote = applyEstimateCommand(quote, { action: "estimate.generate", expectedVersion: 1, sourceRevisionId: source.revisionId, sourcePriceVersionId: source.priceVersions[1].id }, identity);
  const old = structuredClone(quote.activeEstimateCost!);
  assert.equal(estimateCostIsStale(quote, old), true);
  quote = applyEstimateCommand(quote, { action: "estimate.ignore", expectedVersion: 2, estimateId: old.id }, identity);
  assert.equal(estimateCostIsStale(quote, quote.activeEstimateCost!), false);
  quote = applyEstimateCommand(quote, { action: "estimate.regenerate", expectedVersion: 3, sourceRevisionId: quote.defaultRevisionId }, identity);
  const history = structuredClone(quote.estimateCostHistory);
  quote.revisions[0].priceVersions.pop();
  quote = applyEstimateCommand(quote, { action: "estimate.restore", expectedVersion: 4, estimateId: old.id }, identity);
  assert.deepEqual(quote.estimateCostHistory[0], history[0]); assert.equal(quote.activeEstimateCost!.sourcePriceVersionId, old.sourcePriceVersionId);
  assert.notEqual(quote.activeEstimateCost!.id, old.id); assert.notEqual(quote.activeEstimateCost!.fabrics[0].id, old.fabrics[0].id);
  assert.equal(quote.activeEstimateCost!.ignoredForRevisionId, null);
});
test("fixed structure/provenance/parameters/history authority rejected, panel values allowed", () => {
  const start = fixture(); const quote = applyEstimateCommand(start, { action: "estimate.generate", expectedVersion: 1, sourceRevisionId: start.defaultRevisionId }, identity);
  for (const mutate of [
    (e: NonNullable<typeof quote.activeEstimateCost>) => { e.generatedBy = "spoof"; },
    (e: NonNullable<typeof quote.activeEstimateCost>) => { e.fabrics.reverse(); },
    (e: NonNullable<typeof quote.activeEstimateCost>) => { e.fabrics.pop(); },
    (e: NonNullable<typeof quote.activeEstimateCost>) => { e.fabrics[0].id = "spoof"; },
    (e: NonNullable<typeof quote.activeEstimateCost>) => { e.pricingParameters.markupRate = "999"; },
    (e: NonNullable<typeof quote.activeEstimateCost>) => { e.labor.value = "bad"; },
  ]) { const estimate = structuredClone(quote.activeEstimateCost!); mutate(estimate); assert.throws(() => applyEstimateCommand(quote, { action: "estimate.update", estimate, expectedVersion: 2 }, identity)); }
  const estimate = structuredClone(quote.activeEstimateCost!); estimate.fabrics[0].unitPrice = "0"; estimate.labor.value = null;
  const next = applyEstimateCommand(quote, { action: "estimate.update", estimate, expectedVersion: 2 }, identity);
  assert.equal(next.activeEstimateCost!.labor.value, null); assert.equal(next.activeEstimateCost!.fabrics[0].unitPrice, "0"); assert.deepEqual(next.revisions, quote.revisions);
  assert.throws(() => applyEstimateCommand(quote, { action: "estimate.update", estimate: Object.assign(structuredClone(estimate), { constructor: "unknown" }), expectedVersion: 2 }, identity));
  assert.throws(() => parseEstimateCommand({ action: "estimate.generate", expectedVersion: 1, sourceRevisionId: start.defaultRevisionId, actor: "spoof" }));
});
for (const failure of [409, "network"]) test(`Estimate persistence keeps committed Quote baseline and draft on second step ${failure}`, async () => {
  const quote = createSyntheticQuoteFixture("estimate-persistence"); let calls = 0, commands = 0;
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 7 }, {
    async load() { throw new Error("unused"); },
    async save(target, version) { calls++; assert.equal(target.activeEstimateCost!.labor.value, 0); return { quote: target, expectedVersion: version + 1 }; },
  }, { ...quoteServerClient, async estimateWorkflow(_id, command) { commands++; assert.equal(command.expectedVersion, 8); throw Object.assign(new Error("synthetic"), typeof failure === "number" ? { status: failure } : {}); } });
  const draft = structuredClone(quote); draft.revisions.at(-1)!.baseInfo.note = "Saved first"; draft.activeEstimateCost!.labor.value = 99;
  await assert.rejects(persistence.save(draft), (e: unknown) => Boolean(e && typeof e === "object" && "quoteSavedVersion" in e && e.quoteSavedVersion === 8));
  assert.equal(persistence.getVersion(), 8); assert.equal(persistence.getBaseline().activeEstimateCost!.labor.value, 0); assert.equal(draft.activeEstimateCost!.labor.value, 99);
  await assert.rejects(persistence.estimate({ action: "estimate.restore", estimateId: "old" }));
  assert.equal(calls, 1); assert.equal(commands, 1);
});

test("Estimate-only save shares lock, adopts Server version/baseline without redundant aggregate PUT", async () => {
  const quote = createSyntheticQuoteFixture("estimate-lock"); let puts = 0;
  let release!: () => void;
  const wait = new Promise<void>(done => { release = done; });
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 7 }, {
    async load() { throw new Error("unused"); },
    async save() { puts++; throw new Error("unexpected aggregate PUT"); },
  }, { ...quoteServerClient, async estimateWorkflow(_id, command) {
    assert.equal(command.expectedVersion, 7); assert.equal(command.action, "estimate.update");
    await wait;
    const saved = quoteSnapshotFromBrowser(quote);
    saved.activeEstimateCost = structuredClone((command as { estimate: NonNullable<typeof saved.activeEstimateCost> }).estimate);
    return { quote: saved, version: 8 };
  } });
  const draft = structuredClone(quote); draft.activeEstimateCost!.labor.value = 99;
  const pending = persistence.save(draft);
  await assert.rejects(persistence.workflow({ action: "revision.create", sourceRevisionId: quote.defaultRevisionId, reason: "其他", note: "" }));
  release();
  const saved = await pending;
  assert.equal(puts, 0); assert.equal(saved.expectedVersion, 8); assert.equal(persistence.getVersion(), 8);
  assert.equal(persistence.getBaseline().activeEstimateCost!.labor.value, 99);
});

test("invalid draft Estimate lifecycle cannot save Quote first", async () => {
  const quote = createSyntheticQuoteFixture("estimate-identity"); let writes = 0;
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 7 }, {
    async load() { throw new Error("unused"); },
    async save(target, expectedVersion) { writes++; return { quote: target, expectedVersion }; },
  });
  const draft = structuredClone(quote); draft.activeEstimateCost!.id = "client-replacement"; draft.revisions.at(-1)!.baseInfo.note = "Unsaved";
  await assert.rejects(persistence.save(draft));
  assert.equal(writes, 0); assert.equal(persistence.getVersion(), 7);
});
