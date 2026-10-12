import assert from "node:assert/strict";
import test from "node:test";
import { createTeamAccessClient } from "../team-access-client";
const directory={users:[{id:"id",name:"Synthetic",account:"synthetic",status:"active",roleIds:["role"],version:"v",password_hash:"must-not-cross"}],roles:[{id:"role",name:"Role",description:"Synthetic",permissions:["quote.view"]}],assignableRoleIds:["role"]};
test("directory projection never carries server extras or mutable response references",async()=>{
 const client=createTeamAccessClient((async()=>Response.json(directory)) as typeof fetch);
 const actual=await client.read();assert.equal(JSON.stringify(actual).includes("must-not-cross"),false);
 assert.deepEqual(actual.roles[0].permissions,["quote.view"]);
});
test("invalid permissions and role references fail closed",async()=>{
 for(const data of [{...directory,assignableRoleIds:["unknown"]},{...directory,roles:[{...directory.roles[0],permissions:["*"]}]}]){
  await assert.rejects(()=>createTeamAccessClient((async()=>Response.json(data)) as typeof fetch).read());
 }
});
test("ambiguous write is attempted once without fallback or credential error echo",async()=>{
 let calls=0;const client=createTeamAccessClient((async()=>{calls++;throw Error("secret-token");}) as typeof fetch);
 await assert.rejects(()=>client.execute({action:"create",requestId:"uuid",name:"Synthetic",account:"synthetic",password:"Synthetic-Only-2026",roleIds:["role"]}),e=>e instanceof Error&&!e.message.includes("secret-token")&&e.message.includes("不会自动重试"));
 assert.equal(calls,1);
});
test("server error payload cannot inject credentials into displayed messages",async()=>{
 const client=createTeamAccessClient((async()=>Response.json({error:{code:"unknown",message:"secret-token"}},{status:403})) as typeof fetch);
 await assert.rejects(()=>client.read(),e=>e instanceof Error&&!e.message.includes("secret-token"));
});
