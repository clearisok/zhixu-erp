import assert from "node:assert/strict";
import test from "node:test";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { appendOperationLog } from "../operation-logs/repository.js";

test("HTTP commercial grants protect historical aggregate, save, list, export and logs",async t=>{
 const x=await startCommercialSecurityFixture(undefined,q=>{for(const r of q.revisions){r.baseInfo.quoteStyleNo="SYNTHETIC";r.baseInfo.styleName="Synthetic";for(const pv of r.priceVersions){pv.quantity=100;pv.trims.forEach(line=>line.usage=0);pv.pricingParameters.laborCurrency="USD";}}});t.after(x.close);
 const base=["quote.view","quote.edit","quote.cost.view","estimate.view","quote.export","audit_log.view","order.view","order.edit"] as const;
 const restricted=await x.user("cost-only-surfaces",[...base]);
 const sale=await x.user("sale-only-surfaces",[...base,"quote.confirm","commercial.sale.view","commercial.sale.edit"]);
 const labor=await x.user("labor-only-surfaces",[...base,"commercial.labor.view"]);
 const repo=createQuoteRepository(x.pool);
 await t.test("history fields are independently absent, cost and Estimate remain readable",async()=>{
  for(const [cookie,canSale,canLabor] of [[restricted,false,false],[sale,true,false],[labor,false,true]] as const){
   const result=await x.request(x.quotePath,cookie);assert.equal(result.response.status,200);
   assert.ok(result.body.quote.quote.activeEstimateCost);assert.equal(result.body.quote.quote.revisions[0].priceVersions[0].labor.value,"98765");
   const c=result.body.quote.quote.revisions[0].priceVersions[0].confirmation;
   assert.equal(Object.hasOwn(c,"confirmedGarmentPrice"),canSale);
   assert.equal(Object.hasOwn(c,"quotedGarmentPrice"),canSale);
   assert.equal(Object.hasOwn(c,"confirmedLaborPrice"),canLabor);
  }
 });
 await t.test("restricted metadata save retains exact history; hidden null injection is rejected",async()=>{
  const before=await repo.getById(x.record.quote.id);
  const read=await x.request(x.quotePath,restricted);const input=read.body.quote.quote;
  delete input.activeEstimateCost;delete input.estimateCostHistory;
  input.revisions.find((r:{revisionId:string})=>r.revisionId===input.defaultRevisionId).baseInfo.note="safe metadata edit";
  const result=await x.request(x.quotePath,restricted,{quote:input,expectedVersion:read.body.quote.version},"PUT");
  assert.equal(result.response.status,200,result.text);
  const after=await repo.getById(x.record.quote.id);
  assert.deepEqual(after!.quote.revisions.map(r=>r.priceVersions),before!.quote.revisions.map(r=>r.priceVersions));
  input.revisions[0].priceVersions[0].confirmation.confirmedLaborPrice=null;
  const denied=await x.request(x.quotePath,restricted,{quote:input,expectedVersion:after!.version},"PUT");
  assert.equal(denied.response.status,403,denied.text);assert.deepEqual(await repo.getById(x.record.quote.id),after);
 });
 await t.test("customer workbook rejects insufficient commercial grants before building",async()=>{
  const saved=(await repo.getById(x.record.quote.id))!;const r=saved.quote.revisions.at(-1)!;
  const result=await x.request(`${x.quotePath}/customer-export`,restricted,{expectedVersion:saved.version,revisionId:r.revisionId,priceVersionIds:[r.priceVersions[0].id]},"POST");
  assert.equal(result.response.status,403,result.text);
  assert.equal((await x.request("/api/v1/quotes/customer-batch-export",restricted,{items:[{quoteId:saved.quote.id,expectedVersion:saved.version}]},"POST")).response.status,403);
  for(const field of ["confirmedLabor","confirmedGarment","garmentPrice"]){
   assert.equal((await x.request(`/api/v1/quotes?columns=${field}`,restricted)).response.status,403);
   assert.equal((await x.request("/api/v1/quotes/internal-summary",restricted,{items:[{quoteId:saved.quote.id,expectedVersion:saved.version}],columns:[field],rowMode:"quote",estimateColumns:[]},"POST")).response.status,403);
  }
 });
 await t.test("sales-minus-Estimate export requires sale.view before reading/building or logging",async()=>{
  const saved=(await repo.getById(x.record.quote.id))!;
  const logs=(await x.pool.query("SELECT count(*)::int n FROM operation_logs")).rows[0].n;
  const result=await fetch(x.base+"/api/v1/quotes/internal-summary",{method:"POST",headers:{Cookie:restricted,Origin:"http://127.0.0.1","X-Zhixu-Request":"1","Content-Type":"application/json"},body:JSON.stringify({items:[{quoteId:saved.quote.id,expectedVersion:saved.version}],columns:["quote"],rowMode:"quote",estimateColumns:["estimateDifference"]})});
  assert.equal(result.status,403,"protected derived export must reject, not deliver XLSX bytes");
  assert.equal((await x.pool.query("SELECT count(*)::int n FROM operation_logs")).rows[0].n,logs);
  for (const [cookie,field] of [[restricted,"estimateTotal"],[sale,"estimateDifference"]] as const) {
   const allowed=await fetch(x.base+"/api/v1/quotes/internal-summary",{method:"POST",headers:{Cookie:cookie,Origin:"http://127.0.0.1","X-Zhixu-Request":"1","Content-Type":"application/json"},body:JSON.stringify({items:[{quoteId:saved.quote.id,expectedVersion:saved.version}],columns:["quote"],rowMode:"quote",estimateColumns:[field]})});
   assert.equal(allowed.status,200,field+" retains authorized export");
   assert.match(allowed.headers.get("content-type")!,/spreadsheetml/);
   assert.ok((await allowed.arrayBuffer()).byteLength>1000);
  }
 });
 await t.test("CCT audit persists full facts but HTTP strips hidden amounts",async()=>{
  const actor=(await x.pool.query("SELECT id::text,public_id,username,display_name FROM app_users WHERE username='sale-only-surfaces'")).rows[0];
  await appendOperationLog(x.pool,{internalUserId:actor.id,userId:actor.public_id,username:actor.username,userName:actor.display_name,permissions:[]},{module:"报价中心",action:"保存报价",entityType:"Quote",entityId:x.record.quote.id,quoteId:x.record.quote.id,metadata:{nested:{garmentSellingPrice:"314159.26",garmentPrice:"271828.18",finalQuote:"161803.39"}},changes:[{field:"priceVersion.garmentSellingPrice",beforeValue:"314159.26",afterValue:"161803.39"}]});
  assert.equal((await x.request(x.quoteTermsPath,sale,{expectedQuoteVersion:(await repo.getById(x.record.quote.id))!.version,expectedVersion:1,customerConfirmedPrice:"23456"},"PATCH")).response.status,200);
  const result=await x.request("/api/v1/operation-logs",restricted);assert.equal(result.response.status,200,result.text);
  assert.equal(/12345|23456|67890|314159\.26|271828\.18|161803\.39/.test(result.text),false);
  const withSale=await x.request("/api/v1/operation-logs",sale);assert.equal(withSale.text.includes("23456"),true);assert.equal(withSale.text.includes("67890"),false);
  assert.equal(withSale.text.includes("314159.26"),true,"authorized derived audit remains readable");
 });
 await t.test("revoking grants affects existing session reads and writes without account changes",async()=>{
  await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='sale-only-surfaces' AND permission_key='commercial.sale.view'");
  const read=await x.request(x.orderPath,sale);
  assert.equal(read.response.status,200);assert.equal(read.text.includes("23456"),false);assert.equal(read.response.headers.get("cache-control"),"no-store");
  const before=(await x.pool.query("SELECT * FROM confirmed_commercial_terms")).rows;
  const write=await x.request(x.quoteTermsPath,sale,{expectedQuoteVersion:(await repo.getById(x.record.quote.id))!.version,expectedVersion:2,customerConfirmedPrice:null},"PATCH");
  assert.equal(write.response.status,403);assert.deepEqual((await x.pool.query("SELECT * FROM confirmed_commercial_terms")).rows,before);
 });
});

