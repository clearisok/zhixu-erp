import test from "node:test";
import assert from "node:assert/strict";
import { createGarmentShipmentClient, parseGarmentView, parseGarmentHistory, garmentFreshnessAt, GARMENT_RESPONSE_MAX_BYTES, GARMENT_HISTORY_MAX_BYTES } from "../client.js";
import { garmentQuantity, garmentBusinessDate, GARMENT_VISIBLE_FIELDS, type GarmentHistory, type GarmentReadView } from "../model.js";
import { observed, orderId, publicationId, contract } from "./fixtures.js";

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const lease = () => ({ isCurrent: () => true });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function history(): GarmentHistory {
  const value = observed(0);
  return { salesOrderId: orderId, records: [{ publicationId, generation: 12, observedFrom: value.observedFrom, observedThrough: value.observedThrough,
    rowCount: 0, colorBasisHash: "b".repeat(64) }], nextBeforeGeneration: 10, validation: "immutable_summary_detail_verified_on_open" };
}

test("public garment parser accepts real projection, exact quantities, civil dates and frozen color identities", () => {
  const value = observed(); assert.deepEqual(parseGarmentView(value, orderId, contract), value);
  assert.deepEqual(value.rows[0].quantity, { state: "known", raw: "9007199254740993.000000000001", value: "9007199254740993.000000000001" });
  assert.equal(value.rows[0].businessDate.state === "known" && value.rows[0].businessDate.value, "2026-10-11");
  assert.equal(value.rows[0].fields.FDate.state === "known" && value.rows[0].fields.FDate.raw, "2026-10-07");
  assert.equal(/PRIVATE|wxprice|remark/.test(JSON.stringify(value)), false);
  value.colorBasisChanged = true; value.targetPolicyChanged = true;
  assert.deepEqual(parseGarmentView(value, orderId, contract), value);
  assert.deepEqual(parseGarmentView(observed(0), orderId, contract), observed(0));
  assert.equal(parseGarmentView(observed(0, 1000), orderId, contract).sourceStatus, "observed_empty");
});

test("zero, negative, missing and invalid evidence are distinct; outdate has no date fallback", () => {
  const value = observed(5);
  value.rows[0].fields.Num = { state: "known", raw: "-0.000" };
  value.rows[1].fields.Num = { state: "known", raw: "-12.5" };
  value.rows[2].fields.Num = { state: "unknown", reason: "null" };
  value.rows[3].fields.Num = { state: "known", raw: "1,000" };
  value.rows[4].fields.Num = { state: "known", raw: "1e1000" };
  value.rows[2].fields.outdate = { state: "unknown", reason: "blank" };
  value.rows[3].fields.outdate = { state: "known", raw: "2026-02-30" };
  for (const row of value.rows) { row.quantity = garmentQuantity(row.fields.Num); row.businessDate = garmentBusinessDate(row.fields.outdate); }
  assert.deepEqual(parseGarmentView(value, orderId, contract), value);
  assert.deepEqual(value.rows.map(row => row.quantity.state), ["known", "known", "unknown", "invalid", "invalid"]);
  assert.equal(value.rows[2].businessDate.state, "unknown"); assert.equal(value.rows[3].businessDate.state, "invalid");
});
test("new first-page provenance is optional for history, closed and never permits multiple pages", () => {
  const withEvidence = (total = 1) => {
    const value = observed(total);
    for (const trace of value.trace) trace.pagingEvidence = { schemaVersion: "ainuoke-garment-first-page-evidence.v1",
      reportRequestNumber: trace.pass as 1 | 2, requestBodySha256: "a".repeat(64), responsePageIndex: 0, responsePageSize: 0 };
    return value;
  };
  assert.deepEqual(parseGarmentView(withEvidence(), orderId, contract), withEvidence());
  for (const edit of [
    (x: ReturnType<typeof observed>) => { x.trace[0].pagingEvidence!.responsePageSize = 100; },
    (x: ReturnType<typeof observed>) => { x.trace[0].pagingEvidence!.reportRequestNumber = 2; },
    (x: ReturnType<typeof observed>) => { x.trace[0].pagingEvidence!.requestBodySha256 = "not-a-hash"; },
    (x: ReturnType<typeof observed>) => { delete x.trace[1].pagingEvidence; },
    (x: ReturnType<typeof observed>) => { Reflect.set(x.trace[0].pagingEvidence!, "token", "secret"); },
  ]) { const value = withEvidence(); edit(value); assert.throws(() => parseGarmentView(value, orderId, contract)); }
  assert.throws(() => parseGarmentView(withEvidence(101), orderId, contract));
});

