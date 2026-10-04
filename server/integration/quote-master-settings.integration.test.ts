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
type AuditValues = Record<string, string | number | null>;
type AuditChange = { field: string; beforeValue: string | number | null; afterValue: string | number | null };
type AuditRow = {
  actor_public_id: string;
  before_data: { values?: AuditValues } | null;
  after_data: { values?: AuditValues } | null;
  changes: AuditChange[];
};

async function auditForVersion(pool: pg.Pool, entityType: string, entityId: string, version: number): Promise<AuditRow> {
  const row = (await pool.query<AuditRow>(
    `SELECT actor_public_id::text, before_data, after_data, changes
       FROM operation_logs
      WHERE entity_type=$1 AND entity_id=$2
        AND after_data->'values'->>'version'=$3
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [entityType, entityId, String(version)],
  )).rows[0];
  assert.ok(row, `missing audit for ${entityType}/${entityId} version ${version}`);
  return row;
}

function auditChange(row: AuditRow, field: string): AuditChange {
  const change = row.changes.find((item) => item.field === field);
  assert.ok(change, `missing audit change for ${field}`);
  return change;
}

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
    const checksumDir=await copyMigrations(migrations);
    const pendingDir=await copyMigrations(migrations.slice(0,-1));
    const pendingPool=new pg.Pool({connectionString:await postgres.createDatabase("q3a_pending")});
    try{
      assert.deepEqual((await runMigrations(pool,checksumDir)).applied,migrations);
      assert.deepEqual((await runMigrations(pool,checksumDir)).skipped,migrations);
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
  const brandEditor=await seedActor(pool,"q3b1-brand",["settings.brand.edit"]);
  const salespersonEditor=await seedActor(pool,"q3b1-sales",["settings.salesperson.edit"]);
  const fabricEditor=await seedActor(pool,"q3b1-fabric",["settings.fabric.edit"]);
  const trimEditor=await seedActor(pool,"q3b1-trim",["settings.trim.edit"]);
  const globalEditor=await seedActor(pool,"q3b1-global",["settings.global.edit"]);
  const service=createQuoteMasterService(pool);
  const initialSafety=await pool.query(`SELECT
    (SELECT count(*)::int FROM sales_orders) sales_orders,
    (SELECT count(*)::int FROM quote_center_quotes) quotes,
    (SELECT count(*)::int FROM confirmed_commercial_terms) terms`);

  let trimId="";let brandId="";let salespersonId="";let presetId="";let snapshotQuoteId="";
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
    snapshotQuoteId=quote.id;
    const created=await createQuoteService(pool).createAggregate(quote);
    await service.updatePreset(actor.identity,preset.id,preset.version,{name:"中国制作新版",country:"越南",laborCurrency:preset.laborCurrency,markupRate:preset.markupRate,includeFreight:preset.includeFreight,freightName:preset.freightName,freightAmount:preset.freightAmount,status:preset.status});
    assert.equal((await service.resolveDefaults(brandId,salespersonId)).manufacturingPreset?.country,"越南");
    assert.deepEqual((await createQuoteService(pool).getById(quote.id))?.quote,created.quote);
  });

  await t.test("standalone default preset deactivation atomically clears settings without rewriting Quote snapshots",async()=>{
    const quoteService=createQuoteService(pool);
    const quoteBefore=(await quoteService.getById(snapshotQuoteId))?.quote;
    const beforePreset=(await service.getPreset(presetId))!;
    const beforeSettings=(await service.getGlobalSettings())!;
    assert.equal(beforePreset.status,"active");assert.equal(beforeSettings.defaultManufacturingPresetId,presetId);

    const inactive=await service.updatePreset(actor.identity,presetId,beforePreset.version,{name:beforePreset.name,country:beforePreset.country,laborCurrency:beforePreset.laborCurrency,markupRate:beforePreset.markupRate,includeFreight:beforePreset.includeFreight,freightName:beforePreset.freightName,freightAmount:beforePreset.freightAmount,status:"inactive"});
    const cleared=(await service.getGlobalSettings())!;
    assert.equal(inactive.status,"inactive");assert.equal(inactive.version,beforePreset.version+1);
    assert.equal(cleared.defaultManufacturingPresetId,null);assert.equal(cleared.version,beforeSettings.version+1);
    assert.equal((await auditForVersion(pool,"ManufacturingPreset",presetId,inactive.version)).actor_public_id,actor.identity.userId);
    const settingsAudit=await auditForVersion(pool,"QuoteSettings","global",cleared.version);
    assert.equal(settingsAudit.actor_public_id,actor.identity.userId);
    assert.deepEqual(auditChange(settingsAudit,"defaultManufacturingPresetId"),{field:"defaultManufacturingPresetId",beforeValue:presetId,afterValue:null});
    assert.equal((await service.resolveDefaults(brandId,salespersonId)).manufacturingPreset,null);
    assert.deepEqual((await quoteService.getById(snapshotQuoteId))?.quote,quoteBefore);

    await assert.rejects(()=>service.updateGlobalSettings(actor.identity,cleared.version,{defaultUsdCnyRate:cleared.defaultUsdCnyRate,defaultMarkupRate:cleared.defaultMarkupRate,defaultLaborCurrency:cleared.defaultLaborCurrency,defaultLaborDescription:cleared.defaultLaborDescription,defaultOtherCost:cleared.defaultOtherCost,defaultManufacturingPresetId:presetId}),(error:unknown)=>(error as {status?:number;code?:string}).status===400&&(error as {code?:string}).code==="invalid_quote_master_input");
    assert.deepEqual(await service.getGlobalSettings(),cleared);

    await pool.query("UPDATE quote_global_settings SET default_manufacturing_preset_id=$1 WHERE singleton_id=1",[presetId]);
    assert.equal((await service.resolveDefaults(brandId,salespersonId)).manufacturingPreset,null);
    await pool.query("UPDATE quote_global_settings SET default_manufacturing_preset_id=NULL WHERE singleton_id=1");

    const activeAgain=await service.updatePreset(actor.identity,presetId,inactive.version,{name:inactive.name,country:inactive.country,laborCurrency:inactive.laborCurrency,markupRate:inactive.markupRate,includeFreight:inactive.includeFreight,freightName:inactive.freightName,freightAmount:inactive.freightAmount,status:"active"});
    assert.equal((await service.getGlobalSettings())?.defaultManufacturingPresetId,null);
    const settingsBeforeDefault=(await service.getGlobalSettings())!;
    const defaulted=await service.updateGlobalSettings(actor.identity,settingsBeforeDefault.version,{defaultUsdCnyRate:settingsBeforeDefault.defaultUsdCnyRate,defaultMarkupRate:settingsBeforeDefault.defaultMarkupRate,defaultLaborCurrency:settingsBeforeDefault.defaultLaborCurrency,defaultLaborDescription:settingsBeforeDefault.defaultLaborDescription,defaultOtherCost:settingsBeforeDefault.defaultOtherCost,defaultManufacturingPresetId:presetId});
    assert.equal(defaulted.defaultManufacturingPresetId,presetId);

    const presetAuditCount=(await pool.query<{n:number}>("SELECT count(*)::int n FROM operation_logs WHERE entity_type='ManufacturingPreset' AND entity_id=$1",[presetId])).rows[0].n;
    await pool.query(`CREATE FUNCTION q3b1_reject_cascade_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='QuoteSettings' THEN RAISE EXCEPTION 'synthetic cascade audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER q3b1_reject_cascade_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION q3b1_reject_cascade_audit();`);
    await assert.rejects(()=>service.updatePreset(actor.identity,presetId,activeAgain.version,{name:activeAgain.name,country:activeAgain.country,laborCurrency:activeAgain.laborCurrency,markupRate:activeAgain.markupRate,includeFreight:activeAgain.includeFreight,freightName:activeAgain.freightName,freightAmount:activeAgain.freightAmount,status:"inactive"}));
    await pool.query("DROP TRIGGER q3b1_reject_cascade_audit ON operation_logs; DROP FUNCTION q3b1_reject_cascade_audit()");
    assert.deepEqual(await service.getPreset(presetId),activeAgain);
    assert.deepEqual(await service.getGlobalSettings(),defaulted);
    assert.equal((await pool.query<{n:number}>("SELECT count(*)::int n FROM operation_logs WHERE entity_type='ManufacturingPreset' AND entity_id=$1",[presetId])).rows[0].n,presetAuditCount);
    assert.deepEqual((await quoteService.getById(snapshotQuoteId))?.quote,quoteBefore);
  });

  await t.test("trusted audit preserves bounded master and settings business before/after values",async()=>{
    const fabric=await service.createFabric(actor.identity,{name:"审计面料",composition:"棉",netWidthCm:"150",gsm:"180",defaultLossRate:"3",supplier:"供应商甲",unitPrice:"23.5",purchaseUnit:"meter"});
    const priced=await service.updateFabric(actor.identity,fabric.id,fabric.version,{name:"审计面料",composition:"棉涤",netWidthCm:"151",gsm:"181",defaultLossRate:"4",supplier:"供应商乙",unitPrice:"24.2",purchaseUnit:"kg"});
    const priceLog=await auditForVersion(pool,"FabricLibraryItem",fabric.id,priced.version);
    assert.equal(priceLog.before_data?.values?.unitPrice,"23.5");assert.equal(priceLog.after_data?.values?.unitPrice,"24.2");
    assert.deepEqual(auditChange(priceLog,"unitPrice"),{field:"unitPrice",beforeValue:"23.5",afterValue:"24.2"});
    for(const field of ["name","composition","netWidthCm","gsm","defaultLossRate","supplier","unitPrice","purchaseUnit"])assert.ok(Object.hasOwn(priceLog.after_data?.values??{},field));
    const nullable=await service.updateFabric(actor.identity,fabric.id,priced.version,{name:priced.name,composition:priced.composition,netWidthCm:priced.netWidthCm,gsm:priced.gsm,defaultLossRate:priced.defaultLossRate,supplier:priced.supplier,unitPrice:null,purchaseUnit:priced.purchaseUnit});
    const zero=await service.updateFabric(actor.identity,fabric.id,nullable.version,{name:nullable.name,composition:nullable.composition,netWidthCm:nullable.netWidthCm,gsm:nullable.gsm,defaultLossRate:nullable.defaultLossRate,supplier:nullable.supplier,unitPrice:"0",purchaseUnit:nullable.purchaseUnit});
    assert.deepEqual(auditChange(await auditForVersion(pool,"FabricLibraryItem",fabric.id,zero.version),"unitPrice"),{field:"unitPrice",beforeValue:null,afterValue:"0"});

    const secondTrim=await service.createTrim(actor.identity,{name:"审计洗标",specification:"缎面",supplier:"供应商乙",unit:"枚",defaultLossRate:"1",unitPrice:"0.5"});
    const updatedTrim=await service.updateTrim(actor.identity,secondTrim.id,secondTrim.version,{name:"审计洗标新版",specification:"棉质",supplier:"供应商丙",unit:"条",defaultLossRate:"2",unitPrice:"0"});
    const trimLog=await auditForVersion(pool,"TrimLibraryItem",secondTrim.id,updatedTrim.version);
    for(const field of ["name","specification","supplier","unit","defaultLossRate","unitPrice"])assert.ok(auditChange(trimLog,field));
    const auditBrand=await service.createBrand(actor.identity,{name:"审计品牌甲",status:"active",defaults:{defaultUsdCnyRate:"7.10",defaultOtherCost:{name:"包装费",amount:"1"},defaultTrims:[{trimLibraryItemId:trimId,overrideLossRate:null,overrideUnitPrice:"1"},{trimLibraryItemId:secondTrim.id,overrideLossRate:"1",overrideUnitPrice:null}]}});
    const auditBrandUpdated=await service.updateBrand(actor.identity,auditBrand.id,auditBrand.version,{name:"审计品牌甲新版",status:"inactive",defaults:{defaultUsdCnyRate:"7.20",defaultOtherCost:{name:"检测费",amount:"0"},defaultTrims:[{trimLibraryItemId:secondTrim.id,overrideLossRate:"2",overrideUnitPrice:"0"}]}});
    const brandLog=await auditForVersion(pool,"Brand",auditBrand.id,auditBrandUpdated.version);
    assert.deepEqual(auditChange(brandLog,"defaultUsdCnyRate"),{field:"defaultUsdCnyRate",beforeValue:"7.10",afterValue:"7.20"});
    assert.deepEqual(auditChange(brandLog,"defaultOtherCost.name"),{field:"defaultOtherCost.name",beforeValue:"包装费",afterValue:"检测费"});
    assert.deepEqual(auditChange(brandLog,"defaultOtherCost.amount"),{field:"defaultOtherCost.amount",beforeValue:"1",afterValue:"0"});
    assert.deepEqual(auditChange(brandLog,`defaultTrims.${trimId}.trimLibraryItemId`),{field:`defaultTrims.${trimId}.trimLibraryItemId`,beforeValue:trimId,afterValue:null});
    assert.deepEqual(auditChange(brandLog,`defaultTrims.${secondTrim.id}.position`),{field:`defaultTrims.${secondTrim.id}.position`,beforeValue:1,afterValue:0});
    assert.deepEqual(auditChange(brandLog,`defaultTrims.${secondTrim.id}.overrideLossRate`),{field:`defaultTrims.${secondTrim.id}.overrideLossRate`,beforeValue:"1",afterValue:"2"});
    const auditBrandAdded=await service.updateBrand(actor.identity,auditBrand.id,auditBrandUpdated.version,{name:auditBrandUpdated.name,status:auditBrandUpdated.status,defaults:{defaultUsdCnyRate:auditBrandUpdated.defaults.defaultUsdCnyRate,defaultOtherCost:auditBrandUpdated.defaults.defaultOtherCost,defaultTrims:[{trimLibraryItemId:secondTrim.id,overrideLossRate:"2",overrideUnitPrice:"0"},{trimLibraryItemId:trimId,overrideLossRate:"0",overrideUnitPrice:null}]}});
    assert.deepEqual(auditChange(await auditForVersion(pool,"Brand",auditBrand.id,auditBrandAdded.version),`defaultTrims.${trimId}.trimLibraryItemId`),{field:`defaultTrims.${trimId}.trimLibraryItemId`,beforeValue:null,afterValue:trimId});

    const otherBrand=await service.createBrand(actor.identity,{name:"审计品牌乙",status:"active",defaults:{...emptyDefaults}});
    const person=await service.createSalesperson(actor.identity,{name:"审计业务员",brandId:auditBrand.id,status:"active",defaults:{...emptyDefaults}});
    const personUpdated=await service.updateSalesperson(actor.identity,person.id,person.version,{name:"审计业务员新版",brandId:otherBrand.id,status:"inactive",defaults:{defaultUsdCnyRate:"0",defaultOtherCost:{name:"跟单费",amount:null},defaultTrims:[{trimLibraryItemId:trimId,overrideLossRate:null,overrideUnitPrice:"0"}]}});
    const personLog=await auditForVersion(pool,"CustomerSalesperson",person.id,personUpdated.version);
    for(const field of ["name","brandId","status","defaultUsdCnyRate","defaultOtherCost.name",`defaultTrims.${trimId}.trimLibraryItemId`])assert.ok(auditChange(personLog,field));
    assert.equal(personLog.before_data?.values?.["defaultOtherCost.amount"],null);assert.equal(personLog.after_data?.values?.["defaultOtherCost.amount"],null);

    const auditPreset=await service.createPreset(actor.identity,{name:"审计预设",country:"中国",laborCurrency:"CNY",markupRate:"10",includeFreight:false,freightName:"旧运费",freightAmount:null,status:"active"});
    const presetUpdated=await service.updatePreset(actor.identity,auditPreset.id,auditPreset.version,{name:"审计预设新版",country:"越南",laborCurrency:"USD",markupRate:"15",includeFreight:true,freightName:"新运费",freightAmount:"0",status:"inactive"});
    const presetLog=await auditForVersion(pool,"ManufacturingPreset",auditPreset.id,presetUpdated.version);
    for(const [field,beforeValue,afterValue] of [["country","中国","越南"],["laborCurrency","CNY","USD"],["markupRate","10","15"],["includeFreight","false","true"],["freightName","旧运费","新运费"],["freightAmount",null,"0"],["status","active","inactive"]] as const)assert.deepEqual(auditChange(presetLog,field),{field,beforeValue,afterValue});

    const settingsBefore=(await service.getGlobalSettings())!;
    await assert.rejects(()=>service.updateGlobalSettings(actor.identity,settingsBefore.version,{defaultUsdCnyRate:"7.20",defaultMarkupRate:"18",defaultLaborCurrency:"USD",defaultLaborDescription:"审计工价",defaultOtherCost:{name:"系统审计费",amount:"0"},defaultManufacturingPresetId:auditPreset.id}),(error:unknown)=>(error as {status?:number}).status===400);
    const reactivatedAuditPreset=await service.updatePreset(actor.identity,auditPreset.id,presetUpdated.version,{name:presetUpdated.name,country:presetUpdated.country,laborCurrency:presetUpdated.laborCurrency,markupRate:presetUpdated.markupRate,includeFreight:presetUpdated.includeFreight,freightName:presetUpdated.freightName,freightAmount:presetUpdated.freightAmount,status:"active"});
    assert.equal(reactivatedAuditPreset.status,"active");
    const settingsAfter=await service.updateGlobalSettings(actor.identity,settingsBefore.version,{defaultUsdCnyRate:"7.20",defaultMarkupRate:"18",defaultLaborCurrency:"USD",defaultLaborDescription:"审计工价",defaultOtherCost:{name:"系统审计费",amount:"0"},defaultManufacturingPresetId:auditPreset.id});
    const settingsLog=await auditForVersion(pool,"QuoteSettings","global",settingsAfter.version);
    for(const field of ["defaultUsdCnyRate","defaultMarkupRate","defaultLaborCurrency","defaultLaborDescription","defaultOtherCost.name","defaultOtherCost.amount","defaultManufacturingPresetId"])assert.ok(Object.hasOwn(settingsLog.after_data?.values??{},field));
    assert.deepEqual(auditChange(settingsLog,"defaultManufacturingPresetId"),{field:"defaultManufacturingPresetId",beforeValue:settingsBefore.defaultManufacturingPresetId,afterValue:auditPreset.id});
    assert.equal(settingsLog.actor_public_id,actor.identity.userId);
  });

  await t.test("optimistic conflict and audit failure roll back business rows atomically",async()=>{
    const brand=(await service.getBrand(brandId))!;
    await assert.rejects(()=>service.updateBrand(actor.identity,brandId,brand.version-1,{name:brand.name,status:brand.status,defaults:{defaultUsdCnyRate:brand.defaults.defaultUsdCnyRate,defaultOtherCost:brand.defaults.defaultOtherCost,defaultTrims:brand.defaults.defaultTrims.map(({trimLibraryItemId,overrideLossRate,overrideUnitPrice})=>({trimLibraryItemId,overrideLossRate,overrideUnitPrice}))}}),(error:unknown)=>(error as {status?:number}).status===409);
    const fabric=await service.createFabric(actor.identity,{name:"并发面料",composition:"",netWidthCm:null,gsm:null,defaultLossRate:null,supplier:"",unitPrice:"1",purchaseUnit:"kg"});
    const first=await service.updateFabric(actor.identity,fabric.id,fabric.version,{name:fabric.name,composition:"first",netWidthCm:null,gsm:null,defaultLossRate:null,supplier:"",unitPrice:"1",purchaseUnit:"kg"});
    const auditCountBefore=(await pool.query<{n:number}>("SELECT count(*)::int n FROM operation_logs WHERE entity_type='FabricLibraryItem' AND entity_id=$1",[fabric.id])).rows[0].n;
    await assert.rejects(()=>service.updateFabric(actor.identity,fabric.id,fabric.version,{name:fabric.name,composition:"stale",netWidthCm:null,gsm:null,defaultLossRate:null,supplier:"",unitPrice:"2",purchaseUnit:"kg"}),(error:unknown)=>(error as {status?:number}).status===409);
    assert.deepEqual(await service.getFabric(fabric.id),first);
    assert.equal((await pool.query<{n:number}>("SELECT count(*)::int n FROM operation_logs WHERE entity_type='FabricLibraryItem' AND entity_id=$1",[fabric.id])).rows[0].n,auditCountBefore);
    await pool.query(`CREATE FUNCTION q3a_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='Brand' AND NEW.action='新增品牌' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER q3a_reject_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION q3a_reject_audit();`);
    await assert.rejects(()=>service.createBrand(actor.identity,{name:"Must Roll Back",status:"active",defaults:{...emptyDefaults}}));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_master_brands WHERE name='Must Roll Back'")).rows[0].n,0);
    await pool.query("DROP TRIGGER q3a_reject_audit ON operation_logs; DROP FUNCTION q3a_reject_audit()");
    const logs=await pool.query("SELECT actor_public_id::text FROM operation_logs WHERE entity_type IN ('Brand','CustomerSalesperson','FabricLibraryItem','TrimLibraryItem','ManufacturingPreset','QuoteSettings')");
    assert.ok((logs.rowCount??0)>=10);assert.ok(logs.rows.every((row)=>row.actor_public_id===actor.identity.userId));
  });

  await t.test("global settings bundle commits settings, presets and trusted audit atomically",async()=>{
    const beforeSettings=(await service.getGlobalSettings())!;
    const beforePresets=await service.listPresets();
    const existing=beforePresets.map((preset)=>({
      id:preset.id,expectedVersion:preset.version,name:preset.name,country:preset.country,laborCurrency:preset.laborCurrency,
      markupRate:preset.markupRate,includeFreight:preset.includeFreight,freightName:preset.freightName,freightAmount:preset.freightAmount,status:preset.status,
    }));
    const saved=await service.saveSettingsBundle(actor.identity,{
      expectedSettingsVersion:beforeSettings.version,
      settings:{defaultUsdCnyRate:"0",defaultMarkupRate:null,defaultLaborCurrency:"USD",defaultLaborDescription:"bundle",defaultOtherCost:{name:"Bundle fee",amount:"0"},defaultManufacturingPresetId:"new-client-preset"},
      manufacturingPresets:[...existing,{clientId:"new-client-preset",name:"Bundle preset",country:"中国",laborCurrency:"CNY",markupRate:"0",includeFreight:false,freightName:"运费",freightAmount:null,status:"active"}],
    });
    const createdId=saved.createdPresetIds["new-client-preset"];
    assert.match(createdId,/^[0-9a-f-]{36}$/i);
    assert.equal(saved.settings.defaultManufacturingPresetId,createdId);
    assert.ok(saved.manufacturingPresets.some((preset)=>preset.id===createdId));
    assert.equal((await auditForVersion(pool,"QuoteSettings","global",saved.settings.version)).actor_public_id,actor.identity.userId);
    assert.equal((await auditForVersion(pool,"ManufacturingPreset",createdId,saved.manufacturingPresets.find((preset)=>preset.id===createdId)!.version)).actor_public_id,actor.identity.userId);

    const toBundleInputs=(presets:Awaited<ReturnType<typeof service.listPresets>>,statusFor:(id:string,status:"active"|"inactive")=>"active"|"inactive"=(_id,status)=>status)=>presets.map((preset)=>({
      id:preset.id,expectedVersion:preset.version,name:preset.name,country:preset.country,laborCurrency:preset.laborCurrency,
      markupRate:preset.markupRate,includeFreight:preset.includeFreight,freightName:preset.freightName,freightAmount:preset.freightAmount,status:statusFor(preset.id,preset.status),
    }));
    const settingsInput=(settings:Awaited<ReturnType<typeof service.getGlobalSettings>>,defaultManufacturingPresetId:string|null)=>{
      assert.ok(settings);
      return {defaultUsdCnyRate:settings.defaultUsdCnyRate,defaultMarkupRate:settings.defaultMarkupRate,defaultLaborCurrency:settings.defaultLaborCurrency,defaultLaborDescription:settings.defaultLaborDescription,defaultOtherCost:settings.defaultOtherCost,defaultManufacturingPresetId};
    };

    const beforeDeactivation=(await service.getGlobalSettings())!;
    const deactivatedBundle=await service.saveSettingsBundle(actor.identity,{
      expectedSettingsVersion:beforeDeactivation.version,
      settings:settingsInput(beforeDeactivation,createdId),
      manufacturingPresets:toBundleInputs(await service.listPresets(),(id,status)=>id===createdId?"inactive":status),
    });
    const inactiveCreated=deactivatedBundle.manufacturingPresets.find((preset)=>preset.id===createdId)!;
    assert.equal(inactiveCreated.status,"inactive");assert.equal(deactivatedBundle.settings.defaultManufacturingPresetId,null);
    assert.equal(deactivatedBundle.settings.version,beforeDeactivation.version+1);
    assert.equal((await auditForVersion(pool,"ManufacturingPreset",createdId,inactiveCreated.version)).actor_public_id,actor.identity.userId);
    assert.equal((await auditForVersion(pool,"QuoteSettings","global",deactivatedBundle.settings.version)).actor_public_id,actor.identity.userId);

    const invalidSettings=(await service.getGlobalSettings())!;
    const invalidPresets=await service.listPresets();
    await assert.rejects(()=>service.saveSettingsBundle(actor.identity,{
      expectedSettingsVersion:invalidSettings.version,
      settings:settingsInput(invalidSettings,createdId),
      manufacturingPresets:toBundleInputs(invalidPresets),
    }),(error:unknown)=>(error as {status?:number;code?:string}).status===400&&(error as {code?:string}).code==="invalid_quote_master_input");
    assert.deepEqual(await service.getGlobalSettings(),invalidSettings);assert.deepEqual(await service.listPresets(),invalidPresets);

    await assert.rejects(()=>service.saveSettingsBundle(actor.identity,{
      expectedSettingsVersion:invalidSettings.version,
      settings:settingsInput(invalidSettings,"new-inactive-preset"),
      manufacturingPresets:[...toBundleInputs(invalidPresets),{clientId:"new-inactive-preset",name:"Inactive new",country:"中国",laborCurrency:"CNY",markupRate:null,includeFreight:false,freightName:"运费",freightAmount:null,status:"inactive"}],
    }),(error:unknown)=>(error as {status?:number}).status===400);
    assert.deepEqual(await service.getGlobalSettings(),invalidSettings);assert.deepEqual(await service.listPresets(),invalidPresets);

    const reenabledBundle=await service.saveSettingsBundle(actor.identity,{
      expectedSettingsVersion:invalidSettings.version,
      settings:settingsInput(invalidSettings,null),
      manufacturingPresets:toBundleInputs(invalidPresets,(id,status)=>id===createdId?"active":status),
    });
    assert.equal(reenabledBundle.manufacturingPresets.find((preset)=>preset.id===createdId)?.status,"active");
    assert.equal(reenabledBundle.settings.defaultManufacturingPresetId,null);
    const explicitlyDefaulted=await service.saveSettingsBundle(actor.identity,{
      expectedSettingsVersion:reenabledBundle.settings.version,
      settings:settingsInput(reenabledBundle.settings,createdId),
      manufacturingPresets:toBundleInputs(await service.listPresets()),
    });
    assert.equal(explicitlyDefaulted.settings.defaultManufacturingPresetId,createdId);

    const stableSettings=(await service.getGlobalSettings())!;
    const stablePreset=(await service.getPreset(createdId))!;
    const all=await service.listPresets();
    const staleInputs=all.map((preset)=>({id:preset.id,expectedVersion:preset.id===createdId?preset.version-1:preset.version,name:preset.name,country:preset.country,laborCurrency:preset.laborCurrency,markupRate:preset.markupRate,includeFreight:preset.includeFreight,freightName:preset.freightName,freightAmount:preset.freightAmount,status:preset.status}));
    const settingsAuditBefore=(await pool.query<{n:number}>("SELECT count(*)::int n FROM operation_logs WHERE entity_type='QuoteSettings' AND entity_id='global'")).rows[0].n;
    await assert.rejects(()=>service.saveSettingsBundle(actor.identity,{expectedSettingsVersion:stableSettings.version,settings:{defaultUsdCnyRate:"9",defaultMarkupRate:stableSettings.defaultMarkupRate,defaultLaborCurrency:stableSettings.defaultLaborCurrency,defaultLaborDescription:"must rollback",defaultOtherCost:stableSettings.defaultOtherCost,defaultManufacturingPresetId:stableSettings.defaultManufacturingPresetId},manufacturingPresets:staleInputs}),(error:unknown)=>(error as {status?:number}).status===409);
    assert.deepEqual(await service.getGlobalSettings(),stableSettings);
    assert.deepEqual(await service.getPreset(createdId),stablePreset);
    assert.equal((await pool.query<{n:number}>("SELECT count(*)::int n FROM operation_logs WHERE entity_type='QuoteSettings' AND entity_id='global'")).rows[0].n,settingsAuditBefore);

    const rollbackPresets=await service.listPresets();
    const rollbackInputs=rollbackPresets.map((preset)=>({id:preset.id,expectedVersion:preset.version,name:preset.id===createdId?`${preset.name} rejected`:preset.name,country:preset.country,laborCurrency:preset.laborCurrency,markupRate:preset.markupRate,includeFreight:preset.includeFreight,freightName:preset.freightName,freightAmount:preset.freightAmount,status:preset.status}));
    await pool.query(`CREATE FUNCTION q3b1_reject_bundle_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='QuoteSettings' THEN RAISE EXCEPTION 'synthetic bundle audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER q3b1_reject_bundle_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION q3b1_reject_bundle_audit();`);
    await assert.rejects(()=>service.saveSettingsBundle(actor.identity,{expectedSettingsVersion:stableSettings.version,settings:{defaultUsdCnyRate:"8",defaultMarkupRate:stableSettings.defaultMarkupRate,defaultLaborCurrency:stableSettings.defaultLaborCurrency,defaultLaborDescription:"audit rollback",defaultOtherCost:stableSettings.defaultOtherCost,defaultManufacturingPresetId:stableSettings.defaultManufacturingPresetId},manufacturingPresets:rollbackInputs}));
    await pool.query("DROP TRIGGER q3b1_reject_bundle_audit ON operation_logs; DROP FUNCTION q3b1_reject_bundle_audit()");
    assert.deepEqual(await service.getGlobalSettings(),stableSettings);
    assert.deepEqual(await service.getPreset(createdId),stablePreset);
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

      const loginCookie=async(user:typeof brandEditor)=>{
        const response=await fetch(`${base}/api/v1/auth/login`,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"X-Zhixu-Request":"1"},body:JSON.stringify({username:user.identity.username,password:user.password})});
        assert.equal(response.status,200);return response.headers.get("set-cookie")?.split(";",1)[0]??"";
      };
      const brandCookie=await loginCookie(brandEditor);
      assert.equal((await fetch(`${base}/api/v1/quote-masters/brands`,{headers:{Cookie:brandCookie}})).status,200);
      assert.equal((await fetch(`${base}/api/v1/quote-masters/trims`,{headers:{Cookie:brandCookie}})).status,200);
      const salespersonCookie=await loginCookie(salespersonEditor);
      assert.equal((await fetch(`${base}/api/v1/quote-masters/brands`,{headers:{Cookie:salespersonCookie}})).status,200);
      assert.equal((await fetch(`${base}/api/v1/quote-masters/customer-salespeople`,{headers:{Cookie:salespersonCookie}})).status,200);
      const fabricCookie=await loginCookie(fabricEditor);
      assert.equal((await fetch(`${base}/api/v1/quote-masters/fabrics`,{headers:{Cookie:fabricCookie}})).status,200);
      assert.equal((await fetch(`${base}/api/v1/quote-masters/supplier-suggestions`,{headers:{Cookie:fabricCookie}})).status,200);
      const trimCookie=await loginCookie(trimEditor);
      assert.equal((await fetch(`${base}/api/v1/quote-masters/trims`,{headers:{Cookie:trimCookie}})).status,200);
      assert.equal((await fetch(`${base}/api/v1/quote-masters/supplier-suggestions`,{headers:{Cookie:trimCookie}})).status,200);
      const globalCookie=await loginCookie(globalEditor);
      assert.equal((await fetch(`${base}/api/v1/quote-settings`,{headers:{Cookie:globalCookie}})).status,200);
      assert.equal((await fetch(`${base}/api/v1/quote-settings/manufacturing-presets`,{headers:{Cookie:globalCookie}})).status,200);
      const beforeInvalid=(await service.getGlobalSettings())!;
      const invalid=await fetch(`${base}/api/v1/quote-settings/bundle`,{method:"PATCH",headers:{"Content-Type":"application/json",Origin:origin,"X-Zhixu-Request":"1",Cookie:globalCookie},body:JSON.stringify({expectedVersion:beforeInvalid.version,settings:{defaultUsdCnyRate:beforeInvalid.defaultUsdCnyRate,defaultMarkupRate:beforeInvalid.defaultMarkupRate,defaultLaborCurrency:beforeInvalid.defaultLaborCurrency,defaultLaborDescription:beforeInvalid.defaultLaborDescription,defaultOtherCost:beforeInvalid.defaultOtherCost,defaultManufacturingPresetId:beforeInvalid.defaultManufacturingPresetId},manufacturingPresets:[{clientId:"invalid",name:"",country:"中国",laborCurrency:"CNY",markupRate:null,includeFreight:false,freightName:"运费",freightAmount:null,status:"active"}]})});
      assert.equal(invalid.status,400);assert.deepEqual(await service.getGlobalSettings(),beforeInvalid);
    }finally{await new Promise<void>((done,reject)=>server.close((error)=>error?reject(error):done()));}
  });

  await t.test("master/settings CRUD changes neither Quote aggregates nor SalesOrders",async()=>{
    const after=await pool.query(`SELECT (SELECT count(*)::int FROM sales_orders) sales_orders,(SELECT count(*)::int FROM quote_center_quotes) quotes,(SELECT count(*)::int FROM confirmed_commercial_terms) terms`);
    assert.equal(after.rows[0].sales_orders,initialSafety.rows[0].sales_orders);assert.equal(after.rows[0].quotes,initialSafety.rows[0].quotes+1);assert.equal(after.rows[0].terms,initialSafety.rows[0].terms);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_order_source_links")).rows[0].n,0);
    assert.ok(presetId);
  });
});
