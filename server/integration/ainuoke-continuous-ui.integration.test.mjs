import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { existsSync,readFileSync } from "node:fs";
import { mkdtemp,rm,mkdir,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve,relative,isAbsolute } from "node:path";
import { startContinuousFixture } from "./ainuoke-continuous-fixture.ts";
const wait=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,label,timeout=20000){
 const end=Date.now()+timeout;
 while(Date.now()<end){
  try{if(await read())return;}
  catch(error){
   // A real page navigation invalidates the old CDP execution context. Retry
   // only that transient transport error; assertions and app errors still fail.
   if(!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context with specified id/.test(String(error)))throw error;
  }
  await wait(100);
 }
 throw Error(label+" timed out");
}
test("built existing P6 pages use bound orders and persisted four-stream sources", {timeout:180000},async t=>{
 const info=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));assert.equal(info.orderRead,"snapshot");assert.equal(info.quoteAuthority,"server");
 const x=await startContinuousFixture(resolve("dist/client"),{orderAlerts:true});const temp=await mkdtemp(join(tmpdir(),"zhixu-continuous-ui-"));const metrics=[];let browser,ws,session,id=0;const pending=new Map(),errors=[];
 try{
  const profile=join(temp,"profile");
  browser=spawn(process.env.CHROME_PATH??(process.platform==="win32"?"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe":"google-chrome"),["--headless=new","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:"ignore",windowsHide:true});
  await until(()=>existsSync(join(profile,"DevToolsActivePort")),"Chromium");
  const [port,path]=readFileSync(join(profile,"DevToolsActivePort"),"utf8").trim().split(/\r?\n/);ws=new WebSocket("ws://127.0.0.1:"+port+path);await new Promise((done,reject)=>{ws.addEventListener("open",done,{once:true});ws.addEventListener("error",reject,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((done,reject)=>{pending.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params,sessionId:sid}));});
  ws.addEventListener("message",({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(p){pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.done(r.result);}if(r.method==="Runtime.exceptionThrown")errors.push(r.params.exceptionDetails.text);});
  const target=await command("Target.createTarget",{url:"about:blank"},undefined);session=(await command("Target.attachToTarget",{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command("Page.enable");await command("Runtime.enable");await command("Network.enable");
  const evaluate=async expression=>{const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const navigate=async path=>{const marker=Date.now()+Math.random();await evaluate("window.navEpoch="+marker);await command("Page.navigate",{url:x.base+path});await until(()=>evaluate("window.navEpoch!=="+marker+"&&document.readyState==='complete'"),"navigation");};
  const has=async text=>{try{await until(()=>evaluate("Boolean(document.body?.innerText.includes("+JSON.stringify(text)+"))"),text);}catch(error){throw Error(error.message+"; "+await evaluate("document.body?.innerText??'navigation in progress'"));}};
  const login=async username=>{const cookie=await x.login(username);const split=cookie.indexOf("=");await command("Network.setCookie",{name:cookie.slice(0,split),value:cookie.slice(split+1),domain:"127.0.0.1",path:"/",httpOnly:true});};
  const screenshot=async name=>{if(process.env.AINUOKE_UI_EVIDENCE!=="1")return;const dir=resolve("outputs/user-menu-2026-10-14");await mkdir(dir,{recursive:true});const shot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(dir,name+".png"),Buffer.from(shot.data,"base64"));};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.businessWrites=[];const original=fetch;window.fetch=(...a)=>{if(a[1]?.method&&!['GET','HEAD'].includes(a[1].method)&&!String(a[0]).includes('/auth/'))businessWrites.push(String(a[0]));return original(...a)};"});
  const input=(selector,value)=>evaluate("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const click=label=>evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing button '+"+JSON.stringify(label)+");n.click();})()");
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await t.test("animated login, order deep-link, quote navigation and logout share one trusted session",async()=>{
   const target="/order-center/server-detail?id="+x.orderId+"#resume";
   await navigate(target);await has("忘记密码？请联系系统管理员");
   assert.equal(await evaluate("location.pathname"),"/login");
   assert.equal(await evaluate("new URLSearchParams(location.search).get('returnTo')"),target);
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.zx-login')).display"),"grid");await screenshot("login-combined");
   await input("input[name=username]",x.users[0]);await input("input[name=password]",x.password);await click("登录织序");
   await has("物料采购汇总");assert.equal(await evaluate("location.pathname+location.search+location.hash"),target);
   await click("报价中心");await has("SYNTHETIC-TEE-001");await has("合成演示T恤");
   assert.equal(await evaluate("location.pathname"),"/quote-center");
   await click("订单中心");await has("SC-SYNTHETIC-001");
   const material="/order-center/style-progress/detail?orderId="+x.orderId;
   await navigate(material);await has("合成棉布");
   await click("用户菜单");await click("退出登录");await has("忘记密码？请联系系统管理员");
   assert.equal(await evaluate("new URLSearchParams(location.search).get('returnTo')"),material);
   assert.equal(await evaluate("document.querySelectorAll('[data-canonical-material-key]').length"),0);
   assert.equal(await evaluate("(async()=> (await fetch('/api/v1/sales-orders')).status)()"),401);
   await input("input[name=username]",x.users[3]);await input("input[name=password]",x.password);await click("登录织序");await has("合成棉布");
   assert.equal(await evaluate("location.pathname+location.search"),material);
   assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
  });
  await login(x.users[0]);
  for(const width of [1440,1280,390])await t.test("existing layout and real CSS at "+width,async()=>{
   await command("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:width===390});
   await navigate("/order-center");await has("SC-SYNTHETIC-001");
   await has("数量0");await has("单位为空");
   assert.equal(await evaluate("document.querySelectorAll('.qc-server-session-floating').length"),0);
   assert.equal(await evaluate("document.querySelectorAll('.qc-user-popover').length"),0);
   if(width===390){await click("用户菜单");}else{
    const position=await evaluate("(()=>{const r=document.querySelector('.qc-user-menu').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",...position});
   }
   await has("退出登录");assert.equal(await evaluate("document.querySelector('.qc-user-menu button').getAttribute('aria-expanded')"),"true");
   assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth+1"),false);await screenshot("user-menu-"+width);
   await evaluate("document.querySelector('.qc-user-menu button').focus()");
   await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
   await until(()=>evaluate("!document.querySelector('.qc-user-popover')"),"Escape closes user menu");

   assert.equal(await evaluate("document.querySelectorAll('.oc-order-alert-chip').length>=2"),true);
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.qc-toolbar')).display"),"flex");
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.qc-page-container')).display"),"grid");
   assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth+1"),false);await screenshot("list-"+width);
   await navigate("/order-center/server-detail?id="+x.orderId);await has("物料采购汇总");await has("来源读取");await has("2026-11-01");
   const result=await evaluate("(()=>{const dl=document.querySelector('.oc-server-detail-overview .qc-description-list');return{columns:getComputedStyle(dl).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth+1,technicalOpen:document.querySelector('.oc-server-technical-details').open};})()");
   assert.equal(result.columns,width>=1280?3:1);assert.equal(result.overflow,false);assert.equal(result.technicalOpen,false);metrics.push({width,...result});await screenshot("order-"+width);
   await evaluate("[...document.querySelectorAll('a')].find(n=>n.textContent.includes('查看物料跟进')).click()");await has("合成棉布");
   assert.equal(await evaluate("document.querySelectorAll('[data-canonical-material-key]').length"),4);
   for(const label of ["采购","入库","物料出运","物料出库"])await has(label);
   assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth+1"),false);
   await evaluate("document.querySelector('.sp-v4-material-identity').click()");await has("12.75");await screenshot("material-"+width);
   assert.deepEqual(await evaluate("window.businessWrites"),[]);
   assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
  });
  await t.test("all six trusted roles see four-stream procurement; no amount sentinel or Browser fallback",async()=>{
   for(const user of x.users){await login(user);await navigate("/order-center/style-progress/detail?orderId="+x.orderId);await has("合成棉布");await evaluate("document.querySelector('.sp-v4-material-identity').click()");await has("12.75");assert.equal(await evaluate("document.body.innerText.includes('protected-commercial-sentinel')"),false);}
  });
  await t.test("automatic polling observes next persisted generation without navigation or reload",async()=>{
   const before=x.materialReads();await x.capture();await until(()=>evaluate("document.body.innerText.includes('PO-SYNTHETIC-partial-a-G1')"),"automatic next generation",40000);assert.ok(x.materialReads()>before);
  });
  await t.test("failure clears displayed facts and focus-driven recovery reuses the existing layout",async()=>{
   x.setMode("failed");await assert.rejects(x.capture());await evaluate("window.dispatchEvent(new Event('focus'))");await has("物料来源读取失败");
   assert.equal(await evaluate("document.querySelectorAll('[data-canonical-material-key]').length"),0);
   x.setMode("ready");await x.capture();await evaluate("window.dispatchEvent(new Event('focus'))");await has("合成棉布");
   x.setMode("stale");await evaluate("window.dispatchEvent(new Event('focus'))");await has("来源已超出可信读取时效");assert.equal(await evaluate("document.querySelectorAll('[data-canonical-material-key]').length"),0);x.setMode("ready");
  });
  await t.test("missing UUID and unsupported routes cannot enter old Browser pages",async()=>{
   await navigate("/order-center/style-progress/detail");await has("仅接受正式订单 UUID");
   for(const route of ["/order-center/new","/order-center/style-progress","/order-center/risks","/production-scheduling","/closing-center"]){await navigate(route);await has("此模块未在当前候选中启用");}
   assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
  if(process.env.AINUOKE_UI_EVIDENCE==="1")await writeFile(resolve("outputs/user-menu-2026-10-14/computed-styles.json"),JSON.stringify({build:info,metrics},null,2)+"\n");
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  await x.close();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-continuous-ui-"));await rm(temp,{recursive:true,force:true});
 }
});