test("strict allowlist rejects forged scope, totals, traces, projections and private amount fields", async t => {
  const changes: [string, (value: ReturnType<typeof observed>) => void][] = [
    ["order", x => { x.salesOrderId = publicationId; }], ["contract", x => { x.salesContractNo = "OTHER"; }],
    ["report", x => { Reflect.set(x, "sourceReportId", "6086941"); }], ["extra price", x => { Reflect.set(x.rows[0].fields, "wxprice", { state: "known", raw: "1" }); }],
    ["extra note", x => { Reflect.set(x.rows[0], "remark", "private"); }], ["extra root", x => { Reflect.set(x, "total", "12"); }],
    ["wrong row contract", x => { x.rows[0].fields.ExpContractNo = { state: "known", raw: "OTHER" }; }],
    ["wrong source id", x => { x.rows[0].sourceRecordId = "OTHER"; }], ["duplicate row", x => { x.rows[1] = structuredClone(x.rows[0]); }],
    ["wrong projection", x => { x.rows[0].quantity = { state: "known", raw: "12", value: "12" }; }],
    ["borrow FDate", x => { x.rows[0].businessDate = { state: "known", raw: "2026-10-07", value: "2026-10-07" }; }],
    ["page", x => { x.rows[0].trace.page = 2; }], ["row index", x => { x.rows[1].trace.rowIndex = 0; }],
    ["trace capture", x => { x.rows[0].trace.captureId = "b".repeat(64); }], ["trace SHA", x => { x.rows[0].trace.rawResponseSha256 = "b".repeat(64); }],
    ["trace count", x => { x.trace.pop(); }], ["trace order", x => { x.trace.reverse(); }], ["trace rows", x => { x.trace[0].rowCount = 99; }],
    ["trace date", x => { x.trace[0].capturedAt = "2026-02-30T00:00:00Z"; }], ["from", x => { x.observedFrom = x.observedThrough; }],
    ["empty fact", x => { x.sourceStatus = "observed_empty"; }], ["total", x => { x.completeness.queryRows = 1; }],
    ["all records", x => { Reflect.set(x.completeness, "allCompanyRecordsRead", true); }], ["stale label", x => { x.freshness = "stale"; }],
    ["policy too short", x => { x.expiresAt = x.observedFrom; }], ["policy too long", x => { x.expiresAt = new Date(Date.parse(x.observedFrom) + 86400001).toISOString(); }],
    ["future capture", x => { x.evaluatedAt = x.observedFrom; }], ["color id", x => { Reflect.set(x.rows[0].colorMatch, "orderColorId", "bad"); }],
    ["missing color claim", x => { x.rows[0].colorMatch = { state: "missing_source_color" }; }], ["bad control", x => { x.rows[0].fields.billno = { state: "known", raw: "a\u0000b" }; }],
    ["array unknown reason", x => { Reflect.set(x.rows[0].fields.styleNum, "reason", ["missing"]); }],
    ["nested array unknown reason", x => { Reflect.set(x.rows[0].fields.styleNum, "reason", [["missing"]]); }],
    ["array color state", x => { Reflect.set(x.rows[0], "colorMatch", { state: ["unmatched"] }); }],
    ["nested array color state", x => { Reflect.set(x.rows[0], "colorMatch", { state: [["unmatched"]] }); }],
  ];
  for (const [name, change] of changes) await t.test(name, () => { const value = observed(); change(value); assert.throws(() => parseGarmentView(value, orderId, contract), code("invalid_response")); });
  assert.throws(() => parseGarmentView(observed(), orderId, contract, orderId), code("invalid_response"));
  const value = observed(1); value.rows[0].fields.CnColor = { state: "unknown", reason: "missing" }; value.rows[0].colorMatch = { state: "missing_source_color" };
  assert.deepEqual(parseGarmentView(value, orderId, contract), value);
});

test("unavailable states never carry old observations; empty observation remains a full snapshot", () => {
  for (const sourceStatus of ["not_applicable", "not_connected", "not_captured", "identity_changed"] as const) {
    const value: GarmentReadView = { schemaVersion: "order-garment-shipments.v1", salesOrderId: orderId, sourceReportId: "6086979", sourceStatus, rows: [] };
    assert.deepEqual(parseGarmentView(value, orderId, contract), value);
    Reflect.set(value, "snapshotId", "a".repeat(64)); assert.throws(() => parseGarmentView(value, orderId, contract), code("invalid_response"));
  }
});

