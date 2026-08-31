import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createLocalDataStore } from "../features/data-management/repository/local-data-store.ts";
import { fabricConsumption, fabricCostAmount } from "../features/quote-center/model/quote-calculations.ts";
import { createUiQaRepositories, installUiQaDataset } from "../scripts/ui-qa-data/dataset.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

test("Correction: Quote object header uses a semantic identity block and a container-width fallback", async () => {
  const [editor, responsive] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("app/quote-center/responsive.css"),
  ]);
  assert.match(editor, /className="qc-quote-object-header" variant="object"/);
  assert.match(editor, /title=\{pageTitle\}/);
  assert.match(editor, /qc-quote-object-description/);
  assert.match(editor, /<strong>\{pageSubtitle\}<\/strong>/);
  assert.match(responsive, /container-name:\s*qc-quote-header/);
  assert.match(responsive, /@container qc-quote-header \(max-width:\s*760px\)/);
  assert.match(responsive, /qc-quote-object-header[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(responsive, /qc-workspace-metadata > :is\(b,span\)[^}]*white-space:\s*nowrap/s);
});

test("Correction: every visible Fabric Snapshot source field is directly editable in Compact Desktop", async () => {
  const source = await read("features/quote-center/components/cost-table.tsx");
  const compact = source.slice(source.indexOf("function FabricCompactCard"), source.indexOf("export function FabricCostTable"));
  assert.match(compact, /MaterialCombobox ariaLabel=\{`\$\{label\}-名称`\}/);
  assert.match(compact, /<input aria-label=\{`\$\{label\}-成分`\}/);
  assert.match(compact, /CreatableCombobox ariaLabel=\{`\$\{label\}-供应商`\}/);
  assert.match(compact, /NullableNumberInput aria-label=\{`\$\{label\}-段长`\}/);
  assert.match(compact, /NullableNumberInput aria-label=\{`\$\{label\}-净门幅`\}/);
  assert.match(compact, /NullableNumberInput aria-label=\{`\$\{label\}-克重`\}/);
  assert.match(compact, /NullableNumberInput aria-label=\{`\$\{label\}-损耗率`\}/);
  assert.match(compact, /NullableNumberInput aria-label=\{`\$\{label\}-单价`\}/);
  assert.match(compact, /role="group" aria-label=\{`\$\{label\}-采购单位`\}/);
  assert.doesNotMatch(compact, /SnapshotValue/);
});

test("Correction: consumption and cost remain Calculator-derived rather than editable fields", async () => {
  const line = {
    id: "fabric-correction",
    lineGroupId: null,
    name: "针织面料",
    composition: "95% Cotton / 5% Spandex",
    supplier: "QA Supplier",
    segmentLengthCm: 25,
    netWidthCm: 150,
    gsm: 180,
    lossRate: 10,
    unitPrice: 50,
    purchaseUnit: "kg",
    sourceLibraryItemId: null,
  };
  const beforeConsumption = fabricConsumption(line);
  const beforeCost = fabricCostAmount(line);
  const after = { ...line, segmentLengthCm: 30 };
  assert.notEqual(fabricConsumption(after), beforeConsumption);
  assert.notEqual(fabricCostAmount(after), beforeCost);

  const source = await read("features/quote-center/components/cost-table.tsx");
  const compact = source.slice(source.indexOf("function FabricCompactCard"), source.indexOf("export function FabricCostTable"));
  assert.match(compact, /const consumption = fabricConsumptionValue\(line\)/);
  assert.match(compact, /const amount = fabricCostValue\(line\)/);
  assert.match(compact, /<CompactResult label="单耗"/);
  assert.match(compact, /<CompactResult label="面料成本"/);
});

test("Correction: Compact Fabric uses grouped fields while Mobile keeps a task card", async () => {
  const [css, component] = await Promise.all([
    read("app/quote-center/quote-center.css"),
    read("features/quote-center/components/cost-table.tsx"),
  ]);
  assert.match(css, /@container qc-cost-section \(max-width:\s*699px\)[\s\S]*qc-fabric-compact-grid \.is-name[\s\S]*grid-column:\s*span 6/);
  assert.match(css, /qc-fabric-compact-grid \.is-segment[\s\S]*grid-column:\s*span 2/);
  assert.match(css, /@container qc-cost-section \(max-width:\s*459px\)[\s\S]*grid-template-columns:\s*repeat\(2/);
  assert.match(component, /qc-cost-mobile-renderer qc-mobile-cost-list/);
  assert.match(component, /qc-mobile-cost-card/);
});

test("Correction: Order Detail preserves one cockpit and consumes the full context-free Workspace width", async () => {
  const [source, css] = await Promise.all([
    read("features/order-center/components/order-pages.tsx"),
    read("app/order-center/order-center.css"),
  ]);
  const workspaceIndex = source.indexOf('className="oc-order-workspace"');
  const detail = source.slice(source.lastIndexOf("return <AppShell", workspaceIndex), source.indexOf("const creationIssues", workspaceIndex));
  assert.equal((detail.match(/<AppShell/g) ?? []).length, 1);
  assert.equal((detail.match(/<Workspace/g) ?? []).length, 1);
  assert.equal((detail.match(/id="order-overview"/g) ?? []).length, 1);
  assert.match(detail, /className="oc-cockpit-card"/);
  assert.match(css, /\.oc-order-workspace \.qc-workspace-layout\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("Correction: QA Loader is DEV-only, documents Origin/Profile scope, and remains idempotent", async () => {
  const [loader, docs] = await Promise.all([
    read("scripts/generate-ui-qa-data.mjs"),
    read("docs/ui-redesign/qa-dataset.md"),
  ]);
  assert.match(loader, /window\.location\.origin/);
  assert.match(loader, /Browser Profile/);
  assert.match(loader, /zhixu\.erp\.local\.\*/);
  assert.match(loader, /location\.port === "3001"/);
  assert.match(loader, /__dev-ui-qa-data\.html/);
  assert.doesNotMatch(loader, /app\/api|postgres|schemaVersion\s*=/i);
  assert.match(docs, /Origin/i);
  assert.match(docs, /Browser Profile/i);

  const storage = new MemoryStorage();
  const store = createLocalDataStore({ storage, namespace: "zhixu.erp.test-post-phase6-correction", environment: "development", now: () => "2026-08-31T00:00:00.000Z" });
  const first = await installUiQaDataset(createUiQaRepositories(store));
  const second = await installUiQaDataset(createUiQaRepositories(store));
  assert.equal(first.counts.quotes, 72);
  assert.equal(first.counts.orders, 168);
  assert.equal(second.installation.quotesAdded, 0);
  assert.equal(second.installation.quotesSkipped, 72);
  assert.equal(second.installation.ordersAdded, 0);
  assert.equal(second.installation.ordersSkipped, 168);
  assert.equal(second.installation.assignmentsAdded, 0);
  assert.equal(second.installation.closingAllocationsAdded, 0);
});
