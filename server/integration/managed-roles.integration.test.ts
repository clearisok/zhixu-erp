import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {startCommercialSecurityFixture} from "./commercial-security-fixture.js";
import {bootstrapAdmin} from "../auth/bootstrap.js";
import {passwordValidationMessage} from "../../features/permissions/model/password-policy.js";
test("password policy counts characters, accepts six without composition, never truncates",()=>{
 for(const p of ["123456","abcdef","中文密码六字","😀😀😀😀😀😀","  ab  "])assert.equal(passwordValidationMessage(p),null);
 for(const p of ["12345","😀😀😀😀😀","中".repeat(25),"a\0bcdef"])assert.notEqual(passwordValidationMessage(p),null);
 assert.equal(passwordValidationMessage("a".repeat(72)),null);assert.notEqual(passwordValidationMessage("a".repeat(73)),null);
});
test("managed roles preserve grants, revoke sessions and guard identity under actual HTTP",async t=>{
 const x=await startCommercialSecurityFixture();t.after(x.close);
 await bootstrapAdmin(x.pool,{username:"role.root",displayName:"角色管理员",password:"123456"});
 const login=async(username:string,password="123456")=>x.request("/api/v1/auth/login",undefined,{username,password},"POST");
 const root=(await login("role.root")).response.headers.get("set-cookie")!.split(";")[0];
 const post=(data:unknown,cookie=root)=>x.request("/api/v1/team-roles",cookie,data,"POST");
 const create={action:"create",requestId:randomUUID(),name:"合成采购专员",description:"只查看订单",permissions:["order.view"]};
 const made=await post(create);assert.equal(made.response.status,200,made.text);let role=made.body.role;
 await t.test("create replay and changed payload are independently guarded",async()=>{
  assert.equal((await post(create)).body.replayed,true);
  assert.equal((await post({...create,name:"changed"})).response.status,409);
  const receipt=await x.request("/api/v1/team-roles?requestId="+create.requestId,root);assert.ok(receipt.body.receipt);
 });
 const user=await x.request("/api/v1/team-access",root,{action:"create",requestId:randomUUID(),account:"role.member",name:"成员",password:"abcdef",roleIds:[role.id]},"POST");
 assert.equal(user.response.status,200,user.text);
 const member=(await login("role.member","abcdef")).response.headers.get("set-cookie")!.split(";")[0];
 await t.test("reserved administration cannot be delegated or spoofed",async()=>{
  assert.equal((await post({...create,requestId:randomUUID(),name:"坏角色",permissions:["user_permissions.manage"]})).response.status,403);
  assert.equal((await post(create,member)).response.status,403);
  const delegated=await x.user("role.fakeadmin",["user_permissions.view","user_permissions.manage"]);
  assert.equal((await post(create,delegated)).response.status,403);
  const admin=(await x.request("/api/v1/team-roles",root)).body.roles.find((r:{id:string})=>r.id==="role-server-admin");
  assert.equal((await post({action:"archive",requestId:randomUUID(),id:admin.id,expectedVersion:admin.version})).body.error.code,"protected_admin_role");
 });
 await t.test("role permissions update invalidates every member session and do not reset on user update",async()=>{
  const change={action:"update",requestId:randomUUID(),id:role.id,expectedVersion:role.version,name:role.name,description:"最新角色",permissions:["quote.view"]};
  const results=await Promise.all([post(change),post({...change,requestId:randomUUID(),description:"竞争修改"})]);
  assert.deepEqual(results.map(r=>r.response.status).sort(),[200,409]);role=results.find(r=>r.response.status===200)!.body.role;
  assert.equal((await x.request("/api/v1/auth/me",member)).response.status,401);
  const updated=await x.request("/api/v1/team-access",root,{action:"update",id:user.body.user.id,expectedVersion:user.body.user.version,name:"成员新名",status:"active",roleIds:[role.id]},"POST");
  assert.equal(updated.response.status,200,updated.text);
  const signed=await login("role.member","abcdef");assert.deepEqual(signed.body.permissions,["quote.view"]);
 });
 await t.test("in-use deletion blocks; unused deletion retains role and audit history",async()=>{
  assert.equal((await post({action:"archive",requestId:randomUUID(),id:role.id,expectedVersion:role.version})).body.error.code,"role_in_use");
  const r=await post({...create,requestId:randomUUID(),name:"未使用角色"});
  const archive={action:"archive",requestId:randomUUID(),id:r.body.role.id,expectedVersion:r.body.role.version};
  assert.equal((await post(archive)).response.status,200);assert.equal((await post(archive)).body.replayed,true);
  assert.ok((await x.pool.query("SELECT archived_at FROM app_roles WHERE id=$1",[r.body.role.id])).rows[0].archived_at);
  assert.equal((await x.request("/api/v1/team-access",root)).body.assignableRoleIds.includes(r.body.role.id),false);
  assert.equal((await x.pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_id=$1",[r.body.role.id])).rows[0].n,2);
 });
 assert.deepEqual(x.errors,[]);
});

