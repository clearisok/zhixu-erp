import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { createApp } from "../app.js";
import { createIdentityAuthority } from "../auth/identity-authority.js";
import { permissionsForUser, synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { executeRoleCommand } from "../auth/managed-roles.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { parseProductionResourceCommand, type ProductionResourceType } from "../production-resources/contract.js";
import { executeProductionResourceCommand, readProductionResource, type ProductionResource } from "../production-resources/service.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { saveResourcePending, acknowledgeResourcePending, readResourcePending } from "../../features/operations-settings/server/production-resource-outbox.js";
import { createProductionResourceClient } from "../../features/operations-settings/server/production-resource-client.js";

const editKeys: PermissionKey[] = ["settings.production_infrastructure.edit", "settings.production_group.edit", "settings.outsource_factory.edit"];
test("Gate6A empty Server resources: PostgreSQL, HTTP authority, CAS and durable outcomes", { timeout: 180000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("production_resources") });
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
    const row = (await pool.query<{ id: string; public_id: string }>(`INSERT INTO app_users(username,password_hash,display_name,role)
      VALUES($1,crypt('synthetic-resource-only',gen_salt('bf',4)),$2,'viewer') RETURNING id::text,public_id::text`, [username, "合成资源 " + username])).rows[0];
    await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [username]);
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [row.id, username]);
    for (const permission of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [username, permission]);
    const response = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: base, "X-Zhixu-Request": "1" }, body: JSON.stringify({ username, password: "synthetic-resource-only" }) });
    assert.equal(response.status, 200);
    const actor: TrustedIdentity = { internalUserId: row.id, userId: row.public_id, username, userName: "DO NOT TRUST CALLER NAME", permissions };
    return { cookie: response.headers.get("set-cookie")!.split(";")[0], actor, roleId: username };
  }
  const admin = await user("resource.admin", editKeys), viewer = await user("resource.viewer", ["schedule.view"]), groupEditor = await user("resource.group", ["settings.production_group.edit"]), quoteOnly = await user("resource.quote", ["quote.view"]);
  const command = (kind: ProductionResourceType, data: unknown) => ({ requestId: randomUUID(), action: "create", kind, resourceId: null, expectedVersion: 0, data });
  async function save(input: unknown, cookie = admin.cookie) { return request("/commands", cookie, input); }
  async function create(kind: ProductionResourceType, data: unknown): Promise<ProductionResource> { const result = await save(command(kind, data)); assert.equal(result.status, 200, result.text); return result.body.resource; }
  async function get(kind: ProductionResourceType, id: string) { const result = await request(`/${kind}/${id}`, admin.cookie); assert.equal(result.status, 200, result.text); return result.body.resource as ProductionResource; }
  function update(resource: ProductionResource, patch: Record<string, unknown> = {}) {
    const { id, kind, version, createdAt: _created, updatedAt: _updated, ...data } = resource; void _created; void _updated;
    return { requestId: randomUUID(), action: "update", kind, resourceId: id, expectedVersion: version, data: { ...data, ...patch } };
  }
  const calendarData = { name: "合成生产日历", enabled: true, remark: "", workingWeekdays: [1, 2, 3, 4, 5, 6], exceptions: [{ date: "2027-01-01", type: "non_working", name: "合成假日" }] };
  const factoryData = { name: "合成外发厂", enabled: true, remark: "", shortName: "外发", contactPerson: "合成联系人", phone: "0000" };

  await t.test("forward schema is empty, idempotent and adds no role grants or Browser defaults", async () => {
    for (const kind of ["calendars", "sites", "groups", "factories"]) { const read = await request("/" + kind, admin.cookie); assert.equal(read.status, 200); assert.deepEqual(read.body.items, []); assert.equal(read.body.total, 0); }
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []);
    await verifyMigrationsCurrent(pool, resolve("database/migrations"));
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_resource_commands")).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM app_role_permissions WHERE role_id=$1", [viewer.roleId])).rows[0].n, 1);
  });
  let calendar = await create("calendars", calendarData);
  const site = await create("sites", { name: "合成地点", enabled: true, remark: "", countryCode: "柬埔寨 / 金边", productionCalendarId: calendar.id, preProductionSampleLeadDays: 5 });
  const savedSite = await get("sites", site.id); assert.equal(savedSite.kind, "sites");
  if (savedSite.kind !== "sites") assert.fail("Expected site"); assert.equal(savedSite.countryCode, "柬埔寨 / 金边");
  const groupData = { name: "合成生产组", enabled: true, remark: "", shortName: "组合成", productionSiteId: site.id, sortOrder: 0 };
  const group = await create("groups", groupData);
  let factory = await create("factories", factoryData);

  await t.test("only trusted session routes and existing resource permissions allow reads or writes", async () => {
    assert.equal((await request("/groups")).status, 401);
    assert.equal((await request("/groups", quoteOnly.cookie)).status, 403);
    assert.equal((await request("/groups", viewer.cookie)).body.canEdit, false);
    assert.equal((await save(command("factories", factoryData), viewer.cookie)).status, 403);
    for (const kind of ["calendars", "sites", "groups"]) assert.equal((await request("/" + kind, groupEditor.cookie)).status, 200);
    assert.equal((await request("/factories", groupEditor.cookie)).status, 403);
    assert.equal((await save(command("sites", {}), groupEditor.cookie)).status, 400, "invalid payload never becomes a command");
    assert.equal((await save(command("calendars", calendarData), groupEditor.cookie)).status, 403);
    assert.equal((await save({ ...command("factories", factoryData), actorId: admin.actor.userId })).status, 400);
    assert.equal((await request("/commands", admin.cookie, command("factories", factoryData), "POST", { "X-Zhixu-Request": "0" })).status, 403);
    assert.equal((await request("/commands", admin.cookie, command("factories", factoryData), "POST", { Origin: "https://invalid.example" })).status, 403);
    assert.equal((await request("/factories/" + factory.id, admin.cookie, {}, "DELETE")).status, 405);
    assert.equal((await save(command("factories", { ...factoryData, name: "x".repeat(1048576) }))).status, 413);
  });
  await t.test("local compatibility authority cannot expose formal production resources", async () => {
    const local = createServer(createApp({ pool, identityAuthority: createIdentityAuthority(pool, "local-single-user") }));
    try {
      await new Promise<void>(done => local.listen(0, "127.0.0.1", done));
      const address = local.address(); assert.ok(address && typeof address === "object");
      assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/v1/production-resources/groups`)).status, 404);
    } finally { await new Promise<void>(done => local.close(() => done())); }
  });
  await t.test("same request concurrently creates one stable identity and one atomic audit", async () => {
    const input = command("factories", { ...factoryData, name: "幂等外发厂" });
    const replies = await Promise.all([save(input), save(input)]); assert.deepEqual(replies.map(r => r.status), [200, 200]);
    const payloadHash = createHash("sha256").update(JSON.stringify(parseProductionResourceCommand(input))).digest("hex");
    assert.deepEqual(replies.map(r => r.body.payloadHash), [payloadHash, payloadHash]);
    const id = replies[0].body.resource.id; assert.equal(id, replies[1].body.resource.id); assert.deepEqual(replies.map(r => r.body.replayed).sort(), [false, true]);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_id=$1", [id])).rows[0].n, 1);
    const audit = (await pool.query("SELECT actor_name,after_data FROM operation_logs WHERE entity_id=$1", [id])).rows[0];
    assert.equal(audit.actor_name, "合成资源 resource.admin"); assert.equal(audit.after_data.objectName, "幂等外发厂");
    const recovery = await request("/commands/" + input.requestId, admin.cookie); assert.equal(recovery.body.state, "known"); assert.equal(recovery.body.result.resource.id, id);
    assert.equal(recovery.body.result.payloadHash, payloadHash);
    assert.equal((await save({ ...input, data: { ...factoryData, name: "不同内容" } })).body.error.code, "production_resource_request_conflict");
    assert.equal((await request("/commands/" + input.requestId, groupEditor.cookie)).body.state, "unknown", "receipt scope is actor plus request");
  });
  await t.test("one CAS winner; loser remains a durable rejection even after later changes", async () => {
    const first = update(factory, { remark: "first" }), second = update(factory, { remark: "second" });
    const replies = await Promise.all([save(first), save(second)]); assert.deepEqual(replies.map(r => r.status).sort(), [200, 409]);
    const winner = replies.find(r => r.status === 200)!; factory = winner.body.resource;
    const rejected = replies[0].status === 409 ? first : second;
    assert.equal((await save(rejected)).body.replayed, true); assert.equal((await save(rejected)).status, 409);
    const receipt = await request("/commands/" + rejected.requestId, admin.cookie); assert.equal(receipt.body.result.status, "rejected");
    assert.equal(receipt.body.result.payloadHash, createHash("sha256").update(JSON.stringify(parseProductionResourceCommand(rejected))).digest("hex"));
    assert.equal((await get("factories", factory.id)).version, 2);
    const unchanged = await save(update(factory)); assert.equal(unchanged.body.changed, false); assert.equal(unchanged.body.resource.version, 2);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_id=$1", [factory.id])).rows[0].n, 2);
  });
  await t.test("calendar changes replace only explicit dates and retain old receipt and audit snapshots", async () => {
    const initial = await get("calendars", calendar.id);
    const changed = await save(update(initial, { workingWeekdays: [0, 1], exceptions: [{ date: "2027-02-01", type: "working", name: "合成加班" }] }));
    assert.equal(changed.status, 200, changed.text); calendar = changed.body.resource;
    assert.equal(calendar.kind, "calendars"); if (calendar.kind !== "calendars") return;
    assert.deepEqual(calendar.exceptions.map(e => e.date), ["2027-02-01"]);
    const events = (await pool.query("SELECT before_data,after_data FROM operation_logs WHERE entity_id=$1 ORDER BY created_at,id", [calendar.id])).rows;
    assert.equal(events.length, 2); assert.match(events[1].before_data.values["特殊日期"], /2027-01-01/u); assert.match(events[1].after_data.values["特殊日期"], /2027-02-01/u);
    const summary = await request("/calendars", admin.cookie); assert.equal(summary.body.items[0].exceptionCount, 1); assert.equal(Object.hasOwn(summary.body.items[0], "exceptions"), false);
  });
  await t.test("nonexistent or disabled dependencies reject without child writes and can be recovered", async () => {
    const bad = command("groups", { ...groupData, productionSiteId: randomUUID() });
    assert.equal((await save(bad)).body.error.code, "production_site_not_found");
    const missingSite = command("sites", { name: "缺日历", enabled: true, remark: "", countryCode: "CN", productionCalendarId: randomUUID(), preProductionSampleLeadDays: 0 });
    assert.equal((await save(missingSite)).body.error.code, "production_calendar_not_found");
    const disable = await save(update(calendar, { enabled: false })); assert.equal(disable.status, 200, disable.text); calendar = disable.body.resource;
    assert.equal((await get("groups", group.id)).enabled, true, "disabling a parent preserves existing child facts");
    assert.equal((await save(command("groups", groupData))).body.error.code, "production_calendar_disabled");
    const disabledChild = await create("groups", { ...groupData, enabled: false }); assert.equal(disabledChild.enabled, false);
    const enable = await save(update(calendar, { enabled: true })); assert.equal(enable.status, 200); calendar = enable.body.resource;
    assert.equal((await save(bad)).body.replayed, true);
  });
  await t.test("dependency SHARE locks hold a concurrent disable until the child transaction decides", async () => {
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM production_calendars WHERE id=$1 FOR UPDATE", [calendar.id]);
      const input = command("sites", { name: "并发地点", enabled: true, remark: "", countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
      let settled = false; const pending = save(input).then(value => { settled = true; return value; });
      // Observe the actual database wait rather than inferring locking from an arbitrary delay.
      const deadline = Date.now() + 4000; let waiting = false;
      while (Date.now() < deadline) { waiting = (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT enabled FROM production_calendars%') ready")).rows[0].ready; if (waiting) break; await new Promise(done => setTimeout(done, 20)); }
      assert.equal(waiting, true); assert.equal(settled, false);
      await blocker.query("UPDATE production_calendars SET enabled=false,version=version+1 WHERE id=$1", [calendar.id]); await blocker.query("COMMIT");
      const result = await pending; assert.equal(result.status, 409, result.text); assert.equal(result.body.error.code, "production_calendar_disabled");
      assert.equal((await pool.query("SELECT count(*)::int n FROM production_sites WHERE name='并发地点'")).rows[0].n, 0);
      calendar = await get("calendars", calendar.id); const enabled = await save(update(calendar, { enabled: true })); assert.equal(enabled.status, 200); calendar = enabled.body.resource;
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  await t.test("receipt distinguishes an in-flight original request from an unknown one", async () => {
    const requestId = randomUUID(), blocker = await pool.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`production-resource:${admin.actor.internalUserId}:${requestId}`]);
      assert.equal((await request("/commands/" + requestId, admin.cookie)).body.state, "pending");
      await blocker.query("COMMIT"); assert.equal((await request("/commands/" + requestId, admin.cookie)).body.state, "unknown");
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  await t.test("business search is space-AND, pagination is stable, natural group sorting is reused", async () => {
    for (const number of [10, 2]) await create("groups", { ...groupData, name: "排序组" + number, remark: "准备中" });
    const query = new URLSearchParams({ search: "排序组 准备", limit: "1", offset: "0", status: "enabled" });
    const first = await request("/groups?" + query, admin.cookie); assert.equal(first.body.total, 2); assert.equal(first.body.items[0].name, "排序组2");
    query.set("offset", "1"); assert.equal((await request("/groups?" + query, admin.cookie)).body.items[0].name, "排序组10");
    query.set("search", "排序组 缺词"); assert.equal((await request("/groups?" + query, admin.cookie)).body.total, 0);
    await create("factories", factoryData); assert.equal((await request("/factories?search=" + encodeURIComponent(factoryData.name), admin.cookie)).body.total, 2, "names are not identity");
    assert.equal((await request("/factories?search=" + encodeURIComponent("合成联系人 0000"), admin.cookie)).body.total, 3, "existing contact and phone search remains available with AND semantics");
    for (const query of ["limit=101", "offset=-1", "status=active", "limit=1&limit=2", "currency=USD", "limit=1.5"]) assert.equal((await request("/groups?" + query, admin.cookie)).status, 400);
  });
  await t.test("fresh database grants and active identity prevail over a stale or forged caller", async () => {
    const former = await user("resource.former", ["settings.outsource_factory.edit"]);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1", [former.roleId]);
    const input = parseProductionResourceCommand(command("factories", factoryData));
    await assert.rejects(() => executeProductionResourceCommand(pool, former.actor, input), { status: 403 });
    await assert.rejects(() => readProductionResource(pool, { ...viewer.actor, permissions: editKeys }, "factories", factory.id + "x"), { status: 400 });
    await assert.rejects(() => executeProductionResourceCommand(pool, { ...admin.actor, userId: randomUUID() }, input), { status: 401 });
    assert.equal((await request("/factories", former.cookie)).status, 403);
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_resource_commands WHERE actor_id=$1", [former.actor.internalUserId])).rows[0].n, 0);
  });
  await t.test("permission revocation waits for an already authorized resource transaction", async () => {
    const member = await user("resource.concurrent", ["settings.outsource_factory.edit"]), blocker = await pool.connect(), revoker = await pool.connect();
    let pending: ReturnType<typeof save> | undefined, revoking: Promise<pg.QueryResult> | undefined;
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM production_outsource_factories WHERE id=$1 FOR UPDATE", [factory.id]);
      pending = save(update(factory, { remark: "受权限锁保护" }), member.cookie);
      const deadline = Date.now() + 4000; let waiting = false;
      while (Date.now() < deadline) { waiting = (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM production_outsource_factories%') ready")).rows[0].ready; if (waiting) break; await new Promise(done => setTimeout(done, 20)); }
      assert.equal(waiting, true);
      revoking = revoker.query("DELETE FROM app_role_permissions WHERE role_id=$1", [member.roleId]);
      const revokeDeadline = Date.now() + 4000; let revokeWaiting = false;
      while (Date.now() < revokeDeadline) { revokeWaiting = (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'DELETE FROM app_role_permissions%') ready")).rows[0].ready; if (revokeWaiting) break; await new Promise(done => setTimeout(done, 20)); }
      assert.equal(revokeWaiting, true);
      await blocker.query("COMMIT"); const applied = await pending; assert.equal(applied.status, 200, applied.text); factory = applied.body.resource;
      await revoking;
      assert.equal((await save(update(factory, { remark: "不再允许" }), member.cookie)).status, 403);
      await assert.rejects(() => executeProductionResourceCommand(pool, member.actor, parseProductionResourceCommand(update(factory))), { status: 403 });
    } finally { await blocker.query("ROLLBACK"); await pending; await revoking; blocker.release(); revoker.release(); }
  });
  await t.test("bounded search rejects an incomplete candidate set instead of silently truncating", async () => {
    await pool.query(`INSERT INTO production_outsource_factories(name,short_name,enabled,remark,contact_person,phone,created_by,updated_by)
      SELECT '容量合成'||n,'',true,'','','',$1,$1 FROM generate_series(1,5001) n`, [admin.actor.internalUserId]);
    assert.equal((await request("/factories?search=" + encodeURIComponent("容量合成"), admin.cookie)).status, 422);
    const refined = await request("/factories?search=" + encodeURIComponent("容量合成5001"), admin.cookie); assert.equal(refined.status, 200); assert.equal(refined.body.total, 1);
  });
  await t.test("real role editing can revoke grants while a later resource command waits, without an r/rp lock cycle", async () => {
    await bootstrapAdmin(pool, { username: "resource.root", displayName: "合成权限管理员", password: "synthetic-root-only" });
    const rootRow = (await pool.query<{ id: string; public_id: string }>("SELECT id::text,public_id::text FROM app_users WHERE username='resource.root'")).rows[0];
    const root: TrustedIdentity = { internalUserId: rootRow.id, userId: rootRow.public_id, username: "resource.root", userName: "合成权限管理员", permissions: await permissionsForUser(pool, rootRow.id) };
    const member = await user("resource.rolechange", ["settings.outsource_factory.edit"]);
    let signalLocked!: () => void, advance!: () => void;
    const roleLocked = new Promise<void>(done => { signalLocked = done; }), continueRole = new Promise<void>(done => { advance = done; });
    // Pause the actual role service after its UPDATE r but before DELETE rp.
    // The resource command must not hold rp while it waits for that r.
    const managerPool = new Proxy(pool, { get(target, property) {
      if (property === "connect") return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(current, memberName) {
          if (memberName === "query") return async (sql: string, values?: unknown[]) => {
            const result = await current.query(sql, values);
            if (sql.startsWith("UPDATE app_roles SET name=")) { signalLocked(); await continueRole; }
            return result;
          };
          const value = Reflect.get(current, memberName); return typeof value === "function" ? value.bind(current) : value;
        } });
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    let roleError: unknown;
    const roleChange = executeRoleCommand(managerPool, root, { action: "update", requestId: randomUUID(), id: member.roleId, expectedVersion: "1", name: member.roleId, description: "撤销维护权限", permissions: ["schedule.view"] }).catch(error => { roleError = error; signalLocked(); return null; });
    let saving: ReturnType<typeof save> | undefined;
    try {
      await roleLocked; if (roleError) throw roleError;
      saving = save(update(factory, { remark: "不能沿用已撤销授权" }), member.cookie);
      const deadline = Date.now() + 4000; let waiting = false;
      while (Date.now() < deadline) { waiting = (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT r.id FROM app_roles r%') ready")).rows[0].ready; if (waiting) break; await new Promise(done => setTimeout(done, 20)); }
      assert.equal(waiting, true); advance();
      assert.notEqual(await roleChange, null, String(roleError));
      const result = await saving; assert.equal(result.status, 403, result.text);
      assert.equal((await get("factories", factory.id)).remark, factory.remark);
      assert.equal((await pool.query("SELECT count(*)::int n FROM production_resource_commands WHERE actor_id=$1", [member.actor.internalUserId])).rows[0].n, 0);
    } finally { advance(); await saving; await roleChange; }
  });
  await t.test("SQL preserves identity/version and receipts; invalid days and duplicate exceptions fail", async () => {
    for (const sql of ["DELETE FROM production_groups WHERE id=$1", "UPDATE production_groups SET name='bypass' WHERE id=$1", "UPDATE production_groups SET id=gen_random_uuid(),version=version+1 WHERE id=$1"]) await assert.rejects(() => pool.query(sql, [group.id]), { code: "23514" });
    await assert.rejects(() => pool.query("UPDATE production_calendars SET working_weekdays='{}',version=version+1 WHERE id=$1", [calendar.id]), { code: "23514" });
    await assert.rejects(() => pool.query("UPDATE production_calendars SET working_weekdays=ARRAY[1,1]::smallint[],version=version+1 WHERE id=$1", [calendar.id]), { code: "23514" });
    await assert.rejects(() => pool.query("UPDATE production_groups SET sort_order='NaN',version=version+1 WHERE id=$1", [group.id]), { code: "23514" });
    await assert.rejects(() => pool.query("INSERT INTO production_calendar_exceptions VALUES($1,'2027-02-01','working','duplicate')", [calendar.id]), { code: "23505" });
    await assert.rejects(() => pool.query("DELETE FROM production_resource_commands WHERE actor_id=$1", [admin.actor.internalUserId]), { code: "23514" });
  });
  await t.test("a valid bounded calendar whose jsonb result is oversized gets one recoverable rejection, including no-op", async () => {
    const bytes = 1024 * 1024;
    const data = (controls: number) => ({ name: "Capacity", enabled: true, remark: "", workingWeekdays: [1], exceptions: Array.from({ length: 1000 }, (_, index) => ({
      date: new Date(Date.UTC(2027, 0, index + 1)).toISOString().slice(0, 10), type: "non_working", name: "\u0001".repeat(controls) + "x".repeat(200 - controls),
    })) });
    const input = parseProductionResourceCommand(command("calendars", data(159)));
    assert.ok(Buffer.byteLength(JSON.stringify(input)) < bytes, "valid HTTP command remains below its original limit");
    const slots = new Map<string, string>();
    const storage = { getItem: (key: string) => slots.get(key) ?? null, setItem: (key: string, value: string) => { slots.set(key, value); }, removeItem: (key: string) => { slots.delete(key); } };
    const scope = { userId: admin.actor.userId, kind: "calendars" as const };
    saveResourcePending(storage, scope, input);
    assert.ok(Buffer.byteLength([...slots.values()][0]) < bytes, "the actual outbox also accepts the bounded original command");
    const projected = { requestId: input.requestId, kind: "calendars", status: "applied", changed: true, operationId: "operation-" + randomUUID(), resource: {
      id: randomUUID(), kind: "calendars", version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...input.data,
    } };
    const size = (await pool.query<{ n: number }>("SELECT octet_length($1::jsonb::text) n", [JSON.stringify(projected)])).rows[0].n;
    assert.ok(size > bytes, "real PostgreSQL jsonb serialization expands beyond the existing receipt limit");
    const counts = async () => (await pool.query("SELECT (SELECT count(*)::int FROM production_calendars) calendars,(SELECT count(*)::int FROM production_calendar_exceptions) exceptions,(SELECT count(*)::int FROM operation_logs) audit,(SELECT count(*)::int FROM production_resource_commands) receipts")).rows[0];
    const before = await counts(), first = await save(input);
    t.diagnostic(`Calendar capacity: HTTP=${Buffer.byteLength(JSON.stringify(input))}, outbox=${Buffer.byteLength([...slots.values()][0])}, PostgreSQL result=${size}, status=${first.status}`);
    assert.equal(first.status, 422);
    assert.equal(first.body.status, "rejected"); assert.deepEqual(first.body.error, { status: 422, code: "production_resource_result_too_large" });
    assert.deepEqual(await counts(), { ...before, receipts: before.receipts + 1 }, "resource, exception and audit effects rolled back together");
    const repeated = await save(input); assert.equal(repeated.status, 422); assert.equal(repeated.body.replayed, true);
    assert.deepEqual({ ...repeated.body, replayed: false }, first.body);
    const receipt = await request("/commands/" + input.requestId, admin.cookie);
    assert.equal(receipt.status, 200); assert.equal(receipt.body.state, "known");
    const { replayed: _replayed, ...saved } = first.body; void _replayed;
    assert.deepEqual(receipt.body.result, saved); assert.deepEqual(await counts(), { ...before, receipts: before.receipts + 1 });
    const client = createProductionResourceClient((async (url, init) => fetch(base + url, { ...init, headers: { ...init?.headers, Cookie: admin.cookie, Origin: base } })) as typeof fetch);
    const known = await client.receipt(input); assert.equal(known.state, "known");
    if (known.state !== "known") assert.fail("Expected the original known receipt");
    assert.equal(known.result.status, "rejected");
    acknowledgeResourcePending(storage, scope, input); assert.equal(readResourcePending(storage, scope), null);

    // A preexisting large resource can also produce an oversized unchanged result.
    const id = randomUUID();
    await pool.query("INSERT INTO production_calendars(id,name,enabled,remark,working_weekdays,created_by,updated_by) VALUES($1,'Capacity',true,'',ARRAY[1]::smallint[],$2,$2)", [id, admin.actor.internalUserId]);
    await pool.query("INSERT INTO production_calendar_exceptions SELECT $1,e.date::date,e.type,e.name FROM jsonb_to_recordset($2::jsonb) e(date text,type text,name text)", [id, JSON.stringify(data(159).exceptions)]);
    const existing = await get("calendars", id), noop = update(existing), beforeNoop = await counts();
    assert.ok(Buffer.byteLength(JSON.stringify(noop)) < bytes);
    const rejectedNoop = await save(noop); assert.equal(rejectedNoop.status, 422); assert.equal(rejectedNoop.body.error.code, "production_resource_result_too_large");
    assert.deepEqual(await counts(), { ...beforeNoop, receipts: beforeNoop.receipts + 1 });
    assert.deepEqual(await get("calendars", id), existing);

    // Keep legitimate 1000-exception inputs that actually fit; no truncation or new character restriction.
    const fitting = await save(command("calendars", data(157))); assert.equal(fitting.status, 200);
    assert.equal(fitting.body.resource.exceptions.length, 1000);
    assert.equal(fitting.body.resource.exceptions[0].name, data(157).exceptions[0].name);
    const storedBytes = (await pool.query<{ n: number }>("SELECT octet_length(result::text) n FROM production_resource_commands WHERE actor_id=$1 AND request_id=$2", [admin.actor.internalUserId, fitting.body.requestId])).rows[0].n;
    assert.ok(storedBytes <= bytes);
  });
  await t.test("audit failure rolls back the resource and receipt, not a false durable success", async () => {
    await pool.query(`CREATE FUNCTION abort_resource_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.after_data->>'objectName'='回滚外发厂' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER abort_resource_test_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION abort_resource_test_audit()`);
    const input = command("factories", { ...factoryData, name: "回滚外发厂" });
    try {
      assert.equal((await save(input)).status, 500);
      assert.equal((await pool.query("SELECT count(*)::int n FROM production_outsource_factories WHERE name='回滚外发厂'")).rows[0].n, 0);
      assert.equal((await request("/commands/" + input.requestId, admin.cookie)).body.state, "unknown");
    } finally { await pool.query("DROP TRIGGER abort_resource_test_audit ON operation_logs; DROP FUNCTION abort_resource_test_audit()"); }
    assert.equal(errors.length, 1, "only the deliberate audit-failure case produced an internal error");
  });
});
