import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { startContinuousFixture } from './ainuoke-continuous-fixture.ts';
const wait=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,label){const end=Date.now()+20000;while(Date.now()<end){if(await read())return;await wait(100);}throw Error(label+' timed out');}

test('built source UI shows traced excess warehouse independently in a disposable system',{timeout:180000},async t=>{
 const info=JSON.parse(readFileSync('dist/client/build-info.json','utf8'));assert.equal(info.quoteAuthority,'server');assert.equal(info.orderRead,'snapshot');
 const x=await startContinuousFixture(resolve('dist/client'),{excessWarehouse:true});
 const temp=await mkdtemp(join(tmpdir(),'zhixu-num-dyc-ui-'));let browser,ws,session,id=0;const pending=new Map(),errors=[];
 try{
  const profile=join(temp,'profile');
  browser=spawn(process.env.CHROME_PATH??(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome'),['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
  await until(()=>existsSync(join(profile,'DevToolsActivePort')),'Chromium');
  const [port,path]=readFileSync(join(profile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);
  ws=new WebSocket('ws://127.0.0.1:'+port+path);await new Promise((done,reject)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',reject,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((done,reject)=>{pending.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params,sessionId:sid}));});
  ws.addEventListener('message',({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(p){pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.done(r.result);}if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.text);});
  const target=await command('Target.createTarget',{url:'about:blank'},undefined);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const cookie=await x.login('demo.material'),split=cookie.indexOf('=');await command('Network.setCookie',{name:cookie.slice(0,split),value:cookie.slice(split+1),domain:'127.0.0.1',path:'/',httpOnly:true});
  await command('Page.navigate',{url:x.base+'/order-center/style-progress/detail?orderId='+x.orderId});
  await until(()=>evaluate("Boolean(document.body?.innerText.includes('合成拉链'))"),'source material');
  await evaluate("[...document.querySelectorAll('.sp-v4-material-identity')].find(n=>n.textContent.includes('合成拉链')).click()");
  const cells=()=>evaluate("(()=>{const table=[...document.querySelectorAll('.sp-v4-material-card table')].find(n=>[...n.querySelectorAll('th')].some(h=>h.textContent==='多余仓'));return table?[...table.querySelectorAll('tbody tr:first-child td')].map(n=>n.textContent):[];})()");
  // Existing loading state unmounts the detail card; reopen the current generation,
  // exactly as an operator does. Never retry capture or relax the expected value.
  const expectExtra=(value,label)=>until(async()=>{await evaluate("(()=>{const button=[...document.querySelectorAll('.sp-v4-material-identity')].find(n=>n.textContent.includes('合成拉链'));if(button?.getAttribute('aria-expanded')==='false')button.click();})()");return (await cells())[3]===value;},label);
  const refresh=async()=>{const before=x.materialReads();await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='刷新来源').click()");await until(()=>x.materialReads()>before,'material request');};
  const capture=async name=>{if(process.env.EXCESS_WAREHOUSE_UI_EVIDENCE!=='1')return;const dir=resolve('outputs/num-dyc-ui',info.gitCommit+'-'+info.buildId);await mkdir(dir,{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(dir,name+'.png'),Buffer.from(shot.data,'base64'));};
  await t.test('31 inbound and 1 extra stay separate and fit desktop and mobile',async()=>{
   for(const width of [1440,1280,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});await until(async()=>JSON.stringify(await cells()).includes('1 条'),'extra value');const values=await cells();assert.equal(values[2],'31 条');assert.equal(values[3],'1 条');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await evaluate("(()=>{const table=[...document.querySelectorAll('.sp-v4-material-card table')].find(n=>[...n.querySelectorAll('th')].some(h=>h.textContent==='多余仓'));table.scrollIntoView({block:'center'});table.parentElement.scrollLeft=table.parentElement.scrollWidth;})()");await capture('num-dyc-'+width);}
  });
  await t.test('refresh replaces changed and absent source values without carrying a previous extra quantity',async()=>{
   await x.capture();await refresh();await expectExtra('2 条','changed extra');assert.equal((await cells())[2],'31 条');
   await x.capture();await refresh();await expectExtra('未知','missing extra');assert.equal((await cells())[2],'31 条');
   await x.capture();await refresh();await expectExtra('0 条','explicit zero extra');
  });
  await t.test('material DTO adds no raw rows or order commercial fields and quantity remains 31',async()=>{
   const model=await evaluate("(async()=>await(await fetch('/api/v1/sales-orders/"+x.orderId+"/material-progress')).json())()");
   const row=model.progress.rows.find(row=>row.demand.materialCode==='SYNTHETIC-MAT-ready');assert.equal(row.inbound,31);assert.equal(row.pendingInbound,1);assert.equal(row.status,'pending_inbound');assert.equal(row.inbounds[0].excessWarehouse.quantity,0);
   const text=JSON.stringify(model);assert.doesNotMatch(text,/sourceReferences|rawFields|confirmedSale|confirmedLabor|password|token|Authorization/);
   assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
  });
  await t.test('an older v1 response without the new optional fact stays usable and unknown',async()=>{
   await evaluate("window.previousFetch=window.fetch;window.fetch=async(...args)=>{const response=await window.previousFetch(...args);if(new URL(String(args[0]),location.href).pathname.endsWith('/material-progress')&&response.ok){const model=await response.json();for(const row of [...model.progress.rows,...model.progress.groups.flatMap(group=>group.rows)])for(const event of row.inbounds)delete event.excessWarehouse;return new Response(JSON.stringify(model),{status:response.status,headers:{'Content-Type':'application/json'}});}return response;};");
   try{await refresh();await expectExtra('未知','older DTO');assert.equal((await cells())[2],'31 条');}finally{await evaluate('window.fetch=window.previousFetch;delete window.previousFetch;');}
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{if(ws)ws.close();if(browser)browser.kill();await x.close();const owned=relative(resolve(tmpdir()),resolve(temp));if(!owned||owned.startsWith('..')||isAbsolute(owned)||!owned.startsWith('zhixu-num-dyc-ui-'))throw Error('unsafe temporary cleanup target');await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
