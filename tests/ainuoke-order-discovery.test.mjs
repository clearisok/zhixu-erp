import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createAinuokeBridgeClient } from "../features/ainuoke-api/client/ainuoke-bridge-client.ts";
import { adaptAinuokeOrderDiscoverySnapshots } from "../features/ainuoke-api/source/ainuoke-order-discovery-adapter.ts";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const row = (id, insideOrderNo, salesContractNo, status = "生效") => ({
  sourceRowIdentity: `6086103:sha256:${id}`,
  values: { id, InsideOrderNo: insideOrderNo, BillNo: salesContractNo, Status: status, ContractDate: "2026-01-01", DeliveryDate: "2026-03-01", GoodsDesc: `STYLE-${id}` },
});
const snapshot = ({ page, pageSize, total, rows, fetchedAt = "2026-09-10T00:00:00Z" }) => ({
  schemaVersion: "ainuoke-direct-read.v2",
  reportId: "6086103",
  fetchedAt,
  page,
  pageSize,
  total,
  queryContext: {},
  snapshotHash: `transport-${page}`,
  rows,
});

test("Discovery adapter maps the fixed 6086103 list and hashes normalized rows independent of page grouping", async () => {
  const rows = [row(3, " d3 ", "pi-3", "草拟"), row(1, "D1", "PI-1"), row(2, "D2", "PI-2")];
  const first = await adaptAinuokeOrderDiscoverySnapshots([
    snapshot({ page: 1, pageSize: 2, total: 3, rows: rows.slice(0, 2) }),
    snapshot({ page: 2, pageSize: 2, total: 3, rows: rows.slice(2) }),
  ]);
  const regrouped = await adaptAinuokeOrderDiscoverySnapshots([
    snapshot({ page: 3, pageSize: 1, total: 3, rows: rows.slice(2), fetchedAt: "2026-09-10T01:00:00Z" }),
    snapshot({ page: 1, pageSize: 1, total: 3, rows: rows.slice(0, 1), fetchedAt: "2026-09-10T01:00:00Z" }),
    snapshot({ page: 2, pageSize: 1, total: 3, rows: rows.slice(1, 2), fetchedAt: "2026-09-10T01:00:00Z" }),
  ]);
  assert.equal(first.visibilityScope, "current_account_visible");
  assert.deepEqual(first.rows.map((item) => item.sourceId), ["1", "2", "3"]);
  assert.equal(first.rows[2].insideOrderNo, "D3");
  assert.equal(first.rows[2].salesContractNo, "PI-3");
  assert.equal(first.rows[2].lifecycleStatusRaw, "草拟");
  assert.match(first.snapshotHash, /^[a-f0-9]{64}$/);
  assert.equal(first.snapshotHash, regrouped.snapshotHash);
});

test("Discovery adapter fails closed on incomplete paging and duplicate stable identities", async () => {
  await assert.rejects(
    () => adaptAinuokeOrderDiscoverySnapshots([snapshot({ page: 1, pageSize: 2, total: 3, rows: [row(1, "D1", "PI-1")] })]),
    /读取行数与 total 不一致/,
  );
  await assert.rejects(
    () => adaptAinuokeOrderDiscoverySnapshots([snapshot({ page: 1, pageSize: 2, total: 2, rows: [row(1, "D1", "PI-1"), { ...row(1, "D2", "PI-2"), sourceRowIdentity: "6086103:sha256:duplicate-id-different-row" }] })]),
    /sourceId 存在重复值/,
  );
  await assert.rejects(
    () => adaptAinuokeOrderDiscoverySnapshots([snapshot({ page: 1, pageSize: 1, total: 1, rows: [row(1, "", "PI-1")] })]),
    /InsideOrderNo/,
  );
  await assert.rejects(
    () => adaptAinuokeOrderDiscoverySnapshots([snapshot({ page: 1, pageSize: 1, total: 1, rows: [row(1, "D1", "")] })]),
    /BillNo/,
  );
  await assert.rejects(
    () => adaptAinuokeOrderDiscoverySnapshots([snapshot({ page: 1, pageSize: 2, total: 2, rows: [row(1, "D1", "PI-1"), row(2, "D2", " pi-1 ")] })]),
    /SalesContractNo \/ BillNo/,
  );
  await assert.rejects(
    () => adaptAinuokeOrderDiscoverySnapshots([
      snapshot({ page: 1, pageSize: 1, total: 2, rows: [row(1, "D1", "PI-1")] }),
      snapshot({ page: 2, pageSize: 1, total: 2, rows: [row(1, "D1", "PI-1")] }),
    ]),
    /Source row identity.*重复值/,
  );
});

test("Discovery adapter accepts the single complete empty snapshot", async () => {
  const result = await adaptAinuokeOrderDiscoverySnapshots([snapshot({ page: 1, pageSize: 50, total: 0, rows: [] })]);
  assert.equal(result.total, 0);
  assert.equal(result.pageCount, 1);
  assert.deepEqual(result.rows, []);
  assert.match(result.snapshotHash, /^[a-f0-9]{64}$/);
});

test("Discovery BillNo follows the formal color-source whitespace normalization", async () => {
  const source = await adaptAinuokeOrderDiscoverySnapshots([snapshot({ page: 1, pageSize: 2, total: 1, rows: [row(1, "D1", " ｐｉ - １ ")] })]);
  assert.equal(source.rows[0].salesContractNo, "PI-1");
  await assert.rejects(() => adaptAinuokeOrderDiscoverySnapshots([snapshot({ page: 1, pageSize: 2, total: 2, rows: [row(1, "D1", "PI-1"), row(2, "D2", "PI -1")] })]), /BillNo.*重复/);
});

test("Typed discovery client sends no filter and requires complete constant-total pagination", async () => {
  const calls = [];
  const responses = [
    jsonResponse({ csrfToken: "csrf-memory-only" }, 201),
    jsonResponse(snapshot({ page: 1, pageSize: 2, total: 3, rows: [row(1, "D1", "PI-1"), row(2, "D2", "PI-2")] })),
    jsonResponse(snapshot({ page: 2, pageSize: 2, total: 3, rows: [row(3, "D3", "PI-3")] })),
  ];
  const client = createAinuokeBridgeClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return responses.shift(); } });
  const pages = await client.readAllOrderDiscoveryPages("user-a", { pageSize: 2 });
  assert.equal(pages.length, 2);
  assert.ok(calls.slice(1).every((call) => call.url.endsWith("/v1/ainuoke/reports/order_discovery/query")));
  assert.deepEqual(calls.slice(1).map((call) => JSON.parse(call.init.body)), [
    { page: 1, pageSize: 2, query: {} },
    { page: 2, pageSize: 2, query: {} },
  ]);
});

test("Typed discovery client fails closed on total drift, malformed paging and max-page exhaustion", async () => {
  const makeClient = (pageResponses) => createAinuokeBridgeClient({ fetchImpl: async () => pageResponses.shift() });
  const session = () => jsonResponse({ csrfToken: "csrf-memory-only" }, 201);

  await assert.rejects(
    () => makeClient([
      session(),
      jsonResponse(snapshot({ page: 1, pageSize: 1, total: 2, rows: [row(1, "D1", "PI-1")] })),
      jsonResponse(snapshot({ page: 2, pageSize: 1, total: 3, rows: [row(2, "D2", "PI-2")] })),
    ]).readAllOrderDiscoveryPages("user-a", { pageSize: 1 }),
    (error) => error instanceof Error && error.message.includes("分页总数不一致"),
  );
  await assert.rejects(
    () => makeClient([
      session(),
      jsonResponse({ ...snapshot({ page: 1, pageSize: 1, total: 2, rows: [row(1, "D1", "PI-1")] }), page: 9 }),
    ]).readAllOrderDiscoveryPages("user-a", { pageSize: 1 }),
    (error) => error instanceof Error && error.message.includes("固定只读协议不一致"),
  );
  await assert.rejects(
    () => makeClient([
      session(),
      jsonResponse(snapshot({ page: 1, pageSize: 1, total: 2, rows: [row(1, "D1", "PI-1")] })),
    ]).readAllOrderDiscoveryPages("user-a", { pageSize: 1, maxPages: 1 }),
    (error) => error instanceof Error && error.message.includes("安全上限"),
  );
});

test("Typed detail client requires the fixed report, query and complete constant-total pagination", async () => {
  const detailSnapshot = (patch = {}) => ({
    schemaVersion: "ainuoke-direct-read.v2",
    reportId: "6086997",
    fetchedAt: "2026-09-11T00:00:00Z",
    page: 1,
    pageSize: 1,
    total: 2,
    queryContext: { insideOrderNo: "D1" },
    snapshotHash: "detail-hash",
    rows: [{ sourceRowIdentity: "detail-1", values: {} }],
    ...patch,
  });
  const calls = [];
  const responses = [
    jsonResponse({ csrfToken: "csrf-memory-only" }, 201),
    jsonResponse(detailSnapshot()),
    jsonResponse(detailSnapshot({ page: 2, rows: [{ sourceRowIdentity: "detail-2", values: {} }] })),
  ];
  const client = createAinuokeBridgeClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return responses.shift(); } });
  const pages = await client.readAllReportPages("user-a", "sales_contract_color_sizes", { pageSize: 1, query: { insideOrderNo: " D1 " } });
  assert.equal(pages.length, 2);
  assert.deepEqual(calls.slice(1).map((call) => JSON.parse(call.init.body).query), [{ insideOrderNo: "D1" }, { insideOrderNo: "D1" }]);

  const makeClient = (pageResponses) => createAinuokeBridgeClient({ fetchImpl: async () => pageResponses.shift() });
  await assert.rejects(
    () => makeClient([
      jsonResponse({ csrfToken: "csrf-memory-only" }, 201),
      jsonResponse(detailSnapshot()),
      jsonResponse(detailSnapshot({ page: 2, total: 3, rows: [{ sourceRowIdentity: "detail-2", values: {} }] })),
    ]).readAllReportPages("user-a", "sales_contract_color_sizes", { pageSize: 1, query: { insideOrderNo: "D1" } }),
    /分页总数不一致/,
  );
  await assert.rejects(
    () => makeClient([
      jsonResponse({ csrfToken: "csrf-memory-only" }, 201),
      jsonResponse(detailSnapshot({ reportId: "6086103" })),
    ]).readAllReportPages("user-a", "sales_contract_color_sizes", { pageSize: 1, query: { insideOrderNo: "D1" } }),
    /固定只读协议不一致/,
  );
});

test("Discovery foundation has no business repository or PostgreSQL mutation dependency", () => {
  const sources = [
    fs.readFileSync("features/ainuoke-api/client/ainuoke-bridge-client.ts", "utf8"),
    fs.readFileSync("features/ainuoke-api/source/ainuoke-order-discovery-adapter.ts", "utf8"),
    fs.readFileSync("tools/ainuoke-bridge/ainuoke_bridge/contracts.py", "utf8"),
  ].join("\n");
  assert.doesNotMatch(sources, /orderRepository|styleProgressRepository|closingRepository|scheduleRepository|commitImport|INSERT INTO|UPDATE sales_orders|DELETE FROM/i);
});
