import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createApp } from "../app.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { appendOperationLog, type ServerOperationLog } from "../operation-logs/repository.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

type LogPage = { logs: ServerOperationLog[]; page: { limit: number; offset: number; count: number; total: number; hasMore: boolean } };

test("Quote audit read: disposable exact filters, pagination and trusted Estimate isolation", { timeout: 180_000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_audit_read") });
  const runtime: { server?: ReturnType<typeof createServer> } = {};
  t.after(async () => {
    if (runtime.server) await new Promise<void>((done, reject) => runtime.server!.close(error => error ? reject(error) : done()));
    await pool.end();
    await postgres.stop();
  });
  await runMigrations(pool, resolve("database/migrations"));
  await synchronizePermissionCatalog(pool);
  const identities: TrustedIdentity[] = [];
  const permissionSets: TrustedIdentity["permissions"][] = [
    ["audit_log.view", "quote.view", "estimate.view", "quote.cost.view"],
    ["audit_log.view", "quote.view"],
    ["audit_log.view"],
    ["quote.view"],
  ];
  for (const [index, permissions] of permissionSets.entries()) {
    const username = `audit-read-${index}`;
    const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES($1,'synthetic-unused',$2,'viewer',true) RETURNING id::text,public_id::text", [username, `Synthetic audit actor ${index}`])).rows[0];
    const role = `role-audit-read-${index}`;
    await pool.query("INSERT INTO app_roles(id,name,description) VALUES($1,$1,'Disposable audit fixture')", [role]);
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1::bigint,$2)", [row.id, role]);
    for (const permission of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [role, permission]);
    identities.push({ internalUserId: row.id, userId: row.public_id, username, userName: `Synthetic audit actor ${index}`, permissions });
  }
  const [full, restricted, globalOnly, denied] = identities;
  let active: TrustedIdentity | null = full;
  const rolesBefore = (await pool.query("SELECT role_id,permission_key FROM app_role_permissions ORDER BY role_id,permission_key")).rows;
  const server = createServer(createApp({ pool, allowedOrigins: ["http://127.0.0.1:39991"], identityAuthority: { mode: "session", verify: async () => {}, resolve: async () => active } }));
  runtime.server = server;
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const repo = createQuoteRepository(pool);
  const quotes = ["audit-first", "audit-second"].map(id => {
    const quote = quoteSnapshotFromBrowser(createSyntheticQuoteFixture(id));
    for (const revision of quote.revisions) {
      revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null;
    }
    return quote;
  });
  for (const quote of quotes) await repo.create(quote);
  const q1 = quotes[0].id, q2 = quotes[1].id;
  const probe = "PRIVATE-ESTIMATE-AUDIT-PROBE";
  const seed = await pool.connect();
  try {
    await seed.query("BEGIN");
    for (let index = 0; index < 105; index++) await appendOperationLog(seed, full, {
      module: "报价中心", action: "保存报价", entityType: "Quote", entityId: q1, quoteId: q1,
      beforeData: null, afterData: { quoteCode: quotes[0].quoteCode, values: { aggregateVersion: index + 1 } },
    });
    for (let index = 0; index < 3; index++) await appendOperationLog(seed, full, {
      module: "系统设置", action: "创建报价", entityType: "Quote", entityId: q2, quoteId: q2,
      afterData: { quoteCode: quotes[1].quoteCode, values: { aggregateVersion: index + 1 } },
    });
    await appendOperationLog(seed, full, {
      module: "报价中心", action: "生成估算成本", entityType: "EstimateCost", entityId: "synthetic-estimate", quoteId: q1,
      afterData: { values: { privateEstimate: probe } },
    });
    await appendOperationLog(seed, full, {
      module: "报价中心", action: "保存报价", entityType: "Quote", entityId: q1, quoteId: q1,
      metadata: { workflowAction: "estimate.update" }, afterData: { values: { privateEstimate: probe } },
    });
    await appendOperationLog(seed, full, {
      module: "报价中心", action: "保存报价", entityType: "Quote", entityId: q1, quoteId: q1,
      metadata: { workflowAction: "price.update" },
      beforeData: { values: { aggregateVersion: 1, estimateHistoryCount: 7331 } },
      afterData: { values: { aggregateVersion: 2, estimateHistoryCount: 7332 } },
      changes: [
        { field: "aggregateVersion", beforeValue: 1, afterValue: 2 },
        { field: "estimateHistoryCount", beforeValue: 7331, afterValue: 7332 },
      ],
    });
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; }
  finally { seed.release(); }

  const get = async (query = "") => {
    const response = await fetch(`${baseUrl}/api/v1/operation-logs${query ? `?${query}` : ""}`);
    return { status: response.status, body: await response.json() as LogPage };
  };
  const logCount = async () => (await pool.query("SELECT count(*)::int AS n FROM operation_logs")).rows[0].n as number;
  const beforeCount = await logCount();

  await t.test("anonymous and missing audit permission deny; exact Quote access adds quote.view", async () => {
    active = null; assert.equal((await get()).status, 401);
    active = denied; assert.equal((await get()).status, 403);
    active = globalOnly; assert.equal((await get()).status, 200);
    assert.equal((await get(`quoteId=${encodeURIComponent(q1)}`)).status, 403);
    active = full; assert.equal((await get("quoteId=missing-quote")).status, 404);
  });

  await t.test("more than 100 events paginate deterministically and exact Quote IDs never cross", async () => {
    active = full;
    const first = await get(`quoteId=${encodeURIComponent(q1)}&limit=100&offset=0`);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.page, { limit: 100, offset: 0, count: 100, total: 108, hasMore: true });
    const second = await get(`quoteId=${encodeURIComponent(q1)}&limit=100&offset=100`);
    assert.deepEqual(second.body.page, { limit: 100, offset: 100, count: 8, total: 108, hasMore: false });
    const combined = [...first.body.logs, ...second.body.logs];
    const expected = (await pool.query("SELECT id FROM operation_logs WHERE quote_id=$1 ORDER BY created_at DESC,id DESC", [q1])).rows.map(row => row.id);
    assert.deepEqual(combined.map(log => log.id), expected);
    assert.equal(new Set(combined.map(log => log.id)).size, 108);
    assert.ok(combined.every(log => log.quoteId === q1 && log.actorUserId === full.userId && log.actorName === full.userName));
    const other = await get(`quoteId=${encodeURIComponent(q2)}`);
    assert.equal(other.body.logs.length, 3); assert.ok(other.body.logs.every(log => log.quoteId === q2));
    const empty = await get(`quoteId=${encodeURIComponent(q1)}&offset=1000000`);
    assert.deepEqual(empty.body.page, { limit: 50, offset: 1000000, count: 0, total: 108, hasMore: false });
    assert.deepEqual(empty.body.logs, []);
  });

  await t.test("module/action/date filters are executed against full Server history", async () => {
    active = full;
    const action = await get(`action=${encodeURIComponent("创建报价")}`);
    assert.equal(action.status, 200); assert.equal(action.body.page.total, 3);
    const moduleResult = await get(`module=${encodeURIComponent("系统设置")}`);
    assert.equal(moduleResult.body.page.total, 3);
    const none = await get(`quoteId=${encodeURIComponent(q1)}&module=${encodeURIComponent("系统设置")}`);
    assert.equal(none.body.page.total, 0);
    const timestamp = (await pool.query("SELECT created_at FROM operation_logs LIMIT 1")).rows[0].created_at as Date;
    const from = new Date(timestamp.getTime() - 1000).toISOString();
    const to = new Date(timestamp.getTime() + 1000).toISOString();
    assert.equal((await get(`from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).body.page.total, 111);
    assert.equal((await get(`from=${encodeURIComponent(new Date(timestamp.getTime() + 1000).toISOString())}`)).body.page.total, 0);
    assert.equal((await get(`to=${encodeURIComponent(new Date(timestamp.getTime() - 1000).toISOString())}`)).body.page.total, 0);
  });

  await t.test("strict query whitelist and bounded exact numbers/dates fail closed", async () => {
    active = full;
    const invalid = [
      "unknown=1", "search=PRIVATE-ESTIMATE-AUDIT-PROBE", "limit=1&limit=2", "quoteId=a&quoteId=b",
      "limit=", "limit=0", "limit=101", "limit=1junk", "limit=1.5", "limit=-1", "limit=1e2",
      "offset=-1", "offset=1junk", "offset=1.5", "offset=1000001", "offset=1e2",
      `quoteId=${"a".repeat(300)}`, `module=${"a".repeat(300)}`, `action=${"a".repeat(300)}`,
      "from=not-a-date", "to=2026-02-30T00%3A00%3A00Z", "from=2026-10-09", "to=2026-10-09T25%3A00%3A00Z",
      "from=2026-10-10T00%3A00%3A00Z&to=2026-10-09T00%3A00%3A00Z",
    ];
    for (const query of invalid) assert.equal((await get(query)).status, 400, `must reject ${query}`);
  });

  await t.test("restricted actor never receives Estimate events/count snapshots through paging or filters", async () => {
    active = restricted;
    const first = await get(`quoteId=${encodeURIComponent(q1)}&limit=100`);
    const second = await get(`quoteId=${encodeURIComponent(q1)}&limit=100&offset=100`);
    assert.equal(first.status, 200); assert.equal(first.body.page.total, 106);
    assert.equal(second.body.page.count, 6); assert.equal(second.body.page.hasMore, false);
    const json = JSON.stringify([first.body, second.body]);
    for (const secret of [probe, "estimateHistoryCount", "estimate.update", "synthetic-estimate"]) assert.equal(json.includes(secret), false, `protected ${secret}`);
    // Counts are leaf values, not substrings: a random public UUID can contain
    // "7331" without containing a protected estimate count. Check all slices.
    const assertNoProtectedCount = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(assertNoProtectedCount);
      else if (value && typeof value === "object") Object.values(value).forEach(assertNoProtectedCount);
      else assert.ok(![7331, 7332, "7331", "7332"].includes(value as number | string), "protected count value");
    };
    assertNoProtectedCount([first.body, second.body]);
    assert.doesNotThrow(() => assertNoProtectedCount({ id: "00000000-0000-4000-8000-000000007331" }));
    assert.throws(() => assertNoProtectedCount({ afterData: { values: { hidden: 7331 } } }));
    assert.throws(() => assertNoProtectedCount({ changes: [{ afterValue: "7332" }] }));
    assert.ok([...first.body.logs, ...second.body.logs].some(log => log.changes.some(change => change.field === "aggregateVersion")));
    assert.equal((await get()).body.page.total, 109);
    assert.equal((await get(`action=${encodeURIComponent("生成估算成本")}`)).body.page.total, 0);
    active = full;
    const visible = await get(`quoteId=${encodeURIComponent(q1)}&limit=100`);
    assert.equal(visible.status, 200);
    assert.deepEqual(visible.body.page, { limit: 100, offset: 0, count: 100, total: 108, hasMore: true });
    const visibleTail = await get(`quoteId=${encodeURIComponent(q1)}&limit=100&offset=100`);
    assert.equal(visibleTail.status, 200);
    assert.deepEqual(visibleTail.body.page, { limit: 100, offset: 100, count: 8, total: 108, hasMore: false });
    const visibleLogs = [...visible.body.logs, ...visibleTail.body.logs];
    assert.equal(visibleLogs.length, 108);
    assert.equal(new Set(visibleLogs.map(log => log.id)).size, 108);
    // Seeded events share a transaction timestamp; random UUID tie ordering can
    // place either positive control on page two. The negative control above
    // already checks both restricted pages, so inspect the full allowed history.
    const visibleJson = JSON.stringify(visibleLogs);
    assert.ok(visibleJson.includes(probe));
    assert.ok(visibleJson.includes("estimateHistoryCount"));
  });

  await t.test("reads do not append or alter roles; no client append/update/delete endpoint", async () => {
    active = full;
    for (let index = 0; index < 3; index++) assert.equal((await get(`quoteId=${encodeURIComponent(q1)}`)).status, 200);
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await fetch(`${baseUrl}/api/v1/operation-logs`, { method, headers: { Origin: "http://127.0.0.1:39991", "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: method === "DELETE" ? undefined : JSON.stringify({ actorName: "spoof", afterData: { values: { forged: true } } }) });
      assert.equal(response.status, 404);
    }
    assert.equal(await logCount(), beforeCount);
    assert.deepEqual((await pool.query("SELECT role_id,permission_key FROM app_role_permissions ORDER BY role_id,permission_key")).rows, rolesBefore);
  });
});
