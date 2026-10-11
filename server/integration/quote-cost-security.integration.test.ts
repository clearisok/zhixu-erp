import assert from "node:assert/strict";
import test from "node:test";
import { appendOperationLog } from "../operation-logs/repository.js";
import { createQuoteService } from "../quotes/service.js";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.js";

test("Quote internal-cost read/save boundary uses real synthetic sessions",async t=> {
 const x=await startCommercialSecurityFixture();t.after(x.close);
 const view=await x.user("cost-view",["quote.view"]);
 const edit=await x.user("metadata-edit",["quote.view","quote.edit","quote.cost.edit","estimate.view","audit_log.view"]);
 const cost=await x.user("cost-readable",["quote.view","quote.cost.view"]);
 const full=await x.user("all-readable",["quote.view","quote.cost.view","estimate.view"]);
 const saved=()=>createQuoteService(x.pool).getById(x.record.quote.id);
 await t.test("401; ordinary viewing stays200 with explicit restricted state and no nested/history/derived cost",async()=>{
  assert.equal((await x.request(x.quotePath)).response.status,401);
  assert.equal((await x.request(x.orderPath)).response.status,401);
  for(const cookie of [view,edit]) {
   const r=await x.request(x.quotePath,cookie);assert.equal(r.response.status,200);assert.equal(r.response.headers.get("cache-control"),"no-store");
   assert.equal(r.body.quote.costVisibility,"restricted");assert.equal(r.body.quote.estimateVisibility,"restricted");
   assert.equal(r.text.includes("98765"),false);
   for(const key of ["fabrics","trims","labor","otherCosts","pricingParameters","confirmation","activeEstimateCost","estimateCostHistory","unitPrice","amount","quotedGarmentPrice","confirmedLaborPrice"])assert.equal(r.text.includes(`"${key}":`),false,key);
   for(const rev of r.body.quote.quote.revisions)for(const pv of rev.priceVersions)assert.deepEqual(Object.keys(pv).sort(),["description","id","name","quantity"]);
  }
 });
 await t.test("cost.view and estimate.view are independent; full exact null/zero values survive",async()=>{
  const c=(await x.request(x.quotePath,cost)).body.quote;assert.equal(c.costVisibility,undefined);assert.equal(c.estimateVisibility,"restricted");
  assert.equal(c.quote.revisions[0].priceVersions[0].labor.value,"98765");assert.equal(c.quote.revisions[0].priceVersions[0].fabrics[0].unitPrice,"0");
  assert.equal(c.quote.revisions[0].priceVersions[0].fabrics[0].segmentLengthCm,null);
  const f=(await x.request(x.quotePath,full)).body.quote;assert.ok(f.quote.activeEstimateCost);assert.equal(f.quote.estimateCostHistory.length,1);
 });
 await t.test("legal metadata save restores all hidden costs/history/Estimate exactly, never null/empty substitution",async()=>{
  const before=await saved();const r=(await x.request(x.quotePath,edit)).body.quote;
  const current=r.quote.revisions.find((v:{revisionId:string})=>v.revisionId===r.quote.defaultRevisionId);current.baseInfo.quoteStyleNo="SAFE-METADATA-EDIT";
  const response=await x.request(x.quotePath,edit,{quote:r.quote,expectedVersion:r.version},"PUT");assert.equal(response.response.status,200);assert.equal(response.text.includes("98765"),false);
  const after=await saved();assert.equal(after!.version,before!.version+1);
  assert.deepEqual(after!.quote.activeEstimateCost,before!.quote.activeEstimateCost);assert.deepEqual(after!.quote.estimateCostHistory,before!.quote.estimateCostHistory);
  assert.deepEqual(after!.quote.revisions[0],before!.quote.revisions[0]);
  assert.deepEqual(after!.quote.revisions.at(-1)!.priceVersions,before!.quote.revisions.at(-1)!.priceVersions);
  const log=(await x.pool.query("SELECT actor_user_id::text,after_data FROM operation_logs WHERE quote_id=$1 ORDER BY created_at DESC LIMIT 1",[x.record.quote.id])).rows[0];assert.ok(log.actor_user_id);
  const stale=await x.request(x.quotePath,edit,{quote:r.quote,expectedVersion:r.version},"PUT");assert.equal(stale.response.status,409);assert.equal(stale.text.includes("98765"),false);
 });
 await t.test("hidden cost injection, fake permission flag, removal/reordering and Estimate injection fail without mutation",async()=>{
  const r=(await x.request(x.quotePath,edit)).body.quote;const before=await saved();
  for(const value of [null,[],{value:"98765"}]) {
   const quote=structuredClone(r.quote);quote.revisions.at(-1).priceVersions[0].labor=value;
   const response=await x.request(x.quotePath,edit,{quote,expectedVersion:r.version},"PUT");assert.equal(response.response.status,403);assert.equal(response.text.includes("98765"),false);
  }
  const flag={...r.quote,costVisibility:"allowed"};assert.equal((await x.request(x.quotePath,edit,{quote:flag,expectedVersion:r.version},"PUT")).response.status,400);
  const removed=structuredClone(r.quote);removed.revisions[0].priceVersions=[];assert.equal((await x.request(x.quotePath,edit,{quote:removed,expectedVersion:r.version},"PUT")).response.status,400);
  const estimate={...r.quote,activeEstimateCost:null};assert.equal((await x.request(x.quotePath,edit,{quote:estimate,expectedVersion:r.version},"PUT")).response.status,409);
  assert.deepEqual(await saved(),before);
 });
 await t.test("audit failure rolls back aggregate, costs/history, terms and logs; public error contains no sensitive value",async()=>{
  const r=(await x.request(x.quotePath,edit)).body.quote;const before=await saved();
  const terms=(await x.pool.query("SELECT * FROM confirmed_commercial_terms")).rows;
  const logs=(await x.pool.query("SELECT * FROM operation_logs ORDER BY id")).rows;
  await x.pool.query("CREATE FUNCTION reject_security_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
  await x.pool.query("CREATE TRIGGER reject_security_log BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_security_log()");
  try {
   r.quote.revisions.at(-1).baseInfo.styleName="ROLLBACK-METADATA";
   const result=await x.request(x.quotePath,edit,{quote:r.quote,expectedVersion:r.version},"PUT");assert.equal(result.response.status,500);
   for(const value of ["98765","12345","67890","synthetic audit failure"])assert.equal(result.text.includes(value),false);
   assert.deepEqual(await saved(),before);assert.deepEqual((await x.pool.query("SELECT * FROM confirmed_commercial_terms")).rows,terms);assert.deepEqual((await x.pool.query("SELECT * FROM operation_logs ORDER BY id")).rows,logs);
  }finally{await x.pool.query("DROP TRIGGER reject_security_log ON operation_logs; DROP FUNCTION reject_security_log()");}
 });
 await t.test("exports, protected list columns, public errors and logs cannot bypass cost.view",async()=>{
  const exporter=await x.user("metadata-exporter",["quote.view","quote.export","estimate.view","audit_log.view"]);
  const r=(await x.request(x.quotePath,exporter)).body.quote;
  const revision=r.quote.revisions.at(-1),items=[{quoteId:r.quote.id,expectedVersion:r.version}];
  const requests=[
   [x.quotePath+"/customer-export",{expectedVersion:r.version,revisionId:revision.revisionId,priceVersionIds:[revision.priceVersions[0].id]}],
   ["/api/v1/quotes/customer-batch-export",{items}],
   ["/api/v1/quotes/internal-summary",{items,columns:["labor"],rowMode:"quote",estimateColumns:[]}],
  ] as const;
  for(const[path,body]of requests){const result=await x.request(path,exporter,body,"POST");assert.equal(result.response.status,403);assert.equal(result.text.includes("98765"),false);assert.equal(result.response.headers.get("cache-control"),"no-store");}
  assert.equal((await x.request("/api/v1/quotes?columns=labor",exporter)).response.status,403);
  const user=(await x.pool.query("SELECT id::text,public_id::text,username FROM app_users WHERE username='metadata-exporter'")).rows[0];
  const client=await x.pool.connect();try{await appendOperationLog(client,{internalUserId:user.id,userId:user.public_id,username:user.username,userName:"Synthetic",permissions:[]},{module:"报价中心",action:"保存报价",entityType:"Quote",entityId:r.quote.id,quoteId:r.quote.id,afterData:{values:{confirmedLaborPrice:"98765",aggregateVersion:r.version}},beforeData:{values:{confirmedLaborPrice:null,aggregateVersion:r.version}}});}finally{client.release();}
  const logs=await x.request(`/api/v1/operation-logs?quoteId=${encodeURIComponent(r.quote.id)}`,exporter);assert.equal(logs.response.status,200);assert.equal(logs.text.includes("98765"),false);assert.ok(logs.body.logs.some((log:{costVisibility?:string})=>log.costVisibility==="restricted"));
  for(const secret of ["98765","12345","67890","synthetic audit failure"])assert.equal(JSON.stringify(x.errors).includes(secret),false);
 });
 await t.test("two old-version metadata updates have one CAS winner and preserve every hidden value",async()=>{
  const before=await saved();const r=(await x.request(x.quotePath,edit)).body.quote;
  const a=structuredClone(r.quote),b=structuredClone(r.quote);a.revisions.at(-1).baseInfo.note="CAS-A";b.revisions.at(-1).baseInfo.note="CAS-B";
  const results=await Promise.all([a,b].map(quote=>x.request(x.quotePath,edit,{quote,expectedVersion:r.version},"PUT")));
  assert.deepEqual(results.map(result=>result.response.status).sort(),[200,409]);
  const after=await saved();assert.equal(after!.version,before!.version+1);assert.deepEqual(after!.quote.revisions.at(-1)!.priceVersions,before!.quote.revisions.at(-1)!.priceVersions);assert.deepEqual(after!.quote.estimateCostHistory,before!.quote.estimateCostHistory);
 });});