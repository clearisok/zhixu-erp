import assert from "node:assert/strict";
import test from "node:test";
import { loadServerListPreferences, normalizeServerListPreferences, saveServerListPreferences } from "../list-preferences.ts";
test("Server list preferences only use new trusted-user UI keys, never old business settings", () => {
  const values = new Map<string, string>([["zhixu.erp.local.quotes", "PRIVATE-OLD"], ["quote-settings.user", "OLD-PREFERENCES"]]);
  const accessed: string[] = [];
  const store = { getItem(k: string) { accessed.push(k); return values.get(k) ?? null; }, setItem(k: string, v: string) { accessed.push(k); values.set(k, v); } };
  const first = loadServerListPreferences(store, "trusted-A", ["quote.view", "quote.cost.view"]);
  saveServerListPreferences(store, { ...first, visibleColumns: ["quote", "labor"], columnWidths: { labor: 9999 }, columnOrder: ["labor", "quote"] }, ["quote.view", "quote.cost.view"]);
  assert.deepEqual(loadServerListPreferences(store, "trusted-A", ["quote.view"]).visibleColumns, ["quote"]);
  assert.equal(loadServerListPreferences(store, "trusted-A", ["quote.view", "quote.cost.view"]).columnWidths.labor, 720);
  assert.ok(loadServerListPreferences(store, "trusted-B", ["quote.view"]).visibleColumns.includes("brand"));
  assert.ok(accessed.every(k => k.startsWith("zhixu.ui.server.quote-list.v1.")));
  assert.equal(values.get("zhixu.erp.local.quotes"), "PRIVATE-OLD");
  assert.doesNotMatch([...values].filter(([k]) => k.startsWith("zhixu.ui.")).map(([, v]) => v).join(""), /newQuoteDefaults|estimate|amount|rate/u);
});
test("preferences fail safe for corrupted inputs and do not restore revoked columns", () => {
  const result = normalizeServerListPreferences("trusted", ["quote.view"], { userId: "other", visibleColumns: ["labor", "quote", "quote", "evil"], columnOrder: ["evil", "quote"], columnWidths: { quote: -1 } });
  assert.deepEqual(result.visibleColumns, ["quote"]); assert.equal(result.userId, "trusted"); assert.equal(result.columnWidths.quote, 56);
});
test("new Server layout is compact but existing explicit columns and widths survive", () => {
  const permissions = ["quote.view", "quote.cost.view", "commercial.sale.view", "commercial.labor.view"];
  const defaults = normalizeServerListPreferences("trusted", permissions);
  assert.equal(defaults.visibleColumns.length, 15);
  assert.ok(defaults.visibleColumns.includes("fabricCost"));
  assert.ok(!defaults.visibleColumns.includes("quote"));
  assert.equal(defaults.presentation, "original");
  const existing = normalizeServerListPreferences("trusted", permissions, { visibleColumns: ["salesperson", "confirmedLabor", "confirmedGarment", "date"], columnOrder: ["date", "salesperson"], columnWidths: { salesperson: 320 } });
  assert.deepEqual(existing.visibleColumns, ["salesperson", "confirmedLabor", "confirmedGarment", "date"]);
  assert.equal(existing.columnWidths.salesperson, 320);
  assert.deepEqual(existing.columnOrder.slice(0, 2), ["date", "salesperson"]);
  assert.equal(existing.presentation, "fields");
});
