import {createQuoteMasterService} from '../quote-masters/service.ts';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.ts';
import {readOrderCommercialState} from '../sales-orders/commercial-version-service.ts';
import {createSyntheticQuoteFixture} from './quote-fixture.ts';
import {createQuoteRepository} from '../quotes/repository.ts';
import {quoteSnapshotFromBrowser} from '../quotes/model.ts';
import {waitForChromiumEndpoint} from './chromium-endpoint.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
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
test("processing selection, pure labor and synchronized quote push use the real browser", {timeout:180000},async t=>{
 const info=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));assert.equal(info.orderRead,"snapshot");assert.equal(info.quoteAuthority,"server");
 const x=await startContinuousFixture(resolve("dist/client"));const temp=await mkdtemp(join(tmpdir(),"zhixu-continuous-ui-"));let browser,ws,session,id=0;const pending=new Map(),errors=[];
 try{
  const profile=join(temp,"profile");
  browser=spawn(process.env.CHROME_PATH??(process.platform==="win32"?"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe":"google-chrome"),["--headless=new","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:"ignore",windowsHide:true});
  const [port,path]=await waitForChromiumEndpoint(profile,{timeoutMs:20000});ws=new WebSocket("ws://127.0.0.1:"+port+path);await new Promise((done,reject)=>{ws.addEventListener("open",done,{once:true});ws.addEventListener("error",reject,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((done,reject)=>{pending.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params,sessionId:sid}));});
  ws.addEventListener("message",({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(p){pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.done(r.result);}if(r.method==="Runtime.exceptionThrown")errors.push(r.params.exceptionDetails.text);});
  const target=await command("Target.createTarget",{url:"about:blank"},undefined);session=(await command("Target.attachToTarget",{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command("Page.enable");await command("Runtime.enable");await command("Network.enable");
  const evaluate=async expression=>{const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const navigate=async path=>{const marker=Date.now()+Math.random();await evaluate("window.navEpoch="+marker);await command("Page.navigate",{url:x.base+path});await until(()=>evaluate("window.navEpoch!=="+marker+"&&document.readyState==='complete'"),"navigation");};
  const has=async text=>{try{await until(()=>evaluate("Boolean(document.body?.innerText.includes("+JSON.stringify(text)+"))"),text);}catch(error){throw Error(error.message+"; "+await evaluate("document.body?.innerText??'navigation in progress'"));}};
  const login=async username=>{const cookie=await x.login(username);const split=cookie.indexOf("=");await command("Network.setCookie",{name:cookie.slice(0,split),value:cookie.slice(split+1),domain:"127.0.0.1",path:"/",httpOnly:true});};
  const screenshot=async name=>{if(process.env.ORDER_BUSINESS_SOURCE_UI_EVIDENCE!=="1")return;const dir=resolve("outputs/order-business-source-ui");await mkdir(dir,{recursive:true});const shot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(dir,name+".png"),Buffer.from(shot.data,"base64"));};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.businessWrites=[];const original=fetch;window.fetch=(...a)=>{if(a[1]?.method&&!['GET','HEAD'].includes(a[1].method)&&!String(a[0]).includes('/auth/'))businessWrites.push(String(a[0]));return original(...a)};"});
  const click=async label=>{await until(()=>evaluate("[...document.querySelectorAll('button')].some(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length)"),'button '+label);return evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing button '+"+JSON.stringify(label)+");n.click();})()");};
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});



  const q=createSyntheticQuoteFixture('processing-ui-synthetic','processing');for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;r.baseInfo.quoteStyleNo='SYN-PROCESS-UI';r.baseInfo.styleName='Synthetic processing';r.baseInfo.garmentLeadDate='2027-12-01';for(const p of r.priceVersions){p.quantity=300;p.labor.value=10;p.pricingParameters.laborCurrency='CNY';p.confirmation={quotedGarmentPrice:777.125,confirmedGarmentPrice:888.25,quotedLaborPrice:10,confirmedLaborPrice:12,note:'Synthetic preserved',confirmedAt:'2026-10-17T00:00:00Z'};}}
  const rev=q.revisions.find(r=>r.revisionId===q.defaultRevisionId);rev.priceVersions=rev.priceVersions.slice(0,1);rev.confirmationSummary={confirmedCount:1,totalCount:1};q.aggregateStatus='confirmed';const pv=rev.priceVersions[0];const repo=createQuoteRepository(x.pool);await repo.create(quoteSnapshotFromBrowser(q));const original=await repo.getById(q.id);
  const input=async(selector,value)=>{await until(()=>evaluate('Boolean(document.querySelector('+JSON.stringify(selector)+'))'),'input');return evaluate("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");};
  const selectQuote=()=>evaluate("document.querySelector('input[aria-label='+"+JSON.stringify(JSON.stringify('选择 '+q.id))+"+']').click()");
  const more=async label=>{await click('更多报价操作');await click(label);};
  await login('demo.admin');await navigate('/quote-center');await has('SYN-PROCESS-UI');
  await t.test('processing row hides material/garment amounts and both export modes pin selection at the left',async()=>{
   const text=await evaluate("[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('SYN-PROCESS-UI')).innerText");assert.doesNotMatch(text,/面 ¥|辅 ¥|777|888/u);
   for(const label of ['批量客户报价','内部报价汇总']){await more(label);await has('本页全选');await until(()=>evaluate("document.querySelector('table thead th')?.textContent.includes('选择')"),'left checkbox');const heads=await evaluate("[...document.querySelectorAll('table thead th')].map(n=>n.textContent)");assert.match(heads[0],/选择/u);assert.equal(await evaluate("getComputedStyle(document.querySelector('table thead th')).position"),'sticky');const order=await evaluate("[...document.querySelector('.qc-server-selection-context').querySelectorAll('button')].map(n=>n.textContent.trim())");const primary=order.findIndex(n=>/生成客户报价 ZIP|打开内部汇总/u.test(n));assert.equal(order[primary+1],'退出选择');await selectQuote();assert.equal(await evaluate("[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('SYN-PROCESS-UI')).querySelector('td input[type=checkbox]').checked"),true);await click('退出选择');}
  });
  let firstOrder;
  await t.test('More processing push opens an editable second view, saves the quote, then creates a formal order',async()=>{
   await more('推送加工订单');await has('SYN-PROCESS-UI');await selectQuote();await click('确认推送所选报价');await has('确认加工下单与报价同步');await until(()=>evaluate("Boolean(document.querySelector('[aria-label='+"+JSON.stringify(JSON.stringify(q.quoteCode+'款号'))+"+']'))"),'push loaded');const widths=await evaluate("(()=>{const f=document.querySelector('[role=dialog] .oc-source-form');return {form:f.getBoundingClientRect().width,content:f.querySelector('.qc-processing-push-quote').getBoundingClientRect().width};})()");assert.ok(widths.content>=widths.form*0.95,JSON.stringify(widths));await screenshot('processing-sync-desktop');
   await input('[aria-label='+JSON.stringify(q.quoteCode+'款号')+']','SYN-PROCESS-CHANGED');await input('[aria-label='+JSON.stringify(q.quoteCode+' '+pv.name+'数量')+']','450');await input('[aria-label='+JSON.stringify(q.quoteCode+' '+pv.name+'确认工价')+']','18');await click('确认同步并推送');await has('已生成订单');const current=await repo.getById(q.id),r=current.quote.revisions.find(r=>r.revisionId===current.quote.defaultRevisionId);assert.equal(r.baseInfo.quoteStyleNo,'SYN-PROCESS-CHANGED');assert.equal(r.priceVersions[0].quantity,'450');assert.equal(r.priceVersions[0].confirmation.confirmedLaborPrice,'18');assert.equal(r.priceVersions[0].confirmation.confirmedGarmentPrice,'888.25');assert.deepEqual(r.priceVersions[0].fabrics,original.quote.revisions.find(r=>r.revisionId===original.quote.defaultRevisionId).priceVersions[0].fabrics);firstOrder=(await x.pool.query('SELECT s.sales_order_id::text id FROM processing_order_batch_consumptions s JOIN processing_order_batches b ON b.id=s.batch_id WHERE b.quote_id=$1',[q.id])).rows[0].id;await click('关闭');await click('退出选择');
  });
  await t.test('already processed quote shows its SO; explicit repeat purchase creates another batch with its own labor',async()=>{
   await more('推送加工订单');await has('SYN-PROCESS-CHANGED');await selectQuote();await click('确认推送所选报价');await has('已有 SO-');assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent==='确认同步并推送').disabled"),true);
   await evaluate("[...document.querySelectorAll('[role=dialog] label')].find(n=>n.textContent.includes('客户确实再次下单')).querySelector('input').click()");await input('[aria-label='+JSON.stringify(q.quoteCode+' '+pv.name+'确认工价')+']','19');await click('确认同步并推送');await has('已生成订单');assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batches WHERE quote_id=$1',[q.id])).rows[0].n,2);assert.equal((await readOrderCommercialState(x.pool,firstOrder)).current.laborPrice,'18');await click('关闭');await click('退出选择');
  });
  await t.test('quote selection survives pagination without changing the selected identities',async()=>{
   for(let i=0;i<26;i++){const copy=structuredClone(q);copy.id='paging-processing-'+i;copy.quoteCode='QT-PAGING-'+i;copy.activeEstimateCost=null;copy.estimateCostHistory=[];for(const r of copy.revisions)r.baseInfo.quoteStyleNo='SYN-PAGING-'+i;await repo.create(quoteSnapshotFromBrowser(copy));}
   await navigate('/quote-center');await has('SYN-PAGING-');await more('批量客户报价');const first=await evaluate("document.querySelector('tbody input[type=checkbox]').getAttribute('aria-label')");await evaluate("document.querySelector('tbody input[type=checkbox]').click()");await click('下一页');await until(()=>evaluate("Boolean(document.querySelector('tbody input[type=checkbox]'))&&document.querySelector('tbody input[type=checkbox]').getAttribute('aria-label')!=="+JSON.stringify(first)),'next quote page');await evaluate("document.querySelector('tbody input[type=checkbox]').click()");await has('已选 2 / 25');await click('上一页');await until(()=>evaluate("document.querySelector('tbody input[type=checkbox]')?.getAttribute('aria-label')==="+JSON.stringify(first)),'original quote page');assert.equal(await evaluate("document.querySelector('tbody input[type=checkbox]').checked"),true);await click('退出选择');
  });
  await t.test('processing details and raw response contain labor only while hidden stored facts remain intact',async()=>{
   await navigate('/quote-center/detail?id='+q.id);await until(()=>evaluate("Boolean(document.querySelector('[aria-label=加工报价工价摘要]'))"),'labor cockpit');const text=await evaluate("document.querySelector('[aria-label=加工报价工价摘要]').innerText");assert.doesNotMatch(text,/面料|辅料|成衣销售|加成/u);assert.equal(await evaluate("document.querySelector('#quote-section-fabrics')!==null"),false);assert.equal(await evaluate("document.querySelector('#quote-section-other-costs')!==null"),false);
   const response=await evaluate("fetch('/api/v1/quotes/"+q.id+"').then(r=>r.text())");assert.doesNotMatch(response,/888\.25|777\.125/u);assert.equal((await repo.getById(q.id)).quote.revisions.find(r=>r.revisionId===rev.revisionId).priceVersions[0].confirmation.confirmedGarmentPrice,'888.25');
  });
  await t.test('a labor-only account can confirm processing in the quote editor without sale controls',async()=>{
   await x.pool.query("INSERT INTO app_roles(id,name) VALUES('processing-labor-only','Synthetic labor only')");await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) SELECT DISTINCT 'processing-labor-only',p.permission_key FROM app_role_permissions p JOIN app_user_roles ur ON ur.role_id=p.role_id JOIN app_users u ON u.id=ur.user_id WHERE u.username='demo.admin' AND p.permission_key NOT IN ('commercial.sale.view','commercial.sale.edit')");const user=(await x.pool.query("INSERT INTO app_users(username,password_hash,display_name,role) SELECT 'processing.labor',password_hash,'Synthetic labor only','viewer' FROM app_users WHERE username='demo.admin' RETURNING id")).rows[0];await x.pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'processing-labor-only')",[user.id]);
   await login('processing.labor');await navigate('/quote-center/detail?id='+q.id);await has('查看 / 更新确认');await click('查看 / 更新确认');await until(()=>evaluate("Boolean(document.querySelector('[role=dialog] input[inputmode=decimal]'))"),'labor confirmation ready');assert.equal(await evaluate("document.querySelectorAll('[role=dialog] input[inputmode=decimal]').length"),1);assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('客户确认成衣')"),false);await input('[role=dialog] input[inputmode=decimal]','21');await click('保存确认');await has('已保存 Server 客户确认');const saved=await repo.getById(q.id);assert.equal(saved.quote.revisions.find(r=>r.revisionId===rev.revisionId).priceVersions[0].confirmation.confirmedLaborPrice,'21');assert.equal(saved.quote.revisions.find(r=>r.revisionId===rev.revisionId).priceVersions[0].confirmation.confirmedGarmentPrice,'888.25');assert.equal((await readOrderCommercialState(x.pool,firstOrder)).current.laborPrice,'18');
  });
  await t.test('processing creation and its price settings show labor fields only',async()=>{
   const actor=await loadExistingBootstrapActor(x.pool,'demo.admin'),master=createQuoteMasterService(x.pool),settings=await master.getGlobalSettings(actor);await master.updateGlobalSettings(actor,settings?.version??0,{defaultUsdCnyRate:'7',defaultMarkupRate:'0.1',defaultLaborCurrency:'CNY',defaultLaborDescription:'Synthetic processing',defaultOtherCost:null,defaultManufacturingPresetId:null,...settings,defaultQuoteType:'processing'});
   await login('demo.admin');await navigate('/quote-center/new');await click('＋ 新建报价');await has('草稿已创建并保留');await until(()=>evaluate("Boolean(document.querySelector('[aria-label=加工报价工价摘要]'))"),'created processing quote');await click('报价设置');await has('加工币种');const text=await evaluate("document.querySelector('[role=dialog]').innerText");assert.doesNotMatch(text,/成本加成|汇率|成衣销售|运费/u);await click('完成');
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  await x.close();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-continuous-ui-"));await rm(temp,{recursive:true,force:true});
 }
});