test("history preserves empty filtered pages with a cursor and validates the full SQL integer range", () => {
  assert.deepEqual(parseGarmentHistory(history(), orderId), history());
  const empty = { ...history(), records: [], nextBeforeGeneration: 2147483646 };
  assert.deepEqual(parseGarmentHistory(empty, orderId, 2147483647), empty);
  for (const change of [(x: GarmentHistory) => { x.nextBeforeGeneration = 2147483648; }, (x: GarmentHistory) => { x.nextBeforeGeneration = 13; },
    (x: GarmentHistory) => { x.records.push(structuredClone(x.records[0])); }, (x: GarmentHistory) => { x.records[0].generation = 14; },
    (x: GarmentHistory) => { Reflect.deleteProperty(x, "validation"); }, (x: GarmentHistory) => { x.salesOrderId = publicationId; }]) {
    const value = history(); change(value); assert.throws(() => parseGarmentHistory(value, orderId, 14), code("invalid_response"));
  }
  assert.deepEqual(parseGarmentHistory({ salesOrderId: orderId, records: [], nextBeforeGeneration: null }, orderId), { salesOrderId: orderId, records: [], nextBeforeGeneration: null });
});

test("fixed same-origin GET paths, explicit publication and no automatic retries", async () => {
  const calls: { path: string; options?: RequestInit }[] = [];
  const client = createGarmentShipmentClient(async (input, options) => { const path = String(input); calls.push({ path, options }); return json(path.includes("history") ? history() : observed(1)); }, () => 100);
  await client.read(orderId.toUpperCase(), contract, { ...lease(), publicationId }); await client.history(orderId, 2147483647, lease());
  assert.equal(calls[0].path, `/api/v1/sales-orders/${orderId}/garment-shipments/${publicationId}`);
  assert.equal(calls[1].path, `/api/v1/sales-orders/${orderId}/garment-shipments/history?beforeGeneration=2147483647`);
  for (const { options } of calls) assert.deepEqual({ ...options, signal: undefined }, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: undefined, headers: { Accept: "application/json" } });
  for (const id of ["browser-order", "../" + orderId, orderId + "?source=other"]) await assert.rejects(() => client.read(id, contract, lease()), code("invalid_response"));
  await assert.rejects(() => client.read(orderId, contract, { ...lease(), publicationId: "../current" }), code("invalid_response")); assert.equal(calls.length, 2);
  let attempts = 0; const failed = createGarmentShipmentClient(async () => { attempts++; throw Error("PRIVATE transport"); });
  await assert.rejects(() => failed.read(orderId, contract, lease()), code("unavailable")); assert.equal(attempts, 1);
});

test("monotonic expiry subtracts latency and keeps stale and empty observations", async () => {
  let ticks = [100, 200], index = 0;
  const client = createGarmentShipmentClient(async () => json(observed(0)), () => ticks[index++]);
  const view = await client.read(orderId, contract, lease()); assert.equal(view.status, "observed"); if (view.status !== "observed") assert.fail();
  const remaining = Date.parse(view.model.expiresAt) - Date.parse(view.model.evaluatedAt);
  assert.equal(view.deadline, 100 + remaining); assert.equal(garmentFreshnessAt(view, view.deadline - 1), "fresh");
  assert.equal(garmentFreshnessAt(view, view.deadline), "stale"); assert.equal(view.model.sourceStatus, "observed_empty");
  assert.throws(() => garmentFreshnessAt(view, 199), code("clock_unavailable"));
  ticks = [100, 60100]; index = 0; const expired = await client.read(orderId, contract, lease()); assert.equal(expired.status, "observed");
  if (expired.status === "observed") assert.equal(garmentFreshnessAt(expired, expired.receivedAt), "stale");
  const stale = await createGarmentShipmentClient(async () => json(observed(1, 1000)), () => 100).read(orderId, contract, lease());
  assert.equal(stale.status, "observed"); if (stale.status === "observed") { assert.equal(stale.model.rows.length, 1); assert.equal(garmentFreshnessAt(stale, 100), "stale"); }
  for (const ticks of [[NaN], [-1], [100, 99], [100, Infinity]]) { let i = 0; await assert.rejects(() => createGarmentShipmentClient(async () => json(observed(1)), () => ticks[i++]).read(orderId, contract, lease()), code("clock_unavailable")); }
});

test("owner changes suppress late 200/401 and cancel a body after scope loss", async () => {
  for (const status of [200, 401, 403]) {
    let current = true, finish!: (response: Response) => void;
    const client = createGarmentShipmentClient(() => new Promise(done => { finish = done; }), () => 10);
    const pending = client.read(orderId, contract, { isCurrent: () => current }); current = false; finish(json(observed(1), status));
    await assert.rejects(pending, code("owner_changed"));
  }
  let current = true, canceled = false, next!: () => void;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { return new Promise<void>(done => { next = () => { controller.enqueue(new TextEncoder().encode("{}")); done(); }; }); }, cancel() { canceled = true; } });
  const pending = createGarmentShipmentClient(async () => new Response(body), () => 10).read(orderId, contract, { isCurrent: () => current });
  await new Promise(done => setTimeout(done, 0)); current = false; next(); await assert.rejects(pending, code("owner_changed")); assert.equal(canceled, true);
  const aborted = new AbortController(); aborted.abort(); let called = false;
  await assert.rejects(() => createGarmentShipmentClient(async () => { called = true; return json({}); }).read(orderId, contract, { ...lease(), signal: aborted.signal }), code("owner_changed")); assert.equal(called, false);
});

test("authentication, localized disabled source and unavailable history do not fall back", async () => {
  for (const [status, expected] of [[401, "authentication_required"], [403, "forbidden"], [404, "order_unavailable"], [503, "not_connected"], [500, "unavailable"]] as const) {
    let calls = 0; const client = createGarmentShipmentClient(async () => { calls++; return json({ error: { code: "garment_read_not_connected", message: "PRIVATE" } }, status); });
    await assert.rejects(() => client.read(orderId, contract, { ...lease(), publicationId }), error => code(expected)(error) && !(error as Error).message.includes("PRIVATE")); assert.equal(calls, 1);
  }
});

test("stream capacity covers a constructed 16 MiB transport upper bound plus envelope, rejects oversize and invalid UTF-8", async () => {
  const value = observed(2000), fill = "x".repeat(2048), keys = GARMENT_VISIBLE_FIELDS.filter(key => !["id", "ExpContractNo", "Num", "outdate", "CnColor"].includes(key));
  const payload = () => {
    const result: Record<string, unknown> = { ...value };
    for (const key of ["salesOrderId", "sourceReportId", "sourceStatus", "publicationId", "generation", "freshness", "evaluatedAt", "expiresAt", "targetPolicyChanged", "colorBasisChanged"]) delete result[key];
    result.schemaVersion = "ainuoke-garment-shipment-snapshot.v1"; return result;
  };
  let encoded = JSON.stringify(value), size = Buffer.byteLength(encoded);
  const target = 16 * 1024 * 1024 + size - Buffer.byteLength(JSON.stringify(payload()));
  outer: for (const row of value.rows) for (const key of keys) {
    const before = Buffer.byteLength(JSON.stringify(row.fields[key]));
    const replacement = { state: "known" as const, raw: fill }, delta = Buffer.byteLength(JSON.stringify(replacement)) - before;
    if (size + delta > target) {
      const length = target - size - (Buffer.byteLength(JSON.stringify({ state: "known", raw: "" })) - before);
      if (length < 1 || length > 2048) continue;
      row.fields[key] = { state: "known", raw: "x".repeat(length) }; break outer;
    }
    row.fields[key] = replacement; size += delta;
  }
  encoded = JSON.stringify(value);
  assert.equal(Buffer.byteLength(JSON.stringify(payload())), 16 * 1024 * 1024);
  assert.ok(Buffer.byteLength(encoded) > 16 * 1024 * 1024); assert.ok(Buffer.byteLength(encoded) < GARMENT_RESPONSE_MAX_BYTES);
  const result = await createGarmentShipmentClient(async () => new Response(encoded), () => 100).read(orderId, contract, lease());
  assert.equal(result.status, "observed"); if (result.status === "observed") assert.equal(result.model.rows.length, 2000);
  let canceled = false;
  const huge = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(GARMENT_RESPONSE_MAX_BYTES + 1)); }, cancel() { canceled = true; } });
  await assert.rejects(() => createGarmentShipmentClient(async () => new Response(huge)).read(orderId, contract, lease()), code("too_large")); assert.equal(canceled, true);
  await assert.rejects(() => createGarmentShipmentClient(async () => new Response(new Uint8Array([0xff]))).read(orderId, contract, lease()), code("invalid_response"));
  await assert.rejects(() => createGarmentShipmentClient(async () => new Response(" ".repeat(GARMENT_HISTORY_MAX_BYTES + 1))).history(orderId, undefined, lease()), code("too_large"));
});
