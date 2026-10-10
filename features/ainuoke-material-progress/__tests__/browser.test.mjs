import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startMaterialPreview } from '../preview-server.mjs';
const sleep = ms => new Promise(done => setTimeout(done,ms));
async function until(check,label) { const deadline=Date.now()+20_000;while(Date.now()<deadline){if(await check())return;await sleep(40);}throw new Error(`Timeout: ${label}`); }

test('isolated synthetic MaterialProgress Chromium UI and storage/network boundaries', {timeout:180_000}, async t => {
  const preview=await startMaterialPreview();
  const temp=await mkdtemp(join(tmpdir(),'zhixu-material-ui-'));
  const profile=join(temp,'profile');
  const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.ok(existsSync(chrome),'Chromium is required; this test does not silently skip');
  let browser,ws,sessionId,sequence=0;
  const pending=new Map(),requests=[],errors=[];
  let checks=0;
  try {
    const port=new URL(preview.url).port;assert.ok(!['3000','3001','3002','18443','18444'].includes(port));
    browser=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
    const portFile=join(profile,'DevToolsActivePort');await until(()=>existsSync(portFile),'isolated Chromium startup');
    const [debugPort,debugPath]=readFileSync(portFile,'utf8').trim().split(/\r?\n/u);
    ws=new WebSocket(`ws://127.0.0.1:${debugPort}${debugPath}`);
    await new Promise((done,reject)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',reject,{once:true});});
    ws.addEventListener('message',({data})=>{
      const reply=JSON.parse(String(data));const item=pending.get(reply.id);
      if(item){pending.delete(reply.id);if(reply.error)item.reject(new Error(JSON.stringify(reply.error)));else item.done(reply.result);}
      if(reply.method==='Network.requestWillBeSent')requests.push(reply.params.request.url);
      if(reply.method==='Runtime.exceptionThrown')errors.push(reply.params.exceptionDetails.text);
    });
    const command=(method,params={},session=sessionId)=>new Promise((done,reject)=>{pending.set(++sequence,{done,reject});ws.send(JSON.stringify({id:sequence,method,params,...(session?{sessionId:session}:{})}));});
    const target=await command('Target.createTarget',{url:'about:blank'});
    sessionId=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    const evaluate=async(expression)=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(result.exceptionDetails,undefined,`UI evaluation: ${result.exceptionDetails?.text}`);return result.result.value;};
    await command('Page.enable');await command('Network.enable');await command('Runtime.enable');
    await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.materialStorageWrites=0;const setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){window.materialStorageWrites++;return setItem.apply(this,args)};const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.materialStorageWrites++;return open(...args)};`});
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await command('Page.navigate',{url:preview.url});
    await until(()=>evaluate("document.querySelectorAll('[data-demand-id]').length===6"),'initial six demands');
    const capture=async name=>{if(process.env.MATERIAL_CAPTURE_UI!=='1')return;const dir=new URL('./evidence/',import.meta.url);await mkdir(dir,{recursive:true});const image=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL(name,dir),Buffer.from(image.data,'base64'));};
    await capture('material-desktop.png');
    await t.test('synthetic banner, source time, four states and unknown field are visible',async()=>{
      const text=await evaluate('document.body.innerText');
      for(const label of ['合成测试数据 · 非实时同步','SC-SYNTHETIC-001','2026-10-10T04:00:00.000Z','未采购','采购中','待入库','已齐套','来源不完整','厂供排除 1'])assert.ok(text.includes(label),label);
      assert.equal(await evaluate("document.querySelectorAll('[data-status=unknown]').length"),1);checks+=10;
    });
    const select=async(label,value)=>{await evaluate(`(()=>{const el=document.querySelector('select[aria-label='+${JSON.stringify(label)}+']');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
    const search=async(value)=>{await evaluate(`(()=>{const el=document.querySelector('input[aria-label="搜索物料"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
    await t.test('search by specification and purchase order, empty result and state/type filters',async()=>{
      await search('160cm');await until(()=>evaluate("document.querySelectorAll('[data-demand-id]').length===1"),'spec search');
      assert.ok((await evaluate('document.body.innerText')).includes('待入库'));checks++;
      await search('PO-SYNTHETIC-partial-b');await until(()=>evaluate("document.querySelectorAll('[data-demand-id]').length===1"),'purchase search');
      assert.equal(await evaluate("document.querySelector('[data-demand-id]').dataset.status"),'purchasing');checks++;
      await search('ABSENT-SYNTHETIC');await until(()=>evaluate("document.body.innerText.includes('没有匹配的物料需求')"),'empty search');checks++;
      await search('');await select('物料类型','trim');await until(()=>evaluate("document.querySelectorAll('[data-demand-id]').length===3"),'trim filter');checks++;
      await select('进度状态','unknown');await until(()=>evaluate("document.querySelectorAll('[data-demand-id]').length===1"),'unknown filter');checks++;
      await select('物料类型','all');await select('进度状态','all');
    });
    await t.test('details reveal deduplicated purchase dates/suppliers and inbound events',async()=>{
      await until(()=>evaluate("document.querySelectorAll('[data-demand-id]').length===6"),'reset filters');
      await evaluate("document.querySelector('[data-status=purchasing] summary').click()");
      await until(()=>evaluate("document.querySelector('[data-status=purchasing] details').open && document.querySelectorAll('[data-status=purchasing] .amp-event').length===2"),'purchase details');
      assert.ok((await evaluate("document.querySelector('[data-status=purchasing]').innerText")).includes('采购日期 2026-10-01'));checks++;
      assert.ok((await evaluate("document.querySelector('[data-status=purchasing]').innerText")).includes('合成供应商'));checks++;
      await evaluate("document.querySelector('[data-status=ready] summary').click()");
      await until(()=>evaluate("document.body.innerText.includes('IN-SYNTHETIC-ready')"),'inbound details');checks++;
    });
    await t.test('refresh rereads only synthetic data and preserves deterministic demand IDs',async()=>{
      const ids=await evaluate("Array.from(document.querySelectorAll('[data-demand-id]'),el=>el.dataset.demandId)");
      await evaluate("document.querySelector('.amp-refresh').click()");
      await until(()=>evaluate("document.querySelector('[data-testid=refresh-count]').innerText.includes('1 次')"),'refresh');
      assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('[data-demand-id]'),el=>el.dataset.demandId)"),ids);checks++;
    });
    await t.test('not fetched, incomplete page, identity mismatch and collision never show material states',async()=>{
      for(const [scenario,label] of [['not_fetched','数据未获取'],['incomplete','数据不完整'],['identity_mismatch','身份不匹配'],['collision','数据不完整']]){
        await select('演示场景',scenario);await until(()=>evaluate(`document.querySelector('.amp-source').innerText.includes(${JSON.stringify(label)}) && document.querySelectorAll('[data-demand-id]').length===0`),scenario);checks++;
      }
    });
    await t.test('5000 demands render at most 30 rows, page changes and search remain usable',async()=>{
      await select('演示场景','large');await until(()=>evaluate("document.querySelector('[data-testid=matched-count]').innerText==='5000'"),'bulk source');
      assert.equal(await evaluate("document.querySelectorAll('[data-demand-id]').length"),30);checks++;
      const first=await evaluate("document.querySelector('[data-demand-id]').dataset.demandId");
      await evaluate("document.querySelector('.amp-pagination button:last-child').click()");
      await until(()=>evaluate("document.querySelector('.amp-pagination').innerText.includes('第 2 /')"),'next page');
      assert.notEqual(await evaluate("document.querySelector('[data-demand-id]').dataset.demandId"),first);checks++;
      await search('05000');await until(()=>evaluate("document.querySelectorAll('[data-demand-id]').length===1 && document.querySelector('[data-testid=matched-count]').innerText==='1'"),'bulk search');checks++;
    });
    await t.test('390px touch viewport has no horizontal overflow and detail/filter controls stay in bounds',async()=>{
      await select('演示场景','complete');await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
      await until(()=>evaluate('window.innerWidth===390'),'touch layout');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'page must not overflow');checks++;
      await evaluate('window.scrollTo(0,550)');await capture('material-touch.png');await evaluate('window.scrollTo(0,0)');
      assert.ok(await evaluate("Array.from(document.querySelectorAll('input,select,button,summary'),el=>el.getBoundingClientRect()).every(r=>r.left>=0 && r.right<=390)"));checks++;
    });
    await t.test('isolated UI has no storage writes, business API requests or external origins',async()=>{
      assert.equal(await evaluate('window.materialStorageWrites'),0);checks++;
      assert.equal(await evaluate('localStorage.length'),0);checks++;
      assert.equal((await evaluate('indexedDB.databases()')).length,0);checks++;
      assert.ok(requests.every(url=>url.startsWith(new URL(preview.url).origin) || url.startsWith('data:')));checks++;
      assert.ok(requests.every(url=>!new URL(url).pathname.startsWith('/api/')));checks++;
      assert.deepEqual(errors,[]);checks++;
    });
    console.log(`SYNTHETIC Chromium assertions: ${checks}; dynamic preview ${preview.url}; no real accounts/DBs`);
    await command('Browser.close',{},undefined);
  } finally {
    ws?.close();
    if(browser && browser.exitCode===null) {await until(()=>browser.exitCode!==null,'Chromium exit').catch(()=>browser.kill());}
    await preview.close();
    assert.ok(resolve(temp).startsWith(resolve(tmpdir())+'\\zhixu-material-ui-'),'cleanup must target only our temporary profile');
    await rm(temp,{recursive:true,force:true});
    console.log('SYNTHETIC Chromium cleanup PASS: private profile and preview server closed');
  }
});
