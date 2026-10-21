// Built Server UI with a private Chromium profile and an owned disposable PostgreSQL only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { startContinuousFixture } from './ainuoke-continuous-fixture.ts';
import { waitForChromiumEndpoint } from './chromium-endpoint.mjs';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.ts';
import { executeProductionResourceCommand } from '../production-resources/service.ts';
import { parseManagedResourceCommand } from '../production-resources/managed-contract.ts';
import { executeOrderTracking, previewOrderTracking } from '../production-scheduling/tracking-service.ts';
import { executeProductionPlan, previewProductionPlan } from '../production-scheduling/service.ts';

const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(read, label, timeout = 16000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { try { if (await read()) return; } catch (error) { if (!/Execution context was destroyed|Cannot find context|Inspected target navigated/.test(String(error))) throw error; } await wait(60); }
  throw Error(label + ' timed out');
}

test('manual material arrivals and original logistics run on the exact built Server page', { timeout: 360000 }, async t => {
  const phase = async (name, run) => { let failed; await t.test(name, async () => { try { await run(); } catch (error) { failed = error; throw error; } }); if (failed) throw failed; };
  const info = JSON.parse(readFileSync('dist/client/build-info.json', 'utf8')); assert.equal(info.quoteAuthority, 'server'); assert.equal(info.orderRead, 'snapshot'); assert.match(info.gitCommit, /^[a-f0-9]{40}$/);
  const x = await startContinuousFixture(resolve('dist/client'), { materialArrivals: true, materialDisplay: true });
  const temp = await mkdtemp(join(tmpdir(), 'zhixu-material-arrivals-ui-')), pending = new Map(), errors = [], metrics = [];
  let browser, ws, session, id = 0;
  const actor = await loadExistingBootstrapActor(x.pool, x.users[0]);
  const resource = async (kind, data) => { const result = await executeProductionResourceCommand(x.pool, actor, parseManagedResourceCommand({ requestId: randomUUID(), action: 'create', kind, resourceId: null, expectedVersion: 0, data })); assert.equal(result.status, 'applied'); return result.resource; };
  const setHub = async hubId => { const row = (await x.pool.query('SELECT version FROM production_order_execution_trackings WHERE sales_order_id=$1', [x.orderId])).rows[0]; const preview = await previewOrderTracking(x.pool, actor, { action: 'set_order_tracking', orderId: x.orderId, expectedVersion: row?.version ?? 0, data: { supplyHubId: hubId, remark: '' } }); assert.equal((await executeOrderTracking(x.pool, actor, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash })).status, 'applied'); };
  try {
    const calendar = await resource('calendars', { name: '合成日历', enabled: true, remark: '', workingWeekdays: [0, 1, 2, 3, 4, 5, 6], exceptions: [] });
    const site = await resource('sites', { name: '采用生产地点', enabled: true, remark: '', countryCode: 'KH', productionCalendarId: calendar.id, preProductionSampleLeadDays: 5 });
    const group = await resource('groups', { name: '合成生产组', shortName: '', enabled: true, remark: '', productionSiteId: site.id, sortOrder: 1 });
    const hub = await resource('hubs', { name: '明确集货仓', enabled: true, remark: '' });
    await resource('transport-plans', { name: '合成路线', enabled: true, remark: '', supplyHubId: hub.id, productionSiteId: site.id, modes: [{ modeId: null, name: '海运', enabled: true, remark: '', transitDays: 20, sortOrder: 1 }, { modeId: null, name: '陆运', enabled: true, remark: '', transitDays: 12, sortOrder: 2 }] });
    const plan = await previewProductionPlan(x.pool, actor, { action: 'create', orderId: x.orderId, assignmentId: null, expectedVersion: 0, expectedPlanVersion: 0, data: { executionType: 'internal', executorId: group.id, colorId: null, plannedQuantity: '1', duration: { mode: 'workdays', workdays: 1 }, dates: { mode: 'manual_fixed', startDate: '2027-02-01', endDate: '2027-02-01' }, remark: '' } });
    assert.equal((await executeProductionPlan(x.pool, actor, { requestId: randomUUID(), intent: plan.intent, previewHash: plan.previewHash })).status, 'applied');
    const profile = join(temp, 'profile'); browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome'), ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const [port, path] = await waitForChromiumEndpoint(profile, { timeoutMs: 20000 }); ws = new WebSocket('ws://127.0.0.1:' + port + path); await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const command = (method, params = {}, sid = session) => new Promise((done, reject) => { pending.set(++id, { done, reject }); ws.send(JSON.stringify({ id, method, params, sessionId: sid })); });
    ws.addEventListener('message', ({ data }) => { const r = JSON.parse(String(data)), p = pending.get(r.id); if (p) { pending.delete(r.id); if (r.error) p.reject(Error(JSON.stringify(r.error))); else p.done(r.result); } if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails.text); if (r.method === 'Page.javascriptDialogOpening') void command('Page.handleJavaScriptDialog', { accept: true }); });
    const target = await command('Target.createTarget', { url: 'about:blank' }, undefined); session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, undefined)).sessionId;
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.arrivalWire={posts:[],requests:[],postMode:'ready',receiptMode:'ready',historyMode:'ready',readMode:'ready',postWaiters:[],receiptWaiters:[],historyWaiters:[]};
      window.arrivalFetch=window.fetch;window.fetch=async(input,init)=>{const u=new URL(String(input),location.href),m=init?.method??'GET',w=arrivalWire;w.requests.push({path:u.pathname,method:m});
        if(u.pathname==='/api/v1/material-arrivals/commands'&&m==='POST'){w.posts.push(JSON.parse(init.body));const mode=w.postMode;w.postMode='ready';if(mode==='before')throw Error('synthetic before send');const r=await arrivalFetch(input,init);if(mode==='lost')throw Error('synthetic lost reply');if(mode==='hold200'||mode==='hold401')return new Promise(done=>w.postWaiters.push(()=>done(mode==='hold401'?Response.json({error:{code:'authentication_required'}},{status:401}):r)));return r;}
        if(u.pathname.startsWith('/api/v1/material-arrivals/commands/')&&m==='GET'){const mode=w.receiptMode;w.receiptMode='ready';const r=await arrivalFetch(input,init);if(mode==='mismatch'){const d=await r.json();return Response.json({...d,payloadHash:'f'.repeat(64)});}if(mode==='hold200'||mode==='hold401')return new Promise(done=>w.receiptWaiters.push(()=>done(mode==='hold401'?Response.json({error:{code:'authentication_required'}},{status:401}):r)));return r;}
        if(u.pathname.endsWith('/history')&&u.pathname.startsWith('/api/v1/material-arrivals/')){const mode=w.historyMode;w.historyMode='ready';const r=await arrivalFetch(input,init);if(mode==='hold401')return new Promise(done=>w.historyWaiters.push(()=>done(Response.json({error:{code:'authentication_required'}},{status:401}))));return r;}
        if(u.pathname.startsWith('/api/v1/material-arrivals/orders/')&&!u.pathname.endsWith('/history')&&w.readMode==='401'){w.readMode='ready';return Response.json({error:{code:'authentication_required'}},{status:401});}
        return arrivalFetch(input,init);
      };` });
    const evaluate = async expression => { const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.equal(r.exceptionDetails, undefined, JSON.stringify(r.exceptionDetails)); return r.result.value; };
    const has = text => until(() => evaluate('document.body.innerText.includes(' + JSON.stringify(text) + ')'), text);
    const click = async (text, selector = 'button') => { await until(() => evaluate(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>n.textContent.trim()===${JSON.stringify(text)});return !!n&&!n.disabled})()`), 'enabled ' + text); assert.equal(await evaluate(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>n.textContent.trim()===${JSON.stringify(text)});n.click();return true})()`), true); };
    const field = (selector, value) => evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)throw Error('missing enabled input '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const allocation = (batch, unit, value) => evaluate(`(()=>{const b=document.querySelectorAll('.sp-v4-batch')[${batch - 1}],n=[...b.querySelectorAll('.sp-v4-batch-demands label')].find(n=>n.querySelector('small').textContent.endsWith(${JSON.stringify(' ' + unit)}))?.querySelector('input');if(!n||n.disabled)throw Error('missing enabled allocation');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const materialPath = '/order-center/style-progress/detail?orderId=' + x.orderId;
    const navigate = async () => { const marker = randomUUID(); await evaluate('window.navigationMarker=' + JSON.stringify(marker)); await command('Page.navigate', { url: x.base + materialPath }); await until(() => evaluate('window.navigationMarker!==' + JSON.stringify(marker) + '&&document.readyState===\'complete\''), 'fresh document'); await has('合成缝纫线'); };
    const loginCookie = async username => { const cookie = await x.login(username), i = cookie.indexOf('='); await command('Network.setCookie', { name: cookie.slice(0, i), value: cookie.slice(i + 1), domain: '127.0.0.1', path: '/', httpOnly: true }); };
    const loginUI = async username => { await until(() => evaluate("!!document.querySelector('input[name=username]')"), 'login card'); await field('input[name=username]', username); await field('input[name=password]', x.password); await click('登录织序'); await has('合成缝纫线'); };
    const logout = async () => { await evaluate("document.querySelector('[aria-label=用户菜单]').click()"); await click('退出登录'); await until(() => evaluate("!!document.querySelector('input[name=username]')"), 'logged out'); };
    const open = async (name = '合成缝纫线') => { await until(() => evaluate(`(()=>{const c=[...document.querySelectorAll('.sp-v4-material-card')].find(n=>n.querySelector('.sp-v4-material-identity strong')?.textContent===${JSON.stringify(name)});const b=c&&[...c.querySelectorAll('button')].find(n=>['分批到料','到料计划'].includes(n.textContent));return b&&!b.disabled})()`), 'planner action'); await evaluate(`(()=>{const c=[...document.querySelectorAll('.sp-v4-material-card')].find(n=>n.querySelector('.sp-v4-material-identity strong')?.textContent===${JSON.stringify(name)});[...c.querySelectorAll('button')].find(n=>['分批到料','到料计划'].includes(n.textContent)).click()})()`); await has('分批预计到料'); };
    const preview = async () => { await click('预览变更', '.sp-v4-planner button'); await has('确认本次计划'); };
    const version = async () => (await x.pool.query('SELECT max(version)::int n FROM material_arrival_plans')).rows[0].n ?? 0;
    const pendingRaw = () => evaluate("Object.keys(sessionStorage).filter(k=>k.startsWith('zhixu.server.material-arrival.pending.v1.')).map(k=>sessionStorage.getItem(k))");
    const shot = async name => { if (process.env.MATERIAL_ARRIVALS_UI_EVIDENCE !== '1') return; const directory = resolve('outputs/material-arrivals-ui', info.gitCommit + '-' + info.buildId); await mkdir(directory, { recursive: true }); await writeFile(join(directory, name + '.png'), Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64')); };
    await loginCookie('demo.admin'); await navigate();
    await phase('missing explicit Hub never creates a default resource or enables new batches', async () => { await open(); assert.equal(await evaluate("[...document.querySelectorAll('.sp-v4-planner button')].find(n=>n.textContent==='＋ 增加批次').disabled"), true); await has('当前集货仓：未设置'); await click('取消', '.sp-v4-planner button'); assert.equal(await version(), 0); });
    await setHub(hub.id); await click('刷新来源');
    await phase('partial multi-unit drafts keep exact inputs, block dirty navigation and preview one atomic plan', async () => {
      await open(); await click('＋ 增加批次', '.sp-v4-planner button'); await field('.sp-v4-batch:nth-child(1) input[type=date]', '2027-01-01'); await allocation(1, '个', '7.125'); await allocation(1, '条', '1');
      await click('＋ 增加批次', '.sp-v4-planner button'); await field('.sp-v4-batch:nth-child(2) input[type=date]', '2027-01-15'); await allocation(2, '个', '6.875'); await allocation(2, '条', '0.5');
      await has('已安排 14 个 / 需求 20 个'); await has('已安排 1.5 条 / 需求 2 条');
      await evaluate('window.arrivalConfirm=window.confirm;window.arrivalConfirmCount=0;window.confirm=()=>{arrivalConfirmCount++;return false}'); await click('辅料排列设置'); assert.equal(await evaluate('location.pathname+location.search'), materialPath); assert.equal(await evaluate('arrivalConfirmCount'), 1); await evaluate('window.confirm=window.arrivalConfirm');
      await preview(); const before = await evaluate('arrivalWire.posts.length'); await evaluate("(()=>{const n=[...document.querySelectorAll('.sp-v4-planner button')].find(n=>n.textContent==='确认保存');n.click();n.click()})()"); await until(() => evaluate("!document.querySelector('.sp-v4-planner')"), 'saved planner closes'); assert.equal(await version(), 1); assert.equal(await evaluate('arrivalWire.posts.length'), before + 1); assert.deepEqual(await pendingRaw(), []);
    });
    await phase('six widths preserve local tables, Modal and history geometry without document overflow', async () => {
      for (const [width, scale] of [[1920, 1], [1536, 1.25], [1440, 1], [1280, 1], [900, 1], [390, 1]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: scale, mobile: width === 390 }); await open(); await until(() => evaluate("document.querySelectorAll('.sp-v4-batch').length===2"), 'two saved batches');
        const geometry = await evaluate("(()=>{const b=document.querySelector('.sp-v4-planner').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,inside:b.left>=-1&&b.right<=innerWidth+1,footer:!!document.querySelector('.sp-v4-planner>footer'),batches:document.querySelectorAll('.sp-v4-batch').length}})()"); assert.equal(geometry.overflow, false); assert.equal(geometry.inside, true); assert.equal(geometry.footer, true); metrics.push(geometry); await shot('planner-' + width);
        await click('到料历史', '.sp-v4-planner button'); await until(() => evaluate("document.querySelectorAll('[data-arrival-history-version]').length===1"), 'history loaded'); const box = await evaluate("(()=>{const b=document.querySelector('.qc-drawer').getBoundingClientRect();return {inside:b.left>=-1&&b.right<=innerWidth+1,overflow:document.documentElement.scrollWidth>innerWidth+1}})()"); assert.equal(box.inside, true); assert.equal(box.overflow, false); await shot('history-' + width); await evaluate("document.querySelector('.qc-drawer>header>button').click()"); await click('取消', '.sp-v4-planner button');
      }
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    });
    await phase('committed lost reply survives refresh and clears only after original receipt verification', async () => {
      await open(); await field('.sp-v4-batch:nth-child(1) input[type=date]', '2027-01-02'); await preview(); await evaluate("arrivalWire.postMode='lost'"); await click('确认保存', '.sp-v4-planner button'); await has('有到料请求待核对'); const raw = await pendingRaw(); assert.equal(raw.length, 1); assert.equal(await version(), 2);
      await navigate(); await has('有到料请求待核对'); assert.deepEqual(await pendingRaw(), raw); assert.equal(await evaluate('arrivalWire.posts.length'), 0); await evaluate("arrivalWire.receiptMode='mismatch'"); await click('核对原请求'); await has('核对结果与原请求不一致'); assert.deepEqual(await pendingRaw(), raw);
      await click('核对原请求'); await until(async () => (await pendingRaw()).length === 0, 'known receipt releases exact slot'); assert.equal(await version(), 2); assert.equal(await evaluate('arrivalWire.posts.length'), 0);
    });
    await phase('explicit unknown retry keeps the same UUID and body and creates one new version', async () => {
      await open(); await field('.sp-v4-batch:nth-child(1) input[type=date]', '2027-01-03'); await preview(); await evaluate("arrivalWire.postMode='before'"); await click('确认保存', '.sp-v4-planner button'); await has('有到料请求待核对'); assert.equal(await version(), 2); const raw = await pendingRaw();
      await click('核对原请求'); await has('暂未找到原请求结果'); await click('重发完全相同的原请求'); await until(async () => (await pendingRaw()).length === 0, 'explicit retry applied'); assert.equal(await version(), 3); const bodies = await evaluate('arrivalWire.posts'); assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1]); assert.equal(JSON.parse(raw[0]).command.requestId, bodies[1].requestId); await navigate();
    });
    await phase('history close commits invalidate held old 401 before passive cleanup', async () => {
      await open(); await evaluate("arrivalWire.historyMode='hold401'"); await click('到料历史', '.sp-v4-planner button'); await until(() => evaluate('arrivalWire.historyWaiters.length===1'), 'held history');
      await evaluate("window.arrivalCloseObserved=false;window.arrivalCloseObserver=new MutationObserver(()=>{if(!document.querySelector('.qc-drawer')){arrivalCloseObserver.disconnect();arrivalCloseObserved=true;arrivalWire.historyWaiters.splice(0).forEach(done=>done())}});arrivalCloseObserver.observe(document.body,{subtree:true,childList:true});document.querySelector('.qc-drawer>header>button').click()");
      await until(() => evaluate('arrivalCloseObserved'), 'layout-close observer'); await wait(150); assert.equal(await evaluate("!!document.querySelector('[aria-label=用户菜单]')&&!document.querySelector('input[name=username]')"), true); await click('取消', '.sp-v4-planner button');
    });
    await phase('A to B to A does not let the first A history response invalidate the new A session', async () => {
      await open(); await evaluate("arrivalWire.historyMode='hold401'"); await click('到料历史', '.sp-v4-planner button'); await until(() => evaluate('arrivalWire.historyWaiters.length===1'), 'old A history'); await logout(); await loginUI('demo.material'); await logout(); await loginUI('demo.admin'); await evaluate('arrivalWire.historyWaiters.splice(0).forEach(done=>done())'); await wait(150); assert.equal(await evaluate("!!document.querySelector('[aria-label=用户菜单]')&&!document.querySelector('input[name=username]')"), true); assert.equal(await version(), 3);
    });
    await phase('Source failure preserves saved plans, history and dates while blocking new allocations', async () => {
      x.setMode('failed'); await assert.rejects(x.capture()); await click('刷新来源'); await has('合成缝纫线 · 已保存计划'); await until(() => evaluate("[...document.querySelectorAll('.sp-v4-material-card')].some(n=>n.textContent.includes('合成缝纫线')&&n.textContent.includes('当前来源不可用'))"), 'source failure issue');
      await evaluate("(()=>{const c=[...document.querySelectorAll('.sp-v4-material-card')].find(n=>n.textContent.includes('合成缝纫线'));[...c.querySelectorAll('button')].find(n=>['分批到料','到料计划'].includes(n.textContent)).click()})()"); await has('2027-01-03'); assert.equal(await evaluate("[...document.querySelectorAll('.sp-v4-planner button')].find(n=>n.textContent==='＋ 增加批次').disabled"), true); await click('到料历史', '.sp-v4-planner button'); await until(() => evaluate("document.querySelectorAll('[data-arrival-history-version]').length===3"), 'source-free history'); await shot('source-unavailable-history'); await evaluate("document.querySelector('.qc-drawer>header>button').click()"); await click('取消', '.sp-v4-planner button'); x.setMode('ready'); await x.capture(); await click('刷新来源'); await has('合成缝纫线');
    });
    await phase('read-only role never receives edit controls or Browser fallback', async () => {
      await loginCookie('demo.finance'); await navigate(); await open(); assert.equal(await evaluate("[...document.querySelectorAll('.sp-v4-planner input')].every(n=>n.disabled)"), true); assert.equal(await evaluate("[...document.querySelectorAll('.sp-v4-planner button')].find(n=>n.textContent==='预览变更').disabled"), true); await click('关闭', '.sp-v4-planner button');
      assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"), []); assert.deepEqual(await evaluate("arrivalWire.requests.filter(r=>r.path.startsWith('/api/v1/quotes')||r.path.includes('confirmed-commercial-terms'))"), []); assert.equal(await version(), 3);
    });
    assert.deepEqual(errors, []); assert.deepEqual(x.errors, []);
    if (process.env.MATERIAL_ARRIVALS_UI_EVIDENCE === '1') { const directory = resolve('outputs/material-arrivals-ui', info.gitCommit + '-' + info.buildId); await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'receipt.json'), JSON.stringify({ schemaVersion: 'material-arrivals-ui.v1', renderedSourceSha: info.gitCommit, buildId: info.buildId, synthetic: true, realDatabaseAccess: false, sourceActivation: 'not-activated', metrics }, null, 2) + '\n'); }
  } finally {
    if (ws) ws.close(); if (browser) browser.kill(); await x.close(); const owned = relative(resolve(tmpdir()), resolve(temp)); if (!owned || owned.startsWith('..') || isAbsolute(owned) || !owned.startsWith('zhixu-material-arrivals-ui-')) throw Error('unsafe private browser cleanup'); await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
