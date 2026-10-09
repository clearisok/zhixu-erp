import assert from "node:assert/strict";
import test from "node:test";
import { businessValues, allowedBusinessColumns, type BusinessSource } from "../../model/quote-business-view.ts";
import { createQuoteDraft } from "../../model/quote-view-model.ts";
import { quoteSnapshotFromBrowser } from "../../../../server/quotes/decimal-projection.ts";
const source = (): BusinessSource => {
  const quote = quoteSnapshotFromBrowser(createQuoteDraft("synthetic", "QT-TEST", "2026-10-09"));
  const revision = quote.revisions[0];
  const cost = (value: string, currency: "CNY" | "USD") => ({ ...revision.priceVersions[0], labor: { value, description: "synthetic" }, pricingParameters: { ...revision.priceVersions[0].pricingParameters, laborCurrency: currency, usdCnyRate: "7", markupRate: "0" } });
  return { id: quote.id, quoteCode: quote.quoteCode, version: 1, revisionId: revision.revisionId, revisionLabel: "V1", status: "draft", baseInfo: revision.baseInfo,
    versions: [{ id: "a", name: "A", quantity: "0", cost: cost("0", "CNY"), confirmation: { linkage: "linked", labor: "12", garment: "88", currency: "USD", confirmed: true, termsVersion: 4 } },
      { id: "b", name: "B", quantity: "10", cost: cost("2", "USD"), confirmation: { linkage: "unlinked", labor: "0", garment: null, currency: "CNY", confirmed: false, termsVersion: null } }] };
};
test("business projection preserves quantity/null/zero and per-PV values", () => {
  const root = source();
  assert.equal(businessValues(root, ["quantity"]).quantity?.value, 10);
  assert.equal(businessValues(root, ["quantity"], root.versions[0]).quantity?.value, 0);
  root.versions.forEach(v => v.quantity = null);
  assert.equal(businessValues(root, ["quantity"]).quantity?.value, null);
});
test("cost projection reuses calculator, currencies and final garment formatter", () => {
  const result = businessValues(source(), ["labor", "garmentPrice"]);
  assert.equal(result.labor?.display, "CNY ¥0.00 · USD $2.00");
  assert.equal(result.garmentPrice!.display, "¥0.0 – ¥15.8"); // Existing USD labor conversion rule, not a new conversion policy.
});
test("current confirmation is separate from aggregate status, qualified currency and unknown", () => {
  const root = source();
  const result = businessValues(root, ["confirmedLabor", "confirmedGarment", "confirmationStatus", "status"]);
  assert.equal(result.confirmedLabor?.value, "USD $12.00 · CNY ¥0.00");
  assert.equal(result.confirmedGarment?.value, 88);
  assert.equal(result.confirmationStatus?.value, "部分确认（1/2）");
  assert.equal(result.status?.value, "草稿");
  root.versions[0].confirmation!.linkage = "unknown";
  assert.equal(businessValues(root, ["confirmedLabor"]).confirmedLabor?.value, "关联未核实");
});
test("ordinary selected columns never inspect protected or precision-unsafe slices", () => {
  const root = source(); root.versions[0].cost = { value: "0.123456789012345678901" };
  assert.equal(businessValues(root, ["quote"]).quote?.value, "QT-TEST");
  assert.throws(() => businessValues(root, ["labor"]), /round-trip/u);
  assert.ok(!allowedBusinessColumns(["quote.view"]).includes("labor"));
  assert.ok(allowedBusinessColumns(["quote.view"]).includes("confirmationStatus"));
});
