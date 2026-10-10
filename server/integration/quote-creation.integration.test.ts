import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { createApp } from "../app.js";
import { runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { permissionsForUser, synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { createQuoteCreationService } from "../quotes/creation-workflows.js";
import { createTrustedQuoteService } from "../quotes/service.js";
import type { CreationInput, CreationCommand } from "../quotes/creation-contract.js";
import { createQuoteMasterService } from "../quote-masters/service.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
const executeFile = promisify(execFile);

test("Two-step creation: real trusted API, durable receipts and populated 0009 upgrade, disposable only", { timeout: 240_000 }, async t => {
  const postgres = await startDisposablePostgres(); const directory = await mkdtemp(join(tmpdir(), "zhixu-creation-upgrade-"));
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("creation"), max: 10 });
  const origins: string[] = []; const errors: unknown[] = [];
  const server = createServer(createApp({ pool, allowedOrigins: origins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, logger: { error: event => errors.push(event) } }));
  t.after(async () => { if (server.listening) await new Promise<void>(done => server.close(() => done())); await pool.end(); await postgres.stop(); await rm(directory, { recursive: true, force: true }); });
  for (const name of (await readdir(resolve("database/migrations"))).filter(name => /^000[1-9]_.*\.sql$/u.test(name))) await copyFile(resolve("database/migrations", name), join(directory, name));
  await runMigrations(pool, directory); await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool, { username: "synthetic-creation-admin", displayName: "Synthetic creator", password: "disposable-only-password" });
  const user = (await pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic-creation-admin'")).rows[0];
  const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "synthetic-creation-admin", userName: "Synthetic creator", permissions: await permissionsForUser(pool, user.id) };
  const old = await createTrustedQuoteService(pool).createRuntimeDraft(actor);
  await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(createSyntheticQuoteFixture("synthetic-populated-upgrade")));
  const masters = createQuoteMasterService(pool);
  const defaults = { defaultUsdCnyRate: "7.1234567890123456789", defaultOtherCost: null, defaultTrims: [] };
  const brand = await masters.createBrand(actor, { name: "Synthetic Brand", status: "active", defaults });
  const secondBrand = await masters.createBrand(actor, { name: "Other Brand", status: "active", defaults });
  const person = await masters.createSalesperson(actor, { name: "Synthetic Person", brandId: brand.id, status: "active", defaults });
  const preset = await masters.createPreset(actor, { name: "Synthetic preset", country: "Cambodia", laborCurrency: "USD", markupRate: "0", includeFreight: true, freightName: "Synthetic freight", freightAmount: "0", status: "active" });
  await masters.createPreset(actor, { name: "Second same-country preset", country: "Cambodia", laborCurrency: "CNY", markupRate: "0.15", includeFreight: false, freightName: "", freightAmount: null, status: "active" });
  const snapshot = async (database = pool) => (await database.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT IN ('schema_migrations','quote_creation_previews','quote_creation_receipts') ORDER BY table_name")).rows.reduce(async (previous, { table_name }) => ({ ...await previous, [table_name]: (await database.query(`SELECT to_jsonb(t) AS row FROM "${table_name}" t ORDER BY to_jsonb(t)::text`)).rows }), Promise.resolve({} as Record<string, unknown>));
  const throughTen = await mkdtemp(join(tmpdir(), "zhixu-through-ten-"));
  t.after(() => rm(throughTen, {recursive:true,force:true}));
  for (const name of (await readdir(resolve("database/migrations"))).filter(name => /^00(?:0[1-9]|10)_/u.test(name))) await copyFile(resolve("database/migrations",name),join(throughTen,name));
  await t.test("0010 forward-only upgrade preserves every populated old table and all nine published migration bytes", async () => {
    const before = await snapshot();
    const dump = `/tmp/synthetic-creation-${randomUUID()}.dump`;
    const docker = async (arguments_: string[]) => (await executeFile("docker", ["exec", postgres.containerName, ...arguments_], { windowsHide: true, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 })).stdout;
    const databaseName = new URL(pool.options.connectionString!).pathname.slice(1);
    await docker(["pg_dump", "-U", "postgres", "-d", databaseName, "--format=custom", "--file", dump]);
    const checksum = (await docker(["sha256sum", dump])).split(" ")[0];
    assert.match(checksum, /^[a-f0-9]{64}$/u);
    const restoreUrl = await postgres.createDatabase("creation_restore");
    const restored = new pg.Pool({ connectionString: restoreUrl, max: 1 });
    try {
      assert.ok((await docker(["pg_restore", "--list", dump])).includes("quote_center_quotes"));
      await docker(["pg_restore", "-U", "postgres", "--exit-on-error", "--dbname", new URL(restoreUrl).pathname.slice(1), dump]);
      assert.equal((await docker(["sha256sum", dump])).split(" ")[0], checksum);
      assert.deepEqual(await snapshot(restored), before, "recoverable pre-upgrade dump preserves all old business/technical rows");
      assert.deepEqual((await runMigrations(restored, throughTen)).applied, ["0010_quote_creation_receipts.sql"]);
      assert.deepEqual(await snapshot(restored), before, "restore then forward migration preserves existing data");
      assert.deepEqual((await verifyMigrationsCurrent(restored, throughTen)).pending, []);
      t.diagnostic(`Synthetic pre-upgrade PostgreSQL custom dump SHA-256 ${checksum}; isolated restore/readback/0010 upgrade PASS`);
    } finally { await restored.end(); }
    assert.deepEqual((await runMigrations(pool, throughTen)).applied, ["0010_quote_creation_receipts.sql"]);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await runMigrations(pool, throughTen)).applied.length, 0);
    for (const name of await readdir(directory)) assert.deepEqual(await readFile(join(directory, name)), await readFile(resolve("database/migrations", name)));
    assert.deepEqual((await verifyMigrationsCurrent(pool, throughTen)).pending, []);
    assert.equal((await createTrustedQuoteService(pool).getById(old.quote.id))?.version, 1);
  });
  await t.test("0011 upgrades nonempty 0001–0010 without changing business data or historical checksums", async () => {
    await pool.query("INSERT INTO quote_global_settings(singleton_id,default_labor_currency,default_labor_description) VALUES(1,'CNY','Synthetic old description')");
    const before = await snapshot();
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, ["0011_quote_creation_defaults.sql"]);
    const after=await snapshot() as Record<string,Array<{row:Record<string,unknown>}>>;
    assert.equal(after.quote_global_settings[0].row.default_quote_type,null);
    assert.equal(after.quote_global_settings[0].row.default_manufacturing_country,null);
    delete after.quote_global_settings[0].row.default_quote_type;delete after.quote_global_settings[0].row.default_manufacturing_country;
    assert.deepEqual(after, before);
    assert.deepEqual((await verifyMigrationsCurrent(pool, resolve("database/migrations"))).pending, []);
    for (const name of await readdir(throughTen)) assert.deepEqual(await readFile(join(throughTen,name)),await readFile(resolve("database/migrations",name)));
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address === "object" && ![3000, 3001, 3002, 18443, 18444].includes(address.port));
  const origin = `http://127.0.0.1:${address.port}`; origins.push(origin);
  const login = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: { Origin: origin, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: actor.username, password: "disposable-only-password" }) });
  assert.equal(login.status, 200); const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const call = async (path: string, body?: unknown, credentials = cookie) => { const response = await fetch(`${origin}/api/v1/quotes/${path}`, { headers: { Cookie: credentials, Origin: origin, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) }); return { status: response.status, body: await response.json() }; };
  const creation = createQuoteCreationService(pool);
  await t.test("Direct defaults creation is atomic, receipt-bound and preserves empty drafts", async () => {
    const countQuotes = async () => Number((await pool.query("SELECT count(*) FROM quote_center_quotes")).rows[0].count);
    const before = await countQuotes();
    const requestId = randomUUID();
    const result = await call("creation-defaults", { clientRequestId: requestId });
    assert.equal(result.status,201);
    assert.equal(result.body.state,"committed");
    const quote = (await createTrustedQuoteService(pool).getById(result.body.result.quoteId))!.quote;
    assert.equal(quote.revisions[0].baseInfo.quoteType,"distribution");
    assert.equal(quote.revisions[0].priceVersions[0].pricingParameters.manufacturingCountry,"");
    assert.equal(quote.revisions[0].priceVersions[0].pricingParameters.configuration?.status,"incomplete");
    assert.equal((await call("creation-defaults",{clientRequestId:requestId})).body.result.quoteId,quote.id);
    assert.equal(await countQuotes(),before+1);
    const settings = await masters.updateGlobalSettings(actor,1,{defaultQuoteType:"processing",defaultManufacturingCountry:"Cambodia",defaultManufacturingPresetId:preset.id,defaultUsdCnyRate:"7.1234567890123456789",defaultMarkupRate:null,defaultLaborCurrency:"CNY",defaultLaborDescription:"Synthetic default description",defaultOtherCost:{name:"Synthetic default",amount:"0"}});
    const configured = await call("creation-defaults",{clientRequestId:randomUUID()});
    assert.equal(configured.status,201);
    const next = (await createTrustedQuoteService(pool).getById(configured.body.result.quoteId))!.quote;
    assert.equal(next.revisions[0].baseInfo.quoteType,"processing");
    assert.equal(next.revisions[0].priceVersions[0].pricingParameters.manufacturingPresetId,preset.id);
    assert.equal(next.revisions[0].priceVersions[0].pricingParameters.usdCnyRate,"7.1234567890123456789");
    assert.equal(next.revisions[0].priceVersions[0].labor.description,"Synthetic default description");
    assert.equal(next.revisions[0].priceVersions[0].otherCosts[0].unitPrice,"0");
    const injected=structuredClone(next);injected.revisions[0].baseInfo.quoteType="distribution";
    await assert.rejects(async()=>createTrustedQuoteService(pool).saveAggregate(actor,injected,1),{code:"quote_type_workflow_required"});
    await assert.rejects(masters.updateGlobalSettings(actor,settings.version,{...settings,defaultManufacturingCountry:"China"}), /country/u);
    await masters.updateGlobalSettings(actor,settings.version,{...settings,defaultManufacturingCountry:"China",defaultManufacturingPresetId:null});
    const incomplete = await call("creation-defaults",{clientRequestId:randomUUID()});
    assert.equal(incomplete.status,201);
    assert.equal((await createTrustedQuoteService(pool).getById(incomplete.body.result.quoteId))!.quote.revisions[0].priceVersions[0].pricingParameters.configuration?.status,"incomplete");
    assert.deepEqual((await createTrustedQuoteService(pool).getById(next.id))!.quote,next,"settings changes never rewrite existing snapshot");
    await assert.rejects(async()=>masters.updateGlobalSettings({...actor,permissions:["quote.create"]},settings.version+1,{...settings}), /permission/iu);
    const current=await masters.getGlobalSettings();
    const allPresets=await masters.listPresets();
    const bundle={expectedVersion:current!.version,settings:{defaultQuoteType:current!.defaultQuoteType,defaultManufacturingCountry:current!.defaultManufacturingCountry,defaultManufacturingPresetId:null,defaultUsdCnyRate:current!.defaultUsdCnyRate,defaultMarkupRate:current!.defaultMarkupRate,defaultLaborCurrency:current!.defaultLaborCurrency,defaultLaborDescription:current!.defaultLaborDescription,defaultOtherCost:current!.defaultOtherCost},manufacturingPresets:allPresets.map(({id,version,name,country,laborCurrency,markupRate,includeFreight,freightName,freightAmount,status})=>({id,expectedVersion:version,name,country,laborCurrency,markupRate,includeFreight,freightName,freightAmount,status}))};
    const saveBundle=()=>fetch(`${origin}/api/v1/quote-settings/bundle`,{method:"PATCH",headers:{Cookie:cookie,Origin:origin,"X-Zhixu-Request":"1","Content-Type":"application/json"},body:JSON.stringify(bundle)});
    assert.equal((await saveBundle()).status,200,"actual bundle API must parse existing preset identities independently of field DTO");
    assert.equal((await saveBundle()).status,409,"bundle CAS preserved");
  });
  const input: CreationInput = { source: null, quoteType: "processing", selection: { country: "Cambodia", presetId: preset.id }, fields: { brandId: brand.id, salespersonId: person.id, styleNo: "SYNTHETIC-TWO-STEP", styleName: "Synthetic normal creation", quantity: "0", garmentLeadDate: "2028-02-29", note: "Synthetic note" }, parameterOverrides: {} };
  const count = async () => Number((await pool.query("SELECT count(*) FROM quote_center_quotes")).rows[0].count);
  await t.test("Generic PUT cannot evade type protection by appending a client-built Revision",async()=>{
    const result=await call("creation-defaults",{clientRequestId:randomUUID()});
    const service=createTrustedQuoteService(pool);
    let saved=(await service.getById(result.body.result.quoteId))!;
    for(const confirmed of [false,true]){
      if(confirmed){
        // Internal repository fixture only; no public confirmation bypass.
        const fixture=structuredClone(saved.quote),pv=fixture.revisions[0].priceVersions[0];
        pv.confirmation={quotedGarmentPrice:"0",quotedLaborPrice:"0",confirmedLaborPrice:"0",confirmedGarmentPrice:fixture.revisions[0].baseInfo.quoteType==="processing"?null:"0",note:"Synthetic confirmed preservation probe",confirmedAt:new Date().toISOString()};
        fixture.revisions[0].confirmationSummary={confirmedCount:1,totalCount:1};fixture.aggregateStatus="confirmed";
        saved=await createQuoteRepository(pool).save(fixture,saved.version);
      }
      const injected=structuredClone(saved.quote),previous=injected.revisions[0],revision=structuredClone(previous);
      previous.readOnly=true;
      revision.revisionId=randomUUID();revision.revisionLabel="V2";revision.mainlineVersion=2;revision.parentRevisionId=previous.revisionId;
      revision.priceVersions[0].id=randomUUID();revision.priceVersions[0].confirmation=null;revision.confirmationSummary={confirmedCount:0,totalCount:1};
      revision.baseInfo.quoteType=previous.baseInfo.quoteType==="processing"?"distribution":"processing";
      injected.revisions.push(revision);injected.defaultRevisionId=revision.revisionId;injected.currentRevisionId=revision.revisionId;injected.aggregateStatus="quoting";
      const logs=Number((await pool.query("SELECT count(*) FROM operation_logs WHERE quote_id=$1",[injected.id])).rows[0].count);
      await assert.rejects(service.saveAggregate(actor,injected,saved.version),{code:"quote_type_workflow_required"});
      const response=await fetch(`${origin}/api/v1/quotes/${injected.id}`,{method:"PUT",headers:{Cookie:cookie,Origin:origin,"X-Zhixu-Request":"1","Content-Type":"application/json"},body:JSON.stringify({quote:injected,expectedVersion:saved.version})});
      assert.equal(response.status,409);assert.equal((await response.json()).error.code,"quote_type_workflow_required");
      assert.deepEqual(await service.getById(injected.id),saved);
      assert.equal(Number((await pool.query("SELECT count(*) FROM operation_logs WHERE quote_id=$1",[injected.id])).rows[0].count),logs);
    }
  });
  const seq = async () => (await pool.query("SELECT last_value::text,is_called FROM quote_center_quote_number_seq")).rows[0];
  const command = async (value = input): Promise<CreationCommand> => ({ ...value, previewId: (await creation.preview(actor, value)).previewId, clientRequestId: randomUUID(), imageSelection: null });
  await t.test("Default command concurrency, rollback, stale defaults and revoked Session permissions fail closed",async()=>{
    const token=randomUUID(),before=await count();
    const [first,second]=await Promise.all([call("creation-defaults",{clientRequestId:token}),call("creation-defaults",{clientRequestId:token})]);
    assert.deepEqual([first.status,second.status].sort(),[200,201]);assert.deepEqual(first.body.result,second.body.result);assert.equal(await count(),before+1);
    assert.equal((await call("creation-workflows",{...await command(),clientRequestId:token})).body.error.code,"idempotency_payload_mismatch");
    const failedToken=randomUUID(),rollbackCount=await count();
    await pool.query("CREATE FUNCTION synthetic_default_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER synthetic_default_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_default_audit_failure()");
    try{assert.equal((await call("creation-defaults",{clientRequestId:failedToken})).status,500);assert.equal(await count(),rollbackCount);assert.equal((await call(`creation-receipts/${failedToken}`)).body.state,"pending");}finally{await pool.query("DROP TRIGGER synthetic_default_audit_failure ON operation_logs; DROP FUNCTION synthetic_default_audit_failure()");}
    const settings=await masters.getGlobalSettings();await masters.updateGlobalSettings(actor,settings!.version,{...settings!});
    assert.equal((await call("creation-defaults",{clientRequestId:failedToken})).body.error.code,"stale_parameters");assert.equal(await count(),rollbackCount);
    assert.equal((await call(`creation-receipts/${failedToken}`)).body.state,"rejected");
    await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='quote.create'");
    try{await assert.rejects(creation.executeDefaults({...actor,username:"local-single-user"},randomUUID()),{code:"permission_denied"});assert.equal(await count(),rollbackCount);}finally{await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-server-admin','quote.create')");}
  });
  await t.test("Options are bounded minimal projections; preview consumes no number/Quote/audit", async () => {
    const before = [await count(), await seq(), (await pool.query("SELECT count(*) FROM operation_logs")).rows[0].count];
    const options = await call("creation-options"); assert.equal(options.status, 200); assert.equal(options.body.presets.length, 2);
    assert.ok(!JSON.stringify(options.body).includes("markupRate"));
    const preview = await call("creation-preview", input); assert.equal(preview.status, 200); assert.equal(preview.body.pricingParameters.markupRate, "0");
    assert.deepEqual([await count(), await seq(), (await pool.query("SELECT count(*) FROM operation_logs")).rows[0].count], before);
  });
  for (const type of ["processing", "distribution"] as const) await t.test(`${type} atomic creation snapshots type/date/identity/exact decimal, one create audit`, async () => {
    const cmd = await command({ ...input, quoteType: type }); const before = await count();
    const response = await call("creation-workflows", cmd); assert.equal(response.status, 201);
    const result = response.body.result; const saved = await createTrustedQuoteService(pool).getById(result.quoteId); assert.ok(saved);
    const revision = saved.quote.revisions[0], pv = revision.priceVersions[0];
    assert.equal(saved.version, 1); assert.equal(revision.baseInfo.quoteType, type); assert.equal(revision.baseInfo.brandName, brand.name); assert.equal(revision.baseInfo.salespersonName, person.name); assert.equal(revision.baseInfo.garmentLeadDate, "2028-02-29"); assert.equal(pv.quantity, "0"); assert.equal(pv.pricingParameters.usdCnyRate, defaults.defaultUsdCnyRate); assert.equal(pv.pricingParameters.markupRate, "0"); assert.equal(pv.pricingParameters.freightAmount, "0"); assert.equal(pv.pricingParameters.configuration?.status, "configured");
    assert.match(saved.quote.quoteCode, /^QT-\d{4}-\d{4}-\d+$/u); assert.equal(await count(), before + 1);
    assert.equal((await pool.query("SELECT count(*) FROM operation_logs WHERE quote_id=$1 AND action='创建报价'", [result.quoteId])).rows[0].count, "1");
    assert.deepEqual((await call(`creation-receipts/${cmd.clientRequestId}`)).body.result, result);
  });
  await t.test("No preset creates incomplete neutral draft without guessing country/rate/markup/freight; null differs from zero", async () => {
    const cmd = await command({ ...input, selection: { country: null, presetId: null }, fields: { ...input.fields, quantity: null } });
    const response = await creation.execute(actor, cmd); const saved = await createTrustedQuoteService(pool).getById(response.receipt.result!.quoteId); const pv = saved!.quote.revisions[0].priceVersions[0];
    assert.equal(pv.quantity, null); assert.equal(pv.pricingParameters.manufacturingCountry, ""); assert.equal(pv.pricingParameters.usdCnyRate, null); assert.equal(pv.pricingParameters.markupRate, null); assert.equal(pv.pricingParameters.freightAmount, null); assert.equal(pv.pricingParameters.laborCurrency, "CNY"); assert.equal(pv.pricingParameters.configuration?.status, "incomplete");
  });
  await t.test("Concurrent double click is one Quote/audit; receipt survives new service; mismatched token cannot create", async () => {
    const cmd = await command(); const before = await count(); const [a, b] = await Promise.all([call("creation-workflows", cmd), call("creation-workflows", cmd)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]); assert.deepEqual(a.body.result, b.body.result); assert.equal(await count(), before + 1);
    assert.deepEqual((await createQuoteCreationService(pool).receipt(actor, cmd.clientRequestId)).result, a.body.result);
    const changed = { ...input, fields: { ...input.fields, styleNo: "Different request" } }; const other = await command(changed); other.clientRequestId = cmd.clientRequestId;
    assert.equal((await call("creation-workflows", other)).body.error.code, "idempotency_payload_mismatch"); assert.equal(await count(), before + 1);
  });
  await t.test("Later preset edits do not rewrite a created PriceVersion parameter snapshot", async () => {
    const created = await creation.execute(actor, await command());
    const id = created.receipt.result!.quoteId;
    const before = await createTrustedQuoteService(pool).getById(id);
    await pool.query("UPDATE quote_manufacturing_presets SET markup_rate='0.3',freight_amount='19.1234567890123456789',version=version+1 WHERE id=$1", [preset.id]);
    try { assert.deepEqual(await createTrustedQuoteService(pool).getById(id), before); }
    finally { await pool.query("UPDATE quote_manufacturing_presets SET markup_rate=$2,freight_amount=$3,version=version+1 WHERE id=$1", [preset.id, preset.markupRate, preset.freightAmount]); }
  });
  for (const [label, value] of [["cross-brand person", { ...input, fields: { ...input.fields, brandId: secondBrand.id } }], ["missing brand", { ...input, fields: { ...input.fields, brandId: null } }], ["wrong country", { ...input, selection: { ...input.selection, country: "Other country" } }], ["null country", { ...input, selection: { ...input.selection, country: null } }]] as const) await t.test(`Preview rejects ${label} without number/Quote`, async () => { const before = [await count(), await seq()]; assert.equal((await call("creation-preview", value)).status, 400); assert.deepEqual([await count(), await seq()], before); });
  for (const table of ["quote_master_brands", "quote_master_customer_salespeople", "quote_manufacturing_presets"] as const) await t.test(`Final transaction rejects reviewed version/state drift in ${table}`, async () => {
    const cmd = await command(); const id = table === "quote_master_brands" ? brand.id : table === "quote_master_customer_salespeople" ? person.id : preset.id; const before = [await count(), await seq()];
    await pool.query(`UPDATE ${table} SET version=version+1,status='inactive' WHERE id=$1`, [id]);
    const response = await call("creation-workflows", cmd); assert.equal(response.status, 409); assert.equal(response.body.error.code, "stale_parameters"); assert.deepEqual([await count(), await seq()], before); assert.equal((await call(`creation-receipts/${cmd.clientRequestId}`)).body.state, "rejected");
    assert.equal((await call("creation-preview", input)).status, 400);
    await pool.query(`UPDATE ${table} SET version=version+1,status='active' WHERE id=$1`, [id]);
  });
  await t.test("Preset country and salesperson ownership are independently checked again inside final transaction", async () => {
    for (const [table, field, changed, restored, id] of [["quote_manufacturing_presets", "country", "Other country", preset.country, preset.id], ["quote_master_customer_salespeople", "brand_id", secondBrand.id, brand.id, person.id]]) {
      const cmd = await command(); const before = await count(); await pool.query(`UPDATE ${table} SET ${field}=$1,version=version+1 WHERE id=$2`, [changed, id]);
      assert.equal((await call("creation-workflows", cmd)).body.error.code, "stale_parameters"); assert.equal(await count(), before); await pool.query(`UPDATE ${table} SET ${field}=$1,version=version+1 WHERE id=$2`, [restored, id]);
    }
  });
  await t.test("Expired preview and forged payload are rejected before allocator", async () => {
    const cmd = await command(); const before = [await count(), await seq()]; await pool.query("UPDATE quote_creation_previews SET expires_at=now()-interval '1 second' WHERE id=$1", [cmd.previewId]);
    assert.equal((await call("creation-workflows", cmd)).body.error.code, "preview_expired");
    const fresh = await command(); fresh.fields = { ...fresh.fields, styleNo: "Forged" }; assert.equal((await call("creation-workflows", fresh)).body.error.code, "creation_payload_mismatch"); assert.deepEqual([await count(), await seq()], before);
  });
  await t.test("Audit failure rolls back all Quote children and receipt result; explicit same-token recovery remains one Quote", async () => {
    const cmd = await command(); const before = await count();
    await pool.query("CREATE FUNCTION synthetic_creation_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER synthetic_creation_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_creation_audit_failure()");
    try { assert.equal((await call("creation-workflows", cmd)).status, 500); assert.equal(await count(), before); assert.equal((await call(`creation-receipts/${cmd.clientRequestId}`)).body.state, "pending"); } finally { await pool.query("DROP TRIGGER synthetic_creation_audit_failure ON operation_logs; DROP FUNCTION synthetic_creation_audit_failure()"); }
    const completed = await call("creation-workflows", cmd); assert.equal(completed.status, 201); assert.equal(await count(), before + 1);
    const orphan = (await pool.query("SELECT count(*) FROM quote_center_revisions r LEFT JOIN quote_center_quotes q ON q.id=r.quote_id WHERE q.id IS NULL")).rows[0]; assert.equal(orphan.count, "0");
  });
  await t.test("Permission revocation after preview, identity/receipt isolation and protected parameter projection", async () => {
    const cmd = await command(); const before = await count();
    await pool.query("UPDATE app_users SET active=false WHERE id=$1", [actor.internalUserId]);
    await assert.rejects(creation.execute(actor, cmd), { code: "authentication_required" }); assert.equal(await count(), before); await pool.query("UPDATE app_users SET active=true WHERE id=$1", [actor.internalUserId]);
    const limited = { ...actor, permissions: ["quote.create"] as TrustedIdentity["permissions"] };
    const preview = await creation.preview(limited, input); assert.equal(preview.parametersVisibility, "redacted"); assert.equal(Object.hasOwn(preview, "pricingParameters"), false);
    await assert.rejects(creation.preview(limited, { ...input, parameterOverrides: { markupRate: "0" } }), { code: "permission_denied" });
    assert.equal((await call("creation-options", undefined, "")).status, 401);
  });
  await t.test("Trusted create-only identity receives no numeric parameters or another actor's receipt", async () => {
    const id = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('synthetic-create-only',crypt('disposable-only-password',gen_salt('bf',4)),'Synthetic create-only','viewer') RETURNING id::text")).rows[0].id;
    await pool.query("INSERT INTO app_roles(id,name) VALUES('synthetic-create-only','Synthetic create-only'); INSERT INTO app_role_permissions(role_id,permission_key) VALUES('synthetic-create-only','quote.create')");
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'synthetic-create-only')", [id]);
    const login = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: { Origin: origin, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: "synthetic-create-only", password: "disposable-only-password" }) });
    assert.equal(login.status, 200); const limitedCookie = login.headers.get("set-cookie")!.split(";")[0];
    const preview = await call("creation-preview", input, limitedCookie); assert.equal(preview.status, 200); assert.equal(preview.body.parametersVisibility, "redacted"); assert.ok(!JSON.stringify(preview.body).includes(defaults.defaultUsdCnyRate));
    const own = { ...input, previewId: preview.body.previewId, clientRequestId: randomUUID(), imageSelection: null };
    assert.equal((await call("creation-workflows", own, limitedCookie)).status, 201);
    const other = await command(); await call("creation-workflows", other);
    assert.deepEqual((await call(`creation-receipts/${other.clientRequestId}`, undefined, limitedCookie)).body, { state: "pending", retryable: false });
    assert.equal((await call("creation-workflows", other, limitedCookie)).status, 404);
    assert.equal((await call("creation-preview", { ...input, parameterOverrides: { markupRate: "0" } }, limitedCookie)).status, 403);
  });
  await t.test("Transaction rechecks database permissions after preview, not request's old permission array", async () => {
    const cmd = await command(); const before = [await count(), await seq()];
    await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='quote.create'");
    try {
      await assert.rejects(creation.execute({ ...actor, username: "local-single-user", userName: "本地开发用户" }, cmd), { code: "permission_denied" });
      const forgedMode = await fetch(`${origin}/api/v1/quotes/creation-workflows`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-Zhixu-Request": "1", "Content-Type": "application/json", "X-Zhixu-Identity-Mode": "local-single-user", "X-User-Role": "admin" }, body: JSON.stringify(cmd) });
      assert.equal(forgedMode.status, 403, "client identity-mode/role headers cannot bypass Session revocation");
      assert.equal((await forgedMode.json()).error.code, "permission_denied");
      assert.deepEqual([await count(), await seq()], before);
    }
    finally { await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-server-admin','quote.create')"); }
  });
  await t.test("Legacy POST{} remains neutral, rejects new fields and does not require receipts", async () => {
    const response = await fetch(`${origin}/api/v1/quotes`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: "{}" }); assert.equal(response.status, 201);
    const record = (await response.json()).quote; assert.equal(record.quote.revisions[0].baseInfo.quoteType, "distribution"); assert.equal(record.version, 1); assert.equal(record.quote.revisions[0].priceVersions[0].pricingParameters.configuration, undefined);
    const rejected = await fetch(`${origin}/api/v1/quotes`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ quoteType: "processing" }) }); assert.equal(rejected.status, 400);
  });
});
