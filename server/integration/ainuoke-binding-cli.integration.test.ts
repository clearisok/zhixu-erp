import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile,spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { join,resolve } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { collectWithPython } from "../ainuoke-source/collector.js";
import { previewBindings, previewSelectedBindings } from "../ainuoke-source/binding.js";
import { bindingBundle,freshMaterialBundle } from "./ainuoke-binding-fixture.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
test("fixed Python binding worker and Linux operator CLI are executable end to end", {timeout:120000},async t=>{
 const b=bindingBundle();const expanded=bindingBundle(Date.now(),2);const material=freshMaterialBundle();const reports:number[]=[];let logins=0;let additionVisible=false;
 const upstream=createServer(async(req,res)=>{
  res.setHeader("Content-Type","application/json");
  const path=new URL(req.url!,"http://127.0.0.1").pathname;
  if(path==="/kaijin/system/user/loginsys2"){logins++;res.end(JSON.stringify({data:{isOk:true,jwtToken:"synthetic-token",sessionId:"synthetic-session"}}));return;}
  assert.equal(path,"/kaijin/report/report/getReportObjAndData");assert.equal(req.method,"POST");
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=JSON.parse(Buffer.concat(chunks).toString());reports.push(request.reportId);
  assert.ok([6086103,6087105,6087050].includes(request.reportId));
  const page=request.reportId===6086103?(additionVisible?expanded:b).discoveryBefore[0]
    :request.reportId===6087105?Object.values(additionVisible?expanded.colors:b.colors)[additionVisible?1:0][0]
    :Object.values(material.materials)[0][0];
  res.end(JSON.stringify({reObj:{isOk:true},dataCount:page.rows.length,pageIndex:0,pageSize:0,dataList:JSON.stringify({rows:page.rows.map(r=>r.values)})}));
 });
 await new Promise<void>(done=>upstream.listen(0,"127.0.0.1",done));const address=upstream.address();assert.ok(address&&typeof address==="object");
 const cfg={sourceKey:"first-team",baseUrl:"http://127.0.0.1:"+address.port,username:"synthetic",password:"Synthetic-Private-Only",operatorUsername:"synthetic.cli"};
 try{
  const result=await collectWithPython(cfg,[],{mode:"bindings",timeoutMs:20000});const preview=await previewBindings(result);
  assert.equal(preview.preview.candidates.length,1);assert.deepEqual(reports,[6086103,6087105,6086103]);
  assert.ok(!JSON.stringify(result).includes(cfg.password));
  await t.test("fixed worker selected-first preview retains full discovery and fetches one selected color",async()=>{
   additionVisible=true;reports.length=0;
   const selected=[String(expanded.discoveryBefore[0].rows[1].values.BillNo)];
   const result=await collectWithPython(cfg,selected,{mode:"additions",timeoutMs:20000});
   const p=await previewSelectedBindings(result,selected);
   assert.equal(p.visibleContracts,2);assert.equal(p.preview.candidates.length,1);
   assert.equal(p.preview.candidates[0].source.sourceId,"synthetic-2");
   assert.deepEqual(reports,[6086103,6087105,6086103]);additionVisible=false;
  });
  await t.test("Linux check/preview/bind/retry/schedule/signal with private file and empty disposable DB",{skip:process.platform==="win32"},async()=>{
   const db=await startDisposablePostgres();const databaseUrl=await db.createDatabase("binding_cli");const pool=new pg.Pool({connectionString:databaseUrl});
   const dir=await mkdtemp(join(tmpdir(),"zhixu-binding-cli-"));const path=join(dir,"source.json");
   try{
    await runMigrations(pool,resolve("database/migrations"));await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:cfg.operatorUsername,displayName:"合成CLI",password:"Synthetic-CLI-Only"});
    await writeFile(path,JSON.stringify(cfg),{mode:0o600});
    const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:"test",DATABASE_URL:databaseUrl,ZHIXU_IDENTITY_MODE:"session",ZHIXU_ATTACHMENT_BACKEND:"disabled"};
    const args=["--import","tsx","server/ainuoke-source/cli.ts"];
    const run=async (more:string[])=>JSON.parse((await promisify(execFile)(process.execPath,[...args,...more],{env,timeout:30000,encoding:"utf8"})).stdout);
    const config="--config="+path;const loginBefore=logins;
    const checked=await run(["--check",config]);assert.equal(logins,loginBefore);assert.equal(checked.boundOrders,0);
    const target="--expected-target="+checked.targetFingerprint;
    await assert.rejects(run(["--preview-bind=first-team","--expected-target="+"0".repeat(64),config]),/source_target_mismatch/);assert.equal(logins,loginBefore);
    const p=await run(["--preview-bind=first-team",target,config]);assert.equal(p.result,"BINDING_PREVIEW_NO_WRITES");
    assert.equal((await pool.query("SELECT count(*)::int n FROM sales_orders")).rows[0].n,0);
    const bind=["--bind=first-team",target,"--expected-preview="+p.reviewHash,config];
    assert.equal((await run(bind)).created,1);assert.equal((await run(bind)).replayed,true);
    const child=spawn(process.execPath,[...args,"--schedule=first-team",target,config,"--interval-ms=60000"],{env,stdio:["ignore","pipe","pipe"]});
    let output="";let error="";const timeout=setTimeout(()=>child.kill("SIGKILL"),30000);
    child.stdout.on("data",chunk=>{output+=chunk;if(output.includes('"state":"captured"'))child.kill("SIGTERM");});child.stderr.on("data",chunk=>{error+=chunk;});
    const code=await new Promise<number|null>(done=>child.once("close",done));clearTimeout(timeout);
    assert.equal(code,0,error);assert.equal(output.includes(cfg.password),false);assert.ok(output.includes('"state":"captured"'));
    assert.equal((await pool.query("SELECT count(*)::int n FROM ainuoke_source_runs")).rows[0].n,1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM sales_orders")).rows[0].n,1);
    additionVisible=true;
    const selected=String(expanded.discoveryBefore[0].rows[1].values.BillNo);
    const discovered=await run(["--discover-add=first-team",target,config]);
    assert.equal(discovered.result,"ADDITIONS_DISCOVERED_NO_WRITES");
    assert.deepEqual(discovered.additions.map((item:{salesContractNo:string})=>item.salesContractNo),[selected]);
    const preview=await run(["--preview-add=first-team","--contracts="+selected,target,config]);
    assert.equal(preview.result,"ADDITIONS_PREVIEW_NO_WRITES");
    assert.equal((await pool.query("SELECT count(*)::int n FROM sales_orders")).rows[0].n,1);
    const add=["--add=first-team","--contracts="+selected,target,"--expected-preview="+preview.reviewHash,config];
    assert.equal((await run(add)).created,1);
    assert.equal((await run(add)).replayed,true);
    assert.equal((await pool.query("SELECT count(*)::int n FROM sales_orders")).rows[0].n,2);
   }finally{await pool.end();await db.stop();await rm(dir,{recursive:true,force:true});}
  });
 }finally{await new Promise<void>(done=>upstream.close(()=>done()));}
});
