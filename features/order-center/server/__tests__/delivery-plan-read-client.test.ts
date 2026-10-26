import assert from "node:assert/strict";
import test from "node:test";
import { readServerDeliveryPlans, SalesOrderServerReadError } from "../sales-order-server-client.js";
import { adaptServerSalesOrderDetail, type ServerSalesOrderDetailDto } from "../sales-order-server-model.js";

const orderId = '00000000-0000-4000-8000-000000000001';

test("plan GET preserves decimal strings, zero, null, ownership and void history without writes",async()=>{
  const dto={salesOrderId:orderId,ownership:'user_managed',version:4,sourceQuantity:null,sourceDeliveryDate:null,
    plans:[{id:'00000000-0000-4000-8000-000000000002',quantity:'9007199254740993.000000000000000001',deliveryDate:null,isDerivedDefault:false,voidedAt:'2026-10-01T00:00:00Z'},
      {id:'00000000-0000-4000-8000-000000000003',quantity:'0',deliveryDate:'2026-10-02',isDerivedDefault:true,voidedAt:null}],
    reconciliation:{dateStatus:'drift',planDates:['2026-10-02'],quantityStatus:'no_source_quantity'}};
  let count=0;
  const result=await readServerDeliveryPlans(dto.salesOrderId,{baseUrl:'https://synthetic.invalid/',fetchImpl:async(url,init)=>{
    count++;assert.equal(url,`https://synthetic.invalid/api/v1/sales-orders/${orderId}/delivery-plans`);
    assert.equal(init?.method,'GET');assert.equal(init?.credentials,'include');assert.equal(init?.cache,'no-store');assert.equal(init?.body,undefined);
    return new Response(JSON.stringify({deliveryPlanSet:dto}));
  }});
  assert.deepEqual(result,dto);assert.equal(count,1);
});
for(const status of [401,403,404,503])test(`plan read ${status} remains typed and does not retry or fall back`,async()=>{
  let count=0;
  await assert.rejects(readServerDeliveryPlans(orderId,{fetchImpl:async()=>{count++;return new Response(JSON.stringify({error:{code:'synthetic_error',message:'PRIVATE'}}),{status});}}),
    error=>error instanceof SalesOrderServerReadError&&error.status===status&&!error.message.includes('PRIVATE'));
  assert.equal(count,1);
});
test("network failure never produces an empty successful plan set",async()=>{
  let count=0;const failure=Error('synthetic unavailable');
  await assert.rejects(readServerDeliveryPlans(orderId,{fetchImpl:async()=>{count++;throw failure;}}),
    error=>error instanceof SalesOrderServerReadError&&error.status===0&&error.code==='delivery_plan_outcome_unknown');
  assert.equal(count,1);
});
test("order detail adapter preserves typed source evidence without inventing legacy evidence",()=>{
  const base: ServerSalesOrderDetailDto={id:'synthetic',version:1,orderNo:'SO-SYNTHETIC',creationSource:'ainuoke',lifecycleState:'draft',
    colors:[],salesContractNo:'PI-SYNTHETIC',insideOrderNo:'IN-SYNTHETIC',sourceLifecycleStatus:'生效',styleNo:'SYNTHETIC',
    companyName:'Synthetic',customerName:'Synthetic',brandName:'Synthetic',quantity:100,colorCount:0,
    contractDate:null,contractDeliveryDate:null,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',colorSource:{status:'not_recorded'}};
  assert.deepEqual(adaptServerSalesOrderDetail(base).colorSource,{status:'not_recorded'});
  const legacy={...base};delete legacy.colorSource;
  assert.equal(Object.hasOwn(adaptServerSalesOrderDetail(legacy),'colorSource'),false);
});
