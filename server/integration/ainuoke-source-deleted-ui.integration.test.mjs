import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {startSourceDeletedDemo} from './source-deleted-demo-fixture.ts';
import {waitForChromiumEndpoint} from './chromium-endpoint.mjs';

test('built order list shows proven red deletion beside unchanged orange/purple alerts across desktop sizes and roles',{timeout:180000},async()=>{
 const x=await startSourceDeletedDemo(),temp=await mkdtemp(join(tmpdir(),'zhixu-deleted-ui-'));
 const evidence=resolve(process.env.SOURCE_DELETED_EVIDENCE_DIR??join(temp,'evidence'));
 let browser,ws,session,id=0,primaryError;const pending=new Map(),errors=[];
 try{
  await mkdir(evidence,{recursive:true});const profile=join(temp,'profile');
  browser=spawn(process.env.CHROME_PATH??(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'google-chrome'),
   ['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
  const [port,path]=await waitForChromiumEndpoint(profile);ws=new WebSocket('ws://127.0.0.1:'+port+path);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((r,j)=>{pending.set(++id,{r,j});ws.send(JSON.stringify({id,method,params,sessionId:sid}));});
  ws.addEventListener('message',({data})=>{const m=JSON.parse(String(data)),p=pending.get(m.id);if(p){pending.delete(m.id);if(m.error)p.j(Error(JSON.stringify(m.error)));else p.r(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  const target=await command('Target.createTarget',{url:'about:blank'},undefined);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const until=async(expression,label)=>{const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error(label+': '+await evaluate('document.body.innerText'));};
  const login=async username=>{const cookie=await x.login(username),split=cookie.indexOf('=');await command('Network.setCookie',{name:cookie.slice(0,split),value:cookie.slice(split+1),domain:'127.0.0.1',path:'/',httpOnly:true});};
  const navigate=async path=>{await command('Page.navigate',{url:x.base+path});await until("document.readyState==='complete'&&document.body.innerText.includes('PI2611-142')",'order loaded');};
  const shot=async name=>{await evaluate('document.fonts.ready');const r=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(evidence,name),Buffer.from(r.data,'base64'));};
  const metrics=(width,height)=>command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await login(x.admin);await metrics(1440,900);await navigate('/order-center');
  assert.equal(await evaluate("[...document.querySelectorAll('[data-code=order_source_deleted]')].filter(n=>n.getClientRects().length).length"),0);
  const exceptionWidth=await evaluate("[...document.querySelectorAll('th')].find(n=>n.innerText.includes('异常')).getBoundingClientRect().width");
  await shot('before-1440x900.png');await x.confirmDeleted();await navigate('/order-center');
  await until("[...document.querySelectorAll('[data-code=order_source_deleted]')].filter(n=>n.getClientRects().length).length===2",'deleted tags loaded');
  const state=await evaluate(`(()=>{
   const tags=[...document.querySelectorAll('.oc-order-alert-chip')].filter(n=>n.getClientRects().length);
   return tags.map(n=>{const s=getComputedStyle(n);return {code:n.dataset.code,text:n.textContent,color:s.color,border:s.borderTopColor,background:s.backgroundColor,height:n.getBoundingClientRect().height,font:s.fontSize,radius:s.borderRadius};});
  })()`);
  assert.equal(state.filter(s=>s.code==='order_source_deleted').length,2);
  assert.ok(state.some(s=>s.code==='material_source_stale'));assert.ok(state.some(s=>s.code==='material_unit_missing'));
  for(const s of state.filter(s=>s.code==='order_source_deleted')){
   assert.equal(s.text,'订单删除');assert.equal(s.color,'rgb(185, 28, 28)');assert.equal(s.border,'rgb(220, 38, 38)');assert.equal(s.background,'rgb(254, 242, 242)');
   const normal=state.find(t=>t.code==='material_source_stale');assert.equal(s.height,normal.height);assert.equal(s.font,normal.font);assert.equal(s.radius,normal.radius);
  }
  assert.equal(await evaluate("[...document.querySelectorAll('th')].find(n=>n.innerText.includes('异常')).getBoundingClientRect().width"),exceptionWidth);
  const screenshots=[];
  for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[2560,1440]]){
   await metrics(width,height);await until("[...document.querySelectorAll('[data-code=order_source_deleted]')].filter(n=>n.getClientRects().length).length===2",'responsive tags');
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
   const name=`after-${width}x${height}.png`;await shot(name);screenshots.push(name);
  }
  // Page reload and direct detail URL continue to read the persisted lifecycle.
  await command('Page.reload');await until("[...document.querySelectorAll('[data-code=order_source_deleted]')].filter(n=>n.getClientRects().length).length===2",'reload persisted');
  const detail=await fetch(x.base+'/api/v1/sales-orders/'+x.orderIds[0],{headers:{cookie:await x.login(x.admin)}});
  assert.equal(detail.status,200);
  await login(x.reader);await navigate('/order-center');await until("[...document.querySelectorAll('[data-code=order_source_deleted]')].filter(n=>n.getClientRects().length).length===2",'reader tags');
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
  const events=(await x.pool.query('SELECT sales_contract_no,event_type,version,confirmed_run_id FROM ainuoke_contract_lifecycle_events ORDER BY sales_contract_no')).rows;
  assert.equal(events.length,2);
  await writeFile(join(evidence,'browser-result.json'),JSON.stringify({origin:'ISOLATED_SYNTHETIC_DEMO',realAinuokeRequests:0,stagingWrites:0,desktopSizes:screenshots,state,exceptionColumnWidthUnchanged:true,adminAndReader:true,reload:true,events},null,2));
 }catch(error){
  primaryError=error;await writeFile(join(evidence,'browser-failure.json'),JSON.stringify({message:String(error),stack:error.stack},null,2));throw error;
 }finally{
  try{
   ws?.close();
   if(browser&&browser.exitCode===null){await new Promise(resolve=>{browser.once('exit',resolve);browser.kill();});}
   await x.close();
  }finally{
   const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));
   try{await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}catch(error){if(!primaryError)throw error;}
  }
 }
});
