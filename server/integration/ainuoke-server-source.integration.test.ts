import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { mkdtemp, readdir, copyFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { executeTeamCommand } from "../auth/team-access.js";
import { TEAM_ROLES } from "../auth/team-roles.js";
import { createApp } from "../app.js";
import { captureSource } from "../ainuoke-source/service.js";
import { createPersistedMaterialPorts } from "../ainuoke-source/reader.js";
import { createOrderMaterialReader } from "../../features/ainuoke-material-progress/read-service.js";
import { bundle, syntheticOrder, syntheticFetchedAt } from "./ainuoke-source-fixture.js";
import { collectWithPython } from "../ainuoke-source/collector.js";
import { validateBundle } from "../ainuoke-source/contract.js";
test("server source: isolated PostgreSQL, real session HTTP and Python fixed-catalog transport", { timeout: 180000 }, async (t) => {
    const db = await startDisposablePostgres();
    assert.match(db.containerName, /^zhixu-pg-it-[a-f0-9]{12}$/);
    const databaseUrl=await db.createDatabase("ainuoke_source");
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const server = createServer();
    const upstream = createServer();
    let clock = Date.parse(syntheticFetchedAt);
    try {
        const oldDir = await mkdtemp(join(tmpdir(), "zhixu-migrations-11-"));
        try {
            for (const file of await readdir("database/migrations"))
                if (file.endsWith(".sql") && Number(file.slice(0,4))<=11)
                    await copyFile(join("database/migrations", file), join(oldDir, file));
            await runMigrations(pool, oldDir);
        }
        finally {
            await rm(oldDir, { recursive: true, force: true });
        }
        await synchronizePermissionCatalog(pool);
        await bootstrapAdmin(pool, { username: "synthetic.admin", displayName: "合成管理员", password: "synthetic-secret-only" });
        const actor = await loadExistingBootstrapActor(pool, "synthetic.admin");
        const before = (await pool.query("SELECT public_id::text,password_hash FROM app_users")).rows;
        await runMigrations(pool, resolve("database/migrations"));
        await runMigrations(pool, resolve("database/migrations"));
        assert.deepEqual((await pool.query("SELECT public_id::text,password_hash FROM app_users")).rows, before);
        assert.deepEqual((await pool.query("SELECT version::int AS version FROM schema_migrations ORDER BY version")).rows.map(row=>row.version), [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22]);
        const order = (await createAinuokeSalesOrder(pool, actor, { source: { sourceId: "synthetic-1", sourceRowIdentity: "synthetic-order", salesContractNo: syntheticOrder.salesContractNo, insideOrderNo: syntheticOrder.insideOrderNo, lifecycleStatusRaw: "生效", contractDate: "2026-10-01", contractDeliveryDate: "2026-11-01", styleNo: syntheticOrder.styleNo, companyNameSnapshot: "合成公司", customerNameSnapshot: "合成客户", brandNameSnapshot: "合成品牌", quantity: 100, sourceHash: "synthetic-order-hash", fetchedAt: syntheticFetchedAt }, colors: [] })).salesOrder;
        for (const [i, role] of TEAM_ROLES.entries())
            await executeTeamCommand(pool, actor, { action: "create", requestId: randomUUID(), account: "synthetic.team." + i, name: "合成-" + role.name, password: "synthetic-secret-only", roleIds: [role.id] });
        const ports = createPersistedMaterialPorts(pool, { sourceKey: "first-team", maxAgeMs: 1000 }, () => clock);
        server.on("request", createApp({ pool, allowedOrigins: ["http://127.0.0.1"], security: { secureCookies: false, sessionTtlSeconds: 3600 }, orderMaterialRead: ports }));
        await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const base = "http://127.0.0.1:" + address.port;
        const login = async (username: string) => {
            const r = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { Origin: "http://127.0.0.1", "Content-Type": "application/json", "X-Zhixu-Request": "1" }, body: JSON.stringify({ username, password: "synthetic-secret-only" }) });
            assert.equal(r.status, 200);
            return r.headers.get("set-cookie")!.split(";")[0];
        };
        const cookies = await Promise.all(TEAM_ROLES.map((_, i) => login("synthetic.team." + i)));
        const read = (cookie?: string) => fetch(base + "/api/v1/sales-orders/" + order.id + "/material-progress", { headers: cookie ? { Cookie: cookie } : {} });
        const capture = (b: unknown = bundle(), collector?: () => Promise<unknown>) => captureSource(pool, actor, { sourceKey: "first-team", accountFingerprint: "a".repeat(64), maxAgeMs: 1000, now: () => clock, collect: collector ?? (async () => b) });
        const latest = async () => (await pool.query("SELECT latest_run_id::text FROM ainuoke_source_profiles WHERE source_key='first-team'")).rows[0]?.latest_run_id;
        await t.test("empty runtime has no data; successful capture publishes all four streams to all six roles", async () => {
            assert.equal((await read()).status, 401);
            assert.equal((await read(cookies[0])).status, 404);
            await capture();
            for (const cookie of cookies) {
                const r = await read(cookie);
                assert.equal(r.status, 200);
                const body = await r.json();
                assert.equal(body.provenance, "server_snapshot");
                assert.equal(body.progress.sourceStatus, "ready");
                assert.ok(body.progress.factoryExcluded > 0);
                const rows = body.progress.rows;
                for (const key of ["purchases", "inbounds", "shipments", "outbounds"])
                    assert.ok(rows.some((row: Record<string, unknown[]>) => row[key].length));
                assert.ok(rows.some((row: {
                    purchases: {
                        sourcePricing: {
                            unitPrice: number;
                        };
                    }[];
                }) => row.purchases.some(p => p.sourcePricing.unitPrice === 12.75)));
                assert.ok(!JSON.stringify(body).includes("protected-commercial-sentinel"));
                assert.ok(!JSON.stringify(body).includes("snapshots"));
            }
        });
        await t.test("exact retry is idempotent; no domain orders/quotes or accounts are created", async () => {
            const first = await latest();
            const counts = await pool.query("SELECT (SELECT count(*) FROM sales_orders)::int AS orders,(SELECT count(*) FROM app_users)::int AS users,(SELECT count(*) FROM quote_center_quotes)::int AS quotes,(SELECT count(*) FROM operation_logs)::int AS logs");
            assert.equal((await capture()).replayed, true);
            assert.equal(await latest(), first);
            assert.deepEqual((await pool.query("SELECT (SELECT count(*) FROM sales_orders)::int AS orders,(SELECT count(*) FROM app_users)::int AS users,(SELECT count(*) FROM quote_center_quotes)::int AS quotes,(SELECT count(*) FROM operation_logs)::int AS logs")).rows, counts.rows);
        });
        await t.test("failed/partial/foreign/secret-bearing reads retain pointer and history, never advertise current facts", async () => {
            for (const kind of ["partial", "foreign", "secret"]) {
                const b = bundle();
                if (kind === "partial")
                    b.materials[syntheticOrder.salesContractNo][0].total++;
                if (kind === "foreign")
                    b.materials[syntheticOrder.salesContractNo][0].rows[0].values.ExpContractNo = "OTHER";
                if (kind === "secret")
                    b.discoveryBefore[0].rows[0].values.password = "synthetic-do-not-log";
                const previous = await latest();
                await assert.rejects(capture(b));
                assert.equal(await latest(), previous);
                const body = await (await read(cookies[0])).json();
                assert.equal(body.progress.sourceStatus, "source_failed");
                assert.equal(body.progress.rows.length, 0);
                await capture();
            }
            const logs = JSON.stringify((await pool.query("SELECT metadata,context,before_data,after_data FROM operation_logs")).rows);
            assert.ok(!logs.includes("synthetic-do-not-log"));
            assert.ok(!logs.includes("protected-commercial-sentinel"));
        });
        await t.test("stale data hides current material status; restart of reader preserves accepted data", async () => {
            clock += 1001;
            assert.equal((await (await read(cookies[3])).json()).progress.sourceStatus, "stale");
            clock -= 1001;
            const restarted = createPersistedMaterialPorts(pool, { sourceKey: "first-team", maxAgeMs: 1000 }, () => clock);
            assert.ok(await restarted.resolveVisibleOrder(actor, order.id));
        });
        await t.test("concurrent captures reject before second upstream request", async () => {
            let release!: () => void;
            const barrier = new Promise<void>(r => { release = r; });
            let began!: () => void;
            const started = new Promise<void>(r => { began = r; });
            const first = capture(bundle(), async () => { began(); await barrier; return bundle(); });
            await started;
            try {
                await assert.rejects(capture(bundle(), async () => { throw Error("must not run"); }), /source_capture_busy/);
            }
            finally {
                release();
            }
            await first;
        });
        await t.test("account identity cannot silently replace the source credential scope", async () => {
            await assert.rejects(captureSource(pool, actor, { sourceKey: "first-team", accountFingerprint: "b".repeat(64), maxAgeMs: 1000, collect: async () => { throw Error("must not run"); } }), /source_account_mismatch/);
        });
        await t.test("permission revocation during collection blocks publication", async () => {
            const previous = await latest();
            await assert.rejects(capture(bundle(), async () => { await pool.query("UPDATE app_users SET active=false WHERE id=$1", [actor.internalUserId]); return bundle(); }), /source_actor_unavailable/);
            assert.equal(await latest(), previous);
            await pool.query("UPDATE app_users SET active=true WHERE id=$1", [actor.internalUserId]);
            await capture();
        });
        await t.test("read and capture independently recheck actual DB permissions, not supplied permission arrays", async () => {
            const manager = await loadExistingBootstrapActor(pool, "synthetic.team.3");
            const forged = { ...manager, permissions: actor.permissions };
            await assert.rejects(captureSource(pool, forged, { sourceKey: "first-team", accountFingerprint: "a".repeat(64), maxAgeMs: 1000, collect: async () => bundle() }));
            await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='ainuoke.view'", [TEAM_ROLES[3].id]);
            assert.notEqual((await read(cookies[3])).status, 200);
            await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,'ainuoke.view')", [TEAM_ROLES[3].id]);
        });
        await t.test("order version drift aborts source publication", async () => {
            const previous = await latest();
            await assert.rejects(capture(bundle(), async () => { await pool.query("UPDATE sales_orders SET version=version+1 WHERE id=$1", [order.id]); return bundle(); }), /source_order_changed/);
            assert.equal(await latest(), previous);
            await capture();
        });
        await t.test("a changed InsideOrderNo uses current discovery without mutating the stable order", async () => {
            const b = bundle();
            for (const pages of [b.discoveryBefore, b.discoveryAfter])
                pages[0].rows[0].values.InsideOrderNo = "NEW-INSIDE";
            b.materials[syntheticOrder.salesContractNo][0].queryContext.insideOrderNo = "NEW-INSIDE";
            await capture(b);
            const body = await (await read(cookies[0])).json();
            assert.equal(body.progress.sourceStatus, "ready");
            assert.equal(body.progress.insideOrderDrift, true);
            assert.equal((await pool.query("SELECT inside_order_no FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1", [order.id])).rows[0].inside_order_no, syntheticOrder.insideOrderNo);
            await capture();
        });
        await t.test("complete missing-contract discovery removes visibility without deleting orders or old snapshots", async () => {
            const b = bundle();
            for (const pages of [b.discoveryBefore, b.discoveryAfter]) {
                pages[0].rows = [];
                pages[0].total = 0;
            }
            b.materials = {};
            await capture(b);
            assert.equal((await read(cookies[0])).status, 404);
            assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_orders")).rows[0].n, 1);
            assert.ok((await pool.query("SELECT count(*)::int AS n FROM ainuoke_source_runs")).rows[0].n > 1);
            await capture();
        });
        await t.test("SQL evidence is immutable and independently corrupted read bytes still fail closed", async () => {
            const id = await latest();
            for (const [table, column] of [["ainuoke_material_source_snapshots", "snapshots"], ["ainuoke_source_runs", "discovery"]]) {
                const key = table === "ainuoke_source_runs" ? "id" : "run_id";
                const original = (await pool.query("SELECT " + column + " AS value FROM " + table + " WHERE " + key + "=$1", [id])).rows[0].value;
                await assert.rejects(() => pool.query("UPDATE " + table + " SET " + column + "='[]'::jsonb WHERE " + key + "=$1", [id]), (error: unknown) => (error as { code?: string }).code === '23514');
                assert.equal((await read(cookies[0])).status, 200);
                // Corrupt only the returned driver bytes, without disabling SQL guards
                // or mutating persisted evidence. The reader hash check is independent.
                const damaged = new Proxy(pool, { get(target, property) {
                    if (property === 'connect') return async () => {
                        const client = await target.connect();
                        return new Proxy(client, { get(current, member) {
                            if (member === 'query') return async (...args: unknown[]) => {
                                const result = await (current.query as (...values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>)(...args);
                                if (typeof args[0] === 'string' && args[0].includes('SELECT r.discovery,r.discovery_hash')) {
                                    return { ...result, rows: result.rows.map(row => ({ ...row, [column]: [] })) };
                                }
                                return result;
                            };
                            const value = Reflect.get(current, member); return typeof value === 'function' ? value.bind(current) : value;
                        } });
                    };
                    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
                } });
                const damagedRead = createOrderMaterialReader(createPersistedMaterialPorts(damaged, { sourceKey: 'first-team', maxAgeMs: 1000 }, () => clock));
                assert.equal((await damagedRead(actor, { salesOrderId: order.id })).status, 503);
                assert.deepEqual((await pool.query("SELECT " + column + " AS value FROM " + table + " WHERE " + key + "=$1", [id])).rows[0].value, original);
            }
        });
        await t.test("audit failure rolls back run, snapshots and pointer together", async () => {
            const previous = await latest();
            const counts = (await pool.query("SELECT count(*)::int AS n FROM ainuoke_source_runs")).rows;
            await pool.query("CREATE FUNCTION synthetic_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$");
            await pool.query("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_audit_failure()");
            const b = bundle();
            b.materials[syntheticOrder.salesContractNo][0].rows[0].values.PurchasePrice = 13;
            try {
                await assert.rejects(capture(b));
            }
            finally {
                await pool.query("DROP TRIGGER synthetic_audit_failure ON operation_logs");
                await pool.query("DROP FUNCTION synthetic_audit_failure()");
            }
            assert.equal(await latest(), previous);
            assert.deepEqual((await pool.query("SELECT count(*)::int AS n FROM ainuoke_source_runs")).rows, counts);
            await capture();
        });
        await t.test("actual Python subprocess reads only fixed login/discovery/material endpoints on synthetic loopback", async subtest => {
            const fixture = bundle();
            let loginCount = 0;
            const reports: number[] = [];
            upstream.on("request", async (req, res) => {
                const u = new URL(req.url!, "http://127.0.0.1");
                res.setHeader("Content-Type", "application/json");
                if (u.pathname === "/kaijin/system/user/loginsys2") {
                    loginCount++;
                    res.end(JSON.stringify({ data: { isOk: true, jwtToken: "synthetic-upstream-token", sessionId: "synthetic-session" } }));
                    return;
                }
                assert.equal(u.pathname, "/kaijin/report/report/getReportObjAndData");
                assert.equal(req.method, "POST");
                assert.equal(req.headers.authorization, "synthetic-upstream-token");
                const chunks = [];
                for await (const chunk of req)
                    chunks.push(chunk);
                const request = JSON.parse(Buffer.concat(chunks).toString());
                reports.push(request.reportId);
                const rows = (request.reportId === 6086103 ? fixture.discoveryBefore[0].rows : fixture.materials[syntheticOrder.salesContractNo][0].rows).map(r => r.values);
                res.end(JSON.stringify({ reObj: { isOk: true }, dataCount: rows.length, pageIndex: 0, pageSize: 0, dataList: JSON.stringify({ rows }) }));
            });
            await new Promise<void>(done => upstream.listen(0, "127.0.0.1", done));
            const addr = upstream.address();
            assert.ok(addr && typeof addr === "object");
            const result = await collectWithPython({ sourceKey: "first-team", baseUrl: "http://127.0.0.1:" + addr.port, username: "合成采集账号", password: "synthetic-private-password", operatorUsername: "synthetic.admin" }, [syntheticOrder.salesContractNo], { timeoutMs: 20000 });
            await validateBundle(result, [{ ...syntheticOrder, id: order.id, version: order.version }], Date.now(), 60000);
            assert.equal(loginCount, 1);
            assert.deepEqual(reports, [6086103, 6087050, 6086103]);
            assert.ok(!JSON.stringify(result).includes("synthetic-private-password"));
            assert.ok(!JSON.stringify(result).includes("synthetic-upstream-token"));
            await subtest.test("Linux CLI check is read-only; wrong target fails; explicit source writes only snapshots", {skip:process.platform==="win32"}, async()=>{
                const dir=await mkdtemp(join(tmpdir(),"zhixu-source-cli-"));
                const path=join(dir,"private.json");
                const config={sourceKey:"cli-team",baseUrl:"http://127.0.0.1:"+addr.port,username:"synthetic-cli",password:"synthetic-private-password",operatorUsername:"synthetic.admin"};
                try {
                    await writeFile(path,JSON.stringify(config),{mode:0o600});
                    const run=(args:string[])=>promisify(execFile)(process.execPath,["--import","tsx","server/ainuoke-source/cli.ts",...args],{env:{...process.env,NODE_ENV:"test",DATABASE_URL:databaseUrl,ZHIXU_IDENTITY_MODE:"session",ZHIXU_ATTACHMENT_BACKEND:"disabled"},timeout:30000});
                    const prior=loginCount;
                    const checked=JSON.parse((await run(["--check","--config="+path])).stdout);
                    assert.equal(checked.result,"CHECKED_NO_SOURCE_READ");
                    assert.equal(loginCount,prior);
                    assert.equal((await pool.query("SELECT count(*)::int AS n FROM ainuoke_source_profiles WHERE source_key='cli-team'")).rows[0].n,0);
                    await assert.rejects(run(["--execute=cli-team","--expected-target="+"0".repeat(64),"--config="+path]),/source_target_mismatch/);
                    assert.equal(loginCount,prior);
                    const captured=JSON.parse((await run(["--execute=cli-team","--expected-target="+checked.targetFingerprint,"--config="+path])).stdout);
                    assert.equal(captured.result,"SOURCE_CAPTURED");assert.equal(captured.orders,1);
                    assert.equal(loginCount,prior+1);
                } finally {await rm(dir,{recursive:true,force:true});}
            });

        });
    }
    finally {
        for (const s of [server, upstream])
            if (s.listening)
                await new Promise<void>(done => s.close(() => done()));
        await pool.end();
        await db.stop();
    }
});
