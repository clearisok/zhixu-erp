import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.ts";
import { createQuoteRepository } from "../quotes/repository.ts";
import { createSyntheticQuoteFixture } from "./quote-fixture.ts";
import { quoteSnapshotFromBrowser } from "../quotes/model.ts";
import { createQuoteService } from "../quotes/service.ts";
import { createSalesOrder } from "../sales-orders/repository.ts";
import { startCommercialOrderBrowser } from "./commercial-browser-fixture/server.mjs";

const wait = ms => new Promise(done => setTimeout(done,ms));
async function until(read,label) { for(let i=0;i<120;i++){if(await read())return;await wait(100);}throw Error(label+" timed out"); }

test("Actual Quote/Order Chromium isolates commercial fields across grants, revocation and identity changes",{timeout:180000},async t=>{
 const build=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));
 assert.equal(build.quoteAuthority,"server");assert.equal(build.masterSettingsAuthority,"server");
 const x=await startCommercialSecurityFixture(resolve("dist/client"),q=>{
  for(const r of q.revisions){r.garmentMedia=[];r.baseInfo.quoteStyleNo="SYNTHETIC-SECURITY";r.baseInfo.styleName="Synthetic security";for(const p of r.priceVersions){p.quantity=20;p.pricingParameters.laborCurrency="USD";for(const trim of p.trims)trim.usage=0;if(p.confirmation){p.confirmation.confirmedGarmentPrice=54321;p.confirmation.confirmedLaborPrice=76543;}}}
 });t.after(x.close);
 const orderBrowser=await startCommercialOrderBrowser(x.base);t.after(orderBrowser.close);
 x.origins.push(orderBrowser.url);
 const q=structuredClone(x.record.quote);
 const orderId=x.orderPath.split("/")[4];
 const common=["quote.view","quote.revision.view","order.view","order.edit","quote.confirm"];
 const roles={
  viewer:common,
  cost:[...common,"quote.cost.view"],
  sale:[...common,"quote.cost.view","commercial.sale.view","commercial.sale.edit"],
  labor:[...common,"quote.cost.view","commercial.labor.view","commercial.labor.edit"],
  saleNoCost:[...common,"commercial.sale.view","commercial.sale.edit"],
  laborNoCost:[...common,"commercial.labor.view","commercial.labor.edit"],
  both:[...common,"quote.cost.view","commercial.sale.view","commercial.sale.edit","commercial.labor.view","commercial.labor.edit"],
 };
 for(const [name,keys] of Object.entries(roles))await x.user("browser-"+name.toLowerCase(),keys);
 const temp=await mkdtemp(join(tmpdir(),"zhixu-commercial-browser-"));
 let browser,ws,session;let id=0;
 const pending=new Map(), errors=[];
 try {
  const profile=join(temp,"profile");
  browser=spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",["--headless=new","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:"ignore",windowsHide:true});
  await until(()=>existsSync(join(profile,"DevToolsActivePort")),"Chromium");
  const [port,path]=readFileSync(join(profile,"DevToolsActivePort"),"utf8").trim().split(/\r?\n/);
  ws=new WebSocket("ws://127.0.0.1:"+port+path);await new Promise((done,reject)=>{ws.addEventListener("open",done,{once:true});ws.addEventListener("error",reject,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((done,reject)=>{pending.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params,sessionId:sid}));});
  ws.addEventListener("message",({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(p){pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.done(r.result);}if(r.method==="Runtime.exceptionThrown")errors.push(r.params.exceptionDetails.text);});
  const target=await command("Target.createTarget",{url:"about:blank"},undefined);
  session=(await command("Target.attachToTarget",{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command("Page.enable");await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const evalJs=async expression=>{const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,r.exceptionDetails?.text);return r.result.value;};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:`
   window.safeResponses=[];window.safeWrites=[];window.uiErrors=[];window.addEventListener('error',e=>uiErrors.push(e.message));window.addEventListener('unhandledrejection',e=>uiErrors.push(String(e.reason)));
   const original=fetch;window.fetch=async(...a)=>{if(a[1]?.method==='PATCH')safeWrites.push({url:String(a[0]),body:JSON.parse(a[1].body)});const r=await original(...a);if(r.headers.get('content-type')?.includes('json')&&String(a[0]).includes('/api/'))safeResponses.push({url:String(a[0]),body:await r.clone().text()});return r};
  `});
  const text=()=>evalJs("document.body.innerText");
  const has=async label=>{try{await until(async()=>(await text()).includes(label),label);}catch(error){throw Error(error.message+"; synthetic page: "+await text());}};
  const navigate=async path=>{const epoch=Date.now()+Math.random();await evalJs("window.navigationEpoch="+epoch);await command("Page.navigate",{url:(path.startsWith("/order")?orderBrowser.url:x.base)+path});await until(()=>evalJs("window.navigationEpoch!=="+epoch+" && document.readyState==='complete'"),"navigation");};
  const click=label=>evalJs(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(label)}&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('button missing '+${JSON.stringify(label)});n.click()})()`);
  const input=async(selector,value)=>evalJs(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const login=async name=>{await navigate("/quote-center");await evalJs("fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Zhixu-Request':'1'}})");await navigate("/quote-center");await has("登录织序 Server");await input("input[name=username]","browser-"+name.toLowerCase());await input("input[name=password]","synthetic-only");await click("登录 Server");await has("显示 ");};
  const checkLeaks=async(sale,labor,cost)=>{
   const body=await text();const responses=await evalJs("(()=>{const out=[];function walk(x){if(x&&typeof x==='object')Object.values(x).forEach(walk);else out.push(String(x));}safeResponses.filter(r=>!r.url.includes('/auth/')).forEach(r=>walk(JSON.parse(r.body)));return out})()");
   const stored=await evalJs("(()=>{const out=[];function walk(x){if(x&&typeof x==='object')Object.values(x).forEach(walk);else out.push(String(x));}for(const s of [localStorage,sessionStorage])for(const v of Object.values(s)){try{walk(JSON.parse(v));}catch{out.push(v);}}return out})()");
   for(const [allowed,values] of [[sale,["12345","54321","987.654321"]],[labor,["67890","76543"]],[cost,["98765"]]])if(!allowed)for(const value of values){const exact=new RegExp("(?<![\\d.])"+value.replaceAll(".","\\.")+"(?!\\d)","u");assert.equal(exact.test(body),false,"DOM leak "+value+" (not a substring of authorized exchange rate)");assert.equal(responses.includes(value),false,"response leak "+value);assert.equal(stored.includes(value),false,"storage leak");}
   if(!sale){
    assert.equal(/¥795009\.4(?!\d)/u.test(body),false,"derived selling-price DOM leak (not the distinct, permitted ¥795009.48 internal cost)");
    assert.equal(await evalJs("/¥795009\\.4(?!\\d)/u.test(document.body.outerHTML)"),false,"selling price must not be stored in hidden DOM attributes");
   }
  };
  const screenshots=resolve("outputs/commercial-security");
  await mkdir(screenshots,{recursive:true});
  const shot=async name=>{const r=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(screenshots,name+".png"),Buffer.from(r.data,"base64"));};
  for(const [name,sale,labor,cost] of [["viewer",false,false,false],["cost",false,false,true],["sale",true,false,true],["labor",false,true,true],["both",true,true,true],["saleNoCost",true,false,false],["laborNoCost",false,true,false]]){
   await t.test(name+" actual detail/history/Order fields",async()=>{
    await login(name);await checkLeaks(sale,labor,cost);await shot(name+"-list");await navigate("/quote-center/detail?id="+q.id);await has("SYNTHETIC-SECURITY");if(cost)await until(()=>evalJs("safeResponses.some(r=>r.url.includes('confirmed-commercial-terms'))"),"CCT");
    if(cost)await has("测算销售单价");
    await checkLeaks(sale,labor,cost);await shot(name+"-quote");
    if(cost){
     assert.equal(await evalJs("document.querySelector('.qc-cockpit-final strong').textContent"),sale?"¥795009.4":"无权查看");
     assert.equal(await evalJs("[...document.querySelectorAll('.qc-version-facts span')].filter(n=>n.querySelector('small')?.textContent==='测算销售单价').every(n=>n.querySelector('strong').textContent==="+JSON.stringify(sale?"¥795009.4":"无权查看")+")"),true);
     await evalJs("document.querySelector('[aria-label=\"查看成衣销售价格构成\"]').click()");await has("最终报价");await checkLeaks(sale,labor,cost);
     assert.equal(await evalJs("document.querySelector('.qc-price-breakdown .is-total dd').textContent.includes('无权查看')"),!sale);
     await shot(name+"-breakdown");await evalJs("[...document.querySelectorAll('[role=dialog] button')].find(n=>n.getAttribute('aria-label')?.startsWith('关闭')).click()");
    }
    if(cost){
     await evalJs("[...document.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')==='更多报价操作')?.click()");
     const history=await evalJs("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='查看报价历史'&&!n.disabled)");
     if(history){await click("查看报价历史");await evalJs("[...document.querySelectorAll('.qc-revision-pill')].find(n=>n.querySelector('.qc-revision-label')?.textContent==='V1').click()");await checkLeaks(sale,labor,cost);await click("查看");await has("历史只读");await checkLeaks(sale,labor,cost);}
    }
    await navigate("/order-center/server-detail?id="+orderId);await has("客户确认价格");await checkLeaks(sale,labor,cost);
    const labels=await text();assert.equal(labels.includes("12345"),sale);assert.equal(labels.includes("67890"),labor);
    if(!sale||!labor)await has("无权查看");
    if(sale||labor){
     await click("编辑确认商业条款");await has("编辑确认商业条款");const disabled=await evalJs("[...document.querySelectorAll('[role=dialog] input')].map(n=>n.disabled)");assert.equal(disabled[0],!sale);assert.equal(disabled[1],!labor);
     await click("保存");await until(()=>evalJs("[...document.querySelectorAll('[role=dialog]')].every(n=>!n.getClientRects().length)"),"Order save closed");
     const write=await evalJs("safeWrites.at(-1).body");assert.equal(Object.hasOwn(write,"customerConfirmedPrice"),sale);assert.equal(Object.hasOwn(write,"confirmedLaborPrice"),labor);assert.equal(Object.hasOwn(write,"laborCurrency"),labor);
     await checkLeaks(sale,labor,cost);
    }
    await evalJs("document.querySelector('.oc-server-detail-commercial-terms').scrollIntoView()");
    await shot(name+"-order");assert.equal(await evalJs("document.documentElement.scrollWidth>innerWidth+1"),false);
   });
  }
  await t.test("same browser account switch and refresh cannot retain full-reader amounts",async()=>{
   await login("both");await navigate("/order-center/server-detail?id="+orderId);await has("12345");
   await click("退出登录");await has("登录织序 Server");assert.equal((await text()).includes("12345"),false);
   await evalJs("safeResponses=[]");await input("input[name=username]","browser-viewer");await input("input[name=password]","synthetic-only");await click("登录 Server");await has("客户确认价格");await checkLeaks(false,false,false);
   await navigate("/order-center/server-detail?id="+orderId);await has("客户确认价格");await checkLeaks(false,false,false);
  });
  await t.test("existing session refresh enforces revoked commercial grants",async()=>{
   await login("both");await navigate("/order-center/server-detail?id="+orderId);await has("12345");
   await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='browser-both' AND permission_key LIKE 'commercial.%'");
   await navigate("/order-center/server-detail?id="+orderId);await has("无权查看");await checkLeaks(false,false,true);
  });
  await t.test("Quote linked confirmation modal allows only granted input without full snapshot write",async()=>{
   for(const [name,canSale,canLabor] of [["sale",true,false],["labor",false,true]]){
    await login(name);await navigate("/quote-center/detail?id="+q.id);await has("SYNTHETIC-SECURITY");await until(()=>evalJs("safeResponses.some(r=>r.url.includes('confirmed-commercial-terms'))"),"CCT");
    await click("查看 / 更新共享条款");await has("客户确认工价");await checkLeaks(canSale,canLabor,true);
    const disabled=await evalJs("[...document.querySelectorAll('[role=dialog] input')].filter(n=>n.inputMode==='decimal').map(n=>n.disabled)");
    assert.deepEqual(disabled,[!canLabor,!canSale]);await click("保存确认");await until(()=>evalJs("[...document.querySelectorAll('[role=dialog]')].every(n=>!n.getClientRects().length)"),"Quote save closed");
    const write=await evalJs("safeWrites.at(-1).body");assert.equal(Object.hasOwn(write,"customerConfirmedPrice"),canSale);assert.equal(Object.hasOwn(write,"confirmedLaborPrice"),canLabor);assert.equal(Object.hasOwn(write,"expectedQuoteVersion"),true);
    await checkLeaks(canSale,canLabor,true);
   }
  });
  await t.test("Quote permission revocation, identity switch and refresh remove calculated sales prices",async()=>{
   await login("sale");await navigate("/quote-center/detail?id="+q.id);await has("¥795009.4");
   await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='browser-sale' AND permission_key LIKE 'commercial.sale.%'");
   await navigate("/quote-center/detail?id="+q.id);await has("测算销售单价");await checkLeaks(false,false,true);
   assert.equal(await evalJs("document.querySelector('.qc-cockpit-final strong').textContent"),"无权查看");
   await login("viewer");await navigate("/quote-center/detail?id="+q.id);await has("SYNTHETIC-SECURITY");await checkLeaks(false,false,false);
   await navigate("/quote-center/detail?id="+q.id);await has("SYNTHETIC-SECURITY");await checkLeaks(false,false,false);
  });
  await t.test("desktop and mobile preserve operational layout",async()=>{
   await login("cost");
   for(const width of [1920,1280,390]){
    await command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width===390});
    for(const path of ["/quote-center/detail?id="+q.id,"/order-center/server-detail?id="+orderId]){
     await navigate(path);await has(path.startsWith("/quote")?"SYNTHETIC-SECURITY":"客户确认价格");assert.equal(await evalJs("document.documentElement.scrollWidth>innerWidth+1"),false);await checkLeaks(false,false,true);await shot((path.startsWith("/quote")?"quote":"order")+"-"+width);
    }
   }
  });
  assert.deepEqual(errors,[]);assert.deepEqual(await evalJs("uiErrors"),[]);
 }finally{ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}await rm(temp,{recursive:true,force:true});}
});

test("Processing labor-only PATCH succeeds while complete confirmation.save remains protected",async t=>{
 const x=await startCommercialSecurityFixture();t.after(x.close);
 const source=createSyntheticQuoteFixture("synthetic-processing-security","processing");
 for(const r of source.revisions){r.garmentMedia=[];r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;r.baseInfo.quoteStyleNo="PROCESSING";r.baseInfo.styleName="Synthetic processing";for(const p of r.priceVersions){p.confirmation=null;p.pricingParameters.laborCurrency="USD";for(const trim of p.trims)trim.usage=0;}}
 const saved=await createQuoteService(x.pool).createAggregate(quoteSnapshotFromBrowser(source));const r=saved.quote.revisions.at(-1),p=r.priceVersions[0];
 const cookie=await x.user("processing-labor-only",["quote.view","quote.confirm","commercial.labor.view","commercial.labor.edit"]);
 const path="/api/v1/quotes/"+saved.quote.id;
 const before=(await x.pool.query("SELECT count(*)::int n FROM operation_logs")).rows[0].n;
 const denied=await x.request(path+"/confirmation-workflows",cookie,{action:"confirmation.save",expectedVersion:saved.version,revisionId:r.revisionId,priceVersionId:p.id,confirmedLaborPrice:"9.5",confirmedGarmentPrice:null,note:"synthetic"},"POST");
 assert.equal(denied.response.status,403,denied.text);
 assert.equal((await x.pool.query("SELECT count(*)::int n FROM operation_logs")).rows[0].n,before);
 await createSalesOrder(x.pool,{creationSource:"quote",sourceQuoteId:saved.quote.id,sourceRevisionId:r.revisionId,sourcePriceVersionId:p.id});
 const ok=await x.request(path+"/revisions/"+r.revisionId+"/price-versions/"+p.id+"/confirmed-commercial-terms",cookie,{expectedVersion:0,expectedQuoteVersion:saved.version,confirmedLaborPrice:"9.5"},"PATCH");
 assert.equal(ok.response.status,200,ok.text);assert.equal(ok.body.confirmedCommercialTerms.current.labor.value.price,"9.5");assert.equal(ok.body.confirmedCommercialTerms.current.sale.visibility,"restricted");
 assert.deepEqual(await createQuoteRepository(x.pool).getById(saved.quote.id),saved);
});
