import {waitForChromiumEndpoint} from './chromium-endpoint.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {startContinuousFixture} from './ainuoke-continuous-fixture.ts';
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await read())return;}catch(e){if(!/Execution context was destroyed|Cannot find context|Inspected target navigated/.test(String(e)))throw e;}await pause(75);}throw Error(label+' timed out');}
test('contract payment observations use the existing drawer without false material matching',{timeout:240000},async t=>{
  const info=JSON.parse(readFileSync('dist/client/build-info.json','utf8'));assert.equal(info.quoteAuthority,'server');assert.equal(info.orderRead,'snapshot');assert.match(info.gitCommit,/^[a-f0-9]{40}$/u);
  if(process.env.PAYMENT_PANEL_EXPECTED_SOURCE)assert.equal(info.gitCommit,process.env.PAYMENT_PANEL_EXPECTED_SOURCE,'payment panel must use the expected compiled source');
  const x=await startContinuousFixture(resolve('dist/client'),{materialDisplay:true,excessWarehouse:true,paymentRequests:true});
  const temp=await mkdtemp(join(tmpdir(),'zhixu-payment-panel-ui-'));let browser,ws,session,id=0;
  const pending=new Map(),errors=[],metrics=[];
  const evidence=process.env.PAYMENT_PANEL_UI_EVIDENCE==='1'?resolve('outputs/payment-panel-ui',info.gitCommit+'-'+info.buildId+(process.env.PAYMENT_PANEL_UI_RUN?'-'+process.env.PAYMENT_PANEL_UI_RUN:'')):null;
  try{
    const profile=join(temp,'profile');browser=spawn(process.env.CHROME_PATH??(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome'),
      ['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
    const [port,path]=await waitForChromiumEndpoint(profile,{timeoutMs:20000});
    ws=new WebSocket('ws://127.0.0.1:'+port+path);await new Promise((done,reject)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',reject,{once:true});});
    const command=(method,params={},sid=session)=>new Promise((done,reject)=>{pending.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});
    ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.done(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
    const target=await command('Target.createTarget',{url:'about:blank'},null);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
    await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
    await command('Page.addScriptToEvaluateOnNewDocument',{source:"window.paymentApiRequests=[];const original=window.fetch;window.fetch=(input,init)=>{const p=new URL(String(input),location.href).pathname;if(p.startsWith('/api/'))window.paymentApiRequests.push({path:p,method:init?.method??'GET'});return original(input,init);};"});
    const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
    const click=async text=>{assert.equal(await evaluate("(()=>{const label="+JSON.stringify(text)+";const b=[...document.querySelectorAll('.sp-material-events button')].find(x=>x.textContent.trim()===label||(x.getAttribute('role')==='tab'&&x.textContent.trim().startsWith(label+' (')));if(!b||b.disabled)return false;b.click();return true;})()"),true,'click '+text);};
    const has=text=>until(()=>evaluate("Boolean(document.querySelector('.sp-payment-requests')?.textContent.includes("+JSON.stringify(text)+"))"),text);
    const login=async user=>{const cookie=await x.login(user),split=cookie.indexOf('=');await command('Network.setCookie',{name:cookie.slice(0,split),value:cookie.slice(split+1),domain:'127.0.0.1',path:'/',httpOnly:true});};
    const route='/order-center/style-progress/detail?orderId='+x.orderId;
    const navigate=async()=>{const marker=Date.now()+Math.random();await evaluate('window.oldPaymentDocument='+marker);await command('Page.navigate',{url:x.base+route});await until(()=>evaluate("window.oldPaymentDocument!=="+marker+"&&document.readyState==='complete'&&Boolean(document.querySelector('.sp-v4-material-card'))"),'material page');await evaluate('document.fonts.ready');};
    const openEvents=async()=>{assert.equal(await evaluate("(()=>{const b=document.querySelector('.sp-material-card-actions button[aria-label^=\"查看 \" ][aria-label$=\" 事件\"]');if(!b||b.disabled)return false;b.focus();b.click();return true;})()"),true,'open the named material event action');await until(()=>evaluate("Boolean(document.querySelector('.sp-material-events'))"),'existing drawer');};
    const openPayments=async()=>{await openEvents();await click('对账');await has('127 条合同来源明细');};
    const close=async()=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(()=>evaluate("!document.querySelector('.sp-material-events')"),'drawer closed');};
    const screenshot=async name=>{if(!evidence)return;await mkdir(evidence,{recursive:true});const data=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(evidence,name+'.png'),Buffer.from(data.data,'base64'));};
    const money='87654321.1234567890123456';
    await login('demo.material');await navigate();const materialGeneration=x.generation();
    const phase=async(name,work)=>{let passed=false;await t.test(name,async()=>{await work();passed=true;});assert.ok(passed,'Stop dependent payment UI phases after the first failure');};
    await phase('only opening the existing reconciliation tab reads contract observations',async()=>{
      assert.equal(x.payments.reads(),0);await openEvents();assert.equal(x.payments.reads(),0);await click('对账');await has('127 条合同来源明细');
      await has('尚未逐行关联当前物料');await has('申请金额不代表银行实付');
      assert.equal(await evaluate("document.querySelector('.sp-payment-requests tbody tr:first-child td:nth-child(6)').textContent"),'115.50（个）');
      assert.equal(await evaluate("document.querySelector('.sp-payment-requests tbody tr:first-child td:nth-child(7)').textContent"),'118（单位待核）');
      assert.ok(await evaluate("document.querySelector('.sp-payment-requests').textContent.includes("+JSON.stringify(money+' 币种待核')+")"));
      assert.equal(x.payments.reads(),1);await close();
    });
    await phase('six widths keep existing drawer geometry, local scrolling and readable source scope',async()=>{
      for(const width of [1920,1536,1440,1280,900,390]){
        await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:width===1536?1.25:1,mobile:width===390});
        await openPayments();await evaluate('document.fonts.ready');
        const m=await evaluate("(()=>{const d=document.querySelector('.sp-material-events').getBoundingClientRect(),root=document.documentElement,t=document.querySelector('.sp-payment-requests .sp-v4-inner-scroll');return {viewport:innerWidth,globalOverflow:root.scrollWidth>innerWidth+1,drawer:{left:d.left,right:d.right,width:d.width},localScroll:t.scrollWidth>t.clientWidth,notice:document.querySelector('.sp-event-comparison').textContent};})()");
        assert.equal(m.globalOverflow,false);assert.ok(m.drawer.left>=-1&&m.drawer.right<=m.viewport+1);assert.ok(m.notice.includes('尚未逐行关联当前物料'));
        assert.equal(m.localScroll,true);if(width===390)assert.ok(Math.abs(m.drawer.width-390)<2);
        metrics.push({width,...m});await screenshot('payment-'+width);
        if(width===390){
          await evaluate("document.querySelector('.sp-payment-requests details').open=true");
          const expanded=await evaluate("(()=>{const d=document.querySelector('.sp-payment-requests details');const cell=[...d.querySelectorAll('td')].find(n=>n.textContent.includes('9007199254740993.12345678901234567890'));if(!cell)throw Error('missing exact price');cell.scrollIntoView({block:'center'});return {open:d.open,visible:cell.checkVisibility(),overflow:document.documentElement.scrollWidth>innerWidth+1};})()");
          assert.deepEqual(expanded,{open:true,visible:true,overflow:false});await screenshot('payment-fields-390');
        }
        await close();
      }
    });
    await phase('pagination preserves every observation and decimal text without requesting or summing more data',async()=>{
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await openPayments();const before=x.payments.reads();
      for(let i=1;i<13;i++){await click('下一页');await has('显示第 '+(i+1)+' / 13 页');}
      assert.equal(await evaluate("document.querySelectorAll('.sp-payment-requests > .sp-v4-inner-scroll tbody tr').length"),7);
      await evaluate("document.querySelector('.sp-payment-requests details').open=true");
      await has('9007199254740993.12345678901234567890');await has('-80.00');await has('0（单位待核）');await has('来源第 2 页第 21 条');
      assert.equal(await evaluate("(()=>{const d=document.querySelector('.sp-payment-requests details');const cell=[...d.querySelectorAll('td')].find(n=>n.textContent.includes('9007199254740993.12345678901234567890'));cell.scrollIntoView({block:'center'});return d.open&&cell.checkVisibility();})()"),true);
      assert.equal(await evaluate("document.querySelector('.sp-payment-requests').textContent.includes('CNY')"),false);
      assert.equal(x.payments.reads(),before);await screenshot('payment-fields-1440');await close();
    });
    await phase('an open tab hides expired records without issuing another upstream or DB request',async()=>{
      const expiry=(await x.pool.query('SELECT s.payload->>\'expiresAt\' AS expiry FROM ainuoke_payment_heads h JOIN ainuoke_payment_snapshots s ON s.id=h.snapshot_id')).rows[0].expiry;
      x.payments.setOffset(Date.parse(expiry)-Date.now()-3000);await evaluate('window.paymentOriginalDateNow=Date.now;Date.now=()=>0');
      try{await openPayments();const before=x.payments.reads();
        await has('货款申请来源已过期');assert.equal(await evaluate("document.querySelector('.sp-payment-requests table')===null"),true);
        assert.equal(await evaluate("document.querySelector('.sp-payment-requests').textContent.includes("+JSON.stringify(money)+")"),false);assert.equal(x.payments.reads(),before);
        await screenshot('payment-expired-1440');await close();
      }finally{await evaluate('Date.now=window.paymentOriginalDateNow');x.payments.setOffset(0);}
    });
    await phase('disabled/changed targets clear old amounts and require a new accepted snapshot',async()=>{
      await openPayments();await x.payments.setEnabled(false);await click('刷新记录');await has('货款申请明细尚未接通');
      assert.equal(await evaluate("document.querySelector('.sp-payment-requests table')===null"),true);
      await x.payments.setEnabled(true);await click('刷新记录');await has('来源关联已有变化');
      await x.payments.publish();await click('刷新记录');await has('127 条合同来源明细');await close();
    });
    await phase('closing or switching tabs ignores delayed responses and restores keyboard focus',async()=>{
      await openPayments();x.payments.setDelay(650);await click('刷新记录');await click('采购');await pause(800);
      assert.equal(await evaluate("document.querySelector('.sp-payment-requests')===null"),true);
      x.payments.setDelay(0);await click('对账');await has('127 条合同来源明细');await close();
      // The shared overlay restores focus in requestAnimationFrame after unmount.
      await until(()=>evaluate("Boolean(document.activeElement?.getAttribute('aria-label')?.startsWith('查看 '))"),'drawer trigger focus restored',3000);
      assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')?.startsWith('查看 ')") ,true);
    });
    await phase('seven synthetic roles see only contract Source records; no Quote/CCT or Browser fallback requests',async()=>{
      for(const user of x.users){await login(user);await navigate();await openPayments();await has('币种待核');
        const requests=await evaluate("window.paymentApiRequests");
        assert.ok(requests.filter(r=>r.path.endsWith('/payment-requests')).every(r=>r.method==='GET'));
        assert.deepEqual(requests.filter(r=>r.path.includes('confirmed-commercial-terms')||r.path.startsWith('/api/v1/quotes')),[]);
        assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"),[]);await close();}
    });
    await phase('actual DB permission revocation hides amounts despite an already open session',async()=>{
      await login('demo.production');await navigate();await openPayments();
      await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='role-team-production-manager' AND permission_key='ainuoke.view'");
      try{await click('刷新记录');await until(()=>evaluate("!document.body.textContent.includes("+JSON.stringify(money)+")&&/没有货款申请|正式物料来源/.test(document.body.textContent)"),'revoked source hidden');}
      finally{await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-team-production-manager','ainuoke.view')");}
    });
    assert.equal(x.generation(),materialGeneration);assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
    if(evidence)await writeFile(join(evidence,'receipt.json'),JSON.stringify({schemaVersion:'payment-read-panel-ui.v1',renderedSourceSha:info.gitCommit,buildId:info.buildId,synthetic:true,realDatabaseAccess:false,sourceActivation:'not-activated',metrics},null,2)+'\n');
  }finally{
    if(ws)ws.close();if(browser)browser.kill();await x.close();
    const owned=relative(resolve(tmpdir()),resolve(temp));if(!owned||owned.startsWith('..')||isAbsolute(owned)||!owned.startsWith('zhixu-payment-panel-ui-'))throw Error('Unsafe owned browser cleanup');
    await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
