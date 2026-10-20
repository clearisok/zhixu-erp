import assert from "node:assert/strict";
import test from "node:test";
import {startCommercialSecurityFixture} from "./commercial-security-fixture.js";
import {appendOperationLog} from "../operation-logs/repository.js";
import {bootstrapAdmin} from "../auth/bootstrap.js";
import {logAction,logChanges,logTarget,logTime} from "../../features/operation-logs/model/server-log-presentation.js";

test("business audit queries retain immutable snapshots and protect hidden amounts",{timeout:120000},async t=>{
 const x=await startCommercialSecurityFixture();t.after(x.close);
 await bootstrapAdmin(x.pool,{username:"logs.root",displayName:"日志管理员",password:"123456"});
 const login=await x.request("/api/v1/auth/login",undefined,{username:"logs.root",password:"123456"},"POST");
 const root=login.response.headers.get("set-cookie")!.split(";")[0];
 const read=await x.user("logs.reader",["audit_log.view","quote.view"]);
 const u=(await x.pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='logs.root'")).rows[0];
 const actor={internalUserId:u.id,userId:u.public_id,username:"logs.root",userName:"发生时的管理员",permissions:[]};
 const op="operation-audit-business-120";
 for(let n=0;n<120;n++)await appendOperationLog(x.pool,actor,{operationId:op,operationSequence:n,module:"权限管理",entityType:"User",entityId:"synthetic-"+n,action:"修改账号",beforeData:{objectName:"旧姓名",values:{name:"旧姓名",status:"inactive"}},afterData:{objectName:"Jackson原始姓名",values:{name:"Jackson原始姓名",account:"jackson",status:"active"}}});
 const commercial=await appendOperationLog(x.pool,actor,{module:"订单中心",entityType:"OrderCommercialVersion",entityId:"synthetic-money",action:"调整订单成交价",beforeData:{values:{customerConfirmedPrice:7654321,confirmedLaborPrice:8765432}},afterData:{objectName:"SO-SYNTHETIC",values:{customerConfirmedPrice:7654322,confirmedLaborPrice:8765433}},metadata:{reason:"7654322"}});
 await appendOperationLog(x.pool,actor,{module:"报价中心",entityType:"EstimateCost",entityId:"hidden-estimate",action:"生成估算成本",afterData:{objectName:"PRIVATE-ESTIMATE-NAME",values:{amount:99887766}}});
 const get=(q:string,cookie=read)=>x.request("/api/v1/operation-logs?"+q,cookie);
 await t.test("AND keyword, actor and literal wildcard filters use event snapshots",async()=>{
  assert.equal((await get("q="+encodeURIComponent("jackson 原始"))).body.page.total,120);
  assert.equal((await get("q="+encodeURIComponent("%"))).body.page.total,0);
  assert.equal((await get("q=jackson&actorId="+u.public_id)).body.page.total,120);
  assert.equal((await get("q=jackson&actorId=00000000-0000-4000-8000-000000000000")).body.page.total,0);
  await x.pool.query("UPDATE app_users SET display_name='现在已改名' WHERE id=$1",[u.id]);
  const d=(await get("q=jackson")).body;assert.equal(d.logs[0].actorName,"发生时的管理员");assert.equal(logTarget(d.logs[0]),"Jackson原始姓名");
 });
 await t.test("operation details cross list pages and retain every immutable event",async()=>{
  const a=(await get("operationId="+op+"&limit=100")).body,b=(await get("operationId="+op+"&limit=100&offset=100")).body;
  assert.equal(a.page.total,120);assert.equal(a.logs.length,100);assert.equal(b.logs.length,20);assert.equal(b.page.hasMore,false);
  assert.equal(new Set([...a.logs,...b.logs].map(l=>l.id)).size,120);
  assert.equal((await get("q=no-match&operationId="+op)).body.page.total,0);
 });
 await t.test("amounts never leak through response, details, keyword totals or facets",async()=>{
  const d=(await get("operationId="+commercial.operationId)).body,serialized=JSON.stringify(d);
  for(const value of ["7654321","7654322","8765432","8765433"])assert.equal(serialized.includes(value),false);
  for(const q of ["7654322","8765433","PRIVATE-ESTIMATE-NAME"])assert.equal((await get("q="+q)).body.page.total,0);
  assert.equal(d.technicalAllowed,false);assert.equal(d.facets.actions.includes("生成估算成本"),false);
  const full=(await get("operationId="+commercial.operationId,root)).body;assert.equal(full.technicalAllowed,true);assert.match(JSON.stringify(full),/7654322/u);
 });
 await t.test("business labels, zero, historic missing names and password reset are explicit",async()=>{
  const l=(await get("q=jackson")).body.logs[0];assert.equal(logAction(l),"修改用户");assert.equal(logChanges(l).find(c=>c.field==="状态")?.after,"启用");
  assert.match(logTime("2026-10-19T06:11:30.000Z",true),/14:11:30/u);
  assert.equal(logTarget({...l,afterData:null,beforeData:null}),"当时未记录");
  assert.deepEqual(logChanges({...l,action:"重置密码"}),[]);
  assert.equal(logChanges({...l,changes:[{field:"quantity",beforeValue:null,afterValue:0} ]})[0].after,"0");
  for(const q of ["actorId=not-id","q=%00","q=x&q=y","operationId="])assert.equal((await get(q)).response.status,400);
 });
 assert.deepEqual(x.errors,[]);
});
