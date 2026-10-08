import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteDraft, getDefaultRevision } from "../../model/quote-view-model";
import { quoteSnapshotFromBrowser, type ServerQuote } from "../../../../server/quotes/model";
import { applyQuoteVersionCommand, type QuoteVersionCommand } from "../../../../server/quotes/version-workflows";

let sequence = 0;
const identity = { id: () => `synthetic-status-${++sequence}`, actor: "Synthetic actor", now: "2026-10-08T12:00:00.000Z" };
function draft(): ServerQuote {
  const quote = createQuoteDraft("status-fixture", "QT-STATUS", "2026-10-08");
  const revision = getDefaultRevision(quote);
  Object.assign(revision.baseInfo, { brandId: "brand", salespersonId: "salesperson", quoteStyleNo: "SYNTHETIC", styleName: "Synthetic" });
  revision.priceVersions[0].quantity = 0; revision.priceVersions[0].labor.value = 0;
  return quoteSnapshotFromBrowser(quote);
}
function price(quote: ServerQuote, action: "price.create" | "price.update" | "price.delete", id = quote.revisions[0].priceVersions[0].id): ServerQuote {
  const command: QuoteVersionCommand = action === "price.delete"
    ? { action, expectedVersion: 1, revisionId: quote.defaultRevisionId, priceVersionId: id }
    : { action, expectedVersion: 1, revisionId: quote.defaultRevisionId, priceVersionId: id, name: "Scenario", quantity: "0", description: "Synthetic" };
  return applyQuoteVersionCommand(quote, command, identity);
}
for (const status of ["draft", "quoting"] as const) test(`${status} without confirmations survives PV create/update/delete`, () => {
  let quote = draft(); quote.aggregateStatus = status;
  for (const action of ["price.create", "price.update", "price.delete"] as const) {
    quote = price(quote, action); assert.equal(quote.aggregateStatus, status, action);
    assert.equal(quote.revisions[0].confirmationSummary.confirmedCount, 0);
  }
});
test("confirmed/partial status follows remaining confirmations, including removal of the last confirmation", () => {
  let quote = draft(); quote.aggregateStatus = "confirmed";
  const source = quote.revisions[0].priceVersions[0];
  source.confirmation = { quotedGarmentPrice: "1", confirmedGarmentPrice: "1", quotedLaborPrice: "0", confirmedLaborPrice: "0", note: "Synthetic", confirmedAt: identity.now };
  const sourceId = source.id;
  quote = price(quote, "price.create"); assert.equal(quote.aggregateStatus, "partially_confirmed");
  quote = price(quote, "price.update"); assert.equal(quote.aggregateStatus, "partially_confirmed");
  quote = price(quote, "price.delete", quote.revisions[0].priceVersions[1].id); assert.equal(quote.aggregateStatus, "confirmed");
  quote = price(quote, "price.create");
  quote = price(quote, "price.delete", sourceId); assert.equal(quote.aggregateStatus, "quoting");
});
test("Revision creation still starts quoting with reset confirmations", () => {
  const quote = draft();
  const next = applyQuoteVersionCommand(quote, { action: "revision.create", sourceRevisionId: quote.defaultRevisionId, expectedVersion: 1, reason: "其他", note: "" }, identity);
  assert.equal(next.aggregateStatus, "quoting"); assert.equal(next.revisions.at(-1)!.confirmationSummary.confirmedCount, 0);
  assert.equal(quote.aggregateStatus, "draft");
});
