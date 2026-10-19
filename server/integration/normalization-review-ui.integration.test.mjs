import {waitForChromiumEndpoint} from './chromium-endpoint.mjs';
import {randomUUID} from 'node:crypto';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.ts';
import {previewOrderNormalization} from '../sales-orders/normalization-preview.ts';
import {openNormalizationCase} from '../sales-orders/normalization-case-service.ts';
import {previewAttributionExecution,publishAttributionProposal,recordAttributionReview} from '../sales-orders/normalization-execution-service.ts';
import {createFrozenInventoryCoverageProvider,unavailableNormalizationCoverage} from '../sales-orders/normalization-coverage.ts';
import {createSalesOrder} from '../sales-orders/repository.ts';
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
test("normalization review workspace built UI uses independent synthetic roles and preserves original data", {timeout:240000},async t=>{
 const info=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));assert.equal(info.orderRead,"snapshot");assert.equal(info.quoteAuthority,"server");
 const facts=new Map();const expiresAt=new Date(Date.now()+1800000).toISOString();let coverageAvailable=true;
 const frozen=createFrozenInventoryCoverageProvider({withReadLease:async(_ids,run)=>run(),read:async(ids,target)=>({schemaVersion:'order-business-inventory.v1',targetFingerprint:target,memberOrderIds:[...ids],sourceKey:'synthetic-review-ui',leaseId:'synthetic-review-ui-fixed',expiresAt,orders:ids.map(id=>({id,execution:structuredClone(facts.get(id)?.execution??[]),financial:structuredClone(facts.get(id)?.financial??[])}))})});
 const coverage={withFrozenScope:(ids,target,run)=>coverageAvailable?frozen.withFrozenScope(ids,target,run):unavailableNormalizationCoverage.withFrozenScope(ids,target,run)};
 const x=await startContinuousFixture(resolve("dist/client"),{coverage});const temp=await mkdtemp(join(tmpdir(),"zhixu-continuous-ui-"));let browser,ws,session,id=0;const pending=new Map(),errors=[];
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
  const screenshot=async name=>{if(process.env.NORMALIZATION_REVIEW_UI_EVIDENCE!=="1")return;const dir=resolve("outputs/normalization-review-ui");await mkdir(dir,{recursive:true});const shot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(dir,name+".png"),Buffer.from(shot.data,"base64"));};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.businessWrites=[];const original=fetch;window.fetch=(...a)=>{if(a[1]?.method&&!['GET','HEAD'].includes(a[1].method)&&!String(a[0]).includes('/auth/'))businessWrites.push(String(a[0]));return original(...a)};"});
  const click=async label=>{await until(()=>evaluate("[...document.querySelectorAll('button')].some(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.matches(':disabled')&&n.getClientRects().length)"),label+" enabled");return evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.matches(':disabled')&&n.getClientRects().length);if(!n)throw Error('missing button '+"+JSON.stringify(label)+");n.click();})()");};
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

  const admin=await loadExistingBootstrapActor(x.pool,'demo.admin');
  const actor=async username=>{const u=(await x.pool.query('SELECT id::text,public_id::text,display_name FROM app_users WHERE username=$1',[username])).rows[0];return {internalUserId:u.id,userId:u.public_id,username,userName:u.display_name,permissions:['order.view']};};
  const production=await actor('demo.production'),finance=await actor('demo.finance');
  const originalOrder=x.orderId,extra=await createSalesOrder(x.pool,{creationSource:'quote'});
  for(const key of [originalOrder,extra.id])facts.set(key,{execution:[{id:'synthetic-flow-'+key,kind:'completion',facts:{quantity:10}}],financial:[{id:'synthetic-close-'+key,kind:'closing',facts:{locked:true}}]});
  const pair=await previewOrderNormalization(x.pool,admin,[originalOrder,extra.id]);
  const opened=await openNormalizationCase(x.pool,admin,{requestId:randomUUID(),orderIds:[originalOrder,extra.id],expectedReviewHash:pair.reviewHash,reason:'Synthetic isolated case'});
  const snapshot=async()=>({orders:(await x.pool.query('SELECT row_to_json(o) row FROM sales_orders o WHERE id=ANY($1::uuid[]) ORDER BY id',[[originalOrder,extra.id]])).rows,links:(await x.pool.query('SELECT row_to_json(o) row FROM sales_order_source_links o WHERE sales_order_id=ANY($1::uuid[]) ORDER BY id',[[originalOrder,extra.id]])).rows,heads:(await x.pool.query('SELECT row_to_json(o) row FROM sales_order_attribution_heads o ORDER BY sales_order_id')).rows,commercial:(await x.pool.query('SELECT row_to_json(o) row FROM sales_order_commercial_versions o ORDER BY id')).rows});
  const before=await snapshot();
  const input=async(label,value,tag='input')=>{await until(()=>evaluate(`Boolean([...document.querySelectorAll('[role=dialog] label')].find(n=>n.querySelector(':scope > span')?.textContent.trim()===${JSON.stringify(label)})?.querySelector(${JSON.stringify(tag+':not(:disabled)')}))`),'input '+label);await evaluate(`(()=>{const n=[...document.querySelectorAll('[role=dialog] label')].find(n=>n.querySelector(':scope > span')?.textContent.trim()===${JSON.stringify(label)})?.querySelector(${JSON.stringify(tag)});const proto=${tag==='textarea'?'HTMLTextAreaElement':'HTMLInputElement'}.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
  const select=async(label,value)=>evaluate(`(()=>{const n=[...document.querySelectorAll('[role=dialog] label')].find(n=>n.querySelector(':scope > span')?.textContent.trim()===${JSON.stringify(label)})?.querySelector('select');if(!n)throw Error('missing select');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const pairNames=(await x.pool.query('SELECT a.order_no a,b.order_no b FROM sales_order_normalization_cases c JOIN sales_orders a ON a.id=c.first_order_id JOIN sales_orders b ON b.id=c.second_order_id WHERE c.id=$1',[opened.caseId])).rows[0];
  let proofId;
  await t.test('admin explicitly selects full group and lost publish response retries one proof without execution',async()=>{
   await login('demo.admin');await navigate('/order-center');await click('重复订单复核');await click('案件历史');await click('查看案件 '+pairNames.a+' / '+pairNames.b);await click('读取完整订单组');await has('共 2 张原订单');assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] select')].find(n=>n.closest('label')?.textContent.includes('拟有效订单')).value"),'');
   await select('拟有效订单',originalOrder);await input('方案原因','合成方案：保护两单原流水','textarea');await input('恢复方案 SHA256','a'.repeat(64));await click('预览精确归属方案');await has('生产与财务数据已纳入本次冻结核对');await has('本方案要求：生产复核、财务复核');await evaluate("[...document.querySelectorAll('[role=dialog] h3')].find(n=>n.textContent==='独立归一方案').scrollIntoView({block:'start'})");await screenshot('proposal-preview-desktop');
   await evaluate("window.originalReviewFetch=fetch;window.dropPublish=true;window.fetch=async(...a)=>{const r=await originalReviewFetch(...a);if(dropPublish&&String(a[0]).endsWith('/review-proposals')&&a[1]?.method==='POST'){dropPublish=false;throw Error('synthetic lost successful publication response');}return r;};");
   await click('发布独立复核方案');await has('重试原方案发布');assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent.trim()==='关闭').disabled"),true);await click('重试原方案发布');await has('方案已发布：');await evaluate('window.fetch=originalReviewFetch');
   const rows=(await x.pool.query('SELECT id::text FROM sales_order_normalization_proofs WHERE case_id=$1',[opened.caseId])).rows;assert.equal(rows.length,1);proofId=rows[0].id;await click('关闭');await click('归一岗位复核');await click('查看方案 '+proofId);await has('尚未提供本案件的独立执行授权');assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent.includes('执行归一')).disabled"),true);assert.equal(await evaluate("document.body.innerText.includes('保存岗位复核签名')"),false);await evaluate("[...document.querySelectorAll('[role=dialog] h4')].find(n=>n.textContent==='执行状态').scrollIntoView({block:'center'})");await screenshot('admin-execution-closed-desktop');await click('关闭岗位复核');
  });
  await t.test('production signs own type and lost signature response creates exactly one immutable review',async()=>{
   await login('demo.production');await navigate('/order-center');await click('归一岗位复核');await click('查看方案 '+proofId);await has('当前证据与发布方案吻合');assert.deepEqual(await evaluate("[...document.querySelectorAll('[role=dialog] select')].find(n=>n.closest('label')?.textContent.includes('复核岗位')).querySelectorAll('option').length"),2);await input('岗位复核说明','合成生产确认原流水分别保留','textarea');
   await evaluate("window.originalReviewFetch=fetch;window.dropSignature=true;window.fetch=async(...a)=>{const r=await originalReviewFetch(...a);if(dropSignature&&String(a[0]).endsWith('/reviews')&&a[1]?.method==='POST'){dropSignature=false;throw Error('synthetic lost successful review response');}return r;};");await click('保存岗位复核签名');await has('重试原复核签名');await click('重试原复核签名');await has('复核记录已保存');await has('当前岗位签名');await evaluate('window.fetch=originalReviewFetch');assert.equal((await x.pool.query("SELECT count(*)::int n FROM sales_order_normalization_reviews WHERE proof_id=$1 AND review_type='production'",[proofId])).rows[0].n,1);await evaluate("[...document.querySelectorAll('[role=dialog] h4')].find(n=>n.textContent==='当前岗位签名').scrollIntoView({block:'start'})");await screenshot('production-review-desktop');await click('关闭岗位复核');
  });
  await t.test('finance signs independently, production cannot read restricted financial history notes',async()=>{
   await login('demo.finance');await navigate('/order-center');await click('归一岗位复核');await click('查看方案 '+proofId);await input('岗位复核说明','合成财务说明金额 7654321.123','textarea');await click('保存岗位复核签名');await has('复核记录已保存');await click('关闭岗位复核');
   await login('demo.production');await navigate('/order-center');await click('归一岗位复核');await click('查看方案 '+proofId);await has('当前岗位签名');await evaluate("[...document.querySelectorAll('[role=dialog] summary')].find(n=>n.textContent==='查看复核签名历史').click()");await has('说明按当前字段权限隐藏');assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('7654321.123')"),false);await click('关闭岗位复核');
  });
  await t.test('missing coverage remains unknown and cannot be approved',async()=>{
   coverageAvailable=false;const q={changeType:'normalize',caseVersion:1,assignments:[originalOrder,extra.id].sort().map(id=>({originalOrderId:id,effectiveOrderId:originalOrder})),reason:'Synthetic unknown coverage',recoveryPlanHash:'b'.repeat(64)};const e=await previewAttributionExecution(x.pool,admin,opened.caseId,q,{coverage});const p=await publishAttributionProposal(x.pool,admin,opened.caseId,{proposal:q,expectedEvidenceHash:e.evidenceHash},{coverage});
   await click('归一岗位复核');await click('查看方案 '+p.proofId);await has('所需复核岗位仍待确定，不能批准');assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] option')].find(n=>n.textContent==='批准本方案').disabled"),true);await has('尚未提供本案件的独立执行授权');await evaluate("[...document.querySelectorAll('[role=dialog] p')].find(n=>n.textContent.includes('所需复核岗位仍待确定')).scrollIntoView({block:'center'})");await screenshot('unknown-coverage-desktop');await click('关闭岗位复核');coverageAvailable=true;
  });
  await t.test('signature history keyset loads older records without revealing financial notes',async()=>{
   const p=(await x.pool.query('SELECT proposal,evidence_hash FROM sales_order_normalization_proofs WHERE id=$1',[proofId])).rows[0];for(let i=0;i<21;i++)await recordAttributionReview(x.pool,finance,opened.caseId,{requestId:randomUUID(),proposal:p.proposal,expectedEvidenceHash:p.evidence_hash,reviewType:'finance',decision:'approve',reason:'合成财务历史金额 7654321.123 #'+i},{coverage});
   await click('归一岗位复核');await click('查看方案 '+proofId);await has('当前岗位签名');await evaluate("[...document.querySelectorAll('[role=dialog] summary')].find(n=>n.textContent==='查看复核签名历史').click()");await has('说明按当前字段权限隐藏');await click('更早的复核签名');await has('合成生产确认原流水分别保留');assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('7654321.123')"),false);assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent==='更早的复核签名').disabled"),true);await click('关闭岗位复核');
  });
  await t.test('actual related evidence change closes signatures, unrelated case stays preserved',async()=>{
   facts.get(originalOrder).execution.push({id:'synthetic-new-event',kind:'completion',facts:{quantity:3}});try{await click('归一岗位复核');await click('查看方案 '+proofId);await has('关联证据已变化，需要重新发布并复核');await input('岗位复核说明','不得为旧方案签名','textarea');assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent==='保存岗位复核签名').disabled"),true);await click('关闭岗位复核');}finally{facts.get(originalOrder).execution.pop();}
  });
  await t.test('fresh role revocation clears previously loaded facts and has no Browser fallback',async()=>{
   await click('归一岗位复核');await click('查看方案 '+proofId);await has('合成方案：保护两单原流水');await x.pool.query('DELETE FROM app_user_roles WHERE user_id=$1 AND role_id=$2',[production.internalUserId,'role-team-production-manager']);await click('重新核对方案');await has('当前权限已变化');assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('合成方案：保护两单原流水')"),false);await click('关闭岗位复核');await x.pool.query('INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)',[production.internalUserId,'role-team-production-manager']);
   await login('demo.admin');await navigate('/order-center');await click('归一岗位复核');await click('查看方案 '+proofId);await has('授权已变化，旧签名不再有效');await click('关闭岗位复核');
  });
  await t.test('1920/1536 DPR1.25/1280/900 fine-pointer dialogs stay within viewport',async()=>{
   await login('demo.admin');for(const [width,scale] of [[1920,1],[1536,1.25],[1280,1],[900,1]]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:scale,mobile:false});await navigate('/order-center');await click('归一岗位复核');await click('查看方案 '+proofId);await has('当前证据与发布方案吻合');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);assert.equal(await evaluate("(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1})()"),true);await click('关闭岗位复核');}
  });
  await t.test('mobile detail remains readable, only dialog scrolls, and closing aborts in-flight GET',async()=>{
   await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await login('demo.finance');await navigate('/order-center');await click('归一岗位复核');await click('查看方案 '+proofId);await has('当前证据与发布方案吻合');await screenshot('review-detail-mobile');await evaluate("[...document.querySelectorAll('[role=dialog] h4')].find(n=>n.textContent==='执行状态').scrollIntoView({block:'center'})");await screenshot('review-execution-mobile');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
   await evaluate("window.delayedReviewFetch=fetch;window.abortSeen=false;window.fetch=(...a)=>{if(String(a[0]).includes('/proposals/')&&!String(a[0]).endsWith('/reviews'))return new Promise((_,reject)=>a[1].signal.addEventListener('abort',()=>{abortSeen=true;reject(new DOMException('synthetic abort','AbortError'))},{once:true}));return delayedReviewFetch(...a);};");await click('重新核对方案');await has('正在核对当前证据与权限');await click('关闭岗位复核');assert.equal(await evaluate('abortSeen'),true);await evaluate('window.fetch=delayedReviewFetch');
  });
  await t.test('ordinary manager quote material and merchandising roles have no review entry',async()=>{for(const username of ['demo.manager','demo.quote','demo.material','demo.merchandising']){await login(username);await navigate('/order-center');await has('订单中心');await until(()=>evaluate("document.querySelector('.oc-server-order-center-page')!==null"),'order page');await wait(300);assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='归一岗位复核')"),false);}});
  assert.deepEqual(await snapshot(),before);assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_attribution_changes')).rows[0].n,0);
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null){browser.kill();await wait(500);}
  await x.close();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance)&&temp.includes('zhixu-continuous-ui-'));await rm(temp,{recursive:true,force:true});
 }
});
