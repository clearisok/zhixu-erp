import { getSalesOrderById, listSalesOrders } from "../sales-orders/repository.js";
import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { bindOrders,previewBindings } from "../ainuoke-source/binding.js";
import { bindingBundle,freshMaterialBundle } from "./ainuoke-binding-fixture.js";
import { captureSource } from "../ainuoke-source/service.js";
import { createPersistedMaterialPorts } from "../ainuoke-source/reader.js";
import { createOrderMaterialReader } from "../../features/ainuoke-material-progress/read-service.js";

test("first binding from empty disposable ledger then multiple persisted collection cycles", {timeout:120000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase("source_binding")});
 try{
  await runMigrations(pool,resolve("database/migrations"));await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:"synthetic.binding",displayName:"合成绑定员",password:"Synthetic-Binding-Only"});
  const actor=await loadExistingBootstrapActor(pool,"synthetic.binding");
  const count=async(table:string)=>(await pool.query("SELECT count(*)::int n FROM "+table)).rows[0].n;
  const opts={sourceKey:"first-team",accountFingerprint:"a".repeat(64)};
  await t.test("preview is read-only and changed review prevents all orders",async()=>{
   const before=await count("operation_logs");await previewBindings(bindingBundle());
   assert.equal(await count("sales_orders"),0);assert.equal(await count("ainuoke_source_profiles"),0);assert.equal(await count("operation_logs"),before);
   await assert.rejects(bindOrders(pool,actor,{...opts,expectedPreview:"b".repeat(64),collect:async()=>bindingBundle()}),/binding_preview_changed/);
   assert.equal(await count("sales_orders"),0);
  });
  await t.test("late audit failure rolls back every order, binding, mirror and profile",async()=>{
   await pool.query("CREATE FUNCTION reject_binding_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='AinuokeSourceBinding' THEN RAISE EXCEPTION 'synthetic late failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER binding_audit_guard BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_binding_audit()");
   const b=bindingBundle(Date.now(),2);const p=await previewBindings(b);
   await assert.rejects(bindOrders(pool,actor,{...opts,expectedPreview:p.reviewHash,collect:async()=>b}),/binding_failed/);
   for(const table of ["sales_orders","sales_order_source_links","ainuoke_sales_order_contract_mirrors","ainuoke_source_profiles"])assert.equal(await count(table),0);
   await pool.query("DROP TRIGGER binding_audit_guard ON operation_logs; DROP FUNCTION reject_binding_audit()");
  });
  const b=bindingBundle();const p=await previewBindings(b);
  const result=await bindOrders(pool,actor,{...opts,expectedPreview:p.reviewHash,collect:async()=>b});
  await t.test("formal sequence/UUID/colors preserved; retry has no duplicate log or order",async()=>{
   assert.equal(result.created,1);const logs=await count("operation_logs");
   const again=await bindOrders(pool,actor,{...opts,expectedPreview:p.reviewHash,collect:async()=>bindingBundle()});
   assert.deepEqual(again.orderIds,result.orderIds);assert.equal(again.replayed,true);assert.equal(await count("operation_logs"),logs);
   assert.match((await pool.query("SELECT order_no FROM sales_orders")).rows[0].order_no,/^SO-\d{8}$/);
   assert.equal(await count("ainuoke_sales_order_color_mirrors"),1);
  });
  await t.test("SQL calendar dates do not shift in Shanghai, UTC or Los Angeles",async()=>{
   const old=process.env.TZ;
   try{for(const tz of ["Asia/Shanghai","UTC","America/Los_Angeles"]){process.env.TZ=tz;const detail=await getSalesOrderById(pool,result.orderIds[0]);assert.equal(detail?.contractDate,"2026-10-01");assert.equal(detail?.contractDeliveryDate,"2026-11-01");assert.equal(detail?.colors[0].deliveryDate,"2026-11-01");const list=await listSalesOrders(pool,{limit:10,offset:0});assert.equal(list.items[0].contractDeliveryDate,"2026-11-01");}}
   finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
  });
  await t.test("another account/source, partial old ledger and unauthorized operator cannot bind",async()=>{
   for(const change of [{accountFingerprint:"b".repeat(64)},{sourceKey:"another-source"}])await assert.rejects(bindOrders(pool,actor,{...opts,...change,expectedPreview:p.reviewHash,collect:async()=>b}),/source_account_mismatch/);
   const other=bindingBundle(Date.now(),2);await assert.rejects(bindOrders(pool,actor,{...opts,expectedPreview:(await previewBindings(other)).reviewHash,collect:async()=>other}),/binding_requires_empty_or_exact_scope/);
   await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='ainuoke.bind'");
   await assert.rejects(bindOrders(pool,actor,{...opts,expectedPreview:p.reviewHash,collect:async()=>b}));
   await pool.query("INSERT INTO app_role_permissions VALUES('role-server-admin','ainuoke.bind')");
  });
  await t.test("reviewed source changes cannot masquerade as an idempotent first binding",async()=>{
   const changed=bindingBundle();changed.discoveryBefore[0].rows[0].values.Num=200;changed.discoveryAfter=structuredClone(changed.discoveryBefore);
   await assert.rejects(bindOrders(pool,actor,{...opts,expectedPreview:(await previewBindings(changed)).reviewHash,collect:async()=>changed}),/binding_not_exact_retry/);
   assert.equal((await pool.query("SELECT quantity::int FROM ainuoke_sales_order_contract_mirrors")).rows[0].quantity,100);
  });
  await t.test("permission removed during collection stops publication",async()=>{
   await assert.rejects(bindOrders(pool,actor,{...opts,expectedPreview:p.reviewHash,collect:async()=>{
     await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='ainuoke.bind'");return b;
   }}),/binding_failed/);
   await pool.query("INSERT INTO app_role_permissions VALUES('role-server-admin','ainuoke.bind')");
  });
  await t.test("first bound orders immediately read repeated four-stream snapshots; failure and recovery honest",async()=>{
   const reader=createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey:opts.sourceKey,maxAgeMs:1800000}));
   const read=()=>reader(actor,{salesOrderId:result.orderIds[0]});
   const capture=(fail=false)=>captureSource(pool,actor,{...opts,maxAgeMs:600000,collect:async()=>{if(fail)throw Error("synthetic outage");return freshMaterialBundle();}});
   await capture();const first=await read();assert.equal(first.status,200);
   if(first.status===200)for(const key of ["purchases","inbounds","shipments","outbounds"] as const)assert.ok(first.body.progress.rows.some(r=>r[key].length));
   await assert.rejects(capture(true));const failed=await read();assert.equal(failed.status,200);
   if(first.status===200&&failed.status===200){
    assert.equal(failed.body.progress.sourceStatus,"source_failed");
    assert.equal(failed.body.progress.fetchedAt,first.body.progress.fetchedAt);
    assert.deepEqual(failed.body.progress.rows.map(r=>r.demand),first.body.progress.rows.map(r=>r.demand));
    for(const key of ["purchases","inbounds","shipments","outbounds"] as const)
     assert.deepEqual(failed.body.progress.rows.map(r=>r[key]),first.body.progress.rows.map(r=>r[key]));
   }
   await capture();const recovered=await read();assert.equal(recovered.status,200);if(recovered.status===200)assert.equal(recovered.body.progress.sourceStatus,"ready");
   assert.equal(await count("sales_orders"),1);assert.equal(await count("quote_center_quotes"),0);assert.equal(await count("app_users"),1);
  });
 }finally{await pool.end();await db.stop();}
});
