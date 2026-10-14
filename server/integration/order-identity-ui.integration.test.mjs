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
test("order identity built UI uses real sessions with synthetic data", {timeout:180000},async t=>{
 const info=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));assert.equal(info.orderRead,"snapshot");assert.equal(info.quoteAuthority,"server");
 const x=await startContinuousFixture(resolve("dist/client"));const temp=await mkdtemp(join(tmpdir(),"zhixu-continuous-ui-"));let browser,ws,session,id=0;const pending=new Map(),errors=[];
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
  const screenshot=async name=>{if(process.env.ORDER_IDENTITY_UI_EVIDENCE!=="1")return;const dir=resolve("outputs/order-identity-ui");await mkdir(dir,{recursive:true});const shot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(dir,name+".png"),Buffer.from(shot.data,"base64"));};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.businessWrites=[];const original=fetch;window.fetch=(...a)=>{if(a[1]?.method&&!['GET','HEAD'].includes(a[1].method)&&!String(a[0]).includes('/auth/'))businessWrites.push(String(a[0]));return original(...a)};"});
  const input=(selector,value)=>evaluate("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const click=label=>evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing button '+"+JSON.stringify(label)+");n.click();})()");
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

  await login('demo.merchandising');await navigate('/order-center/server-detail?id='+x.orderId);await has('订单认领与血统');
  const original=(await x.pool.query('SELECT row_to_json(o) doc FROM sales_orders o WHERE id=$1',[x.orderId])).rows[0];
  await t.test('merchandising claims and records first-order lineage without changing source',async()=>{
   await has('待认领');await click('认领订单');await has('维护首单 / 翻单血统');await click('维护首单 / 翻单血统');
   await evaluate("(()=>{const n=document.querySelector('[role=dialog] select');n.value='first';n.dispatchEvent(new Event('change',{bubbles:true}));})()");
   await click('保存血统');await until(()=>evaluate("!document.querySelector('[role=dialog]')"),'saved lineage');
   assert.equal((await x.pool.query('SELECT lineage FROM sales_order_identity_profiles WHERE sales_order_id=$1',[x.orderId])).rows[0].lineage,'first');
   assert.equal(await evaluate("document.body.innerText.includes('转交负责人')"),false);
  });
  await t.test('preparation saves once and reloads without creating a formal SO',async()=>{
   const count=(await x.pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n;
   await click('以本单建立翻单准备');await input('[role=dialog] input[inputmode=decimal]','123');await input('[role=dialog] input[type=date]','2027-01-01');await click('保存准备');await has('123 件');
   await navigate('/order-center/server-detail?id='+x.orderId);await has('123 件');
   assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,count);
  });
  await t.test('admin transfer uses eligible public identities and requires reason',async()=>{
   await login('demo.admin');await navigate('/order-center/server-detail?id='+x.orderId);await has('转交负责人');await click('转交负责人');await has('转交订单负责人');
   assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] select option')].some(n=>n.textContent.includes('物控经理'))"),false);
   await evaluate("(()=>{const n=document.querySelector('[role=dialog] select');n.value=[...n.options].find(o=>o.textContent.includes('合成演示管理员')).value;n.dispatchEvent(new Event('change',{bubbles:true}));const t=document.querySelector('[role=dialog] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'synthetic transfer');t.dispatchEvent(new Event('input',{bubbles:true}));})()");await click('确认转交');await until(()=>evaluate("!document.querySelector('[role=dialog]')"),'saved transfer');
   assert.equal((await x.pool.query('SELECT u.username FROM sales_order_identity_profiles p JOIN app_users u ON u.id=p.owner_id WHERE p.sales_order_id=$1',[x.orderId])).rows[0].username,'demo.admin');
   assert.deepEqual((await x.pool.query('SELECT row_to_json(o) doc FROM sales_orders o WHERE id=$1',[x.orderId])).rows[0],original);
  });
  await t.test('desktop and narrow view retain visible identity controls',async()=>{
   for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});await wait(250);await has('订单认领与血统');await screenshot('identity-'+width);}
   await login('demo.material');await navigate('/order-center/server-detail?id='+x.orderId);await has('订单认领与血统');
   for(const label of ['转交负责人','认领订单','维护首单 / 翻单血统','以本单建立翻单准备'])assert.equal(await evaluate('document.body.innerText.includes('+JSON.stringify(label)+')'),false);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  await x.close();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-continuous-ui-"));await rm(temp,{recursive:true,force:true});
 }
});