test("Quote PATCH permits independent null/zero fields, preserves snapshots and requires both CAS tokens",async t=>{
 const x=await startCommercialSecurityFixture();t.after(x.close);const repo=createQuoteRepository(x.pool);
 const q=structuredClone(x.record.quote),r=q.revisions.find(v=>v.revisionId===q.defaultRevisionId)!;
 r.baseInfo.quoteStyleNo="SYNTHETIC-CCT";r.baseInfo.styleName="Synthetic";
 r.priceVersions[0].pricingParameters.laborCurrency="USD";
 for(const trim of r.priceVersions[0].trims)trim.usage="0";
 const saved=await repo.save(q,x.record.version);
 const sale=await x.user("quote-sale",["quote.view","quote.confirm","commercial.sale.view","commercial.sale.edit"]);
 const labor=await x.user("quote-labor",["quote.view","quote.confirm","commercial.labor.view","commercial.labor.edit"]);
 let result=await x.request(x.quoteTermsPath,sale,{expectedVersion:1,expectedQuoteVersion:saved.version,customerConfirmedPrice:null},"PATCH");
 assert.equal(result.response.status,200,result.text);assert.equal(result.body.confirmedCommercialTerms.current.sale.value.price,null);
 assert.equal(result.body.confirmedCommercialTerms.current.labor.visibility,"restricted");
 result=await x.request(x.quoteTermsPath,labor,{expectedVersion:2,expectedQuoteVersion:saved.version,confirmedLaborPrice:null},"PATCH");
 assert.equal(result.response.status,200,result.text);assert.equal(result.body.confirmedCommercialTerms.current.labor.value.price,null);
 result=await x.request(x.quoteTermsPath,labor,{expectedVersion:3,expectedQuoteVersion:saved.version,confirmedLaborPrice:"0"},"PATCH");
 assert.equal(result.response.status,200,result.text);assert.equal(result.body.confirmedCommercialTerms.current.labor.value.price,"0");
 assert.equal((await x.request(x.quoteTermsPath,sale,{expectedVersion:4,expectedQuoteVersion:saved.version-1,customerConfirmedPrice:"0"},"PATCH")).response.status,409);
 assert.deepEqual(await repo.getById(q.id),saved);
 const row=(await x.pool.query("SELECT customer_confirmed_price::text,confirmed_labor_price::text,labor_currency FROM confirmed_commercial_terms")).rows[0];
 assert.deepEqual(row,{customer_confirmed_price:null,confirmed_labor_price:"0",labor_currency:"USD"});
});
