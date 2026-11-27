// Actual production-built routes + real Node API and disposable PostgreSQL.
// All prices/accounts/orders are owned synthetic fixtures; no live ERP or Staging writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startContinuousFixture} from './ainuoke-continuous-fixture.ts';
import {waitForChromiumEndpoint,stopOwnedChromium} from './chromium-endpoint.mjs';
import {createQuoteDraft} from '../../features/quote-center/model/quote-view-model.ts';
import {quoteSnapshotFromBrowser} from '../quotes/model.ts';
import {createQuoteRepository} from '../quotes/repository.ts';
import {createAinuokeSalesOrder} from '../sales-orders/service.ts';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.ts';
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,label){for(let n=0;n<200;n++){try{if(await read())return;}catch(e){if(!/Execution context was destroyed|Cannot find context with specified id|Inspected target navigated or closed/.test(String(e)))throw e;}await pause(100);}throw Error('Timed out: '+label);}

test('compact business pages: actual headers, prices, routes, permissions and desktop/zoom geometry',{timeout:360000},async t=>{
 const observing=Boolean(process.env.COMPACT_UI_BASELINE_BUILD);const staticDirectory=resolve(process.env.COMPACT_UI_BASELINE_BUILD??'dist/client');
 const build=JSON.parse(readFileSync(join(staticDirectory,'build-info.json'),'utf8'));if(observing)assert.equal(build.gitCommit,'4a8c9bc24b00983d0d79150349adeed5a333a237');assert.equal(build.quoteAuthority,'server');assert.equal(build.orderRead,'snapshot');
 const x=await startContinuousFixture(staticDirectory,{materialDisplay:true});
 const dir=resolve(process.env.COMPACT_UI_EVIDENCE_DIR??'outputs/compact-business-pages');await mkdir(dir,{recursive:true});
 const profile=await mkdtemp(join(tmpdir(),'weaveops-compact-chrome-'));let chrome,ws,session,id=0;const pending=new Map(),errors=[];
 const evidence={fixtureContainer:x.containerName,build,observingBaseline:observing,synthetic:true,liveErpRequests:0,checks:[],geometry:[],quotes:[],orderId:x.orderId};
 try{
  const actor=await loadExistingBootstrapActor(x.pool,'demo.admin');
  for(let n=0;n<28;n++){
   const q=createQuoteDraft('SYN-COMPACT-'+String(n).padStart(2,'0'),'QT-COMPACT-'+String(n).padStart(2,'0'),'2026-11-19'),r=q.revisions[0],p=r.priceVersions[0];
   r.baseInfo={...r.baseInfo,quoteStyleNo:'SYN-COMPACT-'+n,styleName:'隔离合成报价 '+n,brandName:'合成品牌',salespersonName:'合成业务员',quoteType:'distribution'};
   p.labor={value:18,description:'合成工价'};p.pricingParameters={...p.pricingParameters,laborCurrency:'CNY',markupRate:0};p.fabrics=[];p.trims=[];
   const state=n%3;
   if(state!==0){p.confirmation={quotedGarmentPrice:999,quotedLaborPrice:18,confirmedGarmentPrice:91.25,confirmedLaborPrice:18,note:'隔离合成确认',confirmedAt:'2026-11-19T00:00:00Z'};const second=structuredClone(p);second.id=randomUUID();second.name='第二合成方案';second.confirmation=state===1?null:{...p.confirmation,confirmedGarmentPrice:108.75};r.priceVersions.push(second);}
   r.confirmationSummary={confirmedCount:state===0?0:state===1?1:2,totalCount:r.priceVersions.length};q.aggregateStatus=state===0?'draft':state===1?'partially_confirmed':'confirmed';
   await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(q));evidence.quotes.push({id:q.id,state});
  }
  // Make the real list cross its existing fifty-row boundary without changing paging code.
  for(let n=0;n<51;n++)await createAinuokeSalesOrder(x.pool,actor,{source:{sourceId:'COMPACT-'+n,sourceRowIdentity:'COMPACT-ROW-'+n,salesContractNo:'SYN-COMPACT-'+n,insideOrderNo:'SYN-FACTORY-'+n,styleNo:'SYN-STYLE-'+n,lifecycleStatusRaw:'生效',contractDate:'2026-11-19',contractDeliveryDate:'2027-02-09',companyNameSnapshot:'合成公司',customerNameSnapshot:'合成客户',brandNameSnapshot:'合成品牌',quantity:100,sourceHash:'synthetic-compact-'+n,fetchedAt:new Date().toISOString()},colors:[]});
  chrome=spawn(process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
  const [port,path]=await waitForChromiumEndpoint(profile,{timeoutMs:20000});ws=new WebSocket('ws://127.0.0.1:'+port+path);await new Promise((done,reject)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',reject,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((done,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},30000);pending.set(key,{done:v=>{clearTimeout(timer);done(v);},reject});ws.send(JSON.stringify({id:key,method,params,sessionId:sid}));});
  ws.addEventListener('message',({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(p){pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.done(r.result);}if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.text);});
  const target=await command('Target.createTarget',{url:'about:blank'},undefined);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const navigate=async path=>{const marker=randomUUID();await evaluate('window.navMarker='+JSON.stringify(marker));await command('Page.navigate',{url:x.base+path});await until(()=>evaluate('window.navMarker!=='+JSON.stringify(marker)+'&&document.readyState==="complete"'),'navigate '+path);};
  const has=async text=>until(()=>evaluate('Boolean(document.body?.innerText.includes('+JSON.stringify(text)+'))'),text);
  const click=async label=>{await until(()=>evaluate('[...document.querySelectorAll("button")].some(n=>(n.getAttribute("aria-label")??n.textContent.trim())==='+JSON.stringify(label)+'&&!n.disabled&&n.getClientRects().length)'),label);await evaluate('(()=>{const n=[...document.querySelectorAll("button")].find(n=>(n.getAttribute("aria-label")??n.textContent.trim())==='+JSON.stringify(label)+'&&!n.disabled&&n.getClientRects().length);n.click();})()');};
  const typeIn=async(label,value)=>{await evaluate('(()=>{const n=[...document.querySelectorAll("input")].find(n=>n.getAttribute("aria-label")==='+JSON.stringify(label)+');if(!n)throw Error("missing input");n.focus();n.select();})()');await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',windowsVirtualKeyCode:8});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',windowsVirtualKeyCode:8});if(value)await command('Input.insertText',{text:value});};
  const select=async(value)=>evaluate('(()=>{const n=[...document.querySelectorAll("select")].find(n=>[...n.options].some(o=>o.value==='+JSON.stringify(value)+'));if(!n)throw Error("missing select");n.value='+JSON.stringify(value)+';n.dispatchEvent(new Event("change",{bubbles:true}));})()');
  const login=async user=>{await command('Network.clearBrowserCookies');const cookie=await x.login(user),split=cookie.indexOf('=');await command('Network.setCookie',{name:cookie.slice(0,split),value:cookie.slice(split+1),domain:'127.0.0.1',path:'/',httpOnly:true});};
  const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(dir,name+'.png'),Buffer.from(shot.data,'base64'));};
  const checkPage=async(kind,width,height,zoom=1)=>{
   await command('Emulation.setDeviceMetricsOverride',{width:Math.floor(width/zoom),height:Math.floor(height/zoom),deviceScaleFactor:zoom,mobile:false});
   await navigate(kind==='quote'?'/quote-center':kind==='orders'?'/order-center':'/order-center/server-detail?id='+x.orderId);
   await has(kind==='quote'?'SYN-COMPACT-':kind==='orders'?'SO-':'订单工作台');
   if(!observing)await until(()=>evaluate('document.querySelector(".ops-page-actions button")!==null'),'page actions');
   if(kind==='detail')await until(()=>evaluate('document.querySelector(".ow-order-heading")!==null'),'workbench identity');
   const geometry=await evaluate(`(()=>{const header=document.querySelector('.ops-topbar'),content=document.querySelector('.ops-content'),workspace=document.querySelector('.ops-workspace'),identity=document.querySelector('.ow-order-heading'),table=document.querySelector('.qc-data-table'),actions=[...document.querySelectorAll('.ops-page-actions button')].filter(n=>n.getClientRects().length),box=n=>n?Object.fromEntries(['x','y','width','height','right','bottom'].map(k=>[k,n.getBoundingClientRect()[k]])):null;return {header:box(header),content:box(content),identity:box(identity),table:box(table),actions:actions.map(n=>({label:n.textContent.trim(),...box(n)})),viewport:innerWidth,documentOverflow:document.documentElement.scrollWidth>innerWidth+1,workspaceOverflow:workspace.scrollWidth>workspace.clientWidth+1,heroCount:content.querySelectorAll('.qc-page-header,.sp-order-nav').length,topbar:header.innerText,body:content.innerText};})()`);
   if(!observing)assert.equal(geometry.heroCount,0,'no empty/repeated header or tabs');assert.equal(geometry.documentOverflow,false);assert.equal(geometry.workspaceOverflow,false);
   assert.ok(geometry.actions.every(a=>a.x>=0&&a.right<=geometry.viewport+1&&a.y>=geometry.header.y&&a.bottom<=geometry.header.bottom+1),'actions inside topbar');
   if(!observing)assert.ok(!geometry.body.includes('Server identity'),'no redundant identity');
   if(kind==='detail'&&!observing){assert.ok(geometry.identity.y-geometry.header.bottom<45,'overview immediately below header');assert.ok(!geometry.topbar.includes('新建报价'),'no stale quote controls');}
   if(kind==='quote')assert.ok(!geometry.topbar.includes('维护来源'),'no stale detail controls');
   evidence.geometry.push({kind,width,height,zoom,...geometry,body:undefined});await screenshot(kind+'-'+width+'x'+height+'-z'+zoom);
  };
  await login('demo.admin');
  await t.test('four actual desktop viewports and equivalent 75/125/150 percent Chromium CSS viewport-DPR zoom reflow',async()=>{
   for(const [w,h]of [[1366,768],[1440,900],[1920,1080],[2560,1440]])for(const kind of ['quote','orders','detail'])await checkPage(kind,w,h);
   for(const z of [.75,1.25,1.5])for(const kind of ['quote','orders','detail'])await checkPage(kind,1366,768,z);
  });
  if(observing){await writeFile(join(dir,'results.json'),JSON.stringify(evidence,null,2)+'\n');return;}
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await navigate('/quote-center');await has('SYN-COMPACT-');
  await t.test('independent actual prices and confirmation states, with all distinct prices and existing detail access',async()=>{
   const rows=await evaluate(`[...document.querySelectorAll('tbody tr')].filter(n=>n.innerText.includes('SYN-COMPACT-')).map(n=>({calculated:n.querySelector('[data-column-key="garmentPrice"]')?.innerText,confirmed:n.querySelector('[data-column-key="confirmedGarment"]')?.innerText,link:n.querySelector('.qc-confirmation-cell a')?.getAttribute('href')}))`);
   assert.ok(rows.some(r=>r.confirmed?.includes('未确认')&&r.confirmed.includes('—')));assert.ok(rows.some(r=>r.confirmed?.includes('部分确认')&&r.confirmed.includes('¥91.25')));assert.ok(rows.some(r=>r.confirmed?.includes('全部确认')&&r.confirmed.includes('¥91.25–108.75')&&r.link?.startsWith('/quote-center/detail?id=')));
   assert.ok(rows.every(r=>!r.calculated?.includes('确认')&&!r.calculated?.includes('91.25')&&!r.calculated?.includes('108.75')));await screenshot('confirmation-three-states-synthetic');evidence.checks.push('three real persisted synthetic confirmation states and multi-price range');
  });
  await t.test('topbar more menu and settings dialog, original column modes, direct creation and route cleanup',async()=>{
   await click('更多报价操作');await click('列表页面设置');await has('列表页面设置');
   assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] input[type=checkbox]')].every(n=>n.classList.contains('qc-checkbox'))"),true);
   await evaluate("const n=document.querySelector('.qc-column-width-settings input');n.focus();n.select()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',windowsVirtualKeyCode:8});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',windowsVirtualKeyCode:8});await command('Input.insertText',{text:'9999'});
   await until(()=>evaluate("document.querySelector('.qc-column-width-settings input')?.getAttribute('aria-invalid')==='true'"),'width error');
   assert.equal(await evaluate("(()=>{const n=document.querySelector('.qc-column-width-settings input'),message=document.getElementById(n.getAttribute('aria-describedby')),label=document.getElementById(n.getAttribute('aria-labelledby'));return !!message?.textContent.trim()&&!!label?.textContent.trim()})()"),true);
   assert.equal(await evaluate("document.querySelector('[role=dialog] button[type=submit]').disabled"),true);await screenshot('quote-list-settings');await click('取消');
   await click('更多报价操作');await click('独立字段视图');await has('客户确认价格');await click('更多报价操作');await click('原版组合视图');await has('客户确认');
   await click('＋ 新建报价');await until(()=>evaluate('location.pathname==="/quote-center/detail"'),'actual quote creation');await has('保存');
   await until(()=>evaluate("!!document.querySelector('.qc-base-card .qc-select-trigger:not([disabled])')"),'brand select ready');
   await evaluate("document.querySelector('.qc-base-card .qc-select-trigger').click()");await until(()=>evaluate("!!document.querySelector('input[role=combobox][aria-label=搜索品牌]')"),'context named search');
   assert.equal(await evaluate("(()=>{const n=document.querySelector('input[role=combobox][aria-label=搜索品牌]');return document.getElementById(n.getAttribute('aria-controls'))?.getAttribute('role')})()"),'listbox');
   await evaluate("document.querySelector('input[role=combobox][aria-label=搜索品牌]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))");assert.equal(await evaluate("!!document.querySelector('input[role=combobox][aria-label=搜索品牌]')"),true);
   await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
   assert.equal(await evaluate('Boolean(document.querySelector(".ops-page-actions")?.innerText.includes("新建报价"))'),false);
  });
  await t.test('quote pagination and filters and actual order query/sort/pagination controls remain',async()=>{
   await navigate('/quote-center');await has('下一页');await click('下一页');await until(()=>evaluate('document.querySelector(".qc-batch-selection-toolbar")?.innerText.includes("上一页")'),'next quote page');await click('上一页');
   await typeIn('搜索报价','SYN-COMPACT-27');await until(()=>evaluate('document.querySelectorAll(".qc-server-business-list tbody tr").length===1&&document.querySelector("tbody")?.innerText.includes("SYN-COMPACT-27")'),'quote search');await typeIn('搜索报价','');await select('confirmed');await until(()=>evaluate('[...document.querySelectorAll(".qc-confirmation-cell small")].length>0&&[...document.querySelectorAll(".qc-confirmation-cell small")].every(n=>n.textContent==="全部确认")'),'confirmed-only filter');
   await navigate('/order-center');await has('SO-');await screenshot('order-list-paging');assert.equal(await evaluate('document.querySelectorAll(".sp-order-nav").length'),0);
   assert.equal(await evaluate('[...document.querySelectorAll("button")].some(n=>["款式进度","风险预警"].includes(n.textContent.trim()))'),false);
   await click('下一页');await until(()=>evaluate('document.querySelector(".oc-server-pagination")?.innerText.includes("51–")'),'order page 2');await click('上一页');await select('asc');await until(()=>evaluate('[...document.querySelectorAll("select")].some(n=>n.value==="asc")'),'ascending order sort');
   await typeIn('搜索正式订单','SYN-COMPACT-50');await click('查询');await until(()=>evaluate('document.querySelectorAll(".oc-server-order-table tbody tr").length===1&&document.querySelector(".oc-server-order-table tbody")?.innerText.includes("SYN-COMPACT-50")'),'order search');await select('draft');await until(()=>evaluate('[...document.querySelectorAll("select")].some(n=>n.value==="draft")'),'order lifecycle filter');
   const selects=await evaluate('[...document.querySelectorAll("select")].map(n=>({label:n.getAttribute("aria-label"),values:[...n.options].map(o=>o.value)}))');evidence.checks.push({orderFilterControls:selects});
  });
  await t.test('topbar order controls and maintenance dialogs preserve scope without writing business fixtures',async()=>{
   await click('全部合同 / 历史查阅');await has('当前跟进');await click('当前跟进');await click('导入加工订单');await has('导入加工订单');await screenshot('processing-import-dialog');await click('关闭');
   await navigate('/order-center/server-detail?id='+x.orderId);await has('订单工作台');await click('维护来源');await has('维护来源');await screenshot('source-maintenance-dialog');await click('关闭');
   await click('维护交期');await has('维护交期');await screenshot('delivery-maintenance-dialog');await click('取消');
   await command('Page.reload',{ignoreCache:true});await has('订单工作台');await until(()=>evaluate('document.querySelector(".ops-page-actions")?.innerText.includes("维护来源")'),'refreshed owned header actions');
  });
  await t.test('persistent client navigation replaces page-owned topbar controls without stale actions',async()=>{
   await click('返回订单列表');await has('全部合同 / 历史查阅');assert.equal(await evaluate('document.querySelector(".ops-page-actions").innerText.includes("维护来源")'),false);
   await click('报价中心');await has('SYN-COMPACT-');await until(()=>evaluate('document.querySelector(".ops-page-actions").innerText.includes("新建报价")'),'quote client actions');assert.equal(await evaluate('document.querySelector(".ops-page-actions").innerText.includes("导入加工订单")'),false);
   await click('订单中心');await has('全部合同 / 历史查阅');assert.equal(await evaluate('document.querySelector(".ops-page-actions").innerText.includes("新建报价")'),false);
  });
  await t.test('retired routes inaccessible; shared material detail retained',async()=>{
   for(const path of ['/order-center/style-progress','/order-center/risks']){await navigate(path);assert.equal(await evaluate('Boolean(document.querySelector(".sp-contract-list,.sp-risk-list"))'),false);}
   await navigate('/order-center/style-progress/detail?orderId='+x.orderId);await has('面料');assert.equal(await evaluate('document.querySelectorAll(".sp-order-nav").length'),0);
  });
  await t.test('restricted real session cannot receive or render protected calculated or confirmed amount fields',async()=>{
   await login('demo.material');await navigate('/quote-center');await has('报价中心');
   assert.equal(await evaluate('document.querySelectorAll("[data-column-key=garmentPrice],[data-column-key=confirmedGarment]").length'),0);assert.equal(await evaluate('document.body.innerText.includes("91.25")||document.body.innerText.includes("108.75")'),false);await screenshot('restricted-material-role');
  });
  await t.test('Issue165 A: nested price edit keeps Enter/Space, upload inputs stay hidden and denied actions explain without writes',async()=>{
   await login('demo.admin');
   await navigate('/quote-center/detail?id='+evidence.quotes.find(q=>q.state===1).id);await has('第二合成方案');
   await evaluate("window.auditWrites=0;const oldFetch=window.fetch;window.fetch=(...args)=>{if(!['GET','HEAD'].includes((args[1]?.method??'GET').toUpperCase()))window.auditWrites++;return oldFetch(...args);}");
   const press=async(key,code,virtual)=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtual,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:key===' '?{text:' ',unmodifiedText:' '}:{})});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual});};
   await command('Page.bringToFront');
   for(const [key,code,virtual] of [['Enter','Enter',13],[' ','Space',32]]){
    assert.equal(await evaluate("(()=>{const n=[...document.querySelectorAll('.qc-version-card button')].find(n=>n.textContent.trim()==='编辑'&&!n.disabled);if(!n)return false;n.focus();return document.activeElement===n})()"),true,'enabled edit button has native focus');
    await press(key,code,virtual);await has('编辑价格版本');
    assert.equal(await evaluate("document.querySelector('[role=dialog] h2')?.textContent"),'编辑价格版本');
    await press('Escape','Escape',27);await until(()=>evaluate("!document.querySelector('[role=dialog]')"),'edit cancelled');
   }
   await evaluate("document.querySelectorAll('.qc-version-card')[1].focus()");await press('Enter','Enter',13);
   assert.equal(await evaluate("document.querySelectorAll('.qc-version-card')[1].getAttribute('aria-pressed')"),'true');
   assert.equal(await evaluate("document.querySelector('[role=dialog]')===null"),true);
   assert.deepEqual(await evaluate("[...document.querySelectorAll('.qc-attachment-card input[type=file]')].map(n=>({hidden:n.hidden,tabIndex:n.tabIndex,visible:!!n.getClientRects().length}))"),Array.from({length:3},()=>({hidden:true,tabIndex:-1,visible:false})));
   assert.equal(await evaluate('window.auditWrites'),0);await screenshot('ui165-a-keyboard-and-attachments');
   await login('demo.material');await navigate('/quote-center');await has('报价中心');
   await until(()=>evaluate("!!document.querySelector('.qc-permission-disabled > button:disabled')"),'denied action');
   assert.equal(await evaluate("(()=>{const n=document.querySelector('.qc-permission-disabled > button:disabled');return document.getElementById(n.getAttribute('aria-describedby'))?.textContent.includes('联系管理员')})()"),true);
   await evaluate("document.querySelector('button[aria-label=查看操作权限说明]').focus()");await press('Enter','Enter',13);await has('暂无权限，请联系管理员');
   assert.equal(await evaluate("document.querySelector('[role=dialog] h2')?.textContent"),'操作权限');
   await press('Escape','Escape',27);await until(()=>evaluate("!document.querySelector('[role=dialog]')"),'permission dialog closed');
   await until(()=>evaluate("document.activeElement?.getAttribute('aria-label')==='查看操作权限说明'"),'permission trigger focus restored');
   await command('Emulation.setTouchEmulationEnabled',{enabled:true});
   const point=await evaluate("(()=>{const r=document.querySelector('button[aria-label=查看操作权限说明]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
   await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await has('暂无权限，请联系管理员');
   assert.equal(await evaluate("document.querySelector('[role=dialog] h2')?.textContent"),'操作权限');await screenshot('ui165-a-touch-permission');
   await press('Escape','Escape',27);await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  });
  await t.test('Issue165 B: role discard uses shared confirmation, keeps cancelled input and never writes permissions',async()=>{
   await login('demo.admin');await navigate('/system-settings/roles');await has('角色列表');
   await until(()=>evaluate("[...document.querySelectorAll('.qc-permission-user-records button')].some(n=>!n.innerText.includes('系统保护'))"),'editable role');
   await evaluate("[...document.querySelectorAll('.qc-permission-user-records button')].find(n=>!n.innerText.includes('系统保护')).click()");await has('角色名称');
   assert.equal(await evaluate("[...document.querySelectorAll('.qc-permission-groups input[type=checkbox]')].every(n=>n.classList.contains('qc-checkbox'))"),true);
   await evaluate("window.dialogWrites=0;const prior=window.fetch;window.fetch=(...a)=>{if(!['GET','HEAD'].includes((a[1]?.method??'GET').toUpperCase()))window.dialogWrites++;return prior(...a);};const n=document.querySelector('.qc-permission-account-fields input');n.focus();n.select()");
   await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',windowsVirtualKeyCode:8});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',windowsVirtualKeyCode:8});await command('Input.insertText',{text:'合成未保存角色草稿'});
   await click('返回角色列表');await has('角色权限有未保存修改');await click('继续编辑');
   await until(()=>evaluate("!document.querySelector('[role=dialog]')"),'keep draft');assert.equal(await evaluate("document.querySelector('.qc-permission-account-fields input').value"),'合成未保存角色草稿');
   await click('返回角色列表');await has('角色权限有未保存修改');await click('放弃修改');await has('选择一个角色');
   assert.equal(await evaluate('window.dialogWrites'),0);await screenshot('ui165-b-role-discard');
  });
  await t.test('Issue165 C3: material GET retry stays separate, source time and settings destinations are explicit, empty groups appear once',async()=>{
   await login('demo.admin');
   const intercept=await command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=window.fetch.bind(window);window.ui165MaterialMode='forbidden';window.ui165ReadRequests=[];window.ui165OriginalFetch=original;window.fetch=async(input,init)=>{const path=new URL(String(input),location.href).pathname,method=init?.method??'GET';if(path.startsWith('/api/'))window.ui165ReadRequests.push({path,method});if(path.endsWith('/material-progress')){if(window.ui165MaterialMode==='forbidden')return new Response('{}',{status:403});if(window.ui165MaterialMode==='network')throw new TypeError('Failed to fetch');}return original(input,init);};})();`});
   try{
    await navigate('/order-center/server-detail?id='+x.orderId);await until(()=>evaluate('Boolean(document.querySelector(".oc-server-detail-material-summary .ow-refresh summary"))'),'material source disclosure');await evaluate('document.querySelector(".oc-server-detail-material-summary .ow-refresh summary").click()');await has('没有物料查看权限，请联系管理员。');
    assert.equal(await evaluate('document.querySelectorAll(".oc-server-detail-material-summary [role=alert]").length'),1);
    await evaluate('window.ui165MaterialMode="network"');await click('重新读取物料');await has('网络连接失败，未取得物料来源');
    await evaluate('window.ui165MaterialMode="allow"');await click('重新读取物料');await until(()=>evaluate('Boolean(document.querySelector(".oc-server-detail-material-summary time[datetime]"))'),'source read time');
    const read=await evaluate(`(()=>{const box=document.querySelector('.oc-server-detail-material-summary'),time=box.querySelector('time[datetime]');return {label:box.innerText,time:time.textContent,raw:time.dateTime,technical:box.querySelector('details details time')?.textContent,requests:window.ui165ReadRequests};})()`);
    assert.ok(read.label.includes('北京时间'));assert.equal(read.time,new Date(read.raw).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}));assert.equal(read.technical,read.raw);
    assert.equal(read.requests.filter(r=>r.method!=='GET').length,0,'reading never launches source capture');assert.ok(read.requests.filter(r=>r.path.endsWith('/material-progress')).length>=3);
    await screenshot('material-read-retry-and-shanghai-time');
   }finally{await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:intercept.identifier});await evaluate('if(window.ui165OriginalFetch)window.fetch=window.ui165OriginalFetch');}
   for(const contextual of [false,true]){await navigate('/system-settings/progress-settings'+(contextual?'?orderId='+x.orderId:''));await has('辅料关键词优先级');assert.equal(await evaluate('document.querySelector(".sp-settings-actions button:last-child")?.textContent'),contextual?'返回物料跟进':'返回订单列表');assert.equal(await evaluate('document.querySelectorAll(".sp-trim-settings [role=tablist]").length'),0);assert.equal(await evaluate('document.querySelectorAll(".sp-trim-settings h2").length'),1);}
   for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await navigate('/production-scheduling');await has('暂无生产组');assert.equal(await evaluate('document.querySelectorAll(".qc-empty-state").length'),1);assert.equal(await evaluate('[...document.querySelectorAll("button")].filter(n=>n.textContent==="维护生产组"&&n.getClientRects().length).length'),1);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);await screenshot('single-empty-groups-'+width);}
  });
  await t.test('Issue165 B: settings navigation commits its discard dialog and never falls back to a second native prompt',async()=>{
   await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await login('demo.admin');await navigate('/system-settings/quote-settings');await has('新建报价默认值');await until(()=>evaluate("![...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='保存报价设置')?.disabled"),'loaded settings');
   const next=await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='加工报价').classList.contains('selected')?'经销报价':'加工报价'");await click(next);
   await evaluate("window.navigationWrites=0;const previous=window.fetch;window.fetch=(...a)=>{if(!['GET','HEAD'].includes((a[1]?.method??'GET').toUpperCase()))window.navigationWrites++;return previous(...a);};window.nativeConfirmCount=0;window.originalConfirm=window.confirm;window.confirm=()=>{window.nativeConfirmCount++;return false;}");
   try{await click('报价中心');await has('报价设置有未保存修改');await screenshot('ui165-b-settings-navigation-discard');await click('继续编辑');await until(()=>evaluate("!document.querySelector('[role=dialog]')"),'settings draft kept');assert.equal(await evaluate('location.pathname'),'/system-settings/quote-settings');assert.equal(await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==="+JSON.stringify(next)+").classList.contains('selected')"),true);await click('报价中心');await has('报价设置有未保存修改');await click('放弃修改');await until(()=>evaluate('location.pathname==="/quote-center"'),'confirmed settings departure');await has('＋ 新建报价');assert.equal(await evaluate('window.nativeConfirmCount'),0);assert.equal(await evaluate('window.navigationWrites'),0);}finally{await evaluate('if(window.originalConfirm)window.confirm=window.originalConfirm');}
  });
  assert.deepEqual(x.errors,[]);assert.deepEqual(errors,[]);await writeFile(join(dir,'results.json'),JSON.stringify(evidence,null,2)+'\n');
 }finally{
  try { await stopOwnedChromium(chrome,{gracefulClose:()=>ws?.send(JSON.stringify({id:++id,method:'Browser.close'})),graceMs:10000,exitMs:10000}); }
  finally { ws?.close();await x.close(); }
  await rm(profile,{recursive:true,force:true});
 }
});
