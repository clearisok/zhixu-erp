import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { createApp } from "../app.js";
import { inspectMigrationStatus, PendingMigrationsError, runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { createQuoteMasterService } from "../quote-masters/service.js";
import { createQuoteService } from "../quotes/service.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

const migrations = [
  "0001_trusted_auth_rbac_operation_logs.sql", "0002_sales_order_foundation.sql", "0003_sales_order_number_sequence.sql",
  "0004_confirmed_commercial_terms.sql", "0005_quote_foundation.sql", "0006_quote_number_sequence.sql", "0007_quote_master_settings.sql",
];
const origin = "http://127.0.0.1:3001";
const emptyDefaults = { defaultUsdCnyRate: null, defaultOtherCost: null, defaultTrims: [] };

async function copyMigrations(names: string[]) {
  const directory=await mkdtemp(join(tmpdir(),"zhixu-q3a-"));
  for(const name of names)await writeFile(join(directory,name),await readFile(resolve("database/migrations",name),"utf8"),"utf8");
  return directory;
}
async function seedActor(pool:pg.Pool,username:string,permissions:TrustedIdentity["permissions"]){
  const password=`test-${username}-password`;
  const user=(await pool.query<{id:string;public_id:string}>(`INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES($1,crypt($2,gen_salt('bf',4)),$3,'viewer',true) RETURNING id::text,public_id::text`,[username,password,username])).rows[0];
  const role=`role-${username}`;await pool.query("INSERT INTO app_roles(id,name,description) VALUES($1,$1,'q3a')",[role]);
  for(const permission of permissions)await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)",[role,permission]);
  await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1::bigint,$2)",[user.id,role]);
  return {password,identity:{internalUserId:user.id,userId:user.public_id,username,userName:username,permissions} satisfies TrustedIdentity};
}

