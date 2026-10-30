import test from "node:test";
import assert from "node:assert/strict";
import { createQuoteDraft } from "../../features/quote-center/model/quote-view-model.js";
import { quoteSnapshotFromBrowser, validateQuote, validateQuoteReplacement } from "./model.js";

test("trim origin survives exact-decimal persistence without changing cost or inventing legacy provenance", () => {
  const quote = createQuoteDraft("origin-fixture", "QT-ORIGIN", "2026-10-30");
  const version = quote.revisions[0].priceVersions[0];
  version.trims = [{id:"trim-1", lineGroupId:"group-1", sourceLibraryItemId:"library-1", name:"品牌吊牌", specification:"", supplier:"", usage:null, unit:"个", lossRate:0, unitPrice:0, sourceOrigin:"brand"}];
  const current = quoteSnapshotFromBrowser(quote);
  validateQuote(current);
  assert.equal(current.revisions[0].priceVersions[0].trims[0].sourceOrigin,"brand");
  assert.equal(current.revisions[0].priceVersions[0].trims[0].unitPrice,"0");
  const legacy = structuredClone(current);
  delete legacy.revisions[0].priceVersions[0].trims[0].sourceOrigin;
  validateQuote(legacy);
  assert.equal("sourceOrigin" in legacy.revisions[0].priceVersions[0].trims[0],false);
  const invalid = structuredClone(current);
  Object.assign(invalid.revisions[0].priceVersions[0].trims[0],{sourceOrigin:"inferred-from-current-brand"});
  assert.throws(()=>validateQuote(invalid),/Invalid trim source origin/);
});

test("adding source provenance cannot rewrite an existing historical revision", () => {
  const quote = createQuoteDraft("history-origin", "QT-HISTORY-ORIGIN", "2026-10-30");
  const historical=structuredClone(quote.revisions[0]);
  historical.revisionId="historical";historical.readOnly=true;
  historical.priceVersions[0].trims=[{id:"old",lineGroupId:"old-group",sourceLibraryItemId:"lib",name:"旧辅料",specification:"",supplier:"",usage:1,unit:"个",lossRate:0,unitPrice:1}];
  quote.revisions.push(historical);
  const previous=quoteSnapshotFromBrowser(quote),next=structuredClone(previous);
  next.revisions[1].priceVersions[0].trims[0].sourceOrigin="brand";
  assert.throws(()=>validateQuoteReplacement(previous,next),/Historical Revision immutable/);
});
