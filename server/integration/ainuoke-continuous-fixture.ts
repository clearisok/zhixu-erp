import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { executeTeamCommand } from "../auth/team-access.js";
import { TEAM_ROLES } from "../auth/team-roles.js";
import { createApp } from "../app.js";
import { bindOrders,previewBindings } from "../ainuoke-source/binding.js";
import { captureSource } from "../ainuoke-source/service.js";
import { createPersistedMaterialPorts } from "../ainuoke-source/reader.js";
import { bindingBundle,freshMaterialBundle } from "./ainuoke-binding-fixture.js";
/** Always generates its own loopback tmpfs PostgreSQL; never reads DATABASE_URL or source credentials. */
export async function startContinuousFixture(staticDirectory:string) {
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase("continuous_demo")});
 const server=createServer();const origins:string[]=[];const errors:unknown[]=[];
 const close=async()=>{if(server.listening)await new Promise<void>(done=>server.close(()=>done()));await pool.end();await db.stop();};
 try{
  await runMigrations(pool,resolve("database/migrations"));await synchronizePermissionCatalog(pool);
  const password="Synthetic-Demo-2026";const users=["demo.admin","demo.manager","demo.quote","demo.material","demo.production","demo.finance"];
  await bootstrapAdmin(pool,{username:users[0],displayName:"合成演示管理员",password});
  const actor=await loadExistingBootstrapActor(pool,users[0]);
  for(let i=1;i<TEAM_ROLES.length;i++)await executeTeamCommand(pool,actor,{action:"create",requestId:randomUUID(),account:users[i],name:"合成演示"+TEAM_ROLES[i].name,password,roleIds:[TEAM_ROLES[i].id]});
  const source={sourceKey:"synthetic-demo",accountFingerprint:"a".repeat(64)};
  const b=bindingBundle();const p=await previewBindings(b);
  const bound=await bindOrders(pool,actor,{...source,expectedPreview:p.reviewHash,collect:async()=>b});
  let generation=0;let mode:"ready"|"failed"|"stale"="ready";
  const capture=async()=>{
   const result=await captureSource(pool,actor,{...source,maxAgeMs:600000,collect:async()=>{
    if(mode==="failed")throw Error("synthetic failure");
    const b=freshMaterialBundle();for(const pages of Object.values(b.materials))for(const p of pages)for(const row of p.rows) {
     if(row.values.cgdh)row.values.cgdh=String(row.values.cgdh)+"-G"+generation;
    }
    generation++;return b;
   }});return result;
  };
  await capture();
  let materialReads=0;
  const ports=createPersistedMaterialPorts(pool,{sourceKey:source.sourceKey,maxAgeMs:1800000},()=>Date.now()+(mode==="stale"?1800001:0));
  server.on("request",(req,res)=>{if(req.url?.includes("/material-progress"))materialReads++;app(req,res);});
  const app=createApp({pool,staticDirectory,allowedOrigins:origins,security:{secureCookies:false,sessionTtlSeconds:7200},logger:{error:e=>errors.push(e)},orderMaterialRead:ports});
  await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
  const address=server.address();if(!address||typeof address!=="object")throw Error("loopback fixture failed");
  const base="http://127.0.0.1:"+address.port;origins.push(base);
  return{pool,base,orderId:bound.orderIds[0],users,password,errors,capture,generation:()=>generation,materialReads:()=>materialReads,
    setMode:(value:typeof mode)=>{mode=value;},containerName:db.containerName,
    login:async(username:string)=>{
     const response=await fetch(base+"/api/v1/auth/login",{method:"POST",headers:{"Content-Type":"application/json",Origin:base,"X-Zhixu-Request":"1"},body:JSON.stringify({username,password})});
     if(response.status!==200)throw Error("synthetic login failed");
     return response.headers.get("set-cookie")!.split(";")[0];
    },close};
 }catch(error){await close();throw error;}
}