test("Q3A Quote master/settings foundation uses disposable PostgreSQL 16 only",{timeout:240_000},async(t)=>{
  const postgres=await startDisposablePostgres();
  const pool=new pg.Pool({connectionString:await postgres.createDatabase("q3a")});
  t.after(async()=>{await pool.end();await postgres.stop();});

  await t.test("0001 through 0007 apply, rerun skips, checksum and pending guards hold",async()=>{
    assert.deepEqual((await runMigrations(pool,resolve("database/migrations"))).applied,migrations);
    assert.deepEqual((await runMigrations(pool,resolve("database/migrations"))).skipped,migrations);
    const checksumDir=await copyMigrations(migrations);
    const pendingDir=await copyMigrations(migrations.slice(0,-1));
    const pendingPool=new pg.Pool({connectionString:await postgres.createDatabase("q3a_pending")});
    try{
      await runMigrations(pendingPool,pendingDir);
      assert.deepEqual((await inspectMigrationStatus(pendingPool,checksumDir)).pending,["0007_quote_master_settings.sql"]);
      await assert.rejects(()=>verifyMigrationsCurrent(pendingPool,checksumDir),(error:unknown)=>error instanceof PendingMigrationsError&&error.pending[0]==="0007_quote_master_settings.sql");
      assert.equal((await pendingPool.query("SELECT to_regclass('public.quote_master_brands')::text AS value")).rows[0].value,null);
      await writeFile(join(checksumDir,"0001_trusted_auth_rbac_operation_logs.sql"),"-- changed\n","utf8");
      await assert.rejects(()=>inspectMigrationStatus(pool,checksumDir),/checksum mismatch/i);
    }finally{await pendingPool.end();await Promise.all([rm(checksumDir,{recursive:true,force:true}),rm(pendingDir,{recursive:true,force:true})]);}
  });

  await synchronizePermissionCatalog(pool);
  const actor=await seedActor(pool,"q3a-admin",["quote.view","settings.global.edit","settings.brand.edit","settings.salesperson.edit","settings.fabric.edit","settings.trim.edit"]);
  const denied=await seedActor(pool,"q3a-denied",[]);
  const service=createQuoteMasterService(pool);
  const initialSafety=await pool.query(`SELECT
    (SELECT count(*)::int FROM sales_orders) sales_orders,
    (SELECT count(*)::int FROM quote_center_quotes) quotes,
    (SELECT count(*)::int FROM confirmed_commercial_terms) terms`);

  let trimId="";let brandId="";let salespersonId="";let presetId="";
  await t.test("schema excludes DefaultTrimConfig quantity/usage and Supplier domain",async()=>{
    const columns=(await pool.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_name='quote_master_default_trim_configs' ORDER BY column_name")).rows.map((row)=>row.column_name);
    assert.ok(!columns.includes("quantity")&&!columns.includes("usage"));
    assert.equal((await pool.query("SELECT to_regclass('public.quote_master_suppliers')::text AS value")).rows[0].value,null);
  });

  await t.test("trusted RBAC denial and Server UUID runtime identity",async()=>{
    assert.throws(()=>service.createBrand(denied.identity,{name:"Denied",status:"active",defaults:{...emptyDefaults}}),(error:unknown)=>(error as {status?:number}).status===403);
    const trim=await service.createTrim(actor.identity,{name:"主唛",specification:"织唛",supplier:"自由供应商",unit:"枚",defaultLossRate:null,unitPrice:"0"});
    trimId=trim.id;assert.match(trim.id,/^[0-9a-f-]{36}$/i);assert.equal(trim.unitPrice,"0");assert.equal(trim.defaultLossRate,null);
    const duplicate=await service.createTrim(actor.identity,{name:"主唛",specification:"另一规格",supplier:"另一供应商",unit:"枚",defaultLossRate:"0",unitPrice:null});
    assert.notEqual(duplicate.id,trim.id);
  });

  await t.test("duplicate material names, decimal null/zero and free supplier strings survive",async()=>{
    const first=await service.createFabric(actor.identity,{name:"精梳棉",composition:"100% Cotton",netWidthCm:null,gsm:"0",defaultLossRate:null,supplier:"自由供应商",unitPrice:"0",purchaseUnit:"kg"});
    const second=await service.createFabric(actor.identity,{name:"精梳棉",composition:"",netWidthCm:"0",gsm:null,defaultLossRate:"0",supplier:"另一供应商",unitPrice:null,purchaseUnit:"meter"});
    assert.notEqual(first.id,second.id);assert.equal(first.netWidthCm,null);assert.equal(first.gsm,"0");assert.equal(second.netWidthCm,"0");assert.equal(second.gsm,null);
    assert.deepEqual(await service.supplierSuggestions(),["另一供应商","自由供应商"]);
  });

  await t.test("Brand and salesperson normalized names are globally unique and relationship/status filters work",async()=>{
    const brand=await service.createBrand(actor.identity,{name:"ＡＣＭＥ ",status:"active",defaults:{defaultUsdCnyRate:"7.10",defaultOtherCost:{name:"包装费",amount:"0"},defaultTrims:[{trimLibraryItemId:trimId,overrideLossRate:null,overrideUnitPrice:"0"}]}});brandId=brand.id;
    const brandUpdated=await service.updateBrand(actor.identity,brand.id,brand.version,{name:brand.name,status:brand.status,defaults:{defaultUsdCnyRate:brand.defaults.defaultUsdCnyRate,defaultOtherCost:brand.defaults.defaultOtherCost,defaultTrims:brand.defaults.defaultTrims.map(({trimLibraryItemId,overrideLossRate,overrideUnitPrice})=>({trimLibraryItemId,overrideLossRate,overrideUnitPrice}))}});
    assert.equal(brandUpdated.defaults.defaultTrims[0].id,brand.defaults.defaultTrims[0].id);
    await assert.rejects(()=>service.createBrand(actor.identity,{name:"acme",status:"active",defaults:{...emptyDefaults}}),(error:unknown)=>(error as {status?:number}).status===409);
    const salesperson=await service.createSalesperson(actor.identity,{name:" 林青禾 ",brandId,status:"active",defaults:{defaultUsdCnyRate:null,defaultOtherCost:null,defaultTrims:[]}});salespersonId=salesperson.id;
    await assert.rejects(()=>service.createSalesperson(actor.identity,{name:"林青禾",brandId,status:"active",defaults:{...emptyDefaults}}),(error:unknown)=>(error as {status?:number}).status===409);
    assert.equal((await service.listSalespeople({brandId,status:"active"})).length,1);
    const inactive=await service.updateSalesperson(actor.identity,salespersonId,salesperson.version,{name:salesperson.name,brandId,status:"inactive",defaults:{defaultUsdCnyRate:null,defaultOtherCost:null,defaultTrims:[]}});
    assert.equal((await service.listSalespeople({brandId,status:"active"})).length,0);
    const activeAgain=await service.updateSalesperson(actor.identity,salespersonId,inactive.version,{name:inactive.name,brandId,status:"active",defaults:{defaultUsdCnyRate:"0",defaultOtherCost:{name:"检测费",amount:null},defaultTrims:[{trimLibraryItemId:trimId,overrideLossRate:"0",overrideUnitPrice:null}]}});
    assert.equal(activeAgain.defaults.defaultOtherCost?.amount,null);
  });

  await t.test("one nullable other cost, precedence and whole-set trim resolution preserve null versus zero",async()=>{
    const settings=await service.updateGlobalSettings(actor.identity,0,{defaultUsdCnyRate:"7.12",defaultMarkupRate:"0",defaultLaborCurrency:"CNY",defaultLaborDescription:"工序",defaultOtherCost:{name:"系统费",amount:"1"},defaultManufacturingPresetId:null});
    assert.equal(settings.defaultMarkupRate,"0");
    let resolved=await service.resolveDefaults(brandId,salespersonId);
    assert.equal(resolved.usdCnyRate,"0");assert.equal(resolved.markupRate,"0");assert.equal(resolved.laborCurrency,"CNY");assert.equal(resolved.laborDescription,"工序");assert.deepEqual(resolved.otherCost,{name:"检测费",amount:null});assert.equal(resolved.trims.length,1);assert.equal(resolved.source.trims,"salesperson");
    const person=(await service.getSalesperson(salespersonId))!;
    await service.updateSalesperson(actor.identity,salespersonId,person.version,{name:person.name,brandId,status:"active",defaults:{defaultUsdCnyRate:null,defaultOtherCost:null,defaultTrims:[]}});
    resolved=await service.resolveDefaults(brandId,salespersonId);
    assert.equal(resolved.usdCnyRate,"7.10");assert.deepEqual(resolved.otherCost,{name:"包装费",amount:"0"});assert.equal(resolved.trims.length,1);assert.equal(resolved.source.trims,"brand");
  });

  await t.test("manufacturing preset updates are versioned and never rewrite Quote snapshots",async()=>{
    const preset=await service.createPreset(actor.identity,{name:"中国制作",country:"中国",laborCurrency:"CNY",markupRate:"13",includeFreight:false,freightName:"运费",freightAmount:null,status:"active"});presetId=preset.id;
    const settings=(await service.getGlobalSettings())!;
    await service.updateGlobalSettings(actor.identity,settings.version,{defaultUsdCnyRate:settings.defaultUsdCnyRate,defaultMarkupRate:settings.defaultMarkupRate,defaultLaborCurrency:settings.defaultLaborCurrency,defaultLaborDescription:settings.defaultLaborDescription,defaultOtherCost:settings.defaultOtherCost,defaultManufacturingPresetId:preset.id});
    const quote=quoteSnapshotFromBrowser(createSyntheticQuoteFixture("q3a-snapshot","distribution"));
    quote.revisions[1].priceVersions[0].pricingParameters.manufacturingPresetId=preset.id;
    quote.revisions[1].priceVersions[0].pricingParameters.manufacturingPresetName=preset.name;
    quote.revisions[1].priceVersions[0].pricingParameters.manufacturingCountry=preset.country;
    const created=await createQuoteService(pool).createAggregate(quote);
    await service.updatePreset(actor.identity,preset.id,preset.version,{name:"中国制作新版",country:"越南",laborCurrency:preset.laborCurrency,markupRate:preset.markupRate,includeFreight:preset.includeFreight,freightName:preset.freightName,freightAmount:preset.freightAmount,status:preset.status});
    assert.equal((await service.resolveDefaults(brandId,salespersonId)).manufacturingPreset?.country,"越南");
    assert.deepEqual((await createQuoteService(pool).getById(quote.id))?.quote,created.quote);
  });

  await t.test("optimistic conflict and audit failure roll back business rows atomically",async()=>{
    const brand=(await service.getBrand(brandId))!;
    await assert.rejects(()=>service.updateBrand(actor.identity,brandId,brand.version-1,{name:brand.name,status:brand.status,defaults:{defaultUsdCnyRate:brand.defaults.defaultUsdCnyRate,defaultOtherCost:brand.defaults.defaultOtherCost,defaultTrims:brand.defaults.defaultTrims.map(({trimLibraryItemId,overrideLossRate,overrideUnitPrice})=>({trimLibraryItemId,overrideLossRate,overrideUnitPrice}))}}),(error:unknown)=>(error as {status?:number}).status===409);
    await pool.query(`CREATE FUNCTION q3a_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='Brand' AND NEW.action='新增品牌' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER q3a_reject_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION q3a_reject_audit();`);
    await assert.rejects(()=>service.createBrand(actor.identity,{name:"Must Roll Back",status:"active",defaults:{...emptyDefaults}}));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_master_brands WHERE name='Must Roll Back'")).rows[0].n,0);
    await pool.query("DROP TRIGGER q3a_reject_audit ON operation_logs; DROP FUNCTION q3a_reject_audit()");
    const logs=await pool.query("SELECT actor_public_id::text FROM operation_logs WHERE entity_type IN ('Brand','CustomerSalesperson','FabricLibraryItem','TrimLibraryItem','ManufacturingPreset','QuoteSettings')");
    assert.ok((logs.rowCount??0)>=10);assert.ok(logs.rows.every((row)=>row.actor_public_id===actor.identity.userId));
  });

  await t.test("HTTP surface requires trusted session, rejects caller ID/actor spoof and preserves permission boundaries",async()=>{
    const server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600}}));
    await new Promise<void>((done)=>server.listen(0,"127.0.0.1",done));
    try{
      const address=server.address();assert.ok(address&&typeof address==="object");const base=`http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(`${base}/api/v1/quote-masters/brands`)).status,401);
      const deniedLogin=await fetch(`${base}/api/v1/auth/login`,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"X-Zhixu-Request":"1"},body:JSON.stringify({username:denied.identity.username,password:denied.password})});
      const deniedCookie=deniedLogin.headers.get("set-cookie")?.split(";",1)[0]??"";
      assert.equal((await fetch(`${base}/api/v1/quote-masters/brands`,{headers:{Cookie:deniedCookie}})).status,403);
      assert.equal((await fetch(`${base}/api/v1/quote-masters/brands`,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"X-Zhixu-Request":"1",Cookie:deniedCookie},body:JSON.stringify({name:"Denied API"})})).status,403);
      const login=await fetch(`${base}/api/v1/auth/login`,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"X-Zhixu-Request":"1"},body:JSON.stringify({username:actor.identity.username,password:actor.password})});
      const cookie=login.headers.get("set-cookie")?.split(";",1)[0]??"";
      const spoof=await fetch(`${base}/api/v1/quote-masters/brands`,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"X-Zhixu-Request":"1",Cookie:cookie},body:JSON.stringify({id:"caller",actor:{userId:"spoof"},name:"Spoof"})});
      assert.equal(spoof.status,400);
      const read=await fetch(`${base}/api/v1/quote-settings/resolved-defaults?brandId=${brandId}&salespersonId=${salespersonId}`,{headers:{Cookie:cookie}});assert.equal(read.status,200);
    }finally{await new Promise<void>((done,reject)=>server.close((error)=>error?reject(error):done()));}
  });

  await t.test("master/settings CRUD changes neither Quote aggregates nor SalesOrders",async()=>{
    const after=await pool.query(`SELECT (SELECT count(*)::int FROM sales_orders) sales_orders,(SELECT count(*)::int FROM quote_center_quotes) quotes,(SELECT count(*)::int FROM confirmed_commercial_terms) terms`);
    assert.equal(after.rows[0].sales_orders,initialSafety.rows[0].sales_orders);assert.equal(after.rows[0].quotes,initialSafety.rows[0].quotes+1);assert.equal(after.rows[0].terms,initialSafety.rows[0].terms);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_order_source_links")).rows[0].n,0);
    assert.ok(presetId);
  });
});
