import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeServerListPreferences } from "../list-preferences.ts";
import { applyPresentedTablePreference, presentedListColumns, presentedTablePreference } from "../list-presentation.ts";
import { ServerListCell } from "../../components/server-list-cell.tsx";
import type { QuoteServerListItem } from "../quote-server-client.ts";

const permissions = ["quote.view", "quote.cost.view"];
test("original default has nine visual cells plus action, formal fields remain independent", () => {
  const defaults = normalizeServerListPreferences("u", permissions);
  const columns = presentedListColumns(defaults);
  assert.equal(columns.length, 9);
  assert.deepEqual(columns.flatMap(column => column.fields), defaults.visibleColumns);
  assert.deepEqual(columns.find(column => column.key === "fabricCost")?.fields, ["fabricCost", "trimCost", "labor"]);
});
test("existing v1 field layout/order/width remains lossless and normalization idempotent", () => {
  const old = { visibleColumns: ["status", "salesperson", "brand", "confirmedLabor"], columnOrder: ["salesperson", "status", "brand", "confirmedLabor"], columnWidths: { salesperson: 310, brand: 255 } };
  const safe = normalizeServerListPreferences("u", permissions, old);
  assert.equal(safe.presentation, "fields");
  assert.deepEqual(presentedListColumns(safe).map(column => column.key), ["salesperson", "status", "brand", "confirmedLabor"]);
  assert.equal(safe.columnWidths.salesperson, 310);
  assert.deepEqual(normalizeServerListPreferences("u", permissions, safe), safe);
});
test("hidden/revoked children never render, including tooltip/record markup", () => {
  const preferences = normalizeServerListPreferences("u", ["quote.view"], { presentation: "original", visibleColumns: ["brand", "fabricCost"], columnOrder: ["brand", "salesperson", "fabricCost"] });
  assert.deepEqual(presentedListColumns(preferences), [{ key: "brand", fields: ["brand"] }]);
  const row = { business: { brand: { display: "Allowed" }, salesperson: { display: "HIDDEN-PERSON" }, fabricCost: { display: "SECRET-COST" } }, confirmationSources: [{ priceVersionId: "SECRET-SOURCE" }] } as unknown as QuoteServerListItem;
  const markup = renderToStaticMarkup(<ServerListCell row={row} fields={presentedListColumns(preferences)[0].fields} />);
  assert.match(markup, /Allowed/); assert.doesNotMatch(markup, /HIDDEN|SECRET/);
});
test("group move/resize preserves all IDs and hidden child widths", () => {
  const preferences = normalizeServerListPreferences("u", permissions);
  const table = presentedTablePreference(preferences);
  const next = applyPresentedTablePreference(preferences, { ...table, columnOrder: [...table.columnOrder].reverse(), columnWidths: { ...table.columnWidths, brand: 300, salesperson: 999 } });
  assert.deepEqual([...next.columnOrder].sort(), [...preferences.columnOrder].sort());
  assert.equal(next.columnWidths.brand, 300);
  assert.equal(next.columnWidths.salesperson, preferences.columnWidths.salesperson);
  assert.equal(presentedListColumns(next)[0].key, "date");
});
