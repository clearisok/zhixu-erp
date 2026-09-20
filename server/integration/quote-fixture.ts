import { createEstimateCostFromRevision } from "../../features/quote-center/model/estimate-cost.js";
import { createQuoteDraft, type Quote } from "../../features/quote-center/model/quote-view-model.js";
import { createRevisionFromSnapshot } from "../../features/quote-center/model/quote-workflows.js";

export function createSyntheticQuoteFixture(id: string, type: "processing" | "distribution" = "distribution"): Quote {
  let quote = createQuoteDraft(id, `QT-SYNTHETIC-${id}`, "2026-01-01");
  const revision = quote.revisions[0];
  revision.createdAt = "2026-01-01T00:00:00.000Z";
  revision.createdBy = "synthetic provenance";
  revision.baseInfo = { ...revision.baseInfo, brandId: "missing-brand", brandName: "Snapshot Brand", salespersonId: "missing-person", salespersonName: "Snapshot Person", quoteType: type };
  revision.imageAttachmentIds = ["synthetic-image"];
  revision.fileAttachmentIds = ["synthetic-file"];
  revision.styleImageAttachmentId = "synthetic-image";
  revision.garmentMedia = [{ id: "legacy-ref", fileName: "synthetic.png", fileType: "image/png", url: "https://example.invalid/synthetic.png" }];
  const version = revision.priceVersions[0];
  version.quantity = 0;
  version.pricingParameters = { ...version.pricingParameters, manufacturingCountry: "", manufacturingPresetId: null, manufacturingPresetName: "", usdCnyRate: 7.123456789, markupRate: 0, freightAmount: null };
  version.labor = { value: 0, description: "Synthetic labor" };
  version.fabrics = ["fabric-a", "fabric-b"].map((rowId) => ({ id: rowId, lineGroupId: "same-group", independentFields: ["unitPrice"], sourceLibraryItemId: "missing-fabric", name: "Same Fabric", composition: "Synthetic", segmentLengthCm: null, netWidthCm: 0, gsm: 123.4567, lossRate: null, supplier: "", unitPrice: 0, purchaseUnit: "kg" }));
  version.trims = ["trim-a", "trim-b"].map((rowId) => ({ id: rowId, name: "Same Trim", sourceLibraryItemId: null, specification: "", supplier: "", usage: null, unit: "piece", lossRate: 0, unitPrice: 1.25 }));
  version.otherCosts = [{ id: "other-a", name: "Other", specification: "", usage: 0, unit: "", lossRate: null, unitPrice: null, amount: 0, source: "global", globalSettingId: "missing-setting", overridden: true }];
  version.confirmation = { quotedGarmentPrice: 987.654321, confirmedGarmentPrice: null, quotedLaborPrice: 32.1, confirmedLaborPrice: 0, note: "Historical value", confirmedAt: "2026-01-01T00:00:00Z" };
  revision.confirmationSummary = { confirmedCount: 1, totalCount: 2 };
  revision.priceVersions.push({ ...structuredClone(version), id: "parallel-pv", quantity: null, pricingParameters: { ...version.pricingParameters, laborCurrency: "USD" }, confirmation: null });
  quote = createRevisionFromSnapshot(quote, { sourceRevisionId: revision.revisionId, revisionId: "revision-two", createdBy: "synthetic provenance", nowIso: "2026-02-01T00:00:00Z", reason: "其他" });
  quote.estimateCostHistory = [createEstimateCostFromRevision({ quoteId: id, revision: quote.revisions[0], id: "estimate-old", generatedAt: "2026-01-02", generatedBy: "synthetic" })];
  quote.activeEstimateCost = createEstimateCostFromRevision({ quoteId: id, revision: quote.revisions[0], id: "estimate-active", generatedAt: "2026-02-02", generatedBy: "synthetic" });
  quote.activeEstimateCost.ignoredForRevisionId = quote.defaultRevisionId;
  return quote;
}
