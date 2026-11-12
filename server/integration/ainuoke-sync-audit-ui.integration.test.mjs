import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {startCatalogFixture} from './ainuoke-catalog-fixture.ts';
import {waitForChromiumEndpoint} from './chromium-endpoint.mjs';

test('sync audit menu, filters, report history, detail and readonly permissions in Chromium',{timeout:180000},async t=>{
 const x=await startCatalogFixture(),temp=await mkdtemp(join(tmpdir(),'zhixu-catalog-ui-'));let browser,ws,session,id=0;const pending=new Map(),errors=[];
 try{
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
  await t.test('authorized route renders actual fixture ledger, filters and batch drawer at desktop widths',async()=>{
   await navigate('/system-settings/ainuoke-sync-records');await has('数据表记录');await has('面辅料');
   assert.equal(await evaluate("document.querySelectorAll('.asa-report-table tbody tr').length>0"),true);
   for(const width of [1366,1920]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await click('查看批次');await has('同步批次详情');await has('API 请求');
    const directory=resolve('outputs/sync-audit-ui');await mkdir(directory,{recursive:true});
    const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(directory,`audit-${width}.png`),Buffer.from(shot.data,'base64'));await evaluate("document.querySelector('[aria-label=\"关闭同步批次详情\"]').click()");
   }
   await evaluate("(()=>{const n=document.querySelector('[aria-label=\"数据表名称或报表ID\"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(n,'6087050');n.dispatchEvent(new Event('input',{bubbles:true}));})()");
   await click('查询');await until("[...document.querySelectorAll('.asa-report-table tbody tr')].every(r=>r.innerText.includes('6087050'))",'report filter');
   await click('同步批次');assert.equal(await evaluate("document.body.innerText.includes('耗时')"),true);
   const before=x.captures();await click('更新记录');await has('数据表记录');assert.equal(x.captures(),before);
  });
  await t.test('ordinary material reader cannot inspect audit records or gain mutation rights',async()=>{
   await login(x.reader);await navigate('/system-settings/ainuoke-sync-records');await has('暂无查看同步审计记录的权限');
   assert.equal(await evaluate("document.querySelectorAll('.asa-report-table tbody tr').length"),0);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();browser?.kill();await x.close();await new Promise(r=>setTimeout(r,300));
  const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 }
});
