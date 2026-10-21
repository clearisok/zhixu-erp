import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg from "pg";
import { createApp } from "../app.js";
import { createIdentityAuthority } from "../auth/identity-authority.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { executeProductionResourceCommand } from "../production-resources/service.js";
import { parseLogisticsResourceCommand } from "../production-resources/logistics-contract.js";
import { lockProductionResourceScope } from "../production-resources/snapshot-lock.js";

test("Server logistics resources share atomic commands, authority and durable identities", { timeout: 180000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("logistics_resources") });
  const errors: Record<string, unknown>[] = [], allowedOrigins: string[] = [];
  const server = createServer(createApp({ pool, allowedOrigins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, logger: { error: event => errors.push(event) } }));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); try { await pool.end(); } finally { await postgres.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`; allowedOrigins.push(base);
  async function request(path: string, cookie?: string, body?: unknown, method = body === undefined ? "GET" : "POST", headers: Record<string, string> = {}) {
    const response = await fetch(base + "/api/v1/production-resources" + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: base, "X-Zhixu-Request": "1" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); return { status: response.status, body: JSON.parse(text), text };
  }
  async function user(username: string, permissions: PermissionKey[]) {
    const row = (await pool.query(`INSERT INTO app_users(username,password_hash,display_name,role)
      VALUES($1,crypt('synthetic-logistics-only',gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text`, [username])).rows[0];
    await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [username]);
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [row.id, username]);
    for (const permission of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [username, permission]);
    const login = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: base, "X-Zhixu-Request": "1" }, body: JSON.stringify({ username, password: "synthetic-logistics-only" }) });
    const actor: TrustedIdentity = { internalUserId: row.id, userId: row.public_id, username, userName: "UNTRUSTED", permissions };
    assert.equal(login.status, 200); return { id: row.id, role: username, actor, cookie: login.headers.get("set-cookie")!.split(";")[0] };
  }
  const admin = await user("logistics.admin", ["settings.production_infrastructure.edit"]), viewer = await user("logistics.viewer", ["schedule.view"]), groupEditor = await user("logistics.group", ["settings.production_group.edit"]);
  const createCommand = (kind: string, data: unknown) => ({ requestId: randomUUID(), action: "create", kind, resourceId: null, expectedVersion: 0, data });
  const save = (input: unknown, cookie = admin.cookie) => request("/commands", cookie, input);
  async function create(kind: string, data: unknown) { const response = await save(createCommand(kind, data)); assert.equal(response.status, 200, response.text); return response.body.resource; }
  async function get(kind: string, id: string) { const response = await request(`/${kind}/${id}`, admin.cookie); assert.equal(response.status, 200, response.text); return response.body.resource; }
  function update(resource: Record<string, unknown>, patch: Record<string, unknown> = {}) {
    const { id, kind, version, createdAt: _created, updatedAt: _updated, ...data } = resource; void _created; void _updated;
    return { requestId: randomUUID(), action: "update", kind, resourceId: id, expectedVersion: version, data: { ...data, ...patch } };
  }
  const mode = { modeId: null, name: "合成运输", transitDays: 0, enabled: true, sortOrder: -1.25, remark: "保留\n格式" };
  await t.test("empty new lists add no default warehouse, route, child, account or grant", async () => {
    for (const kind of ["hubs", "transport-plans"]) { const result = await request("/" + kind, admin.cookie); assert.equal(result.status, 200, result.text); assert.deepEqual(result.body.items, []); assert.equal(result.body.total, 0); }
    for (const table of ["production_supply_hubs", "production_supply_routes", "production_transport_modes"]) assert.equal((await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0);
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []); await verifyMigrationsCurrent(pool, resolve("database/migrations"));
    assert.equal((await pool.query("SELECT count(*)::int n FROM app_role_permissions WHERE role_id=$1", [viewer.role])).rows[0].n, 1);
  });
  const calendar = await create("calendars", { name: "合成日历", enabled: true, remark: "", workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
  const site = await create("sites", { name: "合成地点", enabled: true, remark: "", countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
  let hub = await create("hubs", { name: "合成集货仓", enabled: true, remark: "" });
  const planData = { name: "合成仓 → 地点", enabled: true, remark: "测试方案", supplyHubId: hub.id, productionSiteId: site.id, modes: [mode, { ...mode, transitDays: 12, enabled: false }] };
  let plan: Awaited<ReturnType<typeof get>>;
  await t.test("two identical concurrent requests create one plan and stable child IDs with one audit", async () => {
    const input = createCommand("transport-plans", planData);
    const responses = await Promise.all([save(input), save(input)]); assert.deepEqual(responses.map(item => item.status), [200, 200]);
    plan = responses[0].body.resource; assert.equal(plan.id, responses[1].body.resource.id); assert.equal(plan.version, 1);
    assert.deepEqual(responses.map(item => item.body.replayed).sort(), [false, true]);
    assert.equal(new Set(plan.modes.map((item: { modeId: string }) => item.modeId)).size, 2);
    assert.ok(plan.modes.every((item: { modeId: unknown }) => typeof item.modeId === "string"));
    assert.deepEqual(plan.modes.map((item: { transitDays: number }) => item.transitDays), [0, 12]);
    assert.equal(responses[0].body.operationId, responses[1].body.operationId);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_id=$1", [plan.id])).rows[0].n, 1);
    const receipt = await request("/commands/" + input.requestId, admin.cookie); assert.equal(receipt.body.state, "known"); assert.deepEqual(receipt.body.result.resource, plan);
    assert.match(receipt.body.result.payloadHash, /^[a-f0-9]{64}$/u);
    const summary = await request("/transport-plans", viewer.cookie); assert.equal(summary.status, 200); assert.equal(summary.body.canEdit, false); assert.equal(summary.body.items[0].modeCount, 2); assert.equal(Object.hasOwn(summary.body.items[0], "modes"), false);
    assert.equal((await save({ ...input, data: { ...planData, remark: "变更原请求" } })).body.error.code, "production_resource_request_conflict");
  });
  await t.test("fresh authority and existing permission control new kinds without group-editor escalation", async () => {
    for (const kind of ["hubs", "transport-plans"]) {
      assert.equal((await request("/" + kind)).status, 401); assert.equal((await request("/" + kind, groupEditor.cookie)).status, 403);
      assert.equal((await save(createCommand(kind, kind === "hubs" ? { name: "无权", enabled: true, remark: "" } : planData), viewer.cookie)).status, 403);
    }
    assert.equal((await save({ ...createCommand("hubs", { name: "x", enabled: true, remark: "" }), actorId: admin.id })).status, 400);
    assert.equal((await request("/commands", admin.cookie, createCommand("hubs", { name: "x", enabled: true, remark: "" }), "POST", { Origin: "https://invalid.example" })).status, 403);
    assert.equal((await request("/hubs/" + hub.id, admin.cookie, {}, "DELETE")).status, 405);
    assert.equal((await request("/transport-modes", admin.cookie)).status, 400);
    const local = createServer(createApp({ pool, identityAuthority: createIdentityAuthority(pool, "local-single-user") }));
    try {
      await new Promise<void>(done => local.listen(0, "127.0.0.1", done)); const location = local.address(); assert.ok(location && typeof location === "object");
      for (const kind of ["hubs", "transport-plans"]) assert.equal((await fetch(`http://127.0.0.1:${location.port}/api/v1/production-resources/${kind}`)).status, 404);
    } finally { await new Promise<void>(done => local.close(() => done())); }
  });
  await t.test("one plan version atomically preserves, disables, reorders and appends mode identities", async () => {
    const noop = await save(update(plan)); assert.equal(noop.status, 200, noop.text); assert.equal(noop.body.changed, false); assert.equal(noop.body.resource.version, 1);
    const before = structuredClone(plan);
    const changed = await save(update(plan, { modes: [{ ...plan.modes[1], enabled: true }, { ...plan.modes[0], enabled: false }, { ...mode, name: "合成加急", transitDays: 3, sortOrder: 10 }] }));
    assert.equal(changed.status, 200, changed.text); plan = changed.body.resource; assert.equal(plan.version, 2);
    assert.equal(plan.modes[0].modeId, before.modes[1].modeId); assert.equal(plan.modes[1].modeId, before.modes[0].modeId); assert.equal(plan.modes.length, 3);
    assert.deepEqual((await get("transport-plans", plan.id)).modes, plan.modes);
    assert.equal((await save(update(plan))).body.changed, false);
    const rejected = await save(update(plan, { modes: plan.modes.slice(1) })); assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, "logistics_mode_membership_conflict");
    const foreign = await save(update(plan, { modes: [{ ...plan.modes[0], modeId: randomUUID() }, ...plan.modes.slice(1)] })); assert.equal(foreign.status, 409);
    assert.deepEqual(await get("transport-plans", plan.id), plan);
    const oldAudit = (await pool.query("SELECT before_data,after_data FROM operation_logs WHERE entity_id=$1 ORDER BY created_at,id", [plan.id])).rows;
    assert.equal(oldAudit.length, 2); assert.match(oldAudit[1].before_data.values["运输方式"], new RegExp(before.modes[0].modeId));
  });
  await t.test("concurrent edits use the parent CAS and persist the losing request as rejected", async () => {
    const commands = [update(plan, { remark: "竞争A" }), update(plan, { remark: "竞争B" })];
    const results = await Promise.all(commands.map(input => save(input))); assert.deepEqual(results.map(item => item.status).sort(), [200, 409]);
    const lost = results.findIndex(item => item.status === 409); assert.equal(results[lost].body.error.code, "production_resource_version_conflict");
    const repeated = await save(commands[lost]); assert.equal(repeated.status, 409); assert.equal(repeated.body.replayed, true);
    plan = await get("transport-plans", plan.id); assert.equal(plan.version, 3);
  });
  await t.test("enabled Hub/Site pairs are unambiguous while disabled history and duplicate names survive", async () => {
    const duplicate = await save(createCommand("transport-plans", planData)); assert.equal(duplicate.status, 409); assert.equal(duplicate.body.error.code, "logistics_route_pair_conflict");
    const historical = await create("transport-plans", { ...planData, enabled: false }); assert.notEqual(historical.id, plan.id);
    const enable = await save(update(historical, { enabled: true })); assert.equal(enable.status, 409);
    const anotherHub = await create("hubs", { name: hub.name, enabled: true, remark: "同名不去重" }); assert.notEqual(anotherHub.id, hub.id);
    const input = createCommand("transport-plans", { ...planData, supplyHubId: anotherHub.id });
    const race = await Promise.all([save(input), save({ ...input, requestId: randomUUID() })]); assert.deepEqual(race.map(item => item.status).sort(), [200, 409]);
  });
  await t.test("parent disable is not a cascade, but new enabled plans cannot use missing or disabled parents", async () => {
    let result = await save(update(hub, { enabled: false })); assert.equal(result.status, 200); hub = result.body.resource;
    assert.equal((await get("transport-plans", plan.id)).enabled, true);
    result = await save(createCommand("transport-plans", planData)); assert.equal(result.status, 409); assert.equal(result.body.error.code, "production_supply_hub_disabled");
    assert.equal((await save(createCommand("transport-plans", { ...planData, supplyHubId: randomUUID() }))).body.error.code, "production_supply_hub_not_found");
    assert.equal((await save(createCommand("transport-plans", { ...planData, productionSiteId: randomUUID() }))).body.error.code, "production_supply_hub_disabled");
    result = await save(update(hub, { enabled: true })); assert.equal(result.status, 200); hub = result.body.resource;
    assert.equal((await save(createCommand("transport-plans", { ...planData, productionSiteId: randomUUID() }))).body.error.code, "production_site_not_found");
    const disabledSite = await save(update(site, { enabled: false })); assert.equal(disabledSite.status, 200);
    assert.equal((await save(createCommand("transport-plans", planData))).body.error.code, "production_site_disabled");
    assert.equal((await save(update(disabledSite.body.resource, { enabled: true }))).status, 200);
    const disabledCalendar = await save(update(calendar, { enabled: false })); assert.equal(disabledCalendar.status, 200);
    assert.equal((await save(createCommand("transport-plans", planData))).body.error.code, "production_calendar_disabled");
    assert.equal((await save(update(disabledCalendar.body.resource, { enabled: true }))).status, 200);
  });
  await t.test("SQL denies identity moves, deletion, invalid duration and receipt mutation", async () => {
    for (const table of ["production_supply_hubs", "production_supply_routes", "production_transport_modes"]) {
      const id = table === "production_supply_hubs" ? hub.id : table === "production_supply_routes" ? plan.id : plan.modes[0].modeId;
      for (const sql of [`DELETE FROM ${table} WHERE id=$1`, `UPDATE ${table} SET name='绕过版本' WHERE id=$1`, `UPDATE ${table} SET id=gen_random_uuid(),version=version+1 WHERE id=$1`]) await assert.rejects(() => pool.query(sql, [id]), { code: "23514" });
    }
    await assert.rejects(() => pool.query("UPDATE production_transport_modes SET route_id=gen_random_uuid(),version=version+1 WHERE id=$1", [plan.modes[0].modeId]), { code: "23514" });
    await assert.rejects(() => pool.query("UPDATE production_transport_modes SET transit_days=-1,version=version+1 WHERE id=$1", [plan.modes[0].modeId]), { code: "23514" });
    await assert.rejects(() => pool.query("UPDATE production_resource_commands SET kind='hubs' WHERE actor_id=$1", [admin.id]), { code: "23514" });
  });
  await t.test("audit failure rolls back the complete plan, all child changes and its receipt", async () => {
    await pool.query(`CREATE FUNCTION abort_logistics_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.after_data->>'objectName'='回滚运输方案' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER abort_logistics_test_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION abort_logistics_test_audit()`);
    const input = update(plan, { name: "回滚运输方案", modes: [...plan.modes, { ...mode, name: "不应留下" }] });
    try { assert.equal((await save(input)).status, 500); assert.deepEqual(await get("transport-plans", plan.id), plan); assert.equal((await request("/commands/" + input.requestId, admin.cookie)).body.state, "unknown"); }
    finally { await pool.query("DROP TRIGGER abort_logistics_test_audit ON operation_logs; DROP FUNCTION abort_logistics_test_audit()"); }
    assert.equal(errors.length, 1);
  });
  await t.test("a late child-storage failure cannot leave the updated parent, earlier children or a receipt", async () => {
    await pool.query(`CREATE FUNCTION abort_logistics_test_child() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.name='技术失败子项' THEN RAISE EXCEPTION 'synthetic child failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER abort_logistics_test_child BEFORE INSERT ON production_transport_modes FOR EACH ROW EXECUTE FUNCTION abort_logistics_test_child()`);
    const input = update(plan, { remark: "不应留下父变更", modes: [...plan.modes, { ...mode, name: "技术失败子项" }] });
    const bytes = (await pool.query("SELECT to_jsonb(m)::text payload FROM production_transport_modes m WHERE route_id=$1 ORDER BY id", [plan.id])).rows;
    try {
      assert.equal((await save(input)).status, 500); assert.deepEqual(await get("transport-plans", plan.id), plan);
      assert.deepEqual((await pool.query("SELECT to_jsonb(m)::text payload FROM production_transport_modes m WHERE route_id=$1 ORDER BY id", [plan.id])).rows, bytes);
      assert.equal((await request("/commands/" + input.requestId, admin.cookie)).body.state, "unknown");
    } finally { await pool.query("DROP TRIGGER abort_logistics_test_child ON production_transport_modes; DROP FUNCTION abort_logistics_test_child()"); }
    assert.equal(errors.length, 2);
  });
  await t.test("actual COMMIT followed by a lost reply is recovered by reading the original receipt", async () => {
    let dropped = false;
    const lossyPool = new Proxy(pool, { get(target, property) {
      if (property === "connect") return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(current, member) {
          if (member === "query") return async (sql: string, values?: unknown[]) => {
            const result = await current.query(sql, values);
            if (sql === "COMMIT" && !dropped) { dropped = true; throw new Error("synthetic reply lost after actual COMMIT"); }
            return result;
          };
          const value = Reflect.get(current, member); return typeof value === "function" ? value.bind(current) : value;
        } });
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    const input = parseLogisticsResourceCommand(update(plan, { modes: [...plan.modes, { ...mode, name: "已提交新方式" }] }));
    await assert.rejects(() => executeProductionResourceCommand(lossyPool, admin.actor, input), /reply lost after actual COMMIT/u); assert.equal(dropped, true);
    const receipt = await request("/commands/" + input.requestId, admin.cookie); assert.equal(receipt.body.state, "known"); assert.equal(receipt.body.result.status, "applied");
    assert.equal(receipt.body.result.payloadHash, createHash("sha256").update(JSON.stringify(input)).digest("hex"));
    plan = await get("transport-plans", plan.id); assert.deepEqual(plan, receipt.body.result.resource); assert.equal(plan.modes.length, 4);
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_transport_modes WHERE route_id=$1 AND name='已提交新方式'", [plan.id])).rows[0].n, 1);
  });
  await t.test("resource freeze blocks new logistics writes while ordinary reads retain the prior facts", async () => {
    const blocker = await pool.connect(); let pending: ReturnType<typeof save> | undefined;
    try {
      await blocker.query("BEGIN"); await lockProductionResourceScope(blocker, "freeze");
      pending = save(update(plan, { remark: "冻结后显式变更" }));
      let waiting = false; const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        waiting = (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock(%production-resource-snapshot-v1%') ready")).rows[0].ready;
        if (waiting) break; await new Promise(done => setTimeout(done, 20));
      }
      assert.equal(waiting, true); assert.deepEqual(await get("transport-plans", plan.id), plan);
      await blocker.query("COMMIT"); const result = await pending; assert.equal(result.status, 200, result.text); plan = result.body.resource;
    } finally { await blocker.query("ROLLBACK"); await pending; blocker.release(); }
  });
  await t.test("the parent Hub SHARE lock observes a concurrent disable before permitting a new enabled plan", async () => {
    const blocker = await pool.connect(); let pending: ReturnType<typeof save> | undefined;
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM production_supply_hubs WHERE id=$1 FOR UPDATE", [hub.id]);
      pending = save(createCommand("transport-plans", planData));
      let waiting = false; const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        waiting = (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT enabled FROM production_supply_hubs%') ready")).rows[0].ready;
        if (waiting) break; await new Promise(done => setTimeout(done, 20));
      }
      assert.equal(waiting, true); await blocker.query("UPDATE production_supply_hubs SET enabled=false,version=version+1 WHERE id=$1", [hub.id]); await blocker.query("COMMIT");
      const result = await pending; assert.equal(result.status, 409, result.text); assert.equal(result.body.error.code, "production_supply_hub_disabled");
    } finally { await blocker.query("ROLLBACK"); await pending; blocker.release(); }
    hub = await get("hubs", hub.id); const restored = await save(update(hub, { enabled: true })); assert.equal(restored.status, 200); hub = restored.body.resource;
  });
  await t.test("complete child sets are bounded to 100 without truncating or silently dropping modes", async () => {
    const input = { ...planData, enabled: false, name: "100种方式", modes: Array.from({ length: 100 }, (_, index) => ({ ...mode, sortOrder: index })) };
    const maximum = await create("transport-plans", input); assert.equal(maximum.modes.length, 100);
    const tooMany = await save(createCommand("transport-plans", { ...input, modes: [...input.modes, mode] })); assert.equal(tooMany.status, 400);
    await assert.rejects(() => pool.query(`INSERT INTO production_transport_modes(route_id,name,enabled,remark,transit_days,sort_order,display_position,created_by,updated_by)
      VALUES($1,'SQL超量',true,'',0,0,0,$2,$2)`, [maximum.id, admin.id]), { code: "23514" });
    assert.equal((await get("transport-plans", maximum.id)).modes.length, 100);
  });
  await t.test("a request below the HTTP byte limit gets a durable rejection when generated IDs exceed the receipt bound", async () => {
    const input = createCommand("transport-plans", { ...planData, enabled: false, name: "容量边界方案", modes: Array.from({ length: 100 }, () => ({ ...mode, remark: "" })) });
    const data = input.data as typeof planData;
    for (let controls = 1600; controls <= 2000; controls++) {
      const remark = "\u0001".repeat(controls) + "x".repeat(2000 - controls);
      const candidate = { ...data, modes: data.modes.map(item => ({ ...item, remark })) };
      if (Buffer.byteLength(JSON.stringify({ ...input, data: candidate }), "utf8") >= 1048576) break;
      input.data = candidate;
    }
    const bytes = Buffer.byteLength(JSON.stringify(input), "utf8"); assert.ok(bytes < 1048576 && bytes > 1047576, String(bytes));
    t.diagnostic(`Synthetic request bytes=${bytes}; HTTP and immutable receipt limits remain 1048576.`);
    const before = (await pool.query("SELECT count(*)::int n FROM production_transport_modes")).rows[0].n;
    const result = await save(input); assert.equal(result.status, 422, result.text); assert.equal(result.body.status, "rejected"); assert.equal(result.body.error.code, "logistics_result_too_large");
    const receipt = await request("/commands/" + input.requestId, admin.cookie); assert.equal(receipt.body.state, "known"); assert.equal(receipt.body.result.status, "rejected");
    assert.equal((await save(input)).body.replayed, true);
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_transport_modes")).rows[0].n, before);
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_supply_routes WHERE name='容量边界方案'")).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE after_data->>'objectName'='容量边界方案'")).rows[0].n, 0);
  });
  await t.test("search is AND with stable pagination and child detail stays off the list", async () => {
    for (const name of ["分页仓A", "分页仓B"]) await create("hubs", { name, enabled: true, remark: "合成筛选" });
    const page = await request("/hubs?search=" + encodeURIComponent("分页仓 合成筛选") + "&limit=1&offset=1", viewer.cookie); assert.equal(page.body.total, 2); assert.equal(page.body.items.length, 1);
    assert.equal((await request("/hubs?search=" + encodeURIComponent("分页仓 不存在"), viewer.cookie)).body.total, 0);
    for (const query of ["limit=101", "status=active", "limit=1&limit=2", "scope=all"]) assert.equal((await request("/transport-plans?" + query, admin.cookie)).status, 400);
    const row = (await request("/transport-plans", admin.cookie)).body.items.find((item: { id: string }) => item.id === plan.id); assert.equal(row.modeCount, 4); assert.equal(Object.hasOwn(row, "modes"), false);
  });
  await t.test("Hub service-route counts aggregate all enabled routes independently of list pagination", async () => {
    const anotherSite = await create("sites", { name: "合成计数地点", enabled: true, remark: "", countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
    await create("transport-plans", { ...planData, productionSiteId: anotherSite.id });
    const changed = await save(update(hub, { remark: "完整服务计数" })); assert.equal(changed.status, 200); hub = changed.body.resource;
    const result = await request("/hubs?limit=1&search=" + encodeURIComponent("完整服务计数"), viewer.cookie);
    assert.equal(result.status, 200, result.text); assert.equal(result.body.total, 1); assert.equal(result.body.items[0].id, hub.id); assert.equal(result.body.items[0].enabledRouteCount, 2);
    assert.equal(Object.hasOwn(await get("hubs", hub.id), "enabledRouteCount"), false);
  });
  await t.test("revoked database permissions deny new submissions and historical receipts", async () => {
    const member = await user("logistics.former", ["settings.production_infrastructure.edit"]);
    const input = createCommand("hubs", { name: "撤权前仓", enabled: true, remark: "" }); assert.equal((await save(input, member.cookie)).status, 200);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1", [member.role]);
    assert.equal((await save(input, member.cookie)).status, 403); assert.equal((await request("/commands/" + input.requestId, member.cookie)).status, 403);
    const row = (await pool.query("SELECT payload_hash,result FROM production_resource_commands WHERE actor_id=$1 AND request_id=$2", [member.id, input.requestId])).rows[0];
    assert.match(row.payload_hash, /^[a-f0-9]{64}$/u); assert.equal(row.result.status, "applied");
  });
});
