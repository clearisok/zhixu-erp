import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { createApp } from "../app.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { createTrustedQuoteService } from "../quotes/service.js";
import { quoteSnapshotFromBrowser, type QuoteRecord } from "../quotes/model.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import type { QuoteResponseRecord } from "../quotes/quote-response.js";
import { projectQuoteResponse } from "../quotes/quote-response.js";

test("Estimate trusted commands: disposable PostgreSQL exact snapshots and atomic lifecycle", { timeout: 180000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("estimate_workflows") });
  await runMigrations(pool, resolve("database/migrations"));
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES('estimate-test','synthetic-unused','Trusted Estimate','viewer',true) RETURNING id::text,public_id::text")).rows[0];
  const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "estimate-test", userName: "Trusted Estimate", permissions: [...PERMISSION_KEYS] };
  let active: TrustedIdentity | null = actor;
  const server = createServer(createApp({ pool, allowedOrigins: ["http://127.0.0.1:39991"], identityAuthority: { mode: "session", verify: async () => {}, resolve: async () => active } }));
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const repo = createQuoteRepository(pool), value = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("estimate-api"));
  value.activeEstimateCost = null; value.estimateCostHistory = []; value.aggregateStatus = "draft";
  for (const revision of value.revisions) {
    revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null; revision.garmentMedia = []; revision.quoteDocuments = [];
    revision.baseInfo.quoteStyleNo = "SYNTHETIC"; revision.baseInfo.styleName = "Synthetic";
    for (const p of revision.priceVersions) { p.quantity = "0"; p.trims.forEach(row => { row.usage = "0"; }); }
  }
  value.revisions.at(-1)!.priceVersions[0].fabrics[0].unitPrice = "9007199254740993.123456789";
  let record = await repo.create(value);
  const post = async (body: object, id = value.id, method = "POST", suffix = "/estimate-workflows") => {
    const response = await fetch(`${origin}/api/v1/quotes/${id}${suffix}`, { method, headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1", Origin: "http://127.0.0.1:39991" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as { quote: QuoteRecord; error?: { code: string } } };
  };
  const generate = () => ({ action: "estimate.generate", expectedVersion: record.version, sourceRevisionId: value.defaultRevisionId });
  const commit = async (body: object) => { const result = await post({ ...body, expectedVersion: record.version }); assert.equal(result.status, 200); record = result.body.quote; assert.deepEqual(await repo.getById(value.id), record); };
  const countLogs = async (id = value.id) => (await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE quote_id=$1", [id])).rows[0].n;
  try {
    await t.test("current processing default cannot mutate hidden Estimate through any command or historical selector", async t => {
      for (const action of ["estimate.generate", "estimate.regenerate", "estimate.update", "estimate.restore", "estimate.ignore"] as const) {
        await t.test(action, async () => {
          const q = quoteSnapshotFromBrowser(createSyntheticQuoteFixture(`processing-api-${action}`, "processing"));
          q.revisions[0].baseInfo.quoteType = "distribution"; q.currentRevisionId = q.revisions[0].revisionId;
          if (action === "estimate.generate") q.activeEstimateCost = null;
          const before = await repo.create(q), logs = await countLogs(q.id);
          const command = action === "estimate.generate" || action === "estimate.regenerate" ? { action, sourceRevisionId: q.revisions[0].revisionId }
            : action === "estimate.update" ? { action, estimate: structuredClone(q.activeEstimateCost!) }
              : { action, estimateId: action === "estimate.restore" ? q.estimateCostHistory[0].id : q.activeEstimateCost!.id };
          const result = await post({ ...command, expectedVersion: before.version }, q.id);
          assert.equal(result.status, 409); assert.equal(result.body.error?.code, "estimate_not_applicable");
          assert.deepEqual(await repo.getById(q.id), before); assert.equal(await countLogs(q.id), logs);
          const read = await fetch(`${origin}/api/v1/quotes/${q.id}`); assert.equal(read.status, 200);
          const response: { quote: QuoteResponseRecord } = await read.json();
          assert.ok("estimateVisibility" in response.quote);
          assert.equal(response.quote.estimateVisibility, "restricted");
          assert.equal(Object.hasOwn(response.quote.quote, "activeEstimateCost"), false);
          assert.equal(Object.hasOwn(response.quote.quote, "estimateCostHistory"), false);
        });
      }
    });
    await t.test("processing ordinary save preserves hidden Estimate; aggregate injection cannot bypass command rejection", async () => {
      const q = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("processing-estimate-save", "processing"));
      const before = await repo.create(q), logs = await countLogs(q.id);
      const injected = { ...structuredClone(q), activeEstimateCost: null };
      const rejected = await post({ quote: injected, expectedVersion: before.version }, q.id, "PUT", "");
      assert.equal(rejected.status, 409); assert.equal(rejected.body.error?.code, "estimate_command_required");
      assert.deepEqual(await repo.getById(q.id), before); assert.equal(await countLogs(q.id), logs);
      const view = await fetch(`${origin}/api/v1/quotes/${q.id}`).then(response => response.json()) as { quote: QuoteResponseRecord };
      const content = structuredClone(view.quote.quote);
      content.revisions.find(revision => revision.revisionId === q.defaultRevisionId)!.baseInfo.note = "Authorized metadata only";
      const saved = await post({ quote: content, expectedVersion: before.version }, q.id, "PUT", "");
      assert.equal(saved.status, 200);
      const after = (await repo.getById(q.id))!;
      assert.deepEqual(after.quote.activeEstimateCost, before.quote.activeEstimateCost);
      assert.deepEqual(after.quote.estimateCostHistory, before.quote.estimateCostHistory);
      assert.deepEqual(after.quote.revisions.at(-1)!.priceVersions, before.quote.revisions.at(-1)!.priceVersions);
    });
    await t.test("distribution default keeps historical processing Estimate restore after source PV removal", async () => {
      const q = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("distribution-processing-history", "processing"));
      q.revisions.find(revision => revision.revisionId === q.defaultRevisionId)!.baseInfo.quoteType = "distribution";
      const historical = structuredClone(q.estimateCostHistory[0]);
      const source = q.revisions.find(revision => revision.revisionId === historical.basedOnRevisionId)!;
      source.priceVersions = source.priceVersions.filter(price => price.id !== historical.sourcePriceVersionId);
      const before = await repo.create(q);
      const result = await post({ action: "estimate.restore", expectedVersion: before.version, estimateId: historical.id }, q.id);
      assert.equal(result.status, 200);
      const after = (await repo.getById(q.id))!;
      assert.deepEqual(after.quote.revisions, before.quote.revisions);
      assert.deepEqual(after.quote.estimateCostHistory[0], historical);
      assert.equal(after.quote.activeEstimateCost!.sourcePriceVersionId, historical.sourcePriceVersionId);
      assert.notEqual(after.quote.activeEstimateCost!.id, historical.id);
    });
    await t.test("trusted A/B/C/D identities: Quote access independent of empty/active/history Estimate; protected writes and CAS", async () => {
      const identities: TrustedIdentity[] = [];
      const sets: TrustedIdentity["permissions"][] = [
        ["quote.view", "quote.export", "quote.revision.view", "quote.cost.view", "user_permissions.view"],
        ["quote.view", "quote.revision.view", "quote.cost.view", "quote.edit", "quote.create", "quote.cost.edit", "quote.settings.edit", "quote.revision.update", "quote.price_version.create", "quote.price_version.delete"],
        ["quote.view", "quote.revision.view", "quote.cost.view", "quote.edit", "estimate.view"],
        ["quote.view", "quote.edit", "estimate.view", "estimate.edit"],
      ];
      for (const [index, permissions] of sets.entries()) {
        const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES($1,'unused','Synthetic permission identity','viewer',true) RETURNING id::text,public_id::text", [`estimate-role-${index}`])).rows[0];
        identities.push({ ...actor, internalUserId: row.id, userId: row.public_id, username: `estimate-role-${index}`, userName: `Synthetic ${index}`, permissions });
      }
      const [A, B, C, D] = identities;
      const service = createTrustedQuoteService(pool);
      const restricted = (record: QuoteResponseRecord) => {
        assert.ok("estimateVisibility" in record && record.estimateVisibility === "restricted");
        assert.equal(Object.hasOwn(record.quote, "activeEstimateCost"), false);
        assert.equal(Object.hasOwn(record.quote, "estimateCostHistory"), false);
        assert.equal(JSON.stringify(record).includes("PRIVATE-ESTIMATE-PROBE"), false);
      };
      active = B;
      const created = await fetch(`${origin}/api/v1/quotes`, { method: "POST", headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1", Origin: "http://127.0.0.1:39991" }, body: "{}" });
      assert.equal(created.status, 201); restricted((await created.json()).quote);
      for (const state of ["empty", "active", "history", "both"] as const) {
        const q = quoteSnapshotFromBrowser(createSyntheticQuoteFixture(`permission-${state}`));
        q.activeEstimateCost = null; q.estimateCostHistory = [];
        for (const revision of q.revisions) {
          revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null;
          revision.baseInfo.quoteStyleNo = "SYNTHETIC-PERMISSION"; revision.baseInfo.styleName = "Synthetic permission test";
          for (const pv of revision.priceVersions) { pv.quantity = "0"; pv.trims.forEach(row => { row.usage = "0"; }); }
        }
        let saved = await repo.create(q);
        active = A;
        assert.equal((await fetch(`${origin}/api/v1/quotes/${q.id}`)).status, 200, "before Estimate generation");
        if (state !== "empty") {
          await service.estimateWorkflow(D, q.id, { action: "estimate.generate", expectedVersion: saved.version, sourceRevisionId: q.defaultRevisionId });
          saved = (await repo.getById(q.id))!;
          const estimate = structuredClone(saved.quote.activeEstimateCost!); estimate.labor.description = "PRIVATE-ESTIMATE-PROBE";
          await service.estimateWorkflow(D, q.id, { action: "estimate.update", expectedVersion: saved.version, estimate });
          saved = (await repo.getById(q.id))!;
          if (state === "both") { await service.estimateWorkflow(D, q.id, { action: "estimate.regenerate", expectedVersion: saved.version, sourceRevisionId: q.defaultRevisionId }); saved = (await repo.getById(q.id))!; }
          if (state === "history") { const historyOnly = structuredClone(saved.quote); historyOnly.estimateCostHistory = [historyOnly.activeEstimateCost!]; historyOnly.activeEstimateCost = null; saved = await repo.save(historyOnly, saved.version); }
        }
        const protectedSlice = () => [saved.quote.activeEstimateCost, saved.quote.estimateCostHistory];
        const preserved = structuredClone(protectedSlice());
        active = A;
        const view = await fetch(`${origin}/api/v1/quotes/${q.id}`); assert.equal(view.status, 200);
        const restrictedRecord: QuoteResponseRecord = (await view.json()).quote; restricted(restrictedRecord);
        assert.equal((await post({ quote: restrictedRecord.quote, expectedVersion: saved.version }, q.id, "PUT", "")).status, 403);
        active = B;
        const content = structuredClone(restrictedRecord.quote);
        content.revisions.find(r => r.revisionId === q.defaultRevisionId)!.baseInfo.note = "Authorized ordinary Quote edit";
        const result = await post({ quote: content, expectedVersion: saved.version }, q.id, "PUT", ""); assert.equal(result.status, 200); restricted(result.body.quote);
        saved = (await repo.getById(q.id))!; assert.deepEqual(protectedSlice(), preserved);
        const logs = await countLogs(q.id); const beforeInjection = structuredClone(saved);
        for (const injected of [{ activeEstimateCost: null }, { estimateCostHistory: [] }, { activeEstimateCost: preserved[0], estimateCostHistory: preserved[1] }]) {
          assert.equal((await post({ quote: { ...content, ...injected }, expectedVersion: saved.version }, q.id, "PUT", "")).status, 409);
        }
        assert.equal((await post({ quote: { ...content, estimateVisibility: "visible" }, expectedVersion: saved.version }, q.id, "PUT", "")).status, 400);
        assert.deepEqual(await repo.getById(q.id), beforeInjection); assert.equal(await countLogs(q.id), logs);
        const revision = saved.quote.revisions.find(r => r.revisionId === q.defaultRevisionId)!;
        for (const command of [
          { action: "price.create", revisionId: revision.revisionId, priceVersionId: revision.priceVersions[0].id, name: "Permission scenario", quantity: "0", description: "" },
          { action: "revision.create", sourceRevisionId: revision.revisionId, reason: "其他", note: "Permission branch" },
        ]) {
          const response = await post({ ...command, expectedVersion: saved.version }, q.id, "POST", "/version-workflows");
          assert.equal(response.status, 200); restricted(response.body.quote); saved = (await repo.getById(q.id))!; assert.deepEqual(protectedSlice(), preserved);
        }
        active = C;
        const readable = await fetch(`${origin}/api/v1/quotes/${q.id}`); assert.equal(readable.status, 200); assert.deepEqual((await readable.json()).quote, projectQuoteResponse(C,saved));
        assert.equal((await post({ action: "estimate.generate", expectedVersion: saved.version, sourceRevisionId: saved.quote.defaultRevisionId }, q.id)).status, 403);
        const altered = structuredClone(saved.quote); altered.estimateCostHistory = [];
        if (altered.activeEstimateCost) altered.activeEstimateCost.labor.description = "forged"; else altered.activeEstimateCost = preserved[0] as typeof altered.activeEstimateCost;
        if (state !== "empty") assert.equal((await post({ quote: altered, expectedVersion: saved.version }, q.id, "PUT", "")).status, 409);
        active = B; const staleVersion = saved.version;
        await service.estimateWorkflow(D, q.id, { action: saved.quote.activeEstimateCost ? "estimate.regenerate" : "estimate.generate", expectedVersion: saved.version, sourceRevisionId: saved.quote.defaultRevisionId });
        const concurrent = (await repo.getById(q.id))!;
        assert.equal((await post({ quote: content, expectedVersion: staleVersion }, q.id, "PUT", "")).status, 409);
        assert.deepEqual(await repo.getById(q.id), concurrent);
      }
      active = actor;
    });
    await t.test("no automatic Estimate, 401/403 and exact source ownership", async () => {
      assert.equal((await repo.getById(value.id))!.quote.activeEstimateCost, null);
      active = null; assert.equal((await post(generate())).status, 401);
      for (const missing of ["quote.edit", "estimate.view", "estimate.edit"] as const) { active = { ...actor, permissions: actor.permissions.filter(p => p !== missing) }; assert.equal((await post(generate())).status, 403); }
      active = actor;
      for (const extra of [{ actor: "spoof" }, { generatedAt: "fake" }, { estimateCostHistory: [] }]) assert.equal((await post({ ...generate(), ...extra })).status, 400);
      assert.equal((await post({ ...generate(), sourceRevisionId: "foreign" })).status, 404);
      assert.equal((await post({ ...generate(), sourcePriceVersionId: "foreign" })).status, 404);
    });
    await t.test("first generation preserves decimals/null/zero and trusted actor; draft/source unchanged", async () => {
      await commit(generate());
      const e = record.quote.activeEstimateCost!;
      assert.equal(e.generatedBy, actor.userName); assert.equal(e.fabrics[0].unitPrice, "9007199254740993.123456789"); assert.equal(e.labor.value, "0"); assert.equal(e.fabrics[0].segmentLengthCm, null);
      assert.equal(record.quote.aggregateStatus, "draft"); assert.deepEqual(record.quote.revisions, value.revisions);
      assert.equal((await post(generate())).status, 409);
      const logs = (await pool.query("SELECT actor_user_id::text,metadata FROM operation_logs WHERE quote_id=$1", [value.id])).rows;
      assert.equal(logs.length, 1); assert.equal(logs[0].actor_user_id, actor.internalUserId); assert.equal(logs[0].metadata.workflowAction, "estimate.generate");
      active = { ...actor, permissions: ["quote.view", "quote.revision.view", "quote.cost.view"] };
      const viewerResponse = await fetch(`${origin}/api/v1/quotes/${value.id}`);
      assert.equal(viewerResponse.status, 200, "Generating internal Estimate must not revoke Quote access");
      const viewerRecord = (await viewerResponse.json()).quote;
      assert.equal(viewerRecord.estimateVisibility, "restricted");
      assert.equal(Object.hasOwn(viewerRecord.quote, "activeEstimateCost"), false);
      assert.equal(Object.hasOwn(viewerRecord.quote, "estimateCostHistory"), false);
      active = actor;
    });
    await t.test("controlled edits; generic PUT and structure/provenance tamper reject", async () => {
      const e = structuredClone(record.quote.activeEstimateCost!); e.labor.value = null; e.fabrics[0].unitPrice = "0";
      for (const change of [(x: typeof e) => { x.generatedBy = "spoof"; }, (x: typeof e) => { x.fabrics.reverse(); }, (x: typeof e) => { x.fabrics.push(structuredClone(x.fabrics[0])); }, (x: typeof e) => { x.sourcePriceVersionId = "foreign"; }]) { const invalid = structuredClone(e); change(invalid); assert.equal((await post({ action: "estimate.update", expectedVersion: record.version, estimate: invalid })).status, 400); }
      const generic = structuredClone(record.quote); generic.activeEstimateCost = e;
      assert.equal((await post({ quote: generic, expectedVersion: record.version }, value.id, "PUT", "")).status, 409);
      await commit({ action: "estimate.update", estimate: e }); assert.equal(record.quote.activeEstimateCost!.labor.value, null);
    });
    await t.test("regenerate archives exact content; restore works after source PV deletion", async () => {
      const old = structuredClone(record.quote.activeEstimateCost!);
      await commit({ action: "estimate.regenerate", sourceRevisionId: value.defaultRevisionId, sourcePriceVersionId: record.quote.revisions.at(-1)!.priceVersions[1].id });
      assert.deepEqual(record.quote.estimateCostHistory, [old]);
      const source = record.quote.revisions.at(-1)!;
      const result = await post({ action: "price.delete", expectedVersion: record.version, revisionId: source.revisionId, priceVersionId: old.sourcePriceVersionId }, value.id, "POST", "/version-workflows");
      assert.equal(result.status, 200); record = result.body.quote;
      await commit({ action: "estimate.restore", estimateId: old.id });
      assert.notEqual(record.quote.activeEstimateCost!.id, old.id); assert.equal(record.quote.activeEstimateCost!.sourcePriceVersionId, old.sourcePriceVersionId);
      assert.deepEqual(record.quote.estimateCostHistory[0], old); assert.notEqual(record.quote.activeEstimateCost!.fabrics[0].id, old.fabrics[0].id);
      assert.equal((await post({ action: "estimate.restore", estimateId: "foreign", expectedVersion: record.version })).status, 404);
    });
    await t.test("concurrent regenerate single winner and no duplicate archive", async () => {
      const body = { action: "estimate.regenerate", sourceRevisionId: value.defaultRevisionId, expectedVersion: record.version };
      const result = await Promise.all([post(body), post(body)]); assert.deepEqual(result.map(r => r.status).sort(), [200, 409]);
      record = result.find(r => r.status === 200)!.body.quote;
      assert.equal(record.quote.estimateCostHistory.length, 3);
    });
    await t.test("ignore is scoped to default; audit and child failure roll back all rows/version/logs", async () => {
      await commit({ action: "estimate.ignore", estimateId: record.quote.activeEstimateCost!.id });
      assert.equal(record.quote.activeEstimateCost!.ignoredForRevisionId, value.defaultRevisionId);
      const revision = await post({ action: "revision.create", sourceRevisionId: record.quote.defaultRevisionId, reason: "其他", note: "Synthetic", expectedVersion: record.version }, value.id, "POST", "/version-workflows");
      assert.equal(revision.status, 200); record = revision.body.quote;
      assert.notEqual(record.quote.defaultRevisionId, record.quote.activeEstimateCost!.ignoredForRevisionId);
      assert.notEqual(record.quote.defaultRevisionId, record.quote.activeEstimateCost!.basedOnRevisionId);
      const before = structuredClone(record), logs = await countLogs();
      for (const table of ["quote_center_other_cost_lines", "operation_logs"]) {
        await pool.query(`CREATE FUNCTION synthetic_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$; CREATE TRIGGER synthetic_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION synthetic_fail()`);
        const result = await post({ action: "estimate.regenerate", sourceRevisionId: record.quote.defaultRevisionId, expectedVersion: record.version });
        assert.equal(result.status, 500); assert.deepEqual(await repo.getById(value.id), before); assert.equal(await countLogs(), logs);
        await pool.query(`DROP TRIGGER synthetic_failure ON ${table}; DROP FUNCTION synthetic_fail()`);
      }
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_orders")).rows[0].n, 0);
      // Internal repository remains lossless and is not constrained by runtime commands.
      assert.equal((await createTrustedQuoteService(pool).getById(value.id))!.version, record.version);
    });
  } finally { await new Promise<void>((done, reject) => server.close(e => e ? reject(e) : done())); await pool.end(); await postgres.stop(); }
});
