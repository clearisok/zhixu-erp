import assert from "node:assert/strict";
import test from "node:test";
import { normalizeServerListPreferences } from "../list-preferences.ts";
import { applyPresentedTablePreference, presentedTablePreference } from "../list-presentation.ts";

test("group resize has separate stable width, never overwrites independent field widths", () => {
  const before = normalizeServerListPreferences("u", ["quote.view", "quote.cost.view"]);
  const table = presentedTablePreference(before);
  const after = applyPresentedTablePreference(before, { ...table, columnWidths: { ...table.columnWidths, brand: 320 } });
  assert.equal(after.columnWidths.brand, before.columnWidths.brand);
  assert.equal(presentedTablePreference(after).columnWidths.brand, 320);
  const filtered = normalizeServerListPreferences("u", ["quote.view"], { ...after, visibleColumns: before.visibleColumns.filter(k => k !== "brand") });
  assert.equal(presentedTablePreference(filtered).columnWidths.salesperson, 320, "Same group width survives a different visible representative");
  assert.equal(presentedTablePreference({ ...after, presentation: "fields" }).columnWidths.brand, before.columnWidths.brand);
});
