import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import pg from "pg";
import {startDisposablePostgres} from "./postgres-container.js";
import {runMigrations} from "../db/migration-runner.js";
import {synchronizePermissionCatalog} from "../auth/permissions.js";
import {bootstrapAdmin} from "../auth/bootstrap.js";
import {loadExistingBootstrapActor} from "../sales-orders/bootstrap-runner.js";
import {bindOrders,previewSelectedBindings} from "../ainuoke-source/binding.js";
import {additionBundle,freshMaterialBundle} from "./ainuoke-binding-fixture.js";
import {captureSource} from "../ainuoke-source/service.js";
import {createPersistedMaterialPorts} from "../ainuoke-source/reader.js";
import {createOrderMaterialReader} from "../../features/ainuoke-material-progress/read-service.js";

test("selected first binding is atomic, exact on replay and refreshes only bound orders",{timeout:120000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase("selected_binding")});
 try{
  await runMigrations(pool,resolve("database/migrations"));await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:"synthetic.selected",displayName:"Synthetic Selected",password:"Synthetic-Selected-Only"});
  const actor=await loadExistingBootstrapActor(pool,"synthetic.selected");
  const b=additionBundle(Date.now(),3,[0]);const selected=Object.keys(b.colors);const p=await previewSelectedBindings(b,selected);
  const opts={sourceKey:"selected-demo",accountFingerprint:"a".repeat(64),selected,expectedPreview:p.reviewHash,collect:async()=>b};
  const count=async(table:string)=>(await pool.query("SELECT count(*)::int n FROM "+table)).rows[0].n;
  await t.test("preview has no writes; bad review and audit failure leave empty ledger",async()=>{
   assert.equal(await count("sales_orders"),0);assert.equal(await count("ainuoke_source_profiles"),0);
   await assert.rejects(bindOrders(pool,actor,{...opts,expectedPreview:"b".repeat(64)}),/binding_preview_changed/);
   await pool.query("CREATE FUNCTION reject_selected_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='AinuokeSourceBinding' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$; CREATE TRIGGER selected_audit_guard BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_selected_audit()");
   await assert.rejects(bindOrders(pool,actor,opts),/binding_failed/);
   for(const table of ["sales_orders","sales_order_source_links","ainuoke_sales_order_contract_mirrors","ainuoke_sales_order_color_mirrors","ainuoke_source_profiles"])assert.equal(await count(table),0);
   await pool.query("DROP TRIGGER selected_audit_guard ON operation_logs; DROP FUNCTION reject_selected_audit()");
  });
  const r=await bindOrders(pool,actor,opts);
  await t.test("one of three visible orders, exact retry and explicit scoped receipt",async()=>{
   assert.equal(r.created,1);assert.equal(await count("sales_orders"),1);assert.equal(await count("ainuoke_source_runs"),0);
   const receipt=(await pool.query("SELECT metadata FROM operation_logs WHERE entity_type='AinuokeSourceBinding'")).rows[0].metadata;
   assert.equal(receipt.scope,"explicit_selected_first_binding");assert.deepEqual(receipt.selectedContracts,selected);
   const logs=await count("operation_logs");assert.equal((await bindOrders(pool,actor,opts)).replayed,true);assert.equal(await count("operation_logs"),logs);
   await pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=99");
   await assert.rejects(bindOrders(pool,actor,opts),/addition_not_exact_retry/);
   await pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=100");
   const metadata=(await pool.query("SELECT source_metadata FROM ainuoke_sales_order_color_mirrors")).rows[0].source_metadata;
   await pool.query("UPDATE ainuoke_sales_order_color_mirrors SET source_metadata=jsonb_set(source_metadata,'{quantityPendingConfirmation}','true')");
   await assert.rejects(bindOrders(pool,actor,opts),/addition_not_exact_retry/);
   await pool.query("UPDATE ainuoke_sales_order_color_mirrors SET source_metadata=$1::jsonb",[JSON.stringify(metadata)]);

  });
  await t.test("selection widening, wrong account, stale input and revoked operator cannot write",async()=>{
   const wider=additionBundle(Date.now(),3,[0,1]);const keys=Object.keys(wider.colors);const review=await previewSelectedBindings(wider,keys);
   await assert.rejects(bindOrders(pool,actor,{...opts,selected:keys,collect:async()=>wider,expectedPreview:review.reviewHash}),/binding_requires_empty_or_exact_scope/);
   await assert.rejects(bindOrders(pool,actor,{...opts,accountFingerprint:"c".repeat(64)}),/source_account_mismatch/);
   await assert.rejects(bindOrders(pool,actor,{...opts,now:()=>Date.now()+700000}));
   await assert.rejects(bindOrders(pool,actor,{...opts,collect:async()=>{await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='ainuoke.bind'");return b;}}));
   await pool.query("INSERT INTO app_role_permissions VALUES('role-server-admin','ainuoke.bind')");
   assert.equal(await count("sales_orders"),1);
  });
  await t.test("two persisted four-stream captures with full discovery and selected-only material fetch",async()=>{
   const reader=createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey:opts.sourceKey,maxAgeMs:1800000}));
   for(let cycle=0;cycle<2;cycle++){
    await captureSource(pool,actor,{sourceKey:opts.sourceKey,accountFingerprint:opts.accountFingerprint,maxAgeMs:600000,collect:async contracts=>{
     assert.deepEqual(contracts,selected);const materials=freshMaterialBundle();const discovery=additionBundle(Date.now(),3,[0]).discoveryBefore;
     materials.discoveryBefore=discovery;materials.discoveryAfter=structuredClone(discovery);return materials;
    }});
    const read=await reader(actor,{salesOrderId:r.orderIds[0]});assert.equal(read.status,200);
    if(read.status===200){assert.equal(read.body.progress.sourceStatus,"ready");for(const stream of ["purchases","inbounds","shipments","outbounds"] as const)assert.ok(read.body.progress.rows.some(row=>row[stream].length));}
   }
   assert.equal(await count("sales_orders"),1);assert.equal(await count("ainuoke_source_runs"),2);assert.equal(await count("quote_center_quotes"),0);
  });
 }finally{await pool.end();await db.stop();}
});
