import {waitForChromiumEndpoint} from './chromium-endpoint.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startContinuousFixture} from './ainuoke-continuous-fixture.ts';
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await read())return;}catch(error){if(!/Execution context was destroyed|Cannot find context|Inspected target navigated/.test(String(error)))throw error;}await delay(100);}throw Error(label+' timed out');}
test('approved material ordering and event drawer run on the exact built Server UI',{timeout:240000},async t=>{
 const info=JSON.parse(readFileSync('dist/client/build-info.json','utf8'));assert.equal(info.quoteAuthority,'server');assert.equal(info.orderRead,'snapshot');assert.match(info.gitCommit,/^[a-f0-9]{40}$/);
 const x=await startContinuousFixture(resolve('dist/client'),{excessWarehouse:true,materialDisplay:true});const temp=await mkdtemp(join(tmpdir(),'zhixu-material-display-ui-'));let browser,ws,session,id=0;const pending=new Map(),errors=[],metrics=[];
 try{
  const profile=join(temp,'profile');browser=spawn(process.env.CHROME_PATH??(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome'),['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
  const [port,path]=await waitForChromiumEndpoint(profile,{timeoutMs:20000});ws=new WebSocket('ws://127.0.0.1:'+port+path);await new Promise((done,reject)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',reject,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((done,reject)=>{pending.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params,sessionId:sid}));});ws.addEventListener('message',({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(p){pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.done(r.result);}if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.text);});
  const target=await command('Target.createTarget',{url:'about:blank'},undefined);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},undefined)).sessionId;await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Page.addScriptToEvaluateOnNewDocument',{source:"window.apiRequests=[];const originalFetch=window.fetch;window.fetch=(input,init)=>{const path=new URL(String(input),location.href).pathname;if(path.startsWith('/api/'))window.apiRequests.push({path,method:init?.method??'GET'});return originalFetch(input,init);};"});
  const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
  const click=async text=>{const result=await evaluate("(()=>{const button=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==="+JSON.stringify(text)+");if(!button||button.disabled)return false;button.click();return true;})()");assert.equal(result,true,'click '+text);};
  const has=text=>until(()=>evaluate("Boolean(document.body?.innerText.includes("+JSON.stringify(text)+"))"),text);
  const setInput=(selector,value)=>evaluate("(()=>{const input=document.querySelector("+JSON.stringify(selector)+");if(!input)throw Error('missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,"+JSON.stringify(value)+");input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const navigate=async path=>{const token=Date.now()+Math.random();await evaluate('window.navigationMarker='+token);await command('Page.navigate',{url:x.base+path});await until(()=>evaluate("window.navigationMarker!=="+token+"&&document.readyState==='complete'"),'document navigation');};
  const login=async user=>{const cookie=await x.login(user),split=cookie.indexOf('=');await command('Network.setCookie',{name:cookie.slice(0,split),value:cookie.slice(split+1),domain:'127.0.0.1',path:'/',httpOnly:true});return cookie;};
  const materialPath='/order-center/style-progress/detail?orderId='+x.orderId,settingsPath='/system-settings/progress-settings?orderId='+x.orderId;
  const names=()=>evaluate("[...document.querySelectorAll('.sp-business-material-toggle h3')].map(node=>node.textContent)");
  const keywords=()=>evaluate("[...document.querySelectorAll('.sp-keyword-list strong')].map(node=>node.textContent)");
  const version=async()=> (await x.pool.query("SELECT version FROM material_progress_settings WHERE scope='team'")).rows[0]?.version??0;
  const countAudit=async()=> (await x.pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_type='MaterialProgressSettings'")).rows[0].n;
  const capture=async name=>{if(process.env.MATERIAL_DISPLAY_UI_EVIDENCE!=='1')return;const dir=resolve('outputs/material-display-ui',info.gitCommit+'-'+info.buildId+(process.env.MATERIAL_DISPLAY_UI_RUN?'-'+process.env.MATERIAL_DISPLAY_UI_RUN:''));await mkdir(dir,{recursive:true});const image=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(dir,name+'.png'),Buffer.from(image.data,'base64'));};
  const openEvents=async name=>{await evaluate("(()=>{const button=[...document.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')==="+JSON.stringify('查看 '+name+' 明细')+");if(!button)throw Error('missing event button');button.focus();button.click();})()");await until(()=>evaluate("Boolean(document.querySelector('.sp-business-events'))"),'event drawer');await until(()=>evaluate("document.querySelector('.sp-business-events > header > button')===document.activeElement"),'event drawer initial focus',3000);};
  await login('demo.material');await navigate(materialPath);await has('合成排序面料大');const initialOrder=await names();
  await t.test('six widths preserve the approved header, detail expansion, drawer geometry and local table scrolling',async()=>{
   for(const width of [1920,1536,1440,1280,900,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:width===1536?1.25:1,mobile:width===390});
    assert.deepEqual((await names()).slice(0,3),['合成排序面料大','合成棉布','合成排序面料小']);
    assert.equal(await evaluate("(()=>{const buttons=[...document.querySelectorAll('.qc-page-actions button')],settings=buttons.find(node=>node.textContent==='辅料排列设置').getBoundingClientRect(),refresh=buttons.find(node=>node.textContent==='刷新页面').getBoundingClientRect();return settings.width>0&&settings.height>=32&&refresh.width>0&&settings.right<=refresh.left+1;})()"),true,'both approved actions stay visible in order at '+width);
    assert.equal(await evaluate("document.querySelector('.sp-business-material-toggle').getAttribute('aria-expanded')"),'true');
    await evaluate("document.querySelector('.sp-business-material-toggle').click()");assert.equal(await evaluate("Boolean(document.querySelector('.sp-business-material .sp-business-table-scroll'))"),false);
    assert.equal(await evaluate("document.body.innerText.includes('12.75')"),false);await evaluate("document.querySelector('.sp-business-material-toggle').click()");
    assert.equal(await evaluate("Boolean(document.querySelector('.sp-business-material .sp-business-table-scroll'))"),true);
    await capture('materials-'+width);await openEvents('合成排序面料大');await has('12.75');
    const geometry=await evaluate("(()=>{const panel=document.querySelector('.sp-business-events').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,panelInside:panel.left>=-1&&panel.right<=innerWidth+1,inlineEvents:document.querySelectorAll('.sp-business-material .sp-event-variant').length,backWidth:document.querySelector('.ops-topbar-back').getBoundingClientRect().width};})()");
    assert.equal(geometry.overflow,false);assert.equal(geometry.panelInside,true);assert.equal(geometry.inlineEvents,0);assert.ok(geometry.backWidth<=32);metrics.push(geometry);
    await evaluate("(()=>{const box=document.querySelector('.sp-business-events .sp-business-table-scroll');box.scrollLeft=box.scrollWidth-box.clientWidth;})()");
    if(width===390){assert.equal(await evaluate("(()=>{const box=document.querySelector('.sp-business-events .sp-business-table-scroll').getBoundingClientRect(),cell=document.querySelector('.sp-business-events tbody tr').lastElementChild.getBoundingClientRect();return cell.left>=box.left-1&&cell.right<=box.right+1;})()"),true);}
    await capture('events-'+width);await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(()=>evaluate("!document.querySelector('.sp-business-events')"),'drawer Escape');await until(()=>evaluate("document.activeElement.getAttribute('aria-label')==='查看 合成排序面料大 明细'"),'drawer focus restored at '+width,1000);
   }
  });
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await t.test('the settings entry precedes refresh and saves a shared, ordered keyword list without changing material facts',async()=>{
   assert.equal(await evaluate("(()=>{const buttons=[...document.querySelectorAll('.qc-page-actions button')];return buttons.findIndex(node=>node.textContent==='辅料排列设置')<buttons.findIndex(node=>node.textContent==='刷新页面');})()"),true);
   await click('辅料排列设置');await has('辅料关键词优先级');assert.equal(await version(),0);assert.deepEqual(await keywords(),[]);
   await setInput('#trim-priority-keyword','线');await click('添加');await setInput('#trim-priority-keyword','拉链');await click('添加');
   await evaluate("document.querySelector('[aria-label=\"下移 线\"]').click()");assert.deepEqual(await keywords(),['拉链','线']);await evaluate("document.querySelector('[aria-label=\"上移 线\"]').click()");
   await setInput('#trim-priority-keyword','纽扣');await evaluate("document.querySelector('.ops-topbar-back').click()");await has('辅料排列有未保存修改');await click('继续编辑');assert.equal(await evaluate("document.querySelector('#trim-priority-keyword').value"),'纽扣');await setInput('#trim-priority-keyword','');
   await click('保存排列');await has('辅料排列已保存');assert.equal(await version(),1);assert.equal(await countAudit(),1);for(const width of [1920,1536,1440,1280,900,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:width===1536?1.25:1,mobile:width===390});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);assert.equal(await evaluate("(()=>{const input=document.querySelector('#trim-priority-keyword').getBoundingClientRect();return input.width>100&&input.left>=0&&input.right<=innerWidth;})()"),true);await capture('settings-'+width);}await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('.ops-topbar-back').click()");await has('合成排序面料大');
   assert.equal(await evaluate("location.pathname+location.search"),materialPath);const order=await names();assert.ok(order.indexOf('合成缝纫线')<order.indexOf('合成拉链'));assert.ok(order.indexOf('合成拉链')<order.indexOf('合成零需求'));
   const cookie=await x.login('demo.material'),model=await(await fetch(x.base+'/api/v1/sales-orders/'+x.orderId+'/material-progress',{headers:{Cookie:cookie}})).json();const zipper=model.progress.rows.find(row=>row.demand.materialCode==='SYNTHETIC-MAT-ready');assert.equal(zipper.inbound,31);assert.equal(zipper.pendingInbound,1);assert.equal(zipper.inbounds[0].excessWarehouse.quantity,1);assert.equal(model.progress.summary.quantitiesAggregatedAcrossDemands,false);
  });
  await t.test('all seven roles read the same team list while only admin and material managers can edit',async()=>{
   for(const [index,user] of x.users.entries()){await login(user);await navigate(settingsPath);await has('辅料关键词优先级');assert.deepEqual(await keywords(),['线','拉链']);assert.equal(await evaluate("Boolean(document.querySelector('#trim-priority-keyword'))"),index===0||index===3);assert.deepEqual(await evaluate("Object.keys(localStorage).filter(key=>key.startsWith('zhixu.erp.local.'))"),[]);await navigate(materialPath);await has('合成缝纫线');assert.equal(await evaluate("[...document.querySelectorAll('button')].some(node=>node.textContent==='辅料排列设置')"),index===0||index===3);assert.ok((await names()).indexOf('合成缝纫线')<(await names()).indexOf('合成拉链'));}
  });
  await t.test('a lost save response locks inputs and retries the exact request once rather than creating another update',async()=>{
   await login('demo.material');await navigate(settingsPath);await has('辅料关键词优先级');await setInput('#trim-priority-keyword','纽扣');await click('添加');
   await evaluate("window.savedSettingsBodies=[];window.savedFetch=window.fetch;window.dropSettingsResponse=true;window.fetch=async(input,init)=>{if(new URL(String(input),location.href).pathname==='/api/v1/material-progress-settings'&&init?.method==='PUT'){window.savedSettingsBodies.push(init.body);const response=await window.savedFetch(input,init);if(window.dropSettingsResponse){window.dropSettingsResponse=false;throw Error('synthetic-lost-response');}return response;}return window.savedFetch(input,init);};");
   await click('保存排列');await has('保存结果待确认，输入已锁定');assert.equal(await version(),2);assert.equal(await countAudit(),2);assert.equal(await evaluate("document.querySelector('#trim-priority-keyword').disabled"),true);
   await evaluate("document.querySelector('.ops-topbar-back').click()");await has('请先完成当前操作');await has('排序保存结果尚未确认，请先核对原保存请求。');assert.equal(await evaluate('location.pathname+location.search'),settingsPath);assert.equal(await evaluate("document.querySelector('#trim-priority-keyword').disabled"),true);await click('继续处理');await click('用原请求重试');await has('已确认原保存结果');assert.equal(await version(),2);assert.equal(await countAudit(),2);const bodies=await evaluate('window.savedSettingsBodies');assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);await evaluate('window.fetch=window.savedFetch;');
  });
  await t.test('a concurrent team change conflicts, preserves input and requires explicit reload',async()=>{
   await evaluate("document.querySelector('[aria-label=\"上移 拉链\"]').click()");assert.deepEqual(await keywords(),['拉链','线','纽扣']);const cookie=await x.login('demo.admin');const response=await fetch(x.base+'/api/v1/material-progress-settings',{method:'PUT',headers:{Cookie:cookie,Origin:x.base,'X-Zhixu-Request':'1','Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),expectedVersion:2,trimPriorityKeywords:['纽扣','线']})});assert.equal(response.status,200);await click('保存排列');await has('设置已被其他人更新');assert.deepEqual(await keywords(),['拉链','线','纽扣']);await has('其他人已更新团队设置');await click('放弃本次修改并读取最新');assert.deepEqual(await keywords(),['纽扣','线']);assert.equal(await version(),3);
  });
  await t.test('a revoked writer cannot save from an old page and keeps unsaved input visible',async()=>{
   await setInput('#trim-priority-keyword','拉链');await click('添加');await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='role-team-material-manager' AND permission_key='style_progress.settings.edit'");
   try{await click('保存排列');await has('当前账号没有修改辅料排序的权限');await until(()=>evaluate("!document.querySelector('#trim-priority-keyword')"),'revoked editor');assert.deepEqual(await keywords(),['纽扣','线','拉链']);assert.equal(await version(),3);}finally{await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-team-material-manager','style_progress.settings.edit')");}
  });
   await t.test('keyboard interaction waits for delayed initial drawer focus rather than racing the overlay lifecycle',async()=>{
    await navigate(materialPath);await has('合成拉链');
    await evaluate("window.initialDrawerFrameRan=false;window.originalDrawerFrame=window.requestAnimationFrame;window.requestAnimationFrame=callback=>window.originalDrawerFrame(timestamp=>setTimeout(()=>{callback(timestamp);window.initialDrawerFrameRan=true;},150));");
    try{
     await openEvents('合成拉链');
     await evaluate("document.querySelector('.sp-business-event-tabs [role=tab]').focus()");
     await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
     await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
     await until(()=>evaluate('window.initialDrawerFrameRan'),'delayed initial drawer focus');
     assert.equal(await evaluate("document.activeElement.getAttribute('aria-selected')"),'true');
     assert.equal(await evaluate("document.activeElement.textContent.startsWith('入库')"),true);
     await has('多余仓');
    }finally{
     await evaluate('window.requestAnimationFrame=window.originalDrawerFrame');
     await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
     await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
     await until(()=>evaluate("!document.querySelector('.sp-business-events')"),'delayed drawer closed');
     await until(()=>evaluate("document.activeElement.getAttribute('aria-label')==='查看 合成拉链 明细'"),'delayed drawer focus restored');
    }
   });
   await t.test('events keep original identity, duplicates, units and the separate extra warehouse fact; drawer uses refreshed facts',async()=>{
   await navigate(materialPath);await has('合成拉链');await openEvents('合成拉链');await evaluate("document.querySelector('.sp-business-event-tabs [role=tab]').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await has('多余仓');assert.equal(await evaluate("document.activeElement.getAttribute('aria-selected')"),'true');const cells=()=>evaluate("[...document.querySelectorAll('.sp-business-events tbody tr:first-child td')].map(node=>node.textContent)");assert.equal((await cells())[4],'31 条');assert.equal((await cells())[5],'1 条');
   await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36});
   await evaluate("document.querySelectorAll('.sp-business-event-tabs [role=tab]')[2].click()");await has('运输方式');assert.equal(await evaluate("[...document.querySelectorAll('.sp-business-events [role=tabpanel] th')].find(n=>n.textContent==='运输方式').textContent"),'运输方式');
   await evaluate("document.querySelectorAll('.sp-business-event-tabs [role=tab]')[5].click()");await has('艾诺科货款申请明细尚未接通');assert.equal(await evaluate("document.querySelector('.sp-business-events tbody')===null"),true);
   await evaluate("document.querySelectorAll('.sp-business-event-tabs [role=tab]')[1].click()");await x.capture();const before=x.materialReads();await evaluate("window.dispatchEvent(new Event('focus'))");await until(()=>x.materialReads()>before,'focus refreshed source');await until(async()=>(await cells())[5]==='2 条','new extra in open drawer');assert.equal((await cells())[4],'31 条');
   await capture('inbound-extra-1440');await x.setMode('failed');await assert.rejects(x.capture());await evaluate("window.dispatchEvent(new Event('focus'))");await has('保留上次成功数据');assert.equal(await evaluate("Boolean(document.querySelector('.sp-business-events'))&&document.querySelectorAll('.sp-business-material').length>0"),true);assert.equal((await cells())[4],'31 条');
   await x.setMode('ready');await x.capture();await evaluate("window.dispatchEvent(new Event('focus'))");await has('合成拉链');assert.equal(await evaluate("Boolean(document.querySelector('.sp-business-events'))"),true);await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(()=>evaluate("!document.querySelector('.sp-business-events')"),'retained drawer closes explicitly');
  });
  await t.test('settings failure retains real source facts but discards cached sorting; no commercial endpoint or Browser data is used',async()=>{
   await evaluate("window.settingsFailureFetch=window.fetch;window.fetch=(input,init)=>new URL(String(input),location.href).pathname==='/api/v1/material-progress-settings'?Promise.reject(Error('synthetic-settings-offline')):window.settingsFailureFetch(input,init);");await click('刷新页面');await has('辅料排序设置暂不可用，保持来源顺序');assert.deepEqual(await names(),initialOrder);assert.ok((await names()).includes('合成棉布'));await evaluate("window.fetch=window.settingsFailureFetch;window.dispatchEvent(new Event('focus'));");
   assert.deepEqual(await evaluate("window.apiRequests.filter(row=>(row.path.includes('confirmed-commercial-terms')||row.path.startsWith('/api/v1/quotes')))"),[]);assert.deepEqual(await evaluate("Object.keys(localStorage).filter(key=>key.startsWith('zhixu.erp.local.'))"),[]);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
  if(process.env.MATERIAL_DISPLAY_UI_EVIDENCE==='1'){const dir=resolve('outputs/material-display-ui',info.gitCommit+'-'+info.buildId+(process.env.MATERIAL_DISPLAY_UI_RUN?'-'+process.env.MATERIAL_DISPLAY_UI_RUN:''));await writeFile(join(dir,'receipt.json'),JSON.stringify({schemaVersion:'material-display-ui-evidence.v1',renderedSourceSha:info.gitCommit,buildId:info.buildId,synthetic:true,realDatabaseAccess:false,sourceActivation:'not-activated',metrics},null,2)+'\n');}
 }finally{if(ws)ws.close();if(browser)browser.kill();await x.close();const owned=relative(resolve(tmpdir()),resolve(temp));if(!owned||owned.startsWith('..')||isAbsolute(owned)||!owned.startsWith('zhixu-material-display-ui-'))throw Error('unsafe temporary browser cleanup');await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
