import {waitForChromiumEndpoint,stopOwnedChromium} from './chromium-endpoint.mjs';
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
test("built existing P6 pages use bound orders and persisted four-stream sources", {timeout:180000},async t=>{
 const info=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));assert.equal(info.orderRead,"snapshot");assert.equal(info.quoteAuthority,"server");
 const x=await startContinuousFixture(resolve("dist/client"),{orderAlerts:true});const temp=await mkdtemp(join(tmpdir(),"zhixu-continuous-ui-"));const metrics=[];let browser,ws,session,command,id=0;const pending=new Map(),errors=[];
 try{
  const profile=join(temp,"profile");
  browser=spawn(process.env.CHROME_PATH??(process.platform==="win32"?"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe":"google-chrome"),["--headless=new","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:"ignore",windowsHide:true});
  const [port,path]=await waitForChromiumEndpoint(profile,{timeoutMs:20000});ws=new WebSocket("ws://127.0.0.1:"+port+path);await new Promise((done,reject)=>{ws.addEventListener("open",done,{once:true});ws.addEventListener("error",reject,{once:true});});
  command=(method,params={},sid=session)=>new Promise((done,reject)=>{pending.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});
  ws.addEventListener("message",({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(p){pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.done(r.result);}if(r.method==="Runtime.exceptionThrown")errors.push(r.params.exceptionDetails.text);});
  const target=await command("Target.createTarget",{url:"about:blank"},undefined);session=(await command("Target.attachToTarget",{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command("Page.enable");await command("Runtime.enable");await command("Network.enable");
  const evaluate=async expression=>{const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const navigate=async path=>{const marker=Date.now()+Math.random();await evaluate("window.navEpoch="+marker);await command("Page.navigate",{url:x.base+path});await until(()=>evaluate("window.navEpoch!=="+marker+"&&document.readyState==='complete'"),"navigation");};
  const has=async text=>{try{await until(()=>evaluate("Boolean(document.body?.innerText.includes("+JSON.stringify(text)+"))"),text);}catch(error){throw Error(error.message+"; "+await evaluate("document.body?.innerText??'navigation in progress'")+"; "+JSON.stringify({http:await evaluate("window.httpFailures??[]"),pool:{total:x.pool.totalCount,idle:x.pool.idleCount,waiting:x.pool.waitingCount},server:x.errors}));}};
  const login=async username=>{const cookie=await x.login(username);const split=cookie.indexOf("=");await command("Network.setCookie",{name:cookie.slice(0,split),value:cookie.slice(split+1),domain:"127.0.0.1",path:"/",httpOnly:true});};
  const screenshot=async name=>{if(process.env.AINUOKE_UI_EVIDENCE!=="1"&&process.env.MATERIAL_HEADER_UI_EVIDENCE!=="1")return;const dir=process.env.MATERIAL_HEADER_UI_EVIDENCE==="1"?resolve("outputs/material-header-ui",info.gitCommit+"-"+info.buildId):resolve("outputs/confirmed-facts-2026-10-14");await mkdir(dir,{recursive:true});const shot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(dir,name+".png"),Buffer.from(shot.data,"base64"));};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.businessWrites=[];window.httpFailures=[];const original=fetch;window.fetch=async(...a)=>{const path=new URL(String(a[0]),location.href).pathname;if(a[1]?.method&&!['GET','HEAD'].includes(a[1].method)&&!path.includes('/auth/'))businessWrites.push(path);try{const response=await original(...a);if(response.status>=400){let code='';try{code=(await response.clone().json()).error?.code??'';}catch{}httpFailures.push({path,status:response.status,code});}return response;}catch(error){httpFailures.push({path,networkFailure:true});throw error;}};"});
  // The accepted UI separates self/factory views and opens details on the demand tab.
  // Exercise both scopes and the actual procurement tab rather than legacy hidden markup.
  const mainTab=async key=>{await evaluate("document.querySelector('.sp-dense-view-tabs [id$=\"-view-"+key+"\"]').click()");await until(()=>evaluate("document.querySelector('.sp-dense-view-tabs [id$=\"-view-"+key+"\"]').getAttribute('aria-selected')==='true'"),'material view '+key);};
  const assertMaterialScopes=async()=>{
   await mainTab('self');assert.equal(await evaluate("new Set([...document.querySelectorAll('[data-canonical-material-key]')].map(n=>n.getAttribute('data-canonical-material-key'))).size"),4);
   await mainTab('factory');assert.equal(await evaluate("document.querySelectorAll('[data-supply-scope=factory] [data-canonical-material-key]').length"),1,'factory demand remains independently accessible');
   await mainTab('self');assert.equal(await evaluate("document.querySelectorAll('[data-supply-scope=self] [data-canonical-material-key]').length"),4);
  };
  const openPurchaseDetails=async()=>{
   await evaluate("[...document.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')==='查看 合成棉布 明细').click()");
   await until(()=>evaluate("!!document.querySelector('.sp-dense-events [id$=\"-tab-purchase\"]')"),'material detail drawer');
   await evaluate("document.querySelector('.sp-dense-events [id$=\"-tab-purchase\"]').click()");await has('12.75');
  };
  const input=(selector,value)=>evaluate("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const click=label=>evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing button '+"+JSON.stringify(label)+");n.click();})()");
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await t.test("animated login, order deep-link, quote navigation and logout share one trusted session",async()=>{
   const target="/order-center/server-detail?id="+x.orderId+"#resume";
   await navigate(target);await has("忘记密码？请联系系统管理员");
   assert.equal(await evaluate("location.pathname"),"/login");
   assert.equal(await evaluate("new URLSearchParams(location.search).get('returnTo')"),target);
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.zx-login')).display"),"grid");await screenshot("login-combined");
   await input("input[name=username]",x.users[0]);await input("input[name=password]",x.password);await click("登录织序");
   await has("物料采购汇总");assert.equal(await evaluate("location.pathname+location.search+location.hash"),target);
   await click("报价中心");await has("SYNTHETIC-TEE-001");await has("合成演示T恤");
   assert.equal(await evaluate("location.pathname"),"/quote-center");
   await click("订单中心");await has("SC-SYNTHETIC-001");
   const material="/order-center/style-progress/detail?orderId="+x.orderId;
   await navigate(material);await has("合成棉布");
   await click("用户菜单");
   await command("Network.setBlockedURLs",{urls:["*/api/v1/auth/logout*"]});
   await click("退出登录");await has("退出未完成，请检查网络后重试。");
   assert.equal(await evaluate("(async()=> (await fetch('/api/v1/sales-orders')).status)()"),200);
   await command("Network.setBlockedURLs",{urls:[]});
   await click("退出登录");await has("忘记密码？请联系系统管理员");
   assert.equal(await evaluate("new URLSearchParams(location.search).get('returnTo')"),material);
   assert.equal(await evaluate("new Set([...document.querySelectorAll('[data-canonical-material-key]')].map(n=>n.getAttribute('data-canonical-material-key'))).size"),0);
   assert.equal(await evaluate("(async()=> (await fetch('/api/v1/sales-orders')).status)()"),401);
   await input("input[name=username]",x.users[3]);await input("input[name=password]",x.password);await click("登录织序");await has("合成棉布");
   assert.equal(await evaluate("location.pathname+location.search"),material);
   assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
  });
  await t.test("approved headers use factory style and compact guarded back arrows at six widths",async()=>{
   await login(x.users[0]);
   const detail=await evaluate("(async()=> (await (await fetch('/api/v1/sales-orders/"+x.orderId+"')).json()).salesOrder)()");
   assert.ok(detail.insideOrderNo&&detail.styleNo&&detail.insideOrderNo!==detail.styleNo,'fixture must distinguish business and factory styles');
   for(const [width,deviceScaleFactor] of [[1920,1],[1536,1.25],[1440,1],[1280,1],[900,1],[390,1]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor,mobile:width===390});
    await navigate('/order-center/server-detail?id='+x.orderId);await has('业务款号');
    assert.equal(await evaluate("document.querySelector('h1').textContent"),detail.insideOrderNo);
    const overview=await evaluate("document.querySelector('.oc-server-detail-overview').innerText");
    assert.ok(overview.includes(detail.styleNo));assert.doesNotMatch(overview,/正式订单号|BillNo/);
    assert.equal(await evaluate("document.querySelectorAll('.ops-topbar-back').length"),1);
    assert.equal(await evaluate("document.querySelectorAll('.qc-page-back').length"),0);
    assert.ok(await evaluate("document.querySelector('.ops-topbar-back').getBoundingClientRect().width<=32"));
    const aligned=await evaluate("({title:document.querySelector('h1').getBoundingClientRect().left,card:document.querySelector('.oc-server-detail-overview').getBoundingClientRect().left,columns:getComputedStyle(document.querySelector('.qc-page-header')).gridTemplateColumns})");
    assert.ok(Math.abs(aligned.title-aligned.card)<=2,JSON.stringify({width,...aligned}));
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    if(width===1440||width===390)await screenshot('order-header-'+width);
    await navigate('/order-center/style-progress/detail?orderId='+x.orderId);await has('合成棉布');
    assert.equal(await evaluate("document.querySelector('h1').textContent"),detail.insideOrderNo);
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"订单中心功能导航\"]').length"),0);
    assert.equal(await evaluate("document.querySelectorAll('.qc-page-back').length"),0);
    assert.equal(await evaluate("document.body.innerText.includes('完整分页已读取')"),false);
    assert.equal((await evaluate('document.body.innerText')).split(detail.salesContractNo).length-1,1,'contract appears once');
    assert.ok(await evaluate("document.querySelector('.ops-topbar-back').getBoundingClientRect().width<=32"));
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    if(width===1440||width===390)await screenshot('material-header-'+width);
    await click('返回订单详情');await until(()=>evaluate("location.pathname==='/order-center/server-detail'"),'back to order detail');await has('业务款号');assert.equal(await evaluate('location.pathname'),'/order-center/server-detail');
    await click('返回订单列表');await until(()=>evaluate("location.pathname==='/order-center'&&document.querySelector('h1')?.textContent==='订单中心'"),'back to loaded order list');await has('SC-SYNTHETIC-001');assert.equal(await evaluate('location.pathname'),'/order-center');
   }
   await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  });
  await t.test("sidebar logout preserves dirty Server Quote until explicit discard, including logout failure",async()=>{
   await login(x.users[0]);await navigate('/quote-center/detail?id=synthetic-unified-demo');
   await until(()=>evaluate("!!document.querySelector('input[placeholder=\"请输入款式名称\"]')"),'Server quote editor');
   await input('input[placeholder="请输入款式名称"]','合成：尚未保存的退出保护');
   await click('用户菜单');await click('退出登录');await has('有未保存的修改');
   assert.equal(await evaluate("(async()=> (await fetch('/api/v1/sales-orders')).status)()"),200);
   await click('继续编辑');assert.equal(await evaluate("document.querySelector('input[placeholder=\"请输入款式名称\"]').value"),'合成：尚未保存的退出保护');
   await click('用户菜单');await click('退出登录');await has('放弃并退出');
   await command('Network.setBlockedURLs',{urls:['*/api/v1/auth/logout*']});await click('放弃并退出');await has('退出未完成，当前草稿保留');
   assert.equal(await evaluate("document.querySelector('input[placeholder=\"请输入款式名称\"]').value"),'合成：尚未保存的退出保护');
   assert.equal(await evaluate("(async()=> (await fetch('/api/v1/sales-orders')).status)()"),200);
   await command('Network.setBlockedURLs',{urls:[]});await click('放弃并退出');await has('忘记密码？请联系系统管理员');
   await login(x.users[0]);await navigate('/quote-center/detail?id=synthetic-unified-demo');
   await until(()=>evaluate("document.querySelector('input[placeholder=\"请输入款式名称\"]')?.value==='合成演示T恤'"),'persisted quote unchanged');
  });
  await login(x.users[0]);
  for(const width of [1440,1280,390])await t.test("existing layout and real CSS at "+width,async()=>{
   await command("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:width===390});
   await navigate("/order-center");await has("SC-SYNTHETIC-001");
   await has("数量0");await has("单位为空");
   assert.equal(await evaluate("document.querySelectorAll('.qc-server-session-floating').length"),0);
   assert.equal(await evaluate("document.querySelectorAll('.qc-user-popover').length"),0);
   if(width===390){
    await click("打开主导航");await has("业务导航");await click("用户菜单");
   }else{
    const position=await evaluate("(()=>{const r=document.querySelector('.qc-user-menu').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",...position});
   }
   await has("退出登录");assert.equal(await evaluate("document.querySelector('.qc-user-menu button').getAttribute('aria-expanded')"),"true");
   assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth+1"),false);await screenshot("user-menu-"+width);
   await evaluate("document.querySelector('.qc-user-menu button').focus()");
   await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
   await until(()=>evaluate("!document.querySelector('.qc-user-popover')"),"Escape closes user menu");
   if(width===390)await until(()=>evaluate("!document.querySelector('.ops-navigation-drawer')"),"Escape closes mobile navigation");

   assert.equal(await evaluate("document.querySelectorAll('.oc-order-alert-chip').length>=2"),true);
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.qc-toolbar')).display"),"flex");
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.qc-page-container')).display"),"grid");
   assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth+1"),false);await screenshot("list-"+width);
   await navigate("/order-center/server-detail?id="+x.orderId);await has("物料采购汇总");await has("来源读取");await has("2026-11-01");
   const result=await evaluate("(()=>{const dl=document.querySelector('.oc-server-detail-overview .qc-description-list');return{columns:getComputedStyle(dl).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth+1,technicalOpen:document.querySelector('.oc-server-technical-details').open};})()");
   assert.equal(result.columns,width>=1280?3:1);assert.equal(result.overflow,false);assert.equal(result.technicalOpen,false);metrics.push({width,...result});await screenshot("order-"+width);
   await evaluate("[...document.querySelectorAll('a')].find(n=>n.textContent.includes('查看物料跟进')).click()");await has("合成棉布");
   await assertMaterialScopes();
   for(const label of ["采购明细","入库明细","出运明细","出库明细"])await has(label);
   assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth+1"),false);
   await openPurchaseDetails();await screenshot("material-"+width);
   assert.deepEqual(await evaluate("window.businessWrites"),[]);
   assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
  });
  await t.test("all seven trusted roles see four-stream procurement; no amount sentinel or Browser fallback",async()=>{
   for(const user of x.users){await login(user);await navigate("/order-center/style-progress/detail?orderId="+x.orderId);await has("合成棉布");await openPurchaseDetails();assert.equal(await evaluate("document.body.innerText.includes('protected-commercial-sentinel')"),false);}
  });
  await t.test("automatic polling observes next persisted generation without navigation or reload",async()=>{
   const before=x.materialReads();await x.capture();await until(()=>evaluate("document.body.innerText.includes('PO-SYNTHETIC-partial-a-G1')"),"automatic next generation",40000);assert.ok(x.materialReads()>before);
  });
  await t.test("failure preserves last complete facts and focus-driven recovery reuses the existing layout",async()=>{
   x.setMode("failed");await assert.rejects(x.capture());await evaluate("window.dispatchEvent(new Event('focus'))");await has("最近刷新未成功");
   await evaluate("document.querySelector('.sp-dense-events > header button')?.click()");await assertMaterialScopes();
   x.setMode("ready");await x.capture();await evaluate("window.dispatchEvent(new Event('focus'))");await has("合成棉布");
   x.setMode("stale");await evaluate("window.dispatchEvent(new Event('focus'))");await has("当前显示历史数据");await evaluate("document.querySelector('.sp-dense-events > header button')?.click()");await assertMaterialScopes();x.setMode("ready");
  });
  await t.test("missing UUID and unsupported routes cannot enter old Browser pages",async()=>{
   await navigate("/order-center/style-progress/detail");await has("仅接受正式订单 UUID");
   for(const route of ["/order-center/new","/order-center/style-progress","/order-center/risks"]){await navigate(route);await has("此模块未在当前候选中启用");}
   assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
  });
  await t.test("approved snapshot closing routes enforce trusted permissions without Browser fallback or writes",async()=>{
   const routes=["/closing-center?year=2027","/closing-center/detail?year=2027"];
   await login(x.users.at(-1));
   for(const route of routes){
    await navigate(route);await has("暂无关账查看权限");await has("需要关账、订单及生产排单查看权限。");
    assert.equal(await evaluate("document.querySelector('.sc-adjustment-page')!==null"),false);
    assert.equal(await evaluate("(async()=> (await fetch('/api/v1/closing/year?year=2027')).status)()"),403);
    assert.deepEqual(await evaluate("window.businessWrites"),[]);
    assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
   }
   await login(x.users[0]);
   for(const route of routes){
    await navigate(route);await has("全年成衣销售产值 · CNY");await has("全年加工产值 · USD");
    assert.equal(await evaluate("document.querySelector('.sc-adjustment-page')!==null"),true);
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=全年十二个月] .sc-month-card').length"),12);
    assert.equal(await evaluate("(async()=> (await fetch('/api/v1/closing/year?year=2027')).status)()"),200);
    assert.deepEqual(await evaluate("window.businessWrites"),[]);
    assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
   }
  });
  await t.test("explicit snapshot candidate opens trusted Server planning without Browser stores or business writes",async()=>{
   await login(x.users.at(-1));await navigate("/production-scheduling");await has("暂无生产排单权限");
   assert.equal(await evaluate("document.querySelector('.ps-server-scheduling-page')!==null"),false);
   assert.equal(await evaluate("(async()=> (await fetch('/api/v1/production-scheduling/groups')).status)()"),403);
   await login(x.users[0]);await navigate("/production-scheduling");await has("暂无生产组");
   assert.equal(await evaluate("location.pathname"),"/production-scheduling");
   assert.equal(await evaluate("document.querySelector('.ps-server-scheduling-page')!==null"),true);
   assert.deepEqual(await evaluate("window.businessWrites"),[]);
   assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);
  });
  await t.test("saved Quote retries logout without another aggregate PUT, but later edits must save again",async()=>{
   await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
   const version=async()=>Number((await x.pool.query("SELECT version FROM quote_center_quotes WHERE id=$1",['synthetic-unified-demo'])).rows[0].version);
   const writes=()=>evaluate("window.businessWrites.filter(p=>p==='/api/v1/quotes/synthetic-unified-demo').length");
   const editor=async()=>{await login(x.users[0]);await navigate('/quote-center/detail?id=synthetic-unified-demo');await until(()=>evaluate("!!document.querySelector('input[placeholder=\"请输入款式名称\"]')"),'loaded quote editor');};
   const saveWithBlockedLogout=async()=>{
    const failures=()=>evaluate("window.httpFailures.filter(f=>f.path==='/api/v1/auth/logout').length");
    const before=await failures();await click('保存并退出');
    await until(async()=>await failures()>before,'new logout failure completed');
    await has('退出未完成，当前草稿保留');
   };
   try{
    await editor();const before=await version();await evaluate("window.businessWrites=[]");
    await input('input[placeholder="请输入款式名称"]','合成：已保存只重试退出');
    await click('用户菜单');await click('退出登录');await has('保存并退出');
    await command('Network.setBlockedURLs',{urls:['*/api/v1/auth/logout*']});await saveWithBlockedLogout();
    assert.equal(await version(),before+1);assert.equal(await writes(),1);
    await saveWithBlockedLogout();
    assert.equal(await version(),before+1,'retrying logout must not create a second quote version');
    assert.equal(await writes(),1,'retrying logout must not repeat Quote PUT');
    await command('Network.setBlockedURLs',{urls:[]});await click('保存并退出');await has('忘记密码？请联系系统管理员');
    assert.equal(await version(),before+1);
    await editor();await evaluate("window.businessWrites=[]");const next=await version();
    await input('input[placeholder="请输入款式名称"]','合成：第一份已保存修改');
    await click('用户菜单');await click('退出登录');await command('Network.setBlockedURLs',{urls:['*/api/v1/auth/logout*']});await saveWithBlockedLogout();
    assert.equal(await version(),next+1);await click('继续编辑');
    await input('input[placeholder="请输入款式名称"]','合成：继续编辑后的第二份修改');
    await click('用户菜单');await click('退出登录');await saveWithBlockedLogout();
    assert.equal(await version(),next+2,'new dirty edits still require a new save');
    assert.equal(await writes(),2);
    await command('Network.setBlockedURLs',{urls:[]});await click('保存并退出');await has('忘记密码？请联系系统管理员');
    assert.equal(await version(),next+2);
   }finally{await command('Network.setBlockedURLs',{urls:[]});}
  });
  await t.test("an unconfirmed Quote save cannot be bypassed by retry-save or discard logout",async()=>{
   await login(x.users[0]);await navigate('/quote-center/detail?id=synthetic-unified-demo');
   await until(()=>evaluate("!!document.querySelector('input[placeholder=\"请输入款式名称\"]')"),'loaded quote before unknown save');
   const before=Number((await x.pool.query("SELECT version FROM quote_center_quotes WHERE id=$1",['synthetic-unified-demo'])).rows[0].version);
   await evaluate("window.businessWrites=[]");await input('input[placeholder="请输入款式名称"]','合成：保存结果尚待核对');
   await click('用户菜单');await click('退出登录');await has('保存并退出');
   try{
    await command('Network.setBlockedURLs',{urls:['*/api/v1/quotes/synthetic-unified-demo*']});await click('保存并退出');await has('Server 保存未确认');
    await click('保存并退出');await wait(200);
    assert.equal(await evaluate("window.businessWrites.filter(p=>p==='/api/v1/quotes/synthetic-unified-demo').length"),1);
    await click('放弃并退出');await wait(300);
    assert.equal(await evaluate("location.pathname"),'/quote-center/detail','unknown save must remain available for explicit reconciliation');
    assert.equal(Number((await x.pool.query("SELECT version FROM quote_center_quotes WHERE id=$1",['synthetic-unified-demo'])).rows[0].version),before);
    assert.equal(await evaluate("(async()=> (await fetch('/api/v1/sales-orders')).status)()"),200);
    assert.equal(await evaluate("document.querySelector('input[placeholder=\"请输入款式名称\"]').value"),'合成：保存结果尚待核对');
   }finally{await command('Network.setBlockedURLs',{urls:[]});}
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
  if(process.env.AINUOKE_UI_EVIDENCE==="1")await writeFile(resolve("outputs/confirmed-facts-2026-10-14/computed-styles.json"),JSON.stringify({build:info,metrics},null,2)+"\n");
 }finally{
  let stopped=false;
  try{await stopOwnedChromium(browser,{gracefulClose:ws?.readyState===WebSocket.OPEN&&command?()=>command('Browser.close',{},null):undefined});stopped=true;}
  finally{ws?.close();await x.close();}
  const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-continuous-ui-"));if(stopped)await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
});
