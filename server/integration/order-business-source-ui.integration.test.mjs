import {createSyntheticQuoteFixture} from './quote-fixture.ts';
import {createQuoteRepository} from '../quotes/repository.ts';
import {quoteSnapshotFromBrowser} from '../quotes/model.ts';
import {createAinuokeSalesOrder} from '../sales-orders/service.ts';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.ts';
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
test("business source UI replaces ownership and uses exact confirmed conditions", {timeout:180000},async t=>{
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


  const q=createSyntheticQuoteFixture('source-ui-synthetic','distribution');for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;}
  const rev=q.revisions.find(r=>r.revisionId===q.defaultRevisionId),pv=rev.priceVersions[0];pv.quantity=100;pv.pricingParameters.laborCurrency='CNY';pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:120,confirmedLaborPrice:10,note:'synthetic',confirmedAt:'2026-10-17T00:00:00Z'};
  await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(q));
  const actor=await loadExistingBootstrapActor(x.pool,'demo.admin');
  const second=(await createAinuokeSalesOrder(x.pool,actor,{source:{sourceId:'SYN-SECOND',sourceRowIdentity:'SYN-SECOND-ROW',salesContractNo:'SYN-SECOND-CONTRACT',insideOrderNo:'SYN-SECOND-FACTORY',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYNTHETIC-SECOND',companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:100,sourceHash:'synthetic',fetchedAt:'2026-10-17T00:00:00Z'},colors:[]})).salesOrder.id;
  const reason=value=>evaluate("(()=>{const n=document.querySelector('[role=dialog] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await login('demo.admin');
  await t.test('compact order header keeps retired ownership and normalization actions absent',async()=>{
    await navigate('/order-center');await has('导入加工订单');
    for(const old of ['重复订单复核','归一岗位复核'])assert.equal(await evaluate('document.body.innerText.includes('+JSON.stringify(old)+')'),false);
  });
  const chooseQuote=async()=>{await click('维护来源');await has(q.quoteCode);await evaluate("(()=>{const row=[...document.querySelectorAll('[role=dialog] tbody tr')].find(n=>n.textContent.includes("+JSON.stringify(q.quoteCode)+"));row.querySelector('button').click();})()");await has('统一应用价格方案');await click('预览来源与价格');await has('120 CNY / 件');await reason('Synthetic confirmed quote source');};
  await login('demo.merchandising');await navigate('/order-center/server-detail?id='+x.orderId);await has('维护来源');
  await t.test('large centered quote-only wizard adopts confirmed color prices without ownership',async()=>{
    for(const old of ['订单认领与血统','认领订单','转交负责人','以本单建立翻单准备'])assert.equal(await evaluate('document.body.innerText.includes('+JSON.stringify(old)+')'),false);
    await chooseQuote();assert.equal(await evaluate("document.querySelector('[role=dialog]').classList.contains('oc-source-modal')"),true);
    await click('确认维护来源');await has('报价来源和订单价格已保存');assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_identity_profiles WHERE owner_id IS NOT NULL')).rows[0].n,0);await click('关闭');await has('统一成交价');
  });
  await t.test('uncertain save retries the same command and never creates a second price version',async()=>{
    await navigate('/order-center/server-detail?id='+second);await has('维护来源');await chooseQuote();
    await evaluate("window.sourceRequests=[];window.sourceFetch=window.fetch;window.dropSourceResponse=true;window.fetch=async(...args)=>{const save=String(args[0]).endsWith('/business-source')&&args[1]?.method==='POST';if(save)sourceRequests.push(JSON.parse(args[1].body));const response=await sourceFetch(...args);if(save&&response.ok&&dropSourceResponse){dropSourceResponse=false;throw new TypeError('synthetic response lost');}return response;}");
    await click('确认维护来源');await has('原请求重试');await until(()=>evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='原请求重试'&&!n.disabled)"),'retry enabled');await click('原请求重试');await has('报价来源和订单价格已保存');const requests=await evaluate('sourceRequests');assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);await evaluate('window.fetch=window.sourceFetch');
    assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions WHERE sales_order_id=$1',[second])).rows[0].n,1);await click('关闭');
  });
  await t.test('existing price is read-only in order center and all new sources are quotes',async()=>{
    await click('维护来源');await has('调整成交价或更换报价依据');assert.equal(await evaluate("document.querySelectorAll('[role=dialog] select').length"),0);await click('关闭');await navigate('/order-center');await has('来自报价');assert.equal(await evaluate("document.body.innerText.includes('待认领')"),false);
  });
  await t.test('modal fits desktop/mobile and restricted role receives no price input or amount',async()=>{
    await navigate('/order-center/server-detail?id='+second);await has('维护来源');await click('维护来源');await has('采用报价');
    for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});await wait(250);const rect=await evaluate("(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};})()");assert.ok(rect.left>=-1&&rect.right<=width+1&&rect.width<=1281,JSON.stringify(rect));await screenshot('source-v2-'+width);}
    await click('关闭');await login('demo.material');await navigate('/order-center/server-detail?id='+second);await has('维护来源');await click('维护来源');await has('无权查看');assert.equal(await evaluate("document.body.innerText.includes('120 CNY')"),false);assert.equal(await evaluate("document.querySelectorAll('[role=dialog] select').length"),0);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  await x.close();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-continuous-ui-"));await rm(temp,{recursive:true,force:true});
 }
});
