import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createAinuokeBridgeClient } from "../features/ainuoke-api/client/ainuoke-bridge-client.ts";
import {
  adaptAinuokeGarmentColorSizeSnapshots,
  normalizeAinuokeInsideOrderNo,
} from "../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts";
import { buildAinuokeGarmentColorSizeValidationReport } from "../features/ainuoke-sync/service/ainuoke-garment-color-size-validation.ts";

const fixtures = JSON.parse(fs.readFileSync("tests/fixtures/ainuoke-garment-color-size-6087105.redacted.json", "utf8"));
const clone = (value) => structuredClone(value);

const adaptFixture = (insideOrderNo, salesContractNo, styleNo) => adaptAinuokeGarmentColorSizeSnapshots({
  snapshots: [clone(fixtures[insideOrderNo])],
  requestedInsideOrderNo: insideOrderNo,
  expectedSalesContractNo: salesContractNo,
  expectedStyleNo: styleNo,
});

test("6087105 D1935 fixture preserves five colors, repeated upstream id and ordered 25-size mapping", async () => {
  const source = await adaptFixture("D1935", "PI2607-235", "D1935");
  assert.equal(source.colorDetailStatus, "usable");
  assert.equal(source.exactRows, 5);
  assert.equal(source.usableRows.reduce((sum, row) => sum + row.quantity, 0), 4640);
  assert.equal(new Set(source.rows.map((row) => row.sourceId)).size, 1);
  assert.equal(source.rows.filter((row) => row.quantity === 0).length, 2);
  const green = source.rows.find((row) => row.colorName === "绿色/Courtyard");
  assert.equal(green.sizeRuleTokens.length, 25);
  assert.deepEqual(green.sizeAllocations.slice(0, 4), [
    { slot: 1, sizeName: "4P", quantity: 100 },
    { slot: 2, sizeName: "6P", quantity: 200 },
    { slot: 3, sizeName: "8P", quantity: 300 },
    { slot: 4, sizeName: "10P", quantity: 400 },
  ]);
  assert.equal(green.sizeMatrixStatus, "SIZE_MATRIX_VALID");
  assert.ok(source.rows.filter((row) => row.quantity === 0).every((row) => row.sizeMatrixStatus === "ZERO_QUANTITY_WITHOUT_SIZE"));
});

test("6087105 anchor fixtures reproduce T1826-4 and 1917U color totals", async () => {
  const t1826 = await adaptFixture("T1826-4", "PI2508-025", "T1826-4");
  const u1917 = await adaptFixture("1917U", "PI2511-141", "MS1917U");
  assert.deepEqual([t1826.exactRows, t1826.usableRows.reduce((sum, row) => sum + row.quantity, 0)], [3, 3730]);
  assert.deepEqual([u1917.exactRows, u1917.usableRows.reduce((sum, row) => sum + row.quantity, 0)], [2, 9393]);
  assert.ok([...t1826.rows, ...u1917.rows].every((row) => row.sizeMatrixStatus === "SIZE_MATRIX_VALID"));
});

test("contains results are exact-filtered after whitespace and Unicode normalization", async () => {
  const snapshot = clone(fixtures.D1935);
  snapshot.total = 2;
  snapshot.rows = [
    snapshot.rows[0],
    { ...snapshot.rows[1], sourceRowIdentity: "6087105:sha256:false-positive", values: { ...snapshot.rows[1].values, insideorderno: "XD1935" } },
  ];
  const source = await adaptAinuokeGarmentColorSizeSnapshots({ snapshots: [snapshot], requestedInsideOrderNo: " D 1935 ", expectedSalesContractNo: "PI2607-235", expectedStyleNo: "D1935" });
  assert.equal(normalizeAinuokeInsideOrderNo(" D 1935 "), "D1935");
  assert.equal(source.exactRows, 1);
  assert.equal(source.containsFalsePositiveRows, 1);
  assert.equal(source.rows[0].insideOrderNo, "D1935");
});

test("no exact rows means missing detail rather than missing SalesOrder", async () => {
  const snapshot = clone(fixtures.D1935);
  snapshot.total = 1;
  snapshot.rows = [{ ...snapshot.rows[0], values: { ...snapshot.rows[0].values, insideorderno: "D1935-1" } }];
  const source = await adaptAinuokeGarmentColorSizeSnapshots({ snapshots: [snapshot], requestedInsideOrderNo: "D1935", expectedSalesContractNo: "PI2607-235", expectedStyleNo: "D1935" });
  assert.equal(source.colorDetailStatus, "missing");
  assert.equal(source.exactRows, 0);
  assert.equal(source.containsFalsePositiveRows, 1);
});

