import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.ts";
import { bootstrapAdmin } from "../auth/bootstrap.ts";
import { TEAM_ROLES } from "../auth/team-roles.ts";
const wait=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,label,attempts=150){for(let i=0;i<attempts;i++){if(await read())return;await wait(100);}throw Error(label+" timed out");}
test("First team production-built UI uses trusted session, existing layout and server writes",{timeout:180000},async t=>{
 const build=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));
 assert.equal(build.quoteAuthority,"server");assert.equal(build.identityMode,"session");
 const x=await startCommercialSecurityFixture(resolve("dist/client"));t.after(x.close);
 const password="Synthetic-UI-Only-2026";
 await bootstrapAdmin(x.pool,{username:"synthetic.ui.root",displayName:"合成管理员",password});
 const temp=await mkdtemp(join(tmpdir(),"zhixu-team-ui-"));let browser,ws,session,id=0;const pending=new Map(),errors=[];
 try{
  const profile=join(temp,"profile");
  let launchError;let diagnostics="";
  browser=spawn(process.env.CHROME_PATH??(process.platform==="win32"?"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe":"google-chrome"),["--headless=new","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","ignore","pipe"],windowsHide:true});
  browser.on("error",error=>{launchError=error;});
  browser.stderr.on("data",chunk=>{diagnostics=(diagnostics+String(chunk)).slice(-4096);});
  try {
    // Only browser readiness gets a longer budget; page/business assertions keep 15s.
    // This fresh temporary profile has no credentials or business data at startup.
    await until(()=>{
      if(launchError)throw Error("Chromium spawn failed: "+launchError.message);
      if(browser.exitCode!==null||browser.signalCode!==null)throw Error("Chromium exited before readiness: "+(browser.exitCode??browser.signalCode));
      return existsSync(join(profile,"DevToolsActivePort"));
    },"Chromium startup",450);
  } catch(error) {throw Error(error.message+"; startup diagnostics: "+diagnostics);}
  const [port,path]=readFileSync(join(profile,"DevToolsActivePort"),"utf8").trim().split(/\r?\n/);
  ws=new WebSocket("ws://127.0.0.1:"+port+path);await new Promise((done,reject)=>{ws.addEventListener("open",done,{once:true});ws.addEventListener("error",reject,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((done,reject)=>{pending.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params,sessionId:sid}));});
  ws.addEventListener("message",({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(p){pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.done(r.result);}if(r.method==="Runtime.exceptionThrown")errors.push(r.params.exceptionDetails.text);});
  const target=await command("Target.createTarget",{url:"about:blank"},undefined);
  session=(await command("Target.attachToTarget",{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command("Page.enable");await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const evalJs=async expression=>{const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.teamWrites=0;const original=fetch;window.fetch=(...a)=>{if(String(a[0]).includes('/team-access')&&a[1]?.method==='POST')teamWrites++;return original(...a)};"});
  const body=()=>evalJs("document.body?.innerText??''");
  const has=async value=>{try{await until(async()=>(await body()).includes(value),value);}catch(error){throw Error(error.message+"; "+await body());}};
  const navigate=async path=>{const epoch=Date.now()+Math.random();await evalJs("window.navigationEpoch="+epoch);await command("Page.navigate",{url:x.base+path});await until(()=>evalJs("window.navigationEpoch!=="+epoch+" && document.readyState==='complete'"),"navigation");};
  const input=(selector,value)=>evalJs("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");if(!n)throw Error('missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const select=(selector,value)=>evalJs("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");if(!n)throw Error('missing select');n.value="+JSON.stringify(value)+";n.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const click=label=>evalJs("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing button '+ "+JSON.stringify(label)+");n.click()})()");
  const shot=async name=>{if(process.env.TEAM_ACCESS_EVIDENCE!=="1")return;const dir=resolve("docs/tasks/active/evidence/ningbo-first-team-access");await mkdir(dir,{recursive:true});const r=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(dir,name+".png"),Buffer.from(r.data,"base64"));};
  await navigate("/basic-settings/user-permissions");await has("忘记密码？请联系系统管理员");
  await input("input[name=username]","synthetic.ui.root");await input("input[name=password]",password);await click("登录织序");await has("新建账号");
  await t.test("existing layout, loaded CSS and no browser authority/write on mount",async()=>{
   assert.equal(await evalJs("teamWrites"),0);
   assert.ok(await evalJs("document.querySelector('.qc-permission-layout')!==null"));
   assert.notEqual(await evalJs("getComputedStyle(document.querySelector('.qc-control')).borderRadius"),"0px");
   assert.equal((await body()).includes("恢复默认权限"),false);assert.equal((await body()).includes("切换账号"),false);
   await shot("desktop-existing-layout");
  });
  await t.test("create six synthetic roles through real forms; reload persists and secrets stay out of storage",async()=>{
   for(const [i,role] of TEAM_ROLES.entries()){
    await click("新建账号");
    await input("[role=dialog] input:not([type=password])","合成UI"+role.name);
    await input("[role=dialog] input[autocomplete=off]","synthetic.ui."+i);
    await select("[role=dialog] select",role.id);await input("[role=dialog] input[type=password]",password);
    await click("保存");await until(()=>evalJs("document.querySelector('[role=dialog]')===null"),"create completed");await has("合成UI"+role.name);
   }
   assert.equal(await evalJs("teamWrites"),6);
   await navigate("/basic-settings/user-permissions");await has("合成UI财务经理");
   assert.equal(await evalJs("JSON.stringify([localStorage,sessionStorage]).includes("+JSON.stringify(password)+")"),false);
   const storage=await evalJs("Object.keys(localStorage).filter(k=>/permission/i.test(k))");assert.deepEqual(storage,[]);
   await shot("desktop-six-roles");
  });
  await t.test("mobile master/detail and account form preserve width; API-backed disable/reset",async()=>{
   await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await has("合成UI财务经理");
   assert.equal(await evalJs("document.documentElement.scrollWidth>innerWidth+1"),false);await shot("mobile-list");
   await evalJs("[...document.querySelectorAll('.qc-permission-user-records button')].find(n=>n.textContent.includes('合成UI财务经理')).click()");
   await has("重置密码");await shot("mobile-detail");
   await click("重置密码");await input("[role=dialog] input[type=password]","Synthetic-Reset-UI-2026");
   assert.equal(await evalJs("document.documentElement.scrollWidth>innerWidth+1"),false);await shot("mobile-reset");
   await click("保存");await until(()=>evalJs("document.querySelector('[role=dialog]')===null"),"reset");
   await select(".qc-permission-detail select:nth-of-type(1)","role-team-material-manager");await has("已保存");
   await until(()=>evalJs("document.querySelector('.qc-permission-detail select').disabled===false"),"role saved");
   await select(".qc-permission-detail label:nth-child(2) select","inactive");
   await until(async()=>(await x.pool.query("SELECT active FROM app_users WHERE username='synthetic.ui.5'")).rows[0].active===false,"disable");
  });
  await t.test("each non-admin session is denied the management page and cannot recover Browser permissions",async()=>{
   for(let i=1;i<5;i++){
    await evalJs("fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Zhixu-Request':'1'}})");
    await navigate("/basic-settings/user-permissions");await has("忘记密码？请联系系统管理员");
    await input("input[name=username]","synthetic.ui."+i);await input("input[name=password]",password);await click("登录织序");
    await has("暂无权限");
    assert.equal((await body()).includes("新建账号"),false);
   }
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  const distance=relative(resolve(tmpdir()),resolve(temp));
  assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-team-ui-"));
  await rm(temp,{recursive:true,force:true});
 }
});
