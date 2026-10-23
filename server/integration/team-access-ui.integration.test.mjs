import {readChromiumEndpoint} from './chromium-endpoint.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.ts";
import { bootstrapAdmin } from "../auth/bootstrap.ts";
import {appendOperationLog} from "../operation-logs/repository.ts";
import { TEAM_ROLES } from "../auth/team-roles.ts";
const expectedRoleIds=['role-server-admin','role-team-manager','role-team-quote-manager','role-team-material-manager','role-team-production-manager','role-team-finance-manager','role-team-merchandising-manager'];
const wait=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,label,attempts=150){for(let i=0;i<attempts;i++){if(await read())return;await wait(100);}throw Error(label+" timed out");}
test("First team production-built UI uses trusted session, existing layout and server writes",{timeout:180000},async t=>{
 assert.deepEqual(TEAM_ROLES.map(role=>role.id),expectedRoleIds);
 const build=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));
 assert.equal(build.quoteAuthority,"server");assert.equal(build.identityMode,"session");
 const x=await startCommercialSecurityFixture(resolve("dist/client"));t.after(x.close);
 const password="Synthetic-UI-Only-2026";
 await bootstrapAdmin(x.pool,{username:"synthetic.ui.root",displayName:"合成管理员",password});
 const temp=await mkdtemp(join(tmpdir(),"zhixu-team-ui-"));let browser,ws,session,id=0;const pending=new Map(),errors=[];
 try{
  const profile=join(temp,"profile");
  let launchError,chromiumEndpoint;let diagnostics="";
  browser=spawn(process.env.CHROME_PATH??(process.platform==="win32"?"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe":"google-chrome"),["--headless=new","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","ignore","pipe"],windowsHide:true});
  browser.on("error",error=>{launchError=error;});
  browser.stderr.on("data",chunk=>{diagnostics=(diagnostics+String(chunk)).slice(-4096);});
  try {
    // Only browser readiness gets a longer budget; page/business assertions keep 15s.
    // This fresh temporary profile has no credentials or business data at startup.
    await until(()=>{
      if(launchError)throw Error("Chromium spawn failed: "+launchError.message);
      if(browser.exitCode!==null||browser.signalCode!==null)throw Error("Chromium exited before readiness: "+(browser.exitCode??browser.signalCode));
      return Boolean(chromiumEndpoint=readChromiumEndpoint(profile));
    },"Chromium startup",450);
  } catch(error) {throw Error(error.message+"; startup diagnostics: "+diagnostics);}
  const [port,path]=chromiumEndpoint;
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
  const shot=async name=>{if(process.env.TEAM_ACCESS_EVIDENCE!=="1")return;const dir=resolve(process.env.TEAM_ACCESS_EVIDENCE_DIR??"outputs/system-settings-browser");await mkdir(dir,{recursive:true});const r=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(dir,name+".png"),Buffer.from(r.data,"base64"));};
  await navigate("/basic-settings/user-permissions");await has("忘记密码？请联系系统管理员");
  await input("input[name=username]","synthetic.ui.root");await input("input[name=password]",password);await click("登录织序");await has("新建用户");
  await t.test("existing layout, loaded CSS and no browser authority/write on mount",async()=>{
   assert.equal(await evalJs("teamWrites"),0);
   assert.ok(await evalJs("document.querySelector('.qc-data-table')!==null"));
   assert.notEqual(await evalJs("getComputedStyle(document.querySelector('.qc-control')).borderRadius"),"0px");
   assert.equal((await body()).includes("恢复默认权限"),false);assert.equal((await body()).includes("切换账号"),false);
   await shot("desktop-existing-layout");
  });
  await t.test("create the original six roles plus merchandising through real forms; reload persists and secrets stay out of storage",async()=>{
   for(const [i,role] of TEAM_ROLES.entries()){
    await click("新建用户");
    await input("[role=dialog] input:not([type=password])","合成UI"+role.name);
    await input("[role=dialog] input[autocomplete=off]","synthetic.ui."+i);
    await select("[role=dialog] select",role.id);await input("[role=dialog] input[type=password]",password);
    await click("保存");await until(()=>evalJs("document.querySelector('[role=dialog]')===null"),"create completed");await has("合成UI"+role.name);
   }
   assert.equal(await evalJs("teamWrites"),expectedRoleIds.length);
   await navigate("/basic-settings/user-permissions");await has("合成UI财务经理");
   assert.equal(await evalJs("JSON.stringify([localStorage,sessionStorage]).includes("+JSON.stringify(password)+")"),false);
   const storage=await evalJs("Object.keys(localStorage).filter(k=>/permission/i.test(k))");assert.deepEqual(storage,[]);
   await has("合成UI跟单经理");
   const assignments=(await x.pool.query("SELECT u.username,ur.role_id FROM app_users u JOIN app_user_roles ur ON ur.user_id=u.id WHERE u.username LIKE 'synthetic.ui.%' AND u.username<>'synthetic.ui.root' ORDER BY u.username")).rows;
   assert.deepEqual(assignments,expectedRoleIds.map((role_id,i)=>({username:"synthetic.ui."+i,role_id})));
   await shot("desktop-seven-roles");
  });

  await t.test("managed roles use real forms and preserve the shared navigation",async()=>{
   await navigate("/system-settings/roles");await has("角色列表");
   await click("新建角色");
   await input(".qc-permission-account-fields label:first-child input","合成组合角色");
   await input(".qc-permission-account-fields label:nth-child(2) input","角色页面验收");
   await evalJs("[...document.querySelectorAll('.qc-permission-groups label')].find(n=>n.innerText.includes('查看报价')).querySelector('input').click()");
   await click("保存权限");await has("新增 1 项权限");await click("确认保存");await has("已保存");
   await navigate("/system-settings/roles");await has("合成组合角色");
   await evalJs("[...document.querySelectorAll('.qc-permission-user-records button')].find(n=>n.textContent.includes('合成组合角色')).click()");
   await click("删除角色");await click("确认删除");await has("已保存");
   assert.equal((await x.pool.query("SELECT archived_at IS NOT NULL AS archived FROM app_roles WHERE name='合成组合角色'")).rows[0].archived,true);
   await navigate("/system-settings/progress-settings");await has("进度设置");
   assert.ok((await body()).includes("报价中心"));assert.ok((await body()).includes("订单中心"));
   await navigate("/system-settings/progress-settings");await has("进度设置");await click("系统设置");await has("角色权限");
   await navigate("/basic-settings/user-permissions");await has("新建用户");
  });
  await t.test("each non-admin session is denied the management page and cannot recover Browser permissions",async()=>{
   for(let i=1;i<expectedRoleIds.length;i++){
    await evalJs("fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Zhixu-Request':'1'}})");
    await navigate("/basic-settings/user-permissions");await has("忘记密码？请联系系统管理员");
    await input("input[name=username]","synthetic.ui."+i);await input("input[name=password]",password);await click("登录织序");
    await has("暂无权限");
    assert.equal((await body()).includes("新建用户"),false);
   }
  });
  await evalJs("fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Zhixu-Request':'1'}})");
  await navigate("/basic-settings/user-permissions");await has("忘记密码？请联系系统管理员");
  await input("input[name=username]","synthetic.ui.root");await input("input[name=password]",password);await click("登录织序");await has("新建用户");
  await t.test("mobile master/detail and account form preserve width; API-backed disable/reset",async()=>{
   await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await has("合成UI财务经理");
   assert.equal(await evalJs("document.documentElement.scrollWidth>innerWidth+1"),false);await shot("mobile-list");
   await click("管理 synthetic.ui.5");await has("重置密码");await shot("mobile-detail");
   await click("重置密码");await input("[role=dialog] input[type=password]","123456");
   assert.equal(await evalJs("document.documentElement.scrollWidth>innerWidth+1"),false);await shot("mobile-reset");
   await click("保存");await until(()=>evalJs("document.querySelector('[role=dialog]')===null"),"reset");
   await click("管理 synthetic.ui.5");await select("[role=dialog] select","role-team-material-manager");await click("保存");
   await until(()=>evalJs("document.querySelector('[role=dialog]')===null"),"role saved");
   await click("管理 synthetic.ui.5");await select("[role=dialog] select[aria-label=启用状态]","inactive");await click("保存");
   await until(async()=>(await x.pool.query("SELECT active FROM app_users WHERE username='synthetic.ui.5'")).rows[0].active===false,"disable");
   await until(()=>evalJs("document.querySelector('[role=dialog]')===null"),"disabled");
   await click("管理 synthetic.ui.5");await click("删除用户");await click("确认删除");
   await until(()=>evalJs("document.querySelector('[role=dialog]')===null"),"archived");
   await select("select[aria-label=筛选状态]","archived");
   await has("合成UI财务经理");await click("管理 synthetic.ui.5");await click("确认恢复");
   await until(()=>evalJs("document.querySelector('[role=dialog]')===null"),"restore");
   await select("select[aria-label=筛选状态]","inactive");await has("待重置密码");
  });

  await t.test("business audit filters and cross-page operation drawer render safely on desktop and mobile",async()=>{
   const row=(await x.pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic.ui.root'")).rows[0];
   const actor={internalUserId:row.id,userId:row.public_id,username:"synthetic.ui.root",userName:"合成历史管理员",permissions:[]};
   for(let i=0;i<105;i++)await appendOperationLog(x.pool,actor,{operationId:"operation-ui-history",module:"权限管理",entityType:"User",entityId:"test-history-"+i,action:"修改账号",beforeData:{objectName:"Jackson",values:{name:"Jackson",status:"inactive"}},afterData:{objectName:"Jackson",values:{name:"Jackson",status:"active"}}});
   await command("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
   await navigate("/system-settings/operation-logs");await has("查看团队操作与修改前后的记录");
   await input("input[aria-label=日志关键词]","Jackson");await click("查询");await has("共 105 条");
   assert.equal((await body()).includes("operation-ui-history"),false);await shot("audit-desktop");
   await click("查看详情");await has("已读取 100 / 105");await has("修改前");await has("停用");await has("启用");
   assert.equal(await evalJs("document.querySelector('details[open]')!==null"),false);
   await click("读取其余记录");await has("已读取 105 / 105");await has("本次操作记录已完整读取");
   assert.equal(await evalJs("[...document.querySelectorAll('.qc-drawer-body')].some(e=>e.scrollWidth>e.clientWidth+1)"),false);
   await shot("audit-detail");await click("关闭操作详情");
   await input("input[aria-label=日志关键词]","不存在的业务对象");await click("查询");await has("暂无匹配的操作记录");
   await click("重置筛选");await has("查看详情");
   await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
   assert.equal(await evalJs("document.documentElement.scrollWidth>innerWidth+1"),false);await shot("audit-mobile");
  });

  await t.test("quote audit modal uses the same business record and linked detail",async()=>{
   const row=(await x.pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic.ui.root'")).rows[0];
   const actor={internalUserId:row.id,userId:row.public_id,username:"synthetic.ui.root",userName:"合成报价管理员",permissions:[]};
   const quoteId=x.record.quote.id;
   await appendOperationLog(x.pool,actor,{operationId:"operation-quote-ui",module:"报价中心",entityType:"Quote",entityId:quoteId,quoteId,action:"修改报价",beforeData:{objectName:"合成报价日志",values:{name:"修改前"}},afterData:{objectName:"合成报价日志",values:{name:"修改后"}}});
   await command("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
   await navigate("/quote-center/detail?id="+quoteId);
   await until(()=>evalJs("Boolean(document.querySelector('.qc-quote-action-visible'))"),"quote actions loaded");
   if(!await evalJs("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='操作记录'&&n.getClientRects().length)"))await click("更多报价操作");
   await click("操作记录");await has("查看这份报价的操作与修改记录");await has("合成报价日志");
   await click("查看详情");await has("操作详情");await has("修改前");await has("修改后");
   await click("关闭操作详情");await click("关闭操作记录");
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  const distance=relative(resolve(tmpdir()),resolve(temp));
  assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-team-ui-"));
  await rm(temp,{recursive:true,force:true});
 }
});