test("critical row anomalies fail the complete color slice closed without inventing facts", async () => {
  const cases = [
    ["BLANK_COLOR", (rows) => { rows[0].values.CnColor = ""; }],
    ["INVALID_SIZE_NUM", (rows) => { rows[0].values.SizeNum = "not-a-number"; }],
    ["BILL_NO_MISMATCH", (rows) => { rows[0].values.BillNo = "PI-WRONG"; }],
    ["DUPLICATE_SOURCE_IDENTITY", (rows) => { rows[1].sourceRowIdentity = rows[0].sourceRowIdentity; }],
  ];
  for (const [code, mutate] of cases) {
    const snapshot = clone(fixtures.D1935);
    mutate(snapshot.rows);
    const source = await adaptAinuokeGarmentColorSizeSnapshots({ snapshots: [snapshot], requestedInsideOrderNo: "D1935", expectedSalesContractNo: "PI2607-235", expectedStyleNo: "D1935" });
    assert.equal(source.colorDetailStatus, "invalid", code);
    assert.equal(source.usableRows.length, 0, code);
    assert.ok(source.issues.some((issue) => issue.code === code), code);
  }
});

test("SizeRule anomalies remain explicit typed evidence and do not invalidate otherwise usable colors", async () => {
  const snapshot = clone(fixtures["T1826-4"]);
  snapshot.total = 3;
  snapshot.rows[0].values.Size1 = 499;
  snapshot.rows[1].values.SizeRule = "";
  snapshot.rows[2].values.SizeRule = "S,M";
  const source = await adaptAinuokeGarmentColorSizeSnapshots({ snapshots: [snapshot], requestedInsideOrderNo: "T1826-4", expectedSalesContractNo: "PI2508-025", expectedStyleNo: "T1826-4" });
  assert.equal(source.colorDetailStatus, "usable");
  assert.deepEqual(new Set(source.rows.map((row) => row.sizeMatrixStatus)), new Set([
    "SIZE_MATRIX_QUANTITY_MISMATCH",
    "SIZE_RULE_MISSING",
    "SIZE_MATRIX_RULE_OVERFLOW",
  ]));
  assert.equal(new Set(source.rows.map((row) => row.sizeRuleRaw)).size, 3);
});

test("zero-quantity rows only accept absent or zero SizeN values", async () => {
  const withZero = clone(fixtures.D1935);
  const zeroRow = withZero.rows.find((row) => Number(row.values.SizeNum) === 0);
  zeroRow.values.Size1 = 0;
  const accepted = await adaptAinuokeGarmentColorSizeSnapshots({ snapshots: [withZero], requestedInsideOrderNo: "D1935", expectedSalesContractNo: "PI2607-235", expectedStyleNo: "D1935" });
  assert.equal(accepted.rows.find((row) => row.sourceRowIdentity === zeroRow.sourceRowIdentity).sizeMatrixStatus, "ZERO_QUANTITY_WITH_SIZE");

  const withNonZero = clone(fixtures.D1935);
  const invalidZeroRow = withNonZero.rows.find((row) => Number(row.values.SizeNum) === 0);
  invalidZeroRow.values.Size1 = 1;
  const rejected = await adaptAinuokeGarmentColorSizeSnapshots({ snapshots: [withNonZero], requestedInsideOrderNo: "D1935", expectedSalesContractNo: "PI2607-235", expectedStyleNo: "D1935" });
  assert.equal(rejected.rows.find((row) => row.sourceRowIdentity === invalidZeroRow.sourceRowIdentity).sizeMatrixStatus, "SIZE_MATRIX_QUANTITY_MISMATCH");
});

test("row ordering and source hash are deterministic and color name alone is not identity", async () => {
  const firstSnapshot = clone(fixtures.D1935);
  const reversedSnapshot = clone(fixtures.D1935);
  reversedSnapshot.rows.reverse();
  const first = await adaptAinuokeGarmentColorSizeSnapshots({ snapshots: [firstSnapshot], requestedInsideOrderNo: "D1935", expectedSalesContractNo: "PI2607-235", expectedStyleNo: "D1935" });
  const reversed = await adaptAinuokeGarmentColorSizeSnapshots({ snapshots: [reversedSnapshot], requestedInsideOrderNo: "D1935", expectedSalesContractNo: "PI2607-235", expectedStyleNo: "D1935" });
  assert.equal(first.sourceHash, reversed.sourceHash);
  assert.deepEqual(first.rows.map((row) => row.sourceRowIdentity), reversed.rows.map((row) => row.sourceRowIdentity));
  assert.equal(new Set(first.rows.map((row) => row.sourceRowIdentity)).size, first.rows.length);
});

