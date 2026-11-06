import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {startCatalogFixture} from './ainuoke-catalog-fixture.ts';
import {waitForChromiumEndpoint} from './chromium-endpoint.mjs';
import {randomUUID} from 'node:crypto';
import {captureItMaterialFixture} from './it-material-fixture.ts';
import {selectedConfig} from './selected-source-fixture.ts';
import {requestContractSync} from '../ainuoke-source/sync-queue.ts';
import {runSyncTick} from '../ainuoke-source/sync-worker.ts';

test('built catalogue pages, actor-scoped recovery and single-order refresh in Chromium',{timeout:180000},async t=>{
 const x=await startCatalogFixture(),temp=await mkdtemp(join(tmpdir(),'zhixu-catalog-ui-'));let browser,ws,session,id=0;const pending=new Map(),errors=[];
 try{
  await x.pool.query("UPDATE ainuoke_catalog_entries SET delivery_date=CASE WHEN source_id='3' THEN '2024-01-01' WHEN source_id='2' THEN NULL ELSE delivery_date END");
  const profile=join(temp,'profile');browser=spawn(process.env.CHROME_PATH??(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'google-chrome'),['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
  const [port,path]=await waitForChromiumEndpoint(profile);ws=new WebSocket('ws://127.0.0.1:'+port+path);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((r,j)=>{pending.set(++id,{r,j});ws.send(JSON.stringify({id,method,params,sessionId:sid}));});
  ws.addEventListener('message',({data})=>{const msg=JSON.parse(String(data)),p=pending.get(msg.id);if(p){pending.delete(msg.id);if(msg.error)p.j(Error(JSON.stringify(msg.error)));else p.r(msg.result);}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);});
  const target=await command('Target.createTarget',{url:'about:blank'},undefined);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const until=async(expression,label)=>{const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error(label+' timed out: '+await evaluate('document.body.innerText'));};
  const has=text=>until('document.body.innerText.includes('+JSON.stringify(text)+')',text);
  const navigate=async path=>{const marker=Date.now()+Math.random();await evaluate('window.navMarker='+marker);await command('Page.navigate',{url:x.base+path});await until('window.navMarker!=='+marker+"&&document.readyState==='complete'",'navigation');};
  const click=async(label,container='document')=>{await until(`[...${container}.querySelectorAll('button')].some(n=>n.textContent.trim()===${JSON.stringify(label)}&&!n.disabled&&n.getClientRects().length)`,label);return evaluate(`(()=>{const n=[...${container}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(label)}&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('button missing: '+${JSON.stringify(label)});n.click();})()`);};
  const login=async username=>{const cookie=await x.login(username),split=cookie.indexOf('=');await command('Network.setCookie',{name:cookie.slice(0,split),value:cookie.slice(split+1),domain:'127.0.0.1',path:'/',httpOnly:true});};
  await login(x.admin);await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await t.test('directory query, repeated search and dated colour/material detail create no SO',async()=>{
   await navigate('/order-center');await click('全部合同 / 历史查阅');await has('艾诺科合同目录');await has('每月1日04:00');await has('每30分钟 · 交期待核对');
   await click('查询');await has('SYN-SALES-3');await click('查询');await has('SYN-SALES-3');
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
   await click('查看来源资料',"[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('SYN-SALES-3'))");await has('颜色尺码');await has('物料采购与收发');await has('合成线');
   assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,2);
   await click('关闭');
  });
  await t.test('IT details show one purchase and matched units on desktop and mobile without header sums',async()=>{
   await requestContractSync(x.pool,x.actor,{sourceKey:x.sourceKey,sourceId:'1',requestId:randomUUID()});
   await runSyncTick(x.pool,x.actor,{...selectedConfig,materialReport:'6087051'},{automatic:false,collect:async()=>captureItMaterialFixture()});
   await click('查看来源资料',"[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('SYN-SALES-1'))");
   await has('合成面料');
   const directory=resolve('outputs/it-material-20261106');await mkdir(directory,{recursive:true});
   for(const width of [1440,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});
    await evaluate("[...document.querySelectorAll('summary')].filter(n=>n.textContent.includes('采购与收发明细')&&n.getClientRects().length).forEach(n=>{n.parentElement.open=true;n.scrollIntoView({block:'center'});})");
    await has('952 千克');await has('418.7 千克');await has('349.3 千克');await has('213 千克');
    assert.equal(await evaluate("document.body.innerText.includes('999999')"),false);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(directory,`it-material-${width}.png`),Buffer.from(shot.data,'base64'));
   }
   await click('关闭');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  });
  await t.test('manual refresh bypasses monthly tier and survives a page reload without another submission',async()=>{
   const before=x.captures();await click('刷新来源',"[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('SYN-SALES-3'))");await has('等待同步');
   assert.equal(x.captures(),before);await navigate('/order-center');await click('全部合同 / 历史查阅');await has('核对同步结果');
   const tick=await x.tick();assert.equal(tick.jobs.length,1);await has('同步成功');assert.equal(x.captures(),before+1);
  });
  await t.test('lost queue response is checked and resends the same request rather than creating two jobs',async()=>{
   await evaluate("window.originalFetch=fetch;window.dropOnce=true;window.fetch=(...a)=>{if(dropOnce&&String(a[0]).endsWith('/catalog/sync')&&a[1]?.method==='POST'){dropOnce=false;return Promise.reject(Error('synthetic offline'));}return originalFetch(...a);}");
   await click('刷新来源',"[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('SYN-SALES-1'))");await has('重送原请求');
   const count=Number((await x.pool.query('SELECT count(*) n FROM ainuoke_sync_requests')).rows[0].n);
   await click('重送原请求');await until("[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('SYN-SALES-1'))?.innerText.includes('等待同步')",'selected row queued');assert.equal(Number((await x.pool.query('SELECT count(*) n FROM ainuoke_sync_requests')).rows[0].n),count+1);
   await x.tick();await has('同步成功');await evaluate('window.fetch=window.originalFetch');
  });
  await t.test('stale material data is not rendered as zero purchases',async()=>{
   x.setMaterialOffset(1800001);await navigate('/order-center/server-detail?id='+x.orderIds[0]);await has('这不表示没有采购');
   assert.equal(await evaluate("document.querySelector('.oc-server-detail-material-summary .sp-server-summary')===null"),true);x.setMaterialOffset(0);
  });
  await t.test('temporary failure shows deferred retry and manual acceleration without duplicate jobs',async()=>{
   await navigate('/order-center');await click('全部合同 / 历史查阅');await has('已有成功资料');
   const row="[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('SYN-SALES-2'))";
   await until(row+'!==undefined','target contract row');const before=x.captures();x.failNextCapture();await click('刷新来源',row);await has('等待同步');await x.tick();await has('等待重试');await has('立即重试');
   await navigate('/order-center');await click('全部合同 / 历史查阅');await has('来源响应超时');await has('其中待重试 1 张');await has('立即重试');
   await click('立即重试',row);await has('等待重试');
   const deadline=Date.now()+5000;let ready=false;
   while(Date.now()<deadline){ready=(await x.pool.query("SELECT available_at<=now() AS ready FROM ainuoke_sync_jobs WHERE source_id='2' AND status='queued'")).rows[0]?.ready===true;if(ready)break;await new Promise(r=>setTimeout(r,50));}
   assert.equal(ready,true,'manual promotion committed before the worker wakes');
   assert.equal(Number((await x.pool.query("SELECT count(*) n FROM ainuoke_sync_jobs WHERE source_id='2' AND status='queued'")).rows[0].n),1);
   const retried=await x.tick();assert.equal(retried.jobs.length,1);await until(row+"?.innerText.includes('同步成功')",'retry completed');assert.equal(x.captures(),before+2);
  });
  await t.test('material page refresh submits the current order and reloads its published facts',async()=>{
   await navigate('/order-center/style-progress/detail?orderId='+x.orderIds[0]);await has('合成线');
   const before=x.captures();await click('刷新来源');await has('等待同步');
   assert.equal(x.captures(),before);const result=await x.tick();assert.equal(result.jobs.length,1);
   await has('同步成功');await has('合成线');assert.equal(x.captures(),before+1);
  });
  await t.test('readonly role cannot refresh or adopt; mobile drawer fits and closes',async()=>{
   await login(x.reader);await navigate('/order-center');await click('全部合同 / 历史查阅');await has('艾诺科合同目录');await has('SYN-SALES-3');
   assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='刷新来源')"),false);
   await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await click('查看来源资料');await has('颜色尺码');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
   assert.equal(await evaluate("document.body.innerText.includes('预览加入跟进')"),false);
   await click('关闭');
  });
  if(process.env.CATALOG_UI_EVIDENCE==='1'){
   await login(x.admin);await navigate('/order-center');await click('全部合同 / 历史查阅');await has('艾诺科合同目录');await has('SYN-SALES-3');
   const directory=resolve('outputs/catalog-ui');await mkdir(directory,{recursive:true});
   for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(directory,`catalog-${width}.png`),Buffer.from(shot.data,'base64'));}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();browser?.kill();await x.close();await new Promise(r=>setTimeout(r,300));
  const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 }
});

