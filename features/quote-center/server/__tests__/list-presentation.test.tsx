import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeServerListPreferences } from "../list-preferences.ts";
import { applyPresentedTablePreference, fittedPresentedTablePreference, presentedListColumns, presentedMinWidth, presentedTablePreference } from "../list-presentation.ts";
import { ServerListCell } from "../../components/server-list-cell.tsx";
import type { QuoteServerListItem } from "../quote-server-client.ts";

const permissions = ["quote.view", "quote.cost.view"];
test("first/reset layout fills available space without changing persisted defaults; manual and legacy pixels never refit", () => {
  const defaults = normalizeServerListPreferences("u", permissions);
  assert.equal(defaults.widthMode,"fill");
  for (const container of [1018,1200,1440,1740]) {
    const fitted = fittedPresentedTablePreference(defaults,container);
    assert.equal(Object.values(fitted.columnWidths).reduce((a,b)=>a+b,104),container);
    assert.ok(fitted.columnWidths.type>=100);
    assert.equal(defaults.columnWidths.styleIdentity,156);
    const resized=applyPresentedTablePreference(defaults,{...fitted,columnWidths:{...fitted.columnWidths,styleIdentity:100}});
    assert.equal(resized.widthMode,"manual");
    assert.deepEqual(fittedPresentedTablePreference(resized,container+300).columnWidths,{...fitted.columnWidths,styleIdentity:100});
  }
  const legacy=normalizeServerListPreferences("u",permissions,{...defaults,widthMode:undefined,columnWidths:{...defaults.columnWidths,styleIdentity:100}});
  assert.equal(legacy.widthMode,"manual");assert.equal(fittedPresentedTablePreference(legacy,1700).columnWidths.styleIdentity,100);
  const narrow=fittedPresentedTablePreference(defaults,700);
  assert.ok(Object.values(narrow.columnWidths).reduce((a,b)=>a+b,104)>700,"internal scrolling instead of crushing columns");
});
test("style identity floor is 80px while default and saved personal widths remain unchanged", () => {
  const defaults = normalizeServerListPreferences("u", permissions);
  assert.equal(defaults.columnWidths.styleIdentity, 156);
  assert.equal(presentedMinWidth("styleIdentity", ["styleIdentity"]), 80);
  for (const presentation of ["original", "fields"] as const) {
    const saved = normalizeServerListPreferences("u", permissions, { ...defaults, presentation, columnWidths: { ...defaults.columnWidths, styleIdentity: 100 } });
    assert.equal(presentedTablePreference(saved).columnWidths.styleIdentity, 100);
    assert.deepEqual(normalizeServerListPreferences("u", permissions, saved), saved);
  }
});
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
  assert.equal(next.groupWidths["group.brand"], 300);
  assert.equal(next.columnWidths.brand, preferences.columnWidths.brand);
  assert.equal(next.columnWidths.salesperson, preferences.columnWidths.salesperson);
  assert.equal(presentedListColumns(next)[0].key, "date");
});
