import {waitForChromiumEndpoint} from './chromium-endpoint.mjs';
import {createSyntheticQuoteFixture} from './quote-fixture.ts';
import {createQuoteRepository} from '../quotes/repository.ts';
import {quoteSnapshotFromBrowser} from '../quotes/model.ts';
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
test("processing batches built UI uses real sessions and isolated synthetic data", {timeout:180000},async t=>{
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
  const screenshot=async name=>{if(process.env.PROCESSING_UI_EVIDENCE!=="1")return;const dir=resolve("outputs/processing-ui");await mkdir(dir,{recursive:true});const shot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(dir,name+".png"),Buffer.from(shot.data,"base64"));};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.businessWrites=[];const original=fetch;window.fetch=(...a)=>{if(a[1]?.method&&!['GET','HEAD'].includes(a[1].method)&&!String(a[0]).includes('/auth/'))businessWrites.push(String(a[0]));return original(...a)};"});
  const click=async label=>{await until(()=>evaluate("[...document.querySelectorAll('button')].some(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length)"),label+" enabled");return evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing button '+"+JSON.stringify(label)+");n.click();})()");};
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

  const q=createSyntheticQuoteFixture('ui-processing-synthetic','processing');
  for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;r.baseInfo.quoteStyleNo='SYNTHETIC-ADOPT';r.baseInfo.styleName='合成商业采用';}
  const revision=q.revisions.find(r=>r.revisionId===q.defaultRevisionId),pv=revision.priceVersions[0];pv.quantity=100;pv.trims.forEach(l=>l.usage=0);pv.pricingParameters.laborCurrency='CNY';pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:null,confirmedLaborPrice:12.34,note:'synthetic',confirmedAt:'2026-10-14T00:00:00Z'};
  await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(q));

  const input=(label,value)=>evaluate("(()=>{const box=[...document.querySelectorAll('[role=dialog] label')].find(n=>(n.querySelector(':scope > span')?.textContent??n.textContent).trim()==="+JSON.stringify(label)+");const id=box?.getAttribute('for');const n=id?document.getElementById(id):box?.querySelector('input');if(!n)throw Error('missing input '+"+JSON.stringify(label)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await login('demo.admin');await navigate('/order-center');await has('导入加工订单');
  await t.test('registered processing batch preview and confirmation preserve exact quote provenance',async()=>{
   const source={quoteId:q.id,revisionId:revision.revisionId,priceVersionId:pv.id};await evaluate(`(async()=>{const r=await fetch('/api/v1/processing-order-batches',{method:'POST',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({...${JSON.stringify(source)},requestId:crypto.randomUUID(),customerName:'合成加工客户',businessStyleNo:'SYN-PROCESS-UI',quantity:'30',orderDate:'2026-10-14',deliveryDate:null,customerReference:'',deliveryRequirements:'',referenceOrderId:null})});if(!r.ok)throw Error('synthetic setup');})()`);
   await click('导入加工订单');await has('包含已处理及未确认批次');await until(()=>evaluate("Boolean([...document.querySelectorAll('[role=dialog] label')].find(n=>n.textContent.includes('包含已处理'))?.querySelector('input:not(:disabled)'))"),'history ready');await evaluate("[...document.querySelectorAll('[role=dialog] label')].find(n=>n.textContent.includes('包含已处理')).querySelector('input').click()");await has('SYN-PROCESS-UI');await click('预览下单与工价');await has('12.34 CNY / 件');await has('报价 '+q.quoteCode+' · '+revision.revisionLabel+' · '+pv.name);await screenshot('processing-preview-desktop');await click('确认本次下单');await has('下单已确认');assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions')).rows[0].n,0);await click('关闭');
  });
  let orderId;
  await t.test('order entry consumes once and links the formal processing SO',async()=>{
   await navigate('/order-center');await click('导入加工订单');await has('SYN-PROCESS-UI');await evaluate("document.querySelector('input[aria-label=\"选择批次 SYN-PROCESS-UI\"]').click()");await click('确认导入所选 1 项');await has('已创建正式订单');
   const rows=(await x.pool.query('SELECT sales_order_id::text id FROM processing_order_batch_consumptions')).rows;assert.equal(rows.length,1);orderId=rows[0].id;
   await navigate('/order-center/server-detail?id='+orderId);await has('合成加工客户');await has('艾诺科物料流水不适用');await click('维护来源');await has('采用报价');await has(q.quoteCode);await has('12.34 CNY / 件');assert.equal(await evaluate("document.querySelectorAll('[role=dialog] input, [role=dialog] select, [role=dialog] textarea').length"),0);assert.equal(await evaluate("document.body.innerText.includes('认领订单')"),false);await click('关闭');
  });
  await t.test('lost success response retains original request and retry does not create a second SO',async()=>{
   await navigate('/order-center');
   const source={quoteId:q.id,revisionId:revision.revisionId,priceVersionId:pv.id};
   await evaluate(`(async()=>{const post=async(path,body)=>{const r=await fetch('/api/v1/processing-order-batches'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(body)});if(!r.ok)throw Error('synthetic setup failed');return r.json();};const b=await post('',{...${JSON.stringify(source)},requestId:crypto.randomUUID(),customerName:'合成重试客户',businessStyleNo:'SYN-RETRY-UI',quantity:'12',orderDate:'2026-10-14',deliveryDate:null,customerReference:'',deliveryRequirements:'',referenceOrderId:null});const p=await post('/'+b.batchId+'/preview',{});await post('/'+b.batchId+'/confirm',{requestId:crypto.randomUUID(),expectedVersion:b.version,sourceFingerprint:p.candidate.fingerprint});})()`);
   await click('导入加工订单');await has('SYN-RETRY-UI');await evaluate("document.querySelector('input[aria-label=\"选择批次 SYN-RETRY-UI\"]').click()");
   await evaluate("(()=>{const actual=window.fetch;window.fetch=async(...args)=>{const r=await actual(...args);if(String(args[0]).endsWith('/processing-order-batches/consume')){window.fetch=actual;throw new TypeError('synthetic lost response');}return r;};})()");
   await click('确认导入所选 1 项');await has('服务响应尚未确认');assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions')).rows[0].n,2);
   await click('重试原请求');await has('已创建正式订单');assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions')).rows[0].n,2);await click('关闭');
  });
  const setupBatch=async(style,confirm=true)=>evaluate(`(async()=>{const post=async(path,body)=>{const r=await fetch('/api/v1/processing-order-batches'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(body)});if(!r.ok)throw Error('synthetic setup failed');return r.json();};const b=await post('',{quoteId:${JSON.stringify(q.id)},revisionId:${JSON.stringify(revision.revisionId)},priceVersionId:${JSON.stringify(pv.id)},requestId:crypto.randomUUID(),customerName:'合成防重客户',businessStyleNo:${JSON.stringify(style)},quantity:'23',orderDate:'2026-10-14',deliveryDate:null,customerReference:'SYN-SAME-PO',deliveryRequirements:'',referenceOrderId:null});if(${confirm}){const p=await post('/'+b.batchId+'/preview',{});await post('/'+b.batchId+'/confirm',{requestId:crypto.randomUUID(),expectedVersion:b.version,sourceFingerprint:p.candidate.fingerprint});}return b.batchId;})()`);
  await t.test('cancel requires a reason, preserves history and cannot allocate an SO',async()=>{
   await navigate('/order-center');const id=await setupBatch('SYN-CANCEL-UI');await click('导入加工订单');await has('SYN-CANCEL-UI');await click('取消批次 SYN-CANCEL-UI');await has('取消未生成订单的批次');
   assert.equal(await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='确认取消批次').disabled"),true);
   await input('取消原因','合成误登记，保留原记录');await click('确认取消批次');await has('批次已取消');
   assert.equal((await x.pool.query('SELECT state FROM processing_order_batches WHERE id=$1',[id])).rows[0].state,'cancelled');assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions WHERE batch_id=$1',[id])).rows[0].n,0);await click('关闭');
  });
  await t.test('similar orders stay selectable and partial retry submits only the failed batch',async()=>{
   await navigate('/order-center');const good=await setupBatch('SYN-PARTIAL-GOOD'),bad=await setupBatch('SYN-PARTIAL-FAIL');
   await click('导入加工订单');await has('SYN-PARTIAL-FAIL');await has('个相似下单');
   for(const style of ['SYN-PARTIAL-GOOD','SYN-PARTIAL-FAIL'])await evaluate(`document.querySelector('input[aria-label="选择批次 ${style}"]').click()`);
   assert.match(bad,/^[0-9a-f-]{36}$/);
   await x.pool.query(`CREATE FUNCTION synthetic_partial_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='创建加工订单' AND NEW.entity_id='${bad}' THEN RAISE EXCEPTION 'synthetic partial failure'; END IF; RETURN NEW; END; $$`);
   await x.pool.query('CREATE TRIGGER synthetic_partial_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_partial_failure()');
   try{await click('确认导入所选 2 项');await has('仅重试失败项');await has('已创建正式订单');}finally{await x.pool.query('DROP TRIGGER synthetic_partial_failure ON operation_logs');}
   assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions WHERE batch_id=$1',[good])).rows[0].n,1);
   assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions WHERE batch_id=$1',[bad])).rows[0].n,0);
   await evaluate("(()=>{const actual=window.fetch;window.retryBodies=[];window.fetch=(...args)=>{if(String(args[0]).endsWith('/processing-order-batches/consume'))window.retryBodies.push(JSON.parse(args[1].body));return actual(...args);};})()");
   await click('仅重试失败项');await until(()=>evaluate("!document.body.innerText.includes('仅重试失败项')"),'failed item retried');
   assert.deepEqual(await evaluate('window.retryBodies.map(x=>x.items.map(i=>i.batchId))'),[[bad]]);
   assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions WHERE batch_id=ANY($1::uuid[])',[[good,bad]])).rows[0].n,2);
   await screenshot('processing-partial-retry-desktop');await click('关闭');
  });
  const selectBatch=async style=>{const selector='input[aria-label="选择批次 '+style+'"]';await until(()=>evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)})?.matches(':not(:disabled)'))`),'batch checkbox ready');await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);};
  await t.test('selection survives batch pagination and consumes only selected batches',async()=>{
   await navigate('/order-center');const ids=[];for(let i=0;i<21;i++)ids.push(await setupBatch('SYN-CROSSPAGE-'+String(i).padStart(2,'0')));
   await click('导入加工订单');await input('搜索批次','SYN-CROSSPAGE-');await click('搜索批次');await has('SYN-CROSSPAGE-20');
   await selectBatch('SYN-CROSSPAGE-20');await click('下一页批次');await has('SYN-CROSSPAGE-00');
   await selectBatch('SYN-CROSSPAGE-00');await has('确认导入所选 2 项');await click('上一页批次');await has('SYN-CROSSPAGE-20');
   assert.equal(await evaluate("document.querySelector('input[aria-label=\"选择批次 SYN-CROSSPAGE-20\"]').checked"),true);
   await click('确认导入所选 2 项');await has('已创建正式订单');
   const rows=(await x.pool.query('SELECT batch_id::text FROM processing_order_batch_consumptions WHERE batch_id=ANY($1::uuid[])',[ids])).rows;
   assert.deepEqual(rows.map(x=>x.batch_id).sort(),[ids[0],ids[20]].sort());await click('关闭');
  });
  await t.test('mobile history shows original SO while unauthorized role has no entrypoint',async()=>{
   await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await navigate('/order-center');await click('导入加工订单');await input('搜索批次','SYN-PROCESS-UI');await click('搜索批次');await until(()=>evaluate("Boolean([...document.querySelectorAll('[role=dialog] label')].find(n=>n.textContent.includes('包含已处理'))?.querySelector('input:not(:disabled)'))"),"history toggle enabled");await evaluate("[...document.querySelectorAll('[role=dialog] label')].find(n=>n.textContent.includes('包含已处理')).querySelector('input').click()");await has('查看已有订单');await screenshot('processing-history-mobile');assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),true);
   await login('demo.material');await navigate('/order-center');await has('订单中心');assert.equal(await evaluate("document.body.innerText.includes('导入加工订单')"),false);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  await x.close();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-continuous-ui-"));await rm(temp,{recursive:true,force:true});
 }
});
