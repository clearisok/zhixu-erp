import test from "node:test";
import assert from "node:assert/strict";
import {startContinuousFixture} from "./ainuoke-continuous-fixture.js";
import {resolve} from "node:path";
test("order alerts use persisted pending-zero colors and trusted fresh material facts",{timeout:120000},async()=>{
 const x=await startContinuousFixture(resolve("dist/client"),{orderAlerts:true});
 try{
  const unauth=await fetch(x.base+'/api/v1/sales-orders');assert.equal(unauth.status,401);
  const cookie=await x.login(x.users[0]);
  const read=async()=>{const r=await fetch(x.base+'/api/v1/sales-orders',{headers:{cookie}});assert.equal(r.status,200);assert.match(r.headers.get('cache-control')||'',/no-store/);return await r.json();};
  let queries=0;
  const originalQuery=x.pool.query;
  x.pool.query=function(this: typeof x.pool, ...args: unknown[]){queries++;return Reflect.apply(originalQuery,this,args);} as typeof x.pool.query;
  const data=await read(),item=data.salesOrders[0];
  x.pool.query=originalQuery;
  assert.ok(queries<20,`bounded batch query count: ${queries}`);
  assert.equal(item.colorCount,2);
  assert.deepEqual(item.alerts,[{code:'color_quantity_zero',count:1,pendingCount:1},{code:'material_unit_missing',count:1}]);
  for(const username of x.users.slice(1)){
   const roleCookie=await x.login(username);
   const r=await fetch(x.base+'/api/v1/sales-orders',{headers:{cookie:roleCookie}});
   assert.equal(r.status,200);assert.deepEqual((await r.json()).salesOrders[0].alerts,item.alerts);
  }
  assert.doesNotMatch(JSON.stringify(data),/purchaseUnitPrice|sourcePricing|QtyUnit|SupplierName/);
  const color=(await x.pool.query("SELECT quantity,source_metadata FROM ainuoke_sales_order_color_mirrors WHERE source_line_identity='synthetic-pending-color'")).rows[0];
  assert.equal(Number(color.quantity),0);assert.equal(color.source_metadata.sourceQuantity,null);assert.equal(color.source_metadata.quantityPendingConfirmation,true);
  x.setMode('stale');assert.deepEqual((await read()).salesOrders[0].alerts.map((a:{code:string})=>a.code),['color_quantity_zero','material_source_stale']);
  x.setMode('failed');await assert.rejects(x.capture());assert.deepEqual((await read()).salesOrders[0].alerts.map((a:{code:string})=>a.code),['color_quantity_zero','material_source_unavailable']);
  x.setMode('ready');await x.capture();assert.ok((await read()).salesOrders[0].alerts.some((a:{code:string})=>a.code==='material_unit_missing'));
  await assert.rejects(x.pool.query("UPDATE ainuoke_material_source_snapshots SET content_hash=$1",['0'.repeat(64)]),(error:unknown)=>(error as {code?:string}).code==='23514');
  assert.deepEqual((await read()).salesOrders[0].alerts.map((a:{code:string})=>a.code),['color_quantity_zero','material_unit_missing']);
  await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='style_progress.read'");
  assert.deepEqual((await read()).salesOrders[0].alerts.map((a:{code:string})=>a.code),['color_quantity_zero']);
  assert.deepEqual(x.errors,[]);
 }finally{await x.close();}
});
