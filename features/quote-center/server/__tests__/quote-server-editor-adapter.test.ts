import assert from "node:assert/strict";
import test from "node:test";
import { createSyntheticQuoteFixture } from "../../../../server/integration/quote-fixture";
import { normalizeServerQuote, quoteSnapshotFromBrowser, type ServerQuote } from "../../../../server/quotes/decimal-projection";
import type { QuoteRecord } from "../../../../server/quotes/model";
import {
  UnsafeServerQuoteDecimalError,
  browserNumberFromExactDecimal,
  createQuoteServerEditorAdapter,
  editableQuoteFromServer,
  serverQuoteFromEditable,
} from "../quote-server-editor-adapter";
import type { QuoteServerRepository } from "../quote-server-repository";

test("lossless bridge preserves the full synthetic aggregate, null, explicit zero, IDs, and attachments", () => {
  const browserQuote = createSyntheticQuoteFixture("writer-round-trip", "distribution");
  const serverQuote = quoteSnapshotFromBrowser(browserQuote);
  const editable = editableQuoteFromServer(serverQuote);
  const revision = editable.revisions.find((item) => item.revisionId === editable.defaultRevisionId)!;
  const version = revision.priceVersions[0];

  assert.equal(version.quantity, 0);
  assert.equal(version.pricingParameters.freightAmount, null);
  assert.equal(version.fabrics[0].netWidthCm, 0);
  assert.equal(version.trims[0].usage, null);
  assert.equal(revision.baseInfo.brandId, "missing-brand");
  assert.deepEqual(revision.imageAttachmentIds, ["synthetic-image"]);
  assert.deepEqual(normalizeServerQuote(serverQuoteFromEditable(editable)), normalizeServerQuote(serverQuote));
  const processing = createSyntheticQuoteFixture("writer-processing", "processing");
  assert.deepEqual(serverQuoteFromEditable(editableQuoteFromServer(quoteSnapshotFromBrowser(processing))), quoteSnapshotFromBrowser(processing));
});

test("ordinary decimals convert exactly and unsafe high precision fails closed", () => {
  assert.equal(browserNumberFromExactDecimal("7.123456789", "rate"), 7.123456789);
  assert.equal(browserNumberFromExactDecimal("0", "zero"), 0);
  assert.throws(() => browserNumberFromExactDecimal("12345678901234567890.123456789", "unsafe"), UnsafeServerQuoteDecimalError);

  const unsafe = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("writer-unsafe"));
  unsafe.revisions.find((item) => item.revisionId === unsafe.defaultRevisionId)!.priceVersions[0].quantity = "9007199254740993";
  assert.throws(() => editableQuoteFromServer(unsafe), (error: unknown) => error instanceof UnsafeServerQuoteDecimalError && error.fieldPath.endsWith("quantity"));
});

test("editor adapter loads and saves only through getById/save and accepts Server response version", async () => {
  const quote = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("writer-adapter"));
  let current: QuoteRecord = { quote, version: 4 };
  const calls: string[] = [];
  const repository: QuoteServerRepository = {
    async list() { throw new Error("list must not be used"); },
    async getById(id) { calls.push(`get:${id}`); return current; },
    async create() { throw new Error("create must not be used"); },
    async save(next: ServerQuote, expectedVersion: number) {
      calls.push(`save:${expectedVersion}`);
      assert.equal(expectedVersion, 4);
      current = { quote: next, version: 9 };
      return current;
    },
  };
  const adapter = createQuoteServerEditorAdapter(repository);
  const loaded = await adapter.load("writer-adapter");
  loaded.quote.revisions.find((item) => item.revisionId === loaded.quote.defaultRevisionId)!.baseInfo.styleName = "Server edited";
  const saved = await adapter.save(loaded.quote, loaded.expectedVersion);

  assert.deepEqual(calls, ["get:writer-adapter", "save:4"]);
  assert.equal(saved.expectedVersion, 9);
  assert.equal(saved.quote.revisions.find((item) => item.revisionId === saved.quote.defaultRevisionId)!.baseInfo.styleName, "Server edited");
});
