import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { startContinuousFixture } from "./ainuoke-continuous-fixture.js";
import { getSalesOrderById, listSalesOrders } from "../sales-orders/repository.js";
import { readDeliveryPlanSet } from "../sales-orders/delivery-plan-repository.js";
import type { SalesOrderDetailReadModel } from "../sales-orders/model.js";

test("trusted saved contract, color sizes, materials and owned plans stay separate", {timeout:180000}, async t => {
  const x = await startContinuousFixture(resolve("dist/client"), {orderAlerts:true});
  t.after(x.close);
  const cookie = await x.login(x.users[0]);
  const path = `/api/v1/sales-orders/${x.orderId}`;
  const read = async (suffix = "", auth = cookie) => fetch(x.base + path + suffix, {headers:{cookie:auth}});
  const detail = async (): Promise<SalesOrderDetailReadModel> => {
    const response=await read(); assert.equal(response.status,200);
    assert.match(response.headers.get("cache-control") ?? "",/no-store/);
    return (await response.json()).salesOrder;
  };
  const stored=(await x.pool.query("SELECT source_line_identity,quantity::text,source_metadata FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1 AND color_name='蓝色'",[x.orderId])).rows[0];
  const patchColor = async (metadata:unknown, run:()=>Promise<void>, quantity=stored.quantity) => {
    await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET source_metadata=$3,quantity=$4 WHERE sales_order_id=$1 AND source_line_identity=$2",[x.orderId,stored.source_line_identity,metadata,quantity]);
    try{await run();}finally{await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET source_metadata=$3,quantity=$4 WHERE sales_order_id=$1 AND source_line_identity=$2",[x.orderId,stored.source_line_identity,stored.source_metadata,stored.quantity]);}
  };

  await t.test("persisted BillNo identity reaches exact colors and recorded size slots, with no raw metadata",async()=>{
    const before=(await x.pool.query("SELECT row_to_json(c) row FROM ainuoke_sales_order_color_mirrors c WHERE sales_order_id=$1 ORDER BY source_line_identity",[x.orderId])).rows;
    const data=await detail();
    assert.equal(data.businessType,"ainuoke_contract");assert.ok(data.salesContractNo);
    assert.equal(data.colorSource.status,"recorded");
    if(data.colorSource.status==='recorded'){
      assert.equal(data.colorSource.colorDetailStatus,"usable");assert.equal(data.colorSource.reportId,"6087105");
      assert.ok(data.colorSource.savedSourceBatchAt);assert.equal(Object.hasOwn(data.colorSource,"expiresAt"),false);
    }
    const blue=data.colors.find(row=>row.colorName==='蓝色')!;
    assert.equal(blue.quantity,100);assert.equal(blue.sizeEvidence.status,'available');
    if(blue.sizeEvidence.status==='available') assert.deepEqual(blue.sizeEvidence.allocations,[{slot:1,sizeName:'M',quantity:40},{slot:2,sizeName:'L',quantity:60}]);
    const pending=data.colors.find(row=>row.colorName==='合成待定颜色')!;
    assert.equal(pending.quantity,0);assert.equal(pending.sizeEvidence.status,'available');
    if(pending.sizeEvidence.status==='available'){assert.equal(pending.sizeEvidence.sourceQuantity,null);assert.equal(pending.sizeEvidence.quantityPendingConfirmation,true);}
    assert.doesNotMatch(JSON.stringify(data),/sourceMetadata|snapshotHash|sourceHash|sizeEvidence.*password/);
    const materialResponse=await read('/material-progress');assert.equal(materialResponse.status,200);
    const material=await materialResponse.json();assert.equal(material.salesOrderId,x.orderId);
    assert.equal(material.progress.order.salesContractNo,data.salesContractNo);assert.equal(material.provenance,'server_snapshot');
    const planResponse=await read('/delivery-plans');assert.equal(planResponse.status,200);
    assert.match(planResponse.headers.get('cache-control')??'',/no-store/);
    const plan=(await planResponse.json()).deliveryPlanSet;
    assert.equal(plan.salesOrderId,x.orderId);assert.equal(plan.sourceQuantity,'100');assert.equal(plan.plans[0].quantity,'100');
    assert.equal(plan.ownership,'source_derived');assert.equal(plan.plans[0].deliveryDate,data.contractDeliveryDate);
    assert.deepEqual((await x.pool.query("SELECT row_to_json(c) row FROM ainuoke_sales_order_color_mirrors c WHERE sales_order_id=$1 ORDER BY source_line_identity",[x.orderId])).rows,before);
  });

  await t.test("all seven existing roles read sizes; no commercial access is needed and injected prices never leak",async()=>{
    await patchColor({...stored.source_metadata,secretPrice:12345,sourceHash:'private',credentials:{password:'private'},
      sizeAllocations:stored.source_metadata.sizeAllocations.map((row:object)=>({...row,garmentPrice:'private'}))},async()=>{
      for(const username of x.users){
        const response=await read('',await x.login(username));assert.equal(response.status,200);
        const data=(await response.json()).salesOrder;
        assert.equal(data.colors.find((row:{colorName:string})=>row.colorName==='蓝色').sizeEvidence.status,'available');
        assert.doesNotMatch(JSON.stringify(data),/secretPrice|garmentPrice|credentials|private|sourceHash/);
      }
    });
  });

  await t.test("malformed, oversized, unsupported or foreign-contract evidence keeps its color and quantity",async()=>{
    const cases=[{}, {...stored.source_metadata,reportId:'6087050'}, {...stored.source_metadata,salesContractNo:'PI-FOREIGN'},
      {...stored.source_metadata,sizeAllocations:[{slot:1,sizeName:'M',quantity:-1}]},
      {...stored.source_metadata,sizeRule:'M'.repeat(16385)}];
    for(const [index,value] of cases.entries()) await patchColor(value,async()=>{
      const data=await detail(),blue=data.colors.find(row=>row.colorName==='蓝色')!;
      assert.equal(data.colors.length,2);assert.equal(blue.quantity,100);
      assert.equal(blue.sizeEvidence.status,index===0?'not_recorded':'invalid');assert.equal(data.quantity,100);
    });
    await patchColor(stored.source_metadata,async()=>{
      const blue=(await detail()).colors.find(row=>row.colorName==='蓝色')!;
      assert.equal(blue.quantity,101);assert.deepEqual(blue.sizeEvidence,{status:'invalid',reason:'quantity_changed'});
    },'101');
  });

  await t.test("empty colors retain missing/invalid versus legacy absent source evidence without raw rows",async()=>{
    const client=await x.pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('DELETE FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1',[x.orderId]);
      for(const status of ['missing','invalid']){
        await client.query("UPDATE ainuoke_sales_order_contract_mirrors SET source_metadata=jsonb_set(source_metadata,'{colorDetail,status}',to_jsonb($2::text)) WHERE sales_order_id=$1",[x.orderId,status]);
        const data=await getSalesOrderById(client,x.orderId);assert.equal(data?.colors.length,0);
        assert.equal(data?.colorSource.status,'recorded');
        if(data?.colorSource.status==='recorded')assert.equal(data.colorSource.colorDetailStatus,status);
      }
      await client.query("UPDATE ainuoke_sales_order_contract_mirrors SET source_metadata=source_metadata-'colorDetail' WHERE sales_order_id=$1",[x.orderId]);
      assert.deepEqual((await getSalesOrderById(client,x.orderId))?.colorSource,{status:'not_recorded'});
    }finally{await client.query('ROLLBACK');client.release();}
  });

  await t.test("source identity mismatch cannot appear as trusted sizes or a plan comparison, but owned plans survive",async()=>{
    const client=await x.pool.connect();
    try{
      await client.query('BEGIN');
      // Construct an invalid initial association in this disposable transaction.
      // Existing observation identities cannot be changed (0022); never disable that trigger.
      const id=(await client.query("INSERT INTO sales_orders(creation_source) VALUES('ainuoke') RETURNING id::text")).rows[0].id;
      await client.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id,sales_contract_no) VALUES($1,'ainuoke','sales_contract','SYNTHETIC-EXPECTED-ID','SYNTHETIC-UNTRUSTED')",[id]);
      await client.query(`INSERT INTO ainuoke_sales_order_contract_mirrors(sales_order_id,source_id,source_row_identity,sales_contract_no,inside_order_no,lifecycle_status_raw,contract_date,contract_delivery_date,style_no,company_name_snapshot,customer_name_snapshot,brand_name_snapshot,quantity,source_hash,fetched_at,source_metadata)
        SELECT $2,'SYNTHETIC-WRONG-ID','synthetic-wrong-row','SYNTHETIC-UNTRUSTED',inside_order_no,lifecycle_status_raw,contract_date,contract_delivery_date,style_no,company_name_snapshot,customer_name_snapshot,brand_name_snapshot,quantity,source_hash,fetched_at,source_metadata
        FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1`,[x.orderId,id]);
      await client.query("UPDATE sales_order_delivery_plan_sets SET ownership='user_managed',version=version+1 WHERE sales_order_id=$1",[id]);
      const ownPlan=(await client.query("INSERT INTO sales_order_delivery_plans(sales_order_id,delivery_date,quantity) VALUES($1,'2026-12-01',10) RETURNING id::text",[id])).rows[0].id;
      const data=await getSalesOrderById(client,id);
      assert.deepEqual(data?.colorSource,{status:'invalid',reason:'untrusted_source'});
      const after=await readDeliveryPlanSet(client,id);
      assert.equal(after.plans.find(row=>row.id===ownPlan)?.quantity,'10');assert.equal(after.ownership,'user_managed');
      assert.equal(after.sourceQuantity,null);assert.equal(after.sourceDeliveryDate,null);
      assert.equal(after.reconciliation.quantityStatus,'no_source_quantity');
    }finally{await client.query('ROLLBACK');client.release();}
  });

  await t.test("extra unmatched historical link neither duplicates the order nor hides the trusted plan source",async()=>{
    const client=await x.pool.connect();
    try{
      await client.query('BEGIN');
      const before=await getSalesOrderById(client,x.orderId),plans=await readDeliveryPlanSet(client,x.orderId);
      await client.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id,sales_contract_no) VALUES($1,'ainuoke','sales_contract','SYNTHETIC-EXTRA-ID','SYNTHETIC-EXTRA-BILL')",[x.orderId]);
      const after=await getSalesOrderById(client,x.orderId);
      assert.deepEqual(after,before);
      assert.deepEqual(await readDeliveryPlanSet(client,x.orderId),plans);
      const list=await listSalesOrders(client,{limit:20,offset:0});assert.equal(list.total,1);assert.equal(list.items.length,1);
      assert.equal(list.items[0].salesContractNo,before?.salesContractNo);
    }finally{await client.query('ROLLBACK');client.release();}
  });

  await t.test("order detail retains one RR source snapshot across a concurrent quantity/size refresh",async()=>{
    let releaseRead!:()=>void, reachedRead!:()=>void;
    const held=new Promise<void>(done=>{releaseRead=done;}),reached=new Promise<void>(done=>{reachedRead=done;});
    const reader={connect:async()=>{
      const client=await x.pool.connect();return {release:()=>client.release(),query:async(text:string,values?:unknown[])=>{
        if(text.startsWith('SELECT so.*,')){reachedRead();await held;}
        return client.query(text,values);
      }};
    }} as unknown as Pool;
    const reading=getSalesOrderById(reader,x.orderId);void reading.catch(()=>undefined);
    try{
      await Promise.race([reached,reading.then(()=>{throw Error('read barrier not reached');})]);
      const next={...stored.source_metadata,sourceQuantity:101,sizeAllocations:[{slot:1,sizeName:'M',quantity:41},{slot:2,sizeName:'L',quantity:60}]};
      await patchColor(next,async()=>{
        releaseRead();const old=await reading;
        assert.ok(old);
        const oldBlue=old.colors.find(row=>row.colorName==='蓝色');assert.ok(oldBlue);
        assert.equal(oldBlue.quantity,100);assert.equal(oldBlue.sizeEvidence.status,'available');
        if(oldBlue.sizeEvidence.status==='available')assert.equal(oldBlue.sizeEvidence.allocations[0].quantity,40);
        const current=(await detail()).colors.find(row=>row.colorName==='蓝色')!;
        assert.equal(current.quantity,101);assert.equal(current.sizeEvidence.status,'available');
        if(current.sizeEvidence.status==='available')assert.equal(current.sizeEvidence.allocations[0].quantity,41);
      },'101');
    }finally{releaseRead();await reading;}
  });

  await t.test("session, permission revocation, absent ID and malformed plan ID fail closed",async()=>{
    assert.equal((await read('','')).status,401);assert.equal((await read('/delivery-plans','')).status,401);
    for(const suffix of ['', '/delivery-plans'])assert.equal((await fetch(x.base+`/api/v1/sales-orders/${randomUUID()}${suffix}`,{headers:{cookie}})).status,404);
    assert.equal((await fetch(x.base+'/api/v1/sales-orders/not-a-uuid/delivery-plans',{headers:{cookie}})).status,400);
    const materialCookie=await x.login('demo.material');
    await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='role-team-material-manager' AND permission_key='order.view'");
    try{
      assert.equal((await read('',materialCookie)).status,403);assert.equal((await read('/delivery-plans',materialCookie)).status,403);
    }finally{await x.pool.query("INSERT INTO app_role_permissions VALUES('role-team-material-manager','order.view')");}
  });
  assert.deepEqual(x.errors,[]);
});
