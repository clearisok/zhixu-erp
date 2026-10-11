import assert from "node:assert/strict";
import test from "node:test";
import { createSyntheticQuoteFixture } from "../../../../server/integration/quote-fixture";
import { quoteSnapshotFromBrowser } from "../../../../server/quotes/model";
import { projectQuoteResponse } from "../../../../server/quotes/quote-response";
import { editableRecord } from "../quote-server-editor-adapter";
import { createQuoteEditorPersistence } from "../quote-editor-persistence";
import { createQuoteServerClient } from "../quote-server-client";
import { readableEstimateQuote } from "../../model/quote-editor-data";
import type { TrustedIdentity } from "../../../../server/auth/session";

const actor: TrustedIdentity = { internalUserId: "1", userId: "synthetic", username: "synthetic", userName: "Synthetic", permissions: ["quote.view", "quote.edit", "quote.cost.view"] };
const record = () => ({ quote: quoteSnapshotFromBrowser(createSyntheticQuoteFixture("permission-editor")), version: 7 });

test("restricted projection is independent of Estimate presence; adapter retains omitted fields rather than fake empty values", () => {
  const full = record();
  full.quote.activeEstimateCost!.labor.description = "PRIVATE-UNIT-PROBE";
  const restricted = projectQuoteResponse(actor, full);
  assert.equal(JSON.stringify(restricted).includes("PRIVATE-UNIT-PROBE"), false);
  const editable = editableRecord(restricted);
  assert.equal(editable.estimateVisibility, "restricted");
  assert.equal(Object.hasOwn(editable.quote, "activeEstimateCost"), false);
  assert.equal(Object.hasOwn(editable.quote, "estimateCostHistory"), false);
  assert.throws(() => readableEstimateQuote(editable.quote));
  assert.equal(full.quote.activeEstimateCost!.labor.description, "PRIVATE-UNIT-PROBE");
  assert.throws(() => editableRecord({ ...restricted, estimateVisibility: "restricted", quote: full.quote }));
});

test("generic wire PUT contains only Quote content even for Estimate readers", async () => {
  let body: Record<string, unknown> = {};
  const client = createQuoteServerClient({ fetchImpl: async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ quote: record() }), { status: 200 });
  } });
  await client.save(record().quote, 7);
  assert.equal(Object.hasOwn(body.quote as object, "activeEstimateCost"), false);
  assert.equal(Object.hasOwn(body.quote as object, "estimateCostHistory"), false);
  assert.equal(body.expectedVersion, 7);
});

test("restricted persistence saves and adopts version without loading/creating Estimate; injection and failures block further writes", async () => {
  const initial = editableRecord(projectQuoteResponse(actor, record()));
  let calls = 0;
  const adapter = { load: async () => initial, save: async (quote: typeof initial.quote, version: number) => {
    calls++; assert.equal(Object.hasOwn(quote, "estimateCostHistory"), false);
    return { ...initial, quote, expectedVersion: version + 1 };
  } };
  const persistence = createQuoteEditorPersistence(initial, adapter);
  const draft = structuredClone(initial.quote); draft.revisions.at(-1)!.baseInfo.note = "Allowed Quote edit";
  assert.equal(persistence.canReadEstimate(), false);
  assert.equal((await persistence.save(draft)).expectedVersion, 8);
  assert.equal(Object.hasOwn(persistence.getBaseline(), "activeEstimateCost"), false);
  await assert.rejects(persistence.save({ ...draft, activeEstimateCost: null }));
  await assert.rejects(persistence.save(draft)); assert.equal(calls, 1);
  for (const failure of [new Error("409"), new Error("network")]) {
    const failed = createQuoteEditorPersistence(initial, { ...adapter, save: async () => { throw failure; } });
    await assert.rejects(failed.save(draft), failure);
    assert.equal(failed.getVersion(), 7); assert.equal(draft.revisions.at(-1)!.baseInfo.note, "Allowed Quote edit");
    await assert.rejects(failed.workflow({ action: "price.delete", revisionId: "synthetic", priceVersionId: "synthetic" }));
  }
});
