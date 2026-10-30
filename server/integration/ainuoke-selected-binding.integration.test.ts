import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {resolve} from "node:path";
import pg from "pg";
import {startDisposablePostgres} from "./postgres-container.js";
import {runMigrations} from "../db/migration-runner.js";
import {synchronizePermissionCatalog} from "../auth/permissions.js";
import {bootstrapAdmin} from "../auth/bootstrap.js";
import {loadExistingBootstrapActor} from "../sales-orders/bootstrap-runner.js";
import {bindOrders,previewSelectedBindings} from "../ainuoke-source/binding.js";
import {addOrders,previewAdditions,readBoundIdentities} from "../ainuoke-source/additions.js";
import {additionBundle,freshMaterialBundle} from "./ainuoke-binding-fixture.js";
import {captureSource} from "../ainuoke-source/service.js";
import {createPersistedMaterialPorts} from "../ainuoke-source/reader.js";
import {createOrderMaterialReader} from "../../features/ainuoke-material-progress/read-service.js";
import {createApp} from "../app.js";
import {hash} from "../ainuoke-source/contract.js";

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
  const materialPorts=createPersistedMaterialPorts(pool,{sourceKey:opts.sourceKey,maxAgeMs:1800000});
  const materialReader=createOrderMaterialReader(materialPorts);
  await t.test("trusted first binding without a material capture returns an honest unconnected state",async()=>{
   const before=await count("ainuoke_source_runs");
   const result=await materialReader(actor,{salesOrderId:r.orderIds[0]});assert.equal(result.status,200);
   if(result.status===200){assert.equal(result.body.provenance,"not_connected");assert.equal(result.body.progress.sourceStatus,"not_connected");assert.deepEqual(result.body.progress.rows,[]);assert.deepEqual(result.body.progress.groups,[]);}
   assert.equal(await count("ainuoke_source_runs"),before);
   assert.equal((await materialReader(actor,{salesOrderId:randomUUID()})).status,404);
   const server=createServer(createApp({pool,orderMaterialRead:materialPorts,allowedOrigins:["http://127.0.0.1"],security:{secureCookies:false,sessionTtlSeconds:3600}}));
   try{
    await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));const address=server.address();assert.ok(address&&typeof address==="object");const base="http://127.0.0.1:"+address.port;
    const login=await fetch(base+"/api/v1/auth/login",{method:"POST",headers:{Origin:"http://127.0.0.1","Content-Type":"application/json","X-Zhixu-Request":"1"},body:JSON.stringify({username:actor.username,password:"Synthetic-Selected-Only"})});assert.equal(login.status,200);
    const cookie=login.headers.get("set-cookie")!.split(";")[0],path="/api/v1/sales-orders/"+r.orderIds[0]+"/material-progress";
    assert.equal((await fetch(base+path)).status,401);
    const response=await fetch(base+path,{headers:{Cookie:cookie}});assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
    const body=await response.json();assert.equal(body.progress.sourceStatus,"not_connected");assert.deepEqual(body.progress.rows,[]);assert.deepEqual(body.progress.groups,[]);
    assert.equal((await fetch(base+path+"?contract=OTHER",{headers:{Cookie:cookie}})).status,400);
   }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
  });
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
  await t.test("a newly admitted contract does not borrow the old order snapshot or appear missing",async()=>{
   const addition=additionBundle(Date.now(),3,[1]),contracts=Object.keys(addition.colors);
   const preview=await previewAdditions(addition,contracts,await readBoundIdentities(pool));
   const added=await addOrders(pool,actor,{sourceKey:opts.sourceKey,accountFingerprint:opts.accountFingerprint,selected:contracts,expectedPreview:preview.reviewHash,collect:async()=>addition});
   const second=added.orderIds[0];
   const tables=["sales_orders","ainuoke_source_runs","ainuoke_material_source_snapshots","operation_logs"],counts=await Promise.all(tables.map(count));
   const empty=await materialReader(actor,{salesOrderId:second});assert.equal(empty.status,200);
   if(empty.status===200){assert.equal(empty.body.salesOrderId,second);assert.equal(empty.body.provenance,"not_connected");assert.equal(empty.body.progress.sourceStatus,"not_connected");assert.deepEqual(empty.body.progress.rows,[]);assert.deepEqual(empty.body.progress.groups,[]);}
   const existing=await materialReader(actor,{salesOrderId:r.orderIds[0]});assert.equal(existing.status,200);
   if(existing.status===200){assert.equal(existing.body.progress.sourceStatus,"ready");assert.ok(existing.body.progress.rows.length);}
   assert.deepEqual(await Promise.all(tables.map(count)),counts);
   for(const kind of ["bad_hash","incomplete_discovery"]){
    const damaged=new Proxy(pool,{get(target,property){
     if(property==="connect")return async()=>{
      const client=await target.connect();return new Proxy(client,{get(current,member){
       if(member==="query")return async(...args:unknown[])=>{
        const result=await(current.query as(...values:unknown[])=>Promise<{rows:Record<string,unknown>[]}>) (...args);
        return {...result,rows:result.rows.map(row=>{
         if(!Array.isArray(row.discovery))return row;
         const discovery=structuredClone(row.discovery);if(kind==="incomplete_discovery")discovery[0].total++;
         return {...row,discovery,discovery_hash:kind==="bad_hash"?"0".repeat(64):hash(discovery)};
        })};
       };
       const value=Reflect.get(current,member);return typeof value==="function"?value.bind(current):value;
      }});
     };
     const value=Reflect.get(target,property);return typeof value==="function"?value.bind(target):value;
    }});
    const guarded=createOrderMaterialReader(createPersistedMaterialPorts(damaged,{sourceKey:opts.sourceKey,maxAgeMs:1800000}));
    assert.equal((await guarded(actor,{salesOrderId:second})).status,503,kind+" must not become an unconnected success");
   }
   assert.deepEqual(await Promise.all(tables.map(count)),counts);
   try{await pool.query("UPDATE app_users SET active=false WHERE id=$1",[actor.internalUserId]);assert.notEqual((await materialReader(actor,{salesOrderId:second})).status,200);}
   finally{await pool.query("UPDATE app_users SET active=true WHERE id=$1",[actor.internalUserId]);}
   try{await pool.query("UPDATE ainuoke_source_profiles SET enabled=false WHERE source_key=$1",[opts.sourceKey]);assert.equal((await materialReader(actor,{salesOrderId:second})).status,404);}
   finally{await pool.query("UPDATE ainuoke_source_profiles SET enabled=true WHERE source_key=$1",[opts.sourceKey]);}
   const missing=freshMaterialBundle(),discovery=additionBundle(Date.now(),3,[0]).discoveryBefore;
   discovery[0].rows=discovery[0].rows.filter(row=>row.values.BillNo!==contracts[0]);discovery[0].total=discovery[0].rows.length;
   missing.discoveryBefore=discovery;missing.discoveryAfter=structuredClone(discovery);
   await captureSource(pool,actor,{sourceKey:opts.sourceKey,accountFingerprint:opts.accountFingerprint,maxAgeMs:600000,collect:async()=>missing});
   assert.equal((await materialReader(actor,{salesOrderId:second})).status,404);
   assert.equal(await count("sales_orders"),2);assert.equal(await count("ainuoke_material_source_snapshots"),3);
  });
 }finally{await pool.end();await db.stop();}
});
