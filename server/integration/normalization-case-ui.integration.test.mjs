import {createSalesOrder} from '../sales-orders/repository.ts';
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
test("normalization case built UI preserves order data with real synthetic sessions", {timeout:180000},async t=>{
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
  const screenshot=async name=>{if(process.env.NORMALIZATION_UI_EVIDENCE!=="1")return;const dir=resolve("outputs/normalization-ui");await mkdir(dir,{recursive:true});const shot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(dir,name+".png"),Buffer.from(shot.data,"base64"));};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.businessWrites=[];const original=fetch;window.fetch=(...a)=>{if(a[1]?.method&&!['GET','HEAD'].includes(a[1].method)&&!String(a[0]).includes('/auth/'))businessWrites.push(String(a[0]));return original(...a)};"});
  const click=async label=>{await until(()=>evaluate("[...document.querySelectorAll('button')].some(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.matches(':disabled')&&n.getClientRects().length)"),label+" enabled");return evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.matches(':disabled')&&n.getClientRects().length);if(!n)throw Error('missing button '+"+JSON.stringify(label)+");n.click();})()");};
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

  const originalOrder=x.orderId;
  const extra=await createSalesOrder(x.pool,{creationSource:'manual'});
  const orderNo=async id=>(await x.pool.query('SELECT order_no FROM sales_orders WHERE id=$1',[id])).rows[0].order_no;
  const firstNo=await orderNo(originalOrder),secondNo=extra.orderNo;
  const input=async(label,value,tag='input')=>{
   await until(()=>evaluate(`Boolean([...document.querySelectorAll('[role=dialog] label')].find(n=>n.querySelector(':scope > span')?.textContent.trim()===${JSON.stringify(label)})?.querySelector(${JSON.stringify(tag+':not(:disabled)')}))`),'input '+label);
   const expression=`(()=>{const label=[...document.querySelectorAll('[role=dialog] label')].find(n=>n.querySelector(':scope > span')?.textContent.trim()===${JSON.stringify(label)});const n=label?.querySelector(${JSON.stringify(tag)});if(!n)throw Error('missing input');const proto=${tag==='textarea'?'HTMLTextAreaElement':'HTMLInputElement'}.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`;
   await evaluate(expression);
  };
  const select=async(label,value)=>evaluate(`(()=>{const n=[...document.querySelectorAll('[role=dialog] label')].find(n=>n.querySelector(':scope > span')?.textContent.trim()===${JSON.stringify(label)})?.querySelector('select');if(!n)throw Error('missing select');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const choosePair=async(a,b)=>{
   await click('选择订单');await until(()=>evaluate("[...document.querySelectorAll('[role=dialog] label')].some(n=>n.querySelector(':scope > span')?.textContent.trim()==='搜索复核订单')"),'pair tab');if(await evaluate("document.body.innerText.includes('清空已选订单')"))await click('清空已选订单');await has('已选 0/2');
   for(const number of [a,b]){await until(()=>evaluate(`Boolean(document.querySelector('input[aria-label="复核订单 ${number}"]:not(:disabled)'))`),'order selectable');await evaluate(`document.querySelector('input[aria-label="复核订单 ${number}"]').click()`);}
   await click('生成引用对照');await has('生产执行和财务冻结记录尚未完整核验');
  };
  await login('demo.admin');await navigate('/order-center');await has(firstNo);
  let caseId;
  await t.test('administrator saves evidence, appends reason, withdraws and reopens without changing SOs',async()=>{
   const before=(await x.pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows;
   await click('重复订单复核');await choosePair(firstNo,secondNo);await input('开案原因','合成重复订单核对','textarea');await click('保存复核案件');await has('案件记录已保存');
   caseId=(await x.pool.query('SELECT id::text FROM sales_order_normalization_cases')).rows[0].id;
   await input('复核说明','合成生产引用待补','textarea');await click('保存案件记录');await has('合成生产引用待补');
   await select('处理动作','withdrawn');await input('复核说明','合成撤回原因','textarea');await click('保存案件记录');await has('案件记录 · 已撤回');
   await input('复核说明','合成重新核对','textarea');await click('保存案件记录');await has('合成重新核对');
   assert.equal((await x.pool.query('SELECT max(version) AS v FROM sales_order_normalization_case_events WHERE case_id=$1',[caseId])).rows[0].v,4);
   assert.deepEqual((await x.pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows,before);
   await screenshot('case-history-desktop');await click('关闭');
  });
  await t.test('lost successful opening response retains original request and retry makes one case',async()=>{
   const third=await createSalesOrder(x.pool,{creationSource:'manual'});await click('重复订单复核');await choosePair(firstNo,third.orderNo);await input('开案原因','合成丢失响应','textarea');
   await evaluate("window.dropCaseResponse=true;window.caseRetryConflict=true;window.caseFetch=fetch;window.fetch=async(...a)=>{const r=await caseFetch(...a);if(dropCaseResponse&&String(a[0])==='/api/v1/order-normalization-cases'&&a[1]?.method==='POST'){dropCaseResponse=false;throw Error('synthetic lost response');}if(caseRetryConflict&&String(a[0])==='/api/v1/order-normalization-cases'&&a[1]?.method==='POST'){caseRetryConflict=false;return new Response(JSON.stringify({error:{code:'normalization_concurrency_conflict'}}),{status:409,headers:{'Content-Type':'application/json'}});}return r;};");
   await click('保存复核案件');await has('重试原保存请求');assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] textarea')].every(n=>n.matches(':disabled'))"),true);
   await click('重试原保存请求');await has('其他操作仍在处理');await has('重试原保存请求');await click('重试原保存请求');await has('案件记录已保存');
   const row=(await x.pool.query('SELECT c.id::text,count(e.id)::int n FROM sales_order_normalization_cases c JOIN sales_order_normalization_case_events e ON e.case_id=c.id WHERE c.first_order_id=LEAST($1::uuid,$2::uuid) AND c.second_order_id=GREATEST($1::uuid,$2::uuid) GROUP BY c.id',[originalOrder,third.id])).rows[0];assert.equal(row.n,1);
   await evaluate('window.fetch=caseFetch');await click('关闭');
  });
  await t.test('stale evidence is blocked with an actionable refresh and no partial case',async()=>{
   const fourth=await createSalesOrder(x.pool,{creationSource:'manual'});await click('重复订单复核');await choosePair(firstNo,fourth.orderNo);await input('开案原因','合成证据变化','textarea');
   await createSalesOrder(x.pool,{creationSource:'reorder',sourceOrderId:originalOrder});
   await click('保存复核案件');await has('订单引用证据已变化');assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_normalization_cases WHERE first_order_id=LEAST($1::uuid,$2::uuid) AND second_order_id=GREATEST($1::uuid,$2::uuid)',[originalOrder,fourth.id])).rows[0].n,0);
   await click('生成引用对照');await has('生产执行和财务冻结记录尚未完整核验');await click('保存复核案件');await has('案件记录已保存');await click('关闭');
  });
  await t.test('mobile history remains readable and non-admin role has no case entry',async()=>{
   await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await navigate('/order-center');await click('重复订单复核');await click('案件历史');await input('搜索案件订单号',secondNo);await click('搜索案件');
   const pair=(await x.pool.query('SELECT a.order_no AS a,b.order_no AS b FROM sales_order_normalization_cases c JOIN sales_orders a ON a.id=c.first_order_id JOIN sales_orders b ON b.id=c.second_order_id WHERE c.id=$1',[caseId])).rows[0];await click('查看案件 '+pair.a+' / '+pair.b);await has('合成重新核对');await screenshot('case-history-mobile');
   assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),true);await click('关闭');
   await login('demo.material');await navigate('/order-center');await has('订单中心');assert.equal(await evaluate("document.body.innerText.includes('重复订单复核')"),false);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  await x.close();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance)&&temp.includes('zhixu-continuous-ui-'));await rm(temp,{recursive:true,force:true});
 }
});
