import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { TEAM_ROLES } from "../auth/team-roles.js";
import { parseTeamCommand, executeTeamCommand } from "../auth/team-access.js";
import { createApp } from "../app.js";
import type { TrustedIdentity } from "../auth/session.js";
import type { TeamUser, TeamCommand } from "../../features/permissions/server/team-access-client.js";

test("first team: six synthetic session accounts and guarded administration in disposable PostgreSQL", async t => {
  const x=await startCommercialSecurityFixture();t.after(x.close);
  const initialPassword="Synthetic-Team-Only-2026";
  await bootstrapAdmin(x.pool,{username:"synthetic.root",displayName:"合成根管理员",password:initialPassword});
  const signIn=async(username:string,password=initialPassword)=>{
    const r=await x.request("/api/v1/auth/login",undefined,{username,password},"POST");
    return {...r,cookie:r.response.headers.get("set-cookie")?.split(";")[0]};
  };
  const root=(await signIn("synthetic.root")).cookie!;
  const command=(body:unknown,cookie=root)=>x.request("/api/v1/team-access",cookie,body,"POST");
  const directory=async()=>{const r=await x.request("/api/v1/team-access",root);assert.equal(r.response.status,200,r.text);return r.body;};
  const accounts=new Map<string,{cookie:string;user:TeamUser;request:Extract<TeamCommand,{action:"create"}>}>();
  await t.test("GET is read-only; anonymous, CSRF and forged authority are rejected",async()=>{
    const before=(await x.pool.query("SELECT count(*)::int n FROM app_roles")).rows[0].n;
    await directory();await directory();
    assert.equal((await x.pool.query("SELECT count(*)::int n FROM app_roles")).rows[0].n,before);
    assert.equal((await x.request("/api/v1/team-access")).response.status,401);
    const r=await fetch(x.base+"/api/v1/team-access",{method:"POST",headers:{"Content-Type":"application/json",Cookie:root},body:"{}"});
    assert.equal(r.status,403);
    const wrongOrigin=await fetch(x.base+"/api/v1/team-access",{method:"POST",headers:{"Content-Type":"application/json",Cookie:root,Origin:"https://untrusted.invalid","X-Zhixu-Request":"1"},body:"{}"});
    assert.equal(wrongOrigin.status,403);
    assert.equal((await command({action:"create",actor:{id:"fake"}})).response.status,400);
  });
  for(const [index,role] of TEAM_ROLES.entries()) await t.test(role.name+": create through API, login and amount boundaries",async()=>{
    const request={action:"create" as const,requestId:randomUUID(),account:"synthetic.team."+index,name:"合成"+role.name,password:initialPassword,roleIds:[role.id]};
    const created=await command(request);assert.equal(created.response.status,200,created.text);
    const logged=await signIn(request.account);assert.equal(logged.response.status,200,logged.text);
    assert.deepEqual([...logged.body.permissions].sort(),[...role.permissions].sort());
    accounts.set(role.id,{cookie:logged.cookie!,user:created.body.user,request});
    const admin=role.id==="role-server-admin";
    assert.equal((await x.request("/api/v1/team-access",logged.cookie)).response.status,admin?200:403);
    if(!admin)assert.equal((await command({...request,requestId:randomUUID(),account:request.account+".elevate"},logged.cookie)).response.status,403);
    const quote=await x.request(x.quotePath,logged.cookie);assert.equal(quote.response.status,200,quote.text);
    const hasCost=role.permissions.includes("quote.cost.view");
    if(!hasCost)assert.equal(quote.text.includes("98765"),false);
    const terms=await x.request(x.orderPath,logged.cookie);assert.equal(terms.response.status,200,terms.text);
    assert.equal(terms.text.includes("12345"),role.permissions.includes("commercial.sale.view"));
    assert.equal(terms.text.includes("67890"),role.permissions.includes("commercial.labor.view"));
    if(!admin){
      const attempt=await x.request(x.orderPath,logged.cookie,{expectedVersion:terms.body.version??1,customerConfirmedPrice:"90000"},"PATCH");
      assert.equal(attempt.response.status,403,attempt.text);
    }
    const createQuote=await x.request("/api/v1/quotes",logged.cookie,{},"POST");
    assert.equal(createQuote.response.status,admin||role.id==="role-team-quote-manager"?201:403,createQuote.text);
  });
  await t.test("create replay, duplicate username and changed payload cannot overwrite account/password",async()=>{
    const a=accounts.get("role-team-material-manager")!;
    const replay=await command({...a.request,password:"Different-Synthetic-Password"});
    assert.equal(replay.response.status,200,replay.text);assert.equal(replay.body.replayed,true);
    assert.equal((await signIn(a.request.account)).response.status,200);
    assert.equal((await signIn(a.request.account,"Different-Synthetic-Password")).response.status,401);
    assert.equal((await command({...a.request,requestId:randomUUID()})).response.status,409);
    assert.equal((await command({...a.request,name:"different"})).response.status,409);
  });
  await t.test("validation rejects unsupported grants, weak and bcrypt-truncated passwords; no secrets in response",async()=>{
    const base=accounts.get("role-team-manager")!.request;
    for(const override of [{password:"short"},{password:"汉".repeat(30)},{roleIds:["role-admin"]},{roleIds:[]},{permissions:["*"]},{account:"../admin"},{status:"active"}]){
      assert.equal((await command({...base,account:"invalid.case",requestId:randomUUID(),...override})).response.status,400);
    }
    const data=JSON.stringify(await directory());assert.equal(data.includes(initialPassword),false);assert.doesNotMatch(data,/password_hash|\$2[aby]\$/);
  });
  await t.test("role update CAS, all-session revocation and disabled login",async()=>{
    const a=accounts.get("role-team-quote-manager")!;
    const body={action:"update",id:a.user.id,expectedVersion:a.user.version,name:a.user.name,status:"active",roleIds:["role-team-material-manager"]};
    const updated=await command(body);assert.equal(updated.response.status,200,updated.text);
    assert.equal((await command(body)).response.status,409);
    assert.equal((await x.request("/api/v1/auth/me",a.cookie)).response.status,401);
    const relog=await signIn(a.request.account);assert.equal(relog.response.status,200);
    assert.equal(relog.body.permissions.includes("quote.create"),false);
    const disabled=await command({...body,expectedVersion:updated.body.user.version,status:"inactive"});assert.equal(disabled.response.status,200,disabled.text);
    assert.equal((await signIn(a.request.account)).response.status,401);
    assert.equal((await x.request("/api/v1/auth/me",relog.cookie)).response.status,401);
  });
  await t.test("password reset invalidates existing sessions and preserves audit secrecy",async()=>{
    const a=accounts.get("role-team-finance-manager")!;
    const next="Synthetic-New-Password-2026";
    const reset=await command({action:"reset-password",id:a.user.id,expectedVersion:a.user.version,password:next});assert.equal(reset.response.status,200,reset.text);
    assert.equal((await x.request("/api/v1/auth/me",a.cookie)).response.status,401);
    assert.equal((await signIn(a.request.account)).response.status,401);
    assert.equal((await signIn(a.request.account,next)).response.status,200);
    const logs=JSON.stringify((await x.pool.query("SELECT * FROM operation_logs WHERE module='权限管理'")).rows);
    for(const secret of [initialPassword,next,"Different-Synthetic-Password"])assert.equal(logs.includes(secret),false);
    assert.doesNotMatch(logs,/password_hash|\$2[aby]\$/);
  });
  await t.test("self lockout and last administrator are blocked",async()=>{
    const snapshot=await directory();const actor=snapshot.users.find((u:TeamUser)=>u.account==="synthetic.root");
    const update={action:"update",id:actor.id,expectedVersion:actor.version,name:actor.name,status:"inactive",roleIds:["role-team-material-manager"]};
    assert.equal((await command(update)).body.error.code,"team_self_lockout");
    const delegated=await x.user("synthetic.delegated",["user_permissions.view","user_permissions.manage"]);
    const secondary=accounts.get("role-server-admin")!;
    const off=await command({action:"update",id:secondary.user.id,expectedVersion:secondary.user.version,name:secondary.user.name,status:"inactive",roleIds:secondary.user.roleIds});
    assert.equal(off.response.status,200,off.text);
    const last=await command(update,delegated);assert.equal(last.body.error.code,"team_last_admin",last.text);
  });
  await t.test("preset drift is not overwritten; mutation rolls back",async()=>{
    await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='role-team-material-manager' AND permission_key='order.view'");
    const base=accounts.get("role-team-material-manager")!.request;
    const r=await command({...base,requestId:randomUUID(),account:"synthetic.drift"});
    assert.equal(r.body.error.code,"team_role_drift",r.text);
    assert.equal((await x.pool.query("SELECT count(*)::int n FROM app_users WHERE username='synthetic.drift'")).rows[0].n,0);
  });
  await t.test("concurrent updates with the same version commit at most once",async()=>{
    const a=accounts.get("role-team-manager")!;
    const body={action:"update",id:a.user.id,expectedVersion:a.user.version,name:a.user.name,status:"active",roleIds:a.user.roleIds};
    const results=await Promise.all([command({...body,name:"Concurrent A"}),command({...body,name:"Concurrent B"})]);
    assert.deepEqual(results.map(r=>r.response.status).sort(),[200,409]);
    assert.equal((await x.pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_id=$1 AND action='修改账号'",[a.user.id])).rows[0].n,1);
  });
  await t.test("stale trusted identity cannot retain management permission",async()=>{
    const row=(await x.pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic.delegated'")).rows[0];
    const stale:TrustedIdentity={internalUserId:row.id,userId:row.public_id,username:"synthetic.delegated",userName:"Synthetic",permissions:["user_permissions.view","user_permissions.manage"]};
    await x.pool.query("DELETE FROM app_user_roles WHERE user_id=$1",[row.id]);
    const base=accounts.get("role-team-manager")!.request;
    await assert.rejects(()=>executeTeamCommand(x.pool,stale,parseTeamCommand({...base,requestId:randomUUID(),account:"synthetic.revoked"})),(e:unknown)=>e instanceof Error&&"status" in e&&e.status===403);
  });
  await t.test("local single-user mode cannot access account management",async()=>{
    const server=createServer(createApp({pool:x.pool,identityAuthority:{mode:"local-single-user",verify:async()=>{},resolve:async()=>null}}));
    await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
    try{const address=server.address();assert.ok(address&&typeof address==="object");assert.equal((await fetch("http://127.0.0.1:"+address.port+"/api/v1/team-access")).status,404);}
    finally{await new Promise<void>(done=>server.close(()=>done()));}
  });
  assert.deepEqual(x.errors,[]);
});
