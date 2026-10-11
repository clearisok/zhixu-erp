import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {startOrderMaterialFixture} from '../../../server/integration/order-material-fixture.ts';
import {startOrderIntegrationPreview} from '../integration-preview/server.mjs';
async function until(check,label){const deadline=Date.now()+30000;while(Date.now()<deadline){if(await check())return;await new Promise(done=>setTimeout(done,100));}throw new Error('timeout: '+label);}
test('actual Order list/detail/Control Tower closed loop at 1440/1280/390 with isolated session API',async t=>{
  const fixture=await startOrderMaterialFixture(); const preview=await startOrderIntegrationPreview(fixture.base);const temp=await mkdtemp(join(tmpdir(),'zhixu-order-integration-'));const profile=join(temp,'profile');
  let browser,ws,sessionId,sequence=0;const pending=new Map(),requests=[],errors=[];let checks=0;const visualMetrics=[];
  try {
    const port=new URL(preview.url).port;assert.ok(!['3000','3001','3002','18443','18444'].includes(port));
    const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';assert.ok(existsSync(chrome));
    browser=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
    await until(()=>existsSync(join(profile,'DevToolsActivePort')),'private Chrome');const [debugPort,debugPath]=readFileSync(join(profile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);
    ws=new WebSocket(`ws://127.0.0.1:${debugPort}${debugPath}`);await new Promise((done,reject)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',reject,{once:true});});
    ws.addEventListener('message',({data})=>{const reply=JSON.parse(String(data));const item=pending.get(reply.id);if(item){pending.delete(reply.id);if(reply.error){item.reject(new Error(JSON.stringify(reply.error)));}else{item.done(reply.result);}}if(reply.method==='Network.requestWillBeSent')requests.push(reply.params.request);if(reply.method==='Runtime.exceptionThrown')errors.push(reply.params.exceptionDetails.text);});
    const command=(method,params={},session=sessionId)=>new Promise((done,reject)=>{pending.set(++sequence,{done,reject});ws.send(JSON.stringify({id:sequence,method,params,...(session?{sessionId:session}:{})}));});
    const target=await command('Target.createTarget',{url:'about:blank'});sessionId=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(result.exceptionDetails,undefined);return result.result.value;};
    await command('Page.enable');await command('Network.enable');await command('Runtime.enable');
    await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.businessWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(/order|style-progress|quote|permission/i.test(key))window.businessWrites.push(key);return set.call(this,key,value)};const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.businessWrites.push('indexedDB');return open(...args)};`});
    const cookie=await fixture.login('tracker-a');const [name,value]=cookie.split('=');await command('Network.setCookie',{name,value,domain:'127.0.0.1',path:'/',httpOnly:true});
    const origin=new URL(preview.url).origin;
    const navigate=async path=>{await command('Page.navigate',{url:origin+path});};
    const waitDetail=()=>until(()=>evaluate("document.body.innerText.includes('物料采购汇总') && !document.body.innerText.includes('读取物料来源…')"),'actual order detail');
    const capture=async label=>{const dir=new URL('../../../docs/tasks/active/evidence/order-material-p6-restoration/',import.meta.url);await mkdir(dir,{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(new URL(label,dir),Buffer.from(shot.data,'base64'));};
    for(const width of [1440,1280,390]) await t.test(`${width}px actual components summary/detail/return`,async()=>{
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});await navigate('/order-center');
      await until(()=>evaluate(`document.body.innerText.includes('${fixture.orders[0].orderNo}')`),'actual formal list');checks++;
      const styles=await evaluate(`(()=>{const style=sel=>{const el=document.querySelector(sel);const css=el&&getComputedStyle(el);return el?{display:css.display,direction:css.flexDirection,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}:null;};const controls=[...document.querySelectorAll('.qc-toolbar input,.qc-toolbar button,.qc-toolbar-desktop-more select')].filter(el=>el.getBoundingClientRect().height>0).map(el=>({label:el.getAttribute('aria-label')||el.textContent,x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y}));return{width:innerWidth,foundationLoaded:[...document.querySelectorAll('style[data-vite-dev-id]')].some(el=>el.getAttribute('data-vite-dev-id').endsWith('/app/foundation.css')),toolbar:style('.qc-toolbar'),page:style('.qc-page-container'),records:style('.qc-responsive-record-list'),table:style('.qc-table-wrap'),card:style('.oc-list-card'),tableCount:document.querySelectorAll('.oc-server-order-table .qc-data-table').length,controls,overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
      visualMetrics.push({page:'list',...styles});console.log('LIST COMPUTED '+JSON.stringify(styles));
      await capture(`list-${width}.png`);
      assert.equal(styles.toolbar.display,'flex','Foundation toolbar must use flex');checks++;
      assert.equal(styles.toolbar.direction,'row','Toolbar controls remain horizontal');checks++;
      assert.equal(styles.page.display,'grid','PageContainer Foundation grid');checks++;
      assert.equal(styles.foundationLoaded,true,'Actual Foundation stylesheet loaded');checks++;
      assert.equal(styles.tableCount,1,'One original DataTable');checks++;
      assert.equal(styles.overflow,false,'List has no document overflow');checks++;
      if(width>=1280){assert.equal(styles.records.display,'none','Desktop mobile cards hidden');assert.notEqual(styles.table.display,'none','Desktop table visible');assert.ok(Math.abs(styles.table.width-styles.card.width)<3,'Table fills white card');assert.ok(Math.max(...styles.controls.map(c=>c.y))-Math.min(...styles.controls.map(c=>c.y))<12,'Desktop controls form one row');checks+=4;}
      else{assert.equal(styles.records.display,'grid','Original mobile records visible');assert.equal(styles.table.display,'none','Desktop table hidden on mobile');checks+=2;}
      await evaluate(`Array.from(document.querySelectorAll('tbody tr, [role="row"], .qc-record-card')).find(el=>el.innerText.includes('${fixture.orders[0].orderNo}'))?.click()`);
      // Narrow-screen records use actual Open detail actions rather than a table row.
      if(width===390) await evaluate("Array.from(document.querySelectorAll('button')).find(el=>el.textContent.includes('查看详情'))?.click()");
      await waitDetail();assert.ok(await evaluate(`location.search.includes('${fixture.orders[0].id}')`));checks++;
      assert.ok(!(await evaluate("document.body.innerText.includes('确认商业条款')")));checks++;
      assert.ok(await evaluate("document.body.innerText.includes('颜色明细')"));checks++;
      await capture(`order-${width}.png`);
      await evaluate("Array.from(document.querySelectorAll('a')).find(el=>el.textContent.includes('查看物料跟进')).click()");
      await until(()=>evaluate("document.querySelectorAll('[data-canonical-material-key]').length===4"),'actual read Control Tower');checks++;
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);checks++;
      await evaluate("document.querySelector('.sp-v4-material-identity').click()");await until(()=>evaluate("document.body.innerText.includes('采购事件')"),'expanded events');checks++;
      assert.ok(await evaluate("document.body.innerText.includes('12.75') && document.body.innerText.includes('255')"));checks++;
      assert.ok(!(await evaluate("document.body.innerText.includes('分批到料') || document.body.innerText.includes('Excel 导入')")));checks++;
      await capture(`material-${width}.png`);
      await evaluate("Array.from(document.querySelectorAll('a')).find(el=>el.textContent.includes('返回订单详情')).click()");await waitDetail();assert.ok(await evaluate(`location.search.includes('${fixture.orders[0].id}')`));checks++;
    });
    await t.test('refresh/search remain scope-stable; no Browser business writes or sensitive fetch',async()=>{
      await navigate(`/order-center/style-progress/detail?orderId=${fixture.orders[0].id}`);await until(()=>evaluate("document.querySelectorAll('[data-canonical-material-key]').length===4"),'material ready');
      await evaluate("const input=document.querySelector('input[aria-label=\"搜索物料\"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'拉链');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));");
      await until(()=>evaluate("document.querySelectorAll('[data-canonical-material-key]').length===1"),'search one group');checks++;
      await evaluate("Array.from(document.querySelectorAll('button')).find(el=>el.textContent.includes('刷新来源')).click()");await until(()=>evaluate("document.querySelectorAll('[data-canonical-material-key]').length>0"),'refresh');checks++;
      assert.deepEqual(await evaluate('window.businessWrites'),[]);checks++;
      assert.ok(requests.filter(r=>r.url.includes('/api/')).every(r=>r.method==='GET'));checks++;
      assert.ok(!requests.some(r=>new URL(r.url).pathname.startsWith('/api/')&&(r.url.includes('confirmed-commercial-terms')||r.url.includes('/api/v1/quotes'))));checks++;
      assert.ok(requests.every(r=>r.url.startsWith(origin)||r.url.startsWith('data:')));checks++;
      assert.deepEqual(errors,[]);checks++;
    });
    await t.test('actual account switch clears A and rejects unauthorized B instead of cached data',async()=>{
      const b=await fixture.login('tracker-b');const [bname,bvalue]=b.split('=');await command('Network.setCookie',{name:bname,value:bvalue,domain:'127.0.0.1',path:'/',httpOnly:true});
      try { await navigate(`/order-center/style-progress/detail?orderId=${fixture.orders[1].id}`);await until(()=>evaluate("document.body.innerText.includes('SC-SYNTHETIC-B') && document.querySelectorAll('[data-canonical-material-key]').length===4"),'B material scope');
      assert.ok(await evaluate("document.body.innerText.includes('SC-SYNTHETIC-B') && !document.body.innerText.includes('SC-SYNTHETIC-001')"));checks++; } finally { await command('Network.setCookie',{name,value,domain:'127.0.0.1',path:'/',httpOnly:true}); }
      await command('Network.setCookie',{name,value,domain:'127.0.0.1',path:'/',httpOnly:true});await navigate(`/order-center/style-progress/detail?orderId=${fixture.orders[1].id}`);
      await until(()=>evaluate("document.querySelector('[role=alert]')?.textContent.includes('不会回退 Browser')"),'unauthorized B after switch');assert.equal(await evaluate("document.querySelectorAll('[data-canonical-material-key]').length"),0);checks++;
    });
    await t.test('unconnected UI and actual summary/detail use same item counts',async()=>{
      fixture.scenario('unconnected');await navigate(`/order-center/style-progress/detail?orderId=${fixture.orders[0].id}`);await until(()=>evaluate("document.body.innerText.includes('正式物料来源尚未接通')"),'unconnected actual page');assert.equal(await evaluate("document.querySelectorAll('[data-canonical-material-key]').length"),0);checks++;
      fixture.scenario('complete');await navigate(`/order-center/server-detail?id=${fixture.orders[0].id}`);await waitDetail();
      const data=await(await fetch(fixture.base+`/api/v1/sales-orders/${fixture.orders[0].id}/material-progress`,{headers:{Cookie:cookie}})).json();
      assert.ok(await evaluate(`document.querySelector('.sp-server-summary').innerText.includes('面料 ${data.progress.summary.fabric.demands} 项') && document.querySelector('.sp-server-summary').innerText.includes('辅料 ${data.progress.summary.trim.demands} 项')`));checks++;
      await navigate(`/order-center/style-progress/detail?orderId=${fixture.orders[0].id}`);await until(()=>evaluate("document.querySelectorAll('[data-canonical-material-key]').length===4"),'same source detail');
      assert.equal(await evaluate("document.querySelectorAll('.sp-v4-material-list > section > .sp-v4-inner-scroll tbody tr').length"),data.progress.rows.length);checks++;
      assert.deepEqual(await evaluate('window.businessWrites'),[]);checks++;
    });
    console.log(`Actual synthetic components ${checks} assertions, disposable ${fixture.containerName}, private preview ${origin}`);
    await command('Browser.close',{},undefined);
  } finally {
    ws?.close();if(browser&&browser.exitCode===null){await until(()=>browser.exitCode!==null,'Chrome closed').catch(()=>browser.kill());}
    await preview.close();await fixture.close();assert.ok(resolve(temp).startsWith(resolve(tmpdir())+'\\zhixu-order-integration-'));await rm(temp,{recursive:true,force:true});
        const evidence=new URL('../../../docs/tasks/active/evidence/order-material-p6-restoration/',import.meta.url);await mkdir(evidence,{recursive:true});await writeFile(new URL('computed-styles.json',evidence),JSON.stringify(visualMetrics,null,2)+'\n');
    console.log('Order integration cleanup PASS: private browser/profile/API/Vite/disposable PG removed');
  }
});
