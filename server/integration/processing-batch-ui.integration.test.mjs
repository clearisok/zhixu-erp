import {createSyntheticQuoteFixture} from './quote-fixture.ts';
import {createQuoteRepository} from '../quotes/repository.ts';
import {quoteSnapshotFromBrowser} from '../quotes/model.ts';
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
test("processing batches built UI uses real sessions and isolated synthetic data", {timeout:180000},async t=>{
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
  const screenshot=async name=>{if(process.env.PROCESSING_UI_EVIDENCE!=="1")return;const dir=resolve("outputs/processing-ui");await mkdir(dir,{recursive:true});const shot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(dir,name+".png"),Buffer.from(shot.data,"base64"));};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.businessWrites=[];const original=fetch;window.fetch=(...a)=>{if(a[1]?.method&&!['GET','HEAD'].includes(a[1].method)&&!String(a[0]).includes('/auth/'))businessWrites.push(String(a[0]));return original(...a)};"});
  const click=async label=>{await until(()=>evaluate("[...document.querySelectorAll('button')].some(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length)"),label+" enabled");return evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing button '+"+JSON.stringify(label)+");n.click();})()");};
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

  const q=createSyntheticQuoteFixture('ui-processing-synthetic','processing');
  for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;r.baseInfo.quoteStyleNo='SYNTHETIC-ADOPT';r.baseInfo.styleName='合成商业采用';}
  const revision=q.revisions.find(r=>r.revisionId===q.defaultRevisionId),pv=revision.priceVersions[0];pv.quantity=100;pv.trims.forEach(l=>l.usage=0);pv.pricingParameters.laborCurrency='CNY';pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:null,confirmedLaborPrice:12.34,note:'synthetic',confirmedAt:'2026-10-14T00:00:00Z'};
  await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(q));
  const select=async(index,value)=>{await until(()=>evaluate("(()=>{const n=document.querySelectorAll('[role=dialog] select')["+index+"];return n&&!n.matches(':disabled')&&[...n.options].some(o=>o.value==="+JSON.stringify(value)+");})()"),'select option ready');await evaluate("(()=>{const n=document.querySelectorAll('[role=dialog] select')["+index+"];n.value="+JSON.stringify(value)+";n.dispatchEvent(new Event('change',{bubbles:true}));})()");};
  const input=(label,value)=>evaluate("(()=>{const box=[...document.querySelectorAll('[role=dialog] label')].find(n=>n.textContent.trim()==="+JSON.stringify(label)+");const id=box?.getAttribute('for');const n=id?document.getElementById(id):box?.querySelector('input');if(!n)throw Error('missing input '+"+JSON.stringify(label)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await login('demo.admin');await navigate('/quote-center');await has('推送加工订单');
  await t.test('quote entry registers and confirms exact processing version without allocating SO',async()=>{
   await click('推送加工订单');await click('登记新的加工下单 / 再次下单');await has(q.quoteCode);await select(0,q.id);await has(revision.revisionLabel);await select(1,revision.revisionId);await has(pv.name);await select(2,pv.id);
   await input('客户','合成加工客户');await input('业务款号','SYN-PROCESS-UI');await input('本次下单数量','30');await input('下单日期','2026-10-14');await click('登记批次（尚不创建 SO）');await has('已登记，请预览并确认下单');await click('预览下单与工价');await has('12.34 CNY / 件');await screenshot('processing-preview-desktop');await click('确认本次下单');await has('下单已确认');
   assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions')).rows[0].n,0);await click('关闭');
  });
  let orderId;
  await t.test('order entry consumes once and links the formal processing SO',async()=>{
   await navigate('/order-center');await click('导入加工订单');await has('SYN-PROCESS-UI');await evaluate("document.querySelector('input[aria-label=\"选择批次 SYN-PROCESS-UI\"]').click()");await click('确认导入所选 1 项');await has('已创建正式订单');
   const rows=(await x.pool.query('SELECT sales_order_id::text id FROM processing_order_batch_consumptions')).rows;assert.equal(rows.length,1);orderId=rows[0].id;
   await navigate('/order-center/server-detail?id='+orderId);await has('合成加工客户');await has('艾诺科物料流水不适用');await click('认领订单');await has('维护首单 / 翻单血统');
  });
  await t.test('mobile history shows original SO while unauthorized role has no entrypoint',async()=>{
   await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await navigate('/order-center');await click('导入加工订单');await until(()=>evaluate("Boolean([...document.querySelectorAll('[role=dialog] label')].find(n=>n.textContent.includes('包含已处理'))?.querySelector('input:not(:disabled)'))"),"history toggle enabled");await evaluate("[...document.querySelectorAll('[role=dialog] label')].find(n=>n.textContent.includes('包含已处理')).querySelector('input').click()");await has('查看已有订单');await screenshot('processing-history-mobile');assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),true);
   await login('demo.material');await navigate('/order-center');await has('订单中心');assert.equal(await evaluate("document.body.innerText.includes('导入加工订单')"),false);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  await x.close();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-continuous-ui-"));await rm(temp,{recursive:true,force:true});
 }
});
