import {previewOrderBusinessSource,adoptOrderBusinessSource} from '../sales-orders/business-source-service.ts';
import {readOrderCommercialState} from '../sales-orders/commercial-version-service.ts';
import {readPricingColors} from '../sales-orders/color-commercial.ts';
import {previewSaleAdjustment,commitSaleAdjustment} from '../sales-orders/sale-adjustment-service.ts';
import {randomUUID} from 'node:crypto';
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
test("quote center negotiates selected orders and recovers original receipts", {timeout:180000},async t=>{
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

  const selection={kind:'quote',quoteId:q.id,revisionId:rev.revisionId,priceVersionId:pv.id};
  for(const orderId of [x.orderId,second]){const p=await previewOrderBusinessSource(x.pool,actor,orderId,selection);await adoptOrderBusinessSource(x.pool,actor,orderId,{selection,requestId:(await import('node:crypto')).randomUUID(),expectedVersion:0,fingerprint:p.fingerprint,reason:'Synthetic commercial basis'});}
  const input=async(selector,value)=>{await until(()=>evaluate("Boolean(document.querySelector("+JSON.stringify(selector)+"))"),"input "+selector);return evaluate("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");if(!n)throw Error('missing input');Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");};
  const open=async()=>{await navigate('/quote-center');await has('更多');await click('更多报价操作');await click('批量调整订单成交价');await until(()=>evaluate("[...document.querySelectorAll('[role=dialog]')].some(n=>n.innerText.includes('SO-')||n.innerText.includes('待核对的调价请求'))"),'order dialog ready');};
  await login('demo.admin');
  await t.test('select one order, preview a sale-only change and retain a separate quote authority',async()=>{
    await open();const id=second;await evaluate("(()=>{const n=[...document.querySelectorAll('[role=dialog] tbody tr')].find(n=>n.textContent.includes('SO-00000002'));if(!n)throw Error('missing second order');n.querySelector('input[type=checkbox]').click();})()");
    await input('[aria-label="调价规则数值"]','-2');await click('预览调整');await until(()=>evaluate("Boolean([...document.querySelectorAll('[role=dialog] input')].find(n=>n.value==='118'))"),'preview input 118');await input('[role=dialog] textarea','Synthetic negotiated final garment price');
    await click('确认订单调价');await has('已处理 1 张');assert.equal((await readOrderCommercialState(x.pool,id)).current.salePrice,'118');assert.equal((await readOrderCommercialState(x.pool,x.orderId)).current.salePrice,'120');await click('关闭');
  });
  await t.test('a lost response survives page reload and resolves by original receipt without another adjustment',async()=>{
    await open();await evaluate("[...document.querySelectorAll('[role=dialog] tbody tr')].find(n=>n.textContent.includes('SO-00000002')).querySelector('input[type=checkbox]').click()");await input('[aria-label="调价规则数值"]','-1');await click('预览调整');await input('[role=dialog] textarea','Synthetic response-loss test');
    await evaluate("window.priceFetch=window.fetch;window.dropPrice=true;window.fetch=async(...args)=>{const r=await priceFetch(...args);if(String(args[0])==='/api/v1/order-price-adjustments'&&args[1]?.method==='POST'&&r.ok&&dropPrice){dropPrice=false;throw new TypeError('Synthetic response lost');}return r;}");
    await click('确认订单调价');await has('核对原请求');await command('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});await wait(150);assert.equal(await evaluate("(()=>{const f=document.querySelector('[role=dialog] > footer');return f.scrollWidth<=f.clientWidth+1;})()"),true);await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await open();await has('存在待核对的调价请求');await click('核对原请求');await has('updated');await click('结束本次操作');assert.equal((await readOrderCommercialState(x.pool,second)).version,3);assert.equal((await readOrderCommercialState(x.pool,second)).current.salePrice,'117');await click('关闭');
  });
  await t.test('history is shared and order center exposes no sale adjustment action',async()=>{
    await open();await click('调价历史');await has('Synthetic response-loss test');for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});await wait(200);const r=await evaluate("(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return {left:r.left,right:r.right};})()");assert.ok(r.left>=-1&&r.right<=width+1);await screenshot('sale-adjustment-'+width);}await click('关闭');
    await navigate('/order-center/server-detail?id='+second);await has('117 CNY');await has('订单调价历史');assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>/确认订单调价|批量调整/.test(n.textContent))"),false);
  });
  await t.test('nested quote-source unknown submission blocks browser history and preserves the original command',async()=>{
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await navigate('/order-center');await has('导入加工订单');await click('报价中心');await has('更多');await click('更多报价操作');await click('批量调整订单成交价');await has('SO-00000002');
    await evaluate("[...document.querySelectorAll('[role=dialog] tbody tr')].find(n=>n.textContent.includes('SO-00000002')).querySelector('button').click()");
    await has(q.quoteCode);await evaluate("(()=>{const d=[...document.querySelectorAll('[role=dialog]')].at(-1);const row=[...d.querySelectorAll('tbody tr')].find(n=>n.textContent.includes("+JSON.stringify(q.quoteCode)+"));row.querySelector('button').click();})()");await has('统一应用价格方案');await click('预览来源与价格');await input('[role=dialog] textarea','Synthetic nested source pending');
    await evaluate("window.nestedSourceFetch=window.fetch;window.nestedSourceCommands=[];window.fetch=(...a)=>{if(String(a[0]).endsWith('/business-source')&&a[1]?.method==='POST'){nestedSourceCommands.push(JSON.parse(a[1].body));if(nestedSourceCommands.length===1)return Promise.reject(new TypeError('Synthetic before acceptance'));return Promise.resolve(new Response(JSON.stringify({error:{code:'business_source_changed'}}),{status:409,headers:{'Content-Type':'application/json'}}));}return nestedSourceFetch(...a);}");
    await click('确认维护来源');await has('原请求重试');await evaluate('history.back()');await has('请先完成当前操作');
    assert.equal(await evaluate('location.pathname'),'/quote-center');assert.equal(await evaluate('nestedSourceCommands.length'),1);await click('继续处理');
    await click('原请求重试');await has('报价或颜色已变化');const commands=await evaluate('nestedSourceCommands');assert.equal(commands.length,2);assert.deepEqual(commands[0],commands[1]);
    assert.equal((await readOrderCommercialState(x.pool,second)).current.salePrice,'117');
    await evaluate('window.fetch=window.nestedSourceFetch');await click('关闭');await has('放弃来源选择');await click('放弃并关闭');await click('关闭');
  });
  await t.test('a transport failure before acceptance can retry the exact in-memory command',async()=>{
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await open();await evaluate("[...document.querySelectorAll('[role=dialog] tbody tr')].find(n=>n.textContent.includes('SO-00000002')).querySelector('input[type=checkbox]').click()");await input('[aria-label="调价规则数值"]','-1');await click('预览调整');await input('[role=dialog] textarea','Synthetic pre-acceptance transport failure');
    await evaluate("window.originalPriceFetch=window.fetch;window.rejectBeforePrice=true;window.fetch=(...a)=>{if(String(a[0])==='/api/v1/order-price-adjustments'&&a[1]?.method==='POST'&&rejectBeforePrice){rejectBeforePrice=false;return Promise.reject(new TypeError('Synthetic failed before request'));}return originalPriceFetch(...a);}");await click('确认订单调价');await has('重试原提交');await click('核对原请求');await has('尚未找到原请求回执');await click('重试原提交');await has('已处理 1 张');assert.equal((await readOrderCommercialState(x.pool,second)).version,4);assert.equal((await readOrderCommercialState(x.pool,second)).current.salePrice,'116');await click('关闭');
  });
  await t.test('color summaries distinguish prices within a scheme and schemes with the same price',async()=>{
    const colored=createSyntheticQuoteFixture('color-summary-ui','distribution'),r=colored.revisions.find(v=>v.revisionId===colored.defaultRevisionId);
    for(const v of colored.revisions){v.imageAttachmentIds=[];v.fileAttachmentIds=[];v.styleImageAttachmentId=null;}
    for(const [i,p] of r.priceVersions.entries()){p.name=i?'印花':'素色';p.quantity=100;p.pricingParameters.laborCurrency='CNY';p.confirmation={quotedGarmentPrice:120+i*10,quotedLaborPrice:10,confirmedGarmentPrice:120+i*10,confirmedLaborPrice:10,note:'Synthetic',confirmedAt:'2026-10-19T00:00:00Z'};}
    await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(colored));
    const id=(await createAinuokeSalesOrder(x.pool,actor,{source:{sourceId:'SYN-COLORS',sourceRowIdentity:'SYN-COLORS-ROW',salesContractNo:'SYN-COLORS',insideOrderNo:'SYN-COLORS',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYN-COLORS',companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:100,sourceHash:'synthetic',fetchedAt:'2026-10-19T00:00:00Z'},colors:['黑','白','蓝','红'].map((colorName,i)=>({sourceLineIdentity:'c-'+i,colorName,quantity:25,deliveryDate:null,sourceHash:'c-'+i}))})).salesOrder.id;
    const colors=await readPricingColors(x.pool,id),selection={kind:'quote',quoteId:colored.id,revisionId:r.revisionId,assignments:colors.map(c=>({colorId:c.id,priceVersionId:r.priceVersions[c.colorName==='红'?1:0].id}))},p=await previewOrderBusinessSource(x.pool,actor,id,selection);
    await adoptOrderBusinessSource(x.pool,actor,id,{selection,requestId:randomUUID(),expectedVersion:0,fingerprint:p.fingerprint,reason:'Synthetic color mapping'});
    const adjust=async white=>{
      const rule={kind:'set',value:'128'},overrides=colors.map(c=>({colorId:c.id,price:c.colorName==='白'?white:'128'})),preview=await previewSaleAdjustment(x.pool,actor,{rule,items:[{salesOrderId:id,overrides}]}),item=preview.items[0];assert.equal(item.status,'ready');
      const result=await commitSaleAdjustment(x.pool,actor,{requestId:randomUUID(),reason:'Synthetic color price summary',rule,items:[{salesOrderId:id,expectedVersion:item.expectedVersion,fingerprint:item.fingerprint,overrides}]});assert.equal(result.items[0].status,'updated');
      await navigate('/order-center/server-detail?id='+id);await has('订单调价历史');await until(()=>evaluate("Boolean(document.querySelector('.oc-price-summary'))"),'price summary loaded');
    };
    const groups=()=>evaluate("[...[...document.querySelectorAll('details')].find(n=>n.querySelector('summary')?.textContent==='按价格方案查看颜色').querySelectorAll('p')].map(n=>n.textContent)");
    await adjust('120');
    assert.deepEqual((await groups()).sort(),['素色 · 120 CNY/件：白','素色 · 128 CNY/件：蓝、黑','印花 · 128 CNY/件：红'].sort());
    assert.doesNotMatch(await evaluate("document.querySelector('.oc-price-summary').textContent"),/不适用/);
    await screenshot('color-summary-distinct-20261019');
    await adjust('0');assert.ok((await groups()).includes('素色 · 0 CNY/件：白'));
    await login('demo.material');await navigate('/order-center/server-detail?id='+id);await has('无权查看');
    assert.ok((await groups()).every(v=>!v.includes('128')&&!v.includes('120')&&!v.includes('0 CNY')));
    await login('demo.admin');await adjust('128');await has('统一成交价 128 CNY/件');
    assert.equal(await evaluate("document.querySelector('.oc-server-color-table').innerText.includes('实际成交价')"),false);
    await click('查看价格明细');assert.equal(await evaluate("[...document.querySelectorAll('.oc-server-color-table tbody tr')].filter(n=>n.innerText.includes('128 CNY')).length"),4);
    assert.match(await evaluate("document.querySelector('.oc-server-color-table').innerText"),/印花/);
    assert.match(await evaluate("document.querySelector('.oc-server-color-table').innerText"),/素色/);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  await x.close();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-continuous-ui-"));await rm(temp,{recursive:true,force:true});
 }
});