test("typed 6087105 client uses fixed key and fails closed on report and total drift", async () => {
  const calls = [];
  const first = clone(fixtures.D1935);
  first.pageSize = 3;
  first.total = 5;
  first.rows = first.rows.slice(0, 3);
  const second = clone(fixtures.D1935);
  second.page = 2;
  second.pageSize = 3;
  second.total = 5;
  second.rows = second.rows.slice(3);
  const responses = [
    new Response(JSON.stringify({ csrfToken: "memory-only" }), { status: 201 }),
    new Response(JSON.stringify(first), { status: 200 }),
    new Response(JSON.stringify(second), { status: 200 }),
  ];
  const client = createAinuokeBridgeClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return responses.shift(); } });
  const pages = await client.readAllGarmentColorSizePages("user-a", { insideOrderNo: " D1935 ", pageSize: 3 });
  assert.equal(pages.length, 2);
  assert.ok(calls.slice(1).every((call) => call.url.endsWith("/v1/ainuoke/reports/garment_color_size_details/query")));
  assert.ok(calls.slice(1).every((call) => JSON.parse(call.init.body).query.insideOrderNo === "D1935"));

  const badReport = clone(fixtures.D1935);
  badReport.reportId = "6086997";
  const reportClient = createAinuokeBridgeClient({ fetchImpl: async () => new Response(JSON.stringify({ csrfToken: "memory-only", ...badReport }), { status: 200 }) });
  await assert.rejects(() => reportClient.readAllGarmentColorSizePages("user-a", { insideOrderNo: "D1935" }), /固定只读协议不一致/);

  const drifting = clone(second);
  drifting.total = 6;
  const driftResponses = [
    new Response(JSON.stringify({ csrfToken: "memory-only" }), { status: 201 }),
    new Response(JSON.stringify(first), { status: 200 }),
    new Response(JSON.stringify(drifting), { status: 200 }),
  ];
  const driftClient = createAinuokeBridgeClient({ fetchImpl: async () => driftResponses.shift() });
  await assert.rejects(() => driftClient.readAllGarmentColorSizePages("user-a", { insideOrderNo: "D1935", pageSize: 3 }), /分页总数不一致/);
});

test("validation report aggregates coverage, quantity, size, PO, delivery and selected old blockers", async () => {
  const sources = await Promise.all([
    adaptFixture("D1935", "PI2607-235", "D1935"),
    adaptFixture("T1826-4", "PI2508-025", "T1826-4"),
    adaptFixture("1917U", "PI2511-141", "MS1917U"),
  ]);
  const contracts = [
    { insideOrderNo: "D1935", salesContractNo: "PI2607-235", styleNo: "D1935", quantity: 4640 },
    { insideOrderNo: "T1826-4", salesContractNo: "PI2508-025", styleNo: "T1826-4", quantity: 3730 },
    { insideOrderNo: "1917U", salesContractNo: "PI2511-141", styleNo: "MS1917U", quantity: 9393 },
  ];
  const discovery = {
    schemaVersion: "ainuoke-order-discovery.v1",
    reportId: "6086103",
    visibilityScope: "current_account_visible",
    fetchedAt: "2026-09-11T00:00:00Z",
    total: 3,
    pageCount: 1,
    snapshotHash: "stable",
    rows: contracts.map((contract, index) => ({ sourceId: String(index + 1), sourceRowIdentity: `6086103:sha256:${index}`, lifecycleStatusRaw: index ? "生效" : "草拟", contractDate: null, deliveryDate: null, ...contract })),
  };
  const report = buildAinuokeGarmentColorSizeValidationReport({
    discoveryBefore: discovery,
    discoveryAfter: discovery,
    contracts,
    details: sources.map((source) => ({ insideOrderNo: source.requestedInsideOrderNo, pages: 1, source })),
    oldBlockerInsideOrderNos: ["T1826-4", "1917U"],
  });
  assert.equal(report.snapshot.stable, true);
  assert.deepEqual(report.queries, { total: 3, successful: 3, failed: 0, pages: 3 });
  assert.deepEqual(report.colorVsContractQuantity, { equal: 3, lower: 0, higher: 0 });
  assert.equal(report.colors.zeroQuantityRows, 2);
  assert.equal(report.sizeRule.tokenCountMax, 25);
  assert.equal(report.sizeMatrix.positiveValid, 8);
  assert.equal(report.oldBlockers.resolved, 2);
  assert.equal(report.po.nonEmptyOrders, 1);
  assert.equal(report.deliveryDate.presentOrders, 1);
});

test("6087105 candidate source has no 6086997/6087050 or business-write dependency", () => {
  const source = [
    fs.readFileSync("features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts", "utf8"),
    fs.readFileSync("features/ainuoke-sync/service/ainuoke-garment-color-size-validation.ts", "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /6086997|6087050|orderRepository|styleProgressRepository|commitImport|INSERT INTO|UPDATE sales_orders|DELETE FROM/i);
});
