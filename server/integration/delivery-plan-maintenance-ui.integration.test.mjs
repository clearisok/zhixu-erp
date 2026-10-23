// Exact built Server page; owned disposable PG/private Chromium, never a live Source.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { startContinuousFixture } from './ainuoke-continuous-fixture.ts';
import { waitForChromiumEndpoint } from './chromium-endpoint.mjs';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.ts';
import { readDeliveryPlanSet } from '../sales-orders/delivery-plan-repository.ts';
import { updateDeliveryPlans } from '../sales-orders/delivery-plan-service.ts';
import { createSyntheticQuoteFixture } from './quote-fixture.ts';
import { createQuoteRepository } from '../quotes/repository.ts';
import { quoteSnapshotFromBrowser } from '../quotes/model.ts';
import { createProcessingBatch, previewProcessingBatch, confirmProcessingBatch, consumeProcessingBatches } from '../sales-orders/processing-batch-service.ts';

const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(read, label, timeout = 16000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await read()) return; } catch (error) { if (!/Execution context was destroyed|Cannot find context|Inspected target navigated/.test(String(error))) throw error; }
    await wait(60);
  }
  throw Error(label + ' timed out');
}

test('approved delivery plan maintenance works on the exact built Server detail', { timeout: 360000 }, async t => {
  const phase = async (name, run) => { let failure; await t.test(name, async () => { try { await run(); } catch (error) { failure = error; throw error; } }); if (failure) throw failure; };
  const info = JSON.parse(readFileSync('dist/client/build-info.json', 'utf8'));
  assert.equal(info.quoteAuthority, 'server'); assert.equal(info.orderRead, 'snapshot');
  assert.equal(info.gitCommit, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim());
  const evidence = process.env.DELIVERY_PLAN_UI_EVIDENCE === '1', runName = process.env.DELIVERY_PLAN_UI_RUN ?? '';
  assert.match(runName, /^[a-z0-9-]{0,64}$/);
  const directory = resolve('outputs/delivery-plan-ui', info.gitCommit + '-' + info.buildId + (runName ? '-' + runName : ''));
  const x = await startContinuousFixture(resolve('dist/client'));
  const temp = await mkdtemp(join(tmpdir(), 'zhixu-delivery-plan-ui-')), pending = new Map(), errors = [], metrics = [], headerMetrics = [];
  const actor = await loadExistingBootstrapActor(x.pool, x.users[0]);
  let browser, ws, session, serial = 0;
  const read = () => readDeliveryPlanSet(x.pool, x.orderId);
  const peer = async (quantity = '7', date = '2027-03-01') => updateDeliveryPlans(x.pool, actor, x.orderId,
    { requestId: randomUUID(), expectedVersion: (await read()).version, upserts: [{ id: null, deliveryDate: date, quantity }], voidIds: [] });
  const immutable = async () => (await x.pool.query(`SELECT so.id::text,so.order_no,so.creation_source,m.quantity::text,
    to_char(m.contract_delivery_date,'YYYY-MM-DD') AS source_date,(SELECT count(*)::int FROM sales_order_source_links) AS links,
    (SELECT count(*)::int FROM ainuoke_sales_order_color_mirrors) AS colors FROM sales_orders so
    JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=so.id WHERE so.id=$1`, [x.orderId])).rows;
  try {
    if (evidence) { await mkdir(resolve('outputs/delivery-plan-ui'), { recursive: true }); await mkdir(directory); }
    const original = await read(); assert.equal(original.plans.length, 1); assert.equal(original.plans[0].isDerivedDefault, true);
    // Legal retained source default; exercise display without pretending it is a user-positive input.
    await x.pool.query('UPDATE sales_order_delivery_plans SET delivery_date=NULL,quantity=0 WHERE id=$1', [original.plans[0].id]);
    await x.pool.query('UPDATE sales_order_delivery_plan_sets SET version=version+1 WHERE sales_order_id=$1', [x.orderId]);
    const baseline = await immutable();
    const profile = join(temp, 'profile');
    browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome'),
      ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const [port, endpoint] = await waitForChromiumEndpoint(profile, { timeoutMs: 20000 });
    ws = new WebSocket('ws://127.0.0.1:' + port + endpoint);
    await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const command = (method, params = {}, sid = session) => new Promise((done, reject) => {
      const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP deadline: ' + method)); }, 15000);
      pending.set(id, { done: value => { clearTimeout(timer); done(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      try { ws.send(JSON.stringify({ id, method, params, sessionId: sid })); } catch (error) { const p = pending.get(id); pending.delete(id); p.reject(error); }
    });
    const disconnect = () => { for (const p of pending.values()) p.reject(Error('private CDP disconnected')); pending.clear(); };
    ws.addEventListener('close', disconnect); ws.addEventListener('error', disconnect);
    ws.addEventListener('message', ({ data }) => { const r = JSON.parse(String(data)), p = pending.get(r.id); if (p) { pending.delete(r.id); if (r.error) p.reject(Error(JSON.stringify(r.error))); else p.done(r.result); }
      if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails.text);
      if (r.method === 'Page.javascriptDialogOpening') void command('Page.handleJavaScriptDialog', { accept: true }).catch(error => errors.push(String(error)));
    });
    const target = await command('Target.createTarget', { url: 'about:blank' }, undefined);
    session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, undefined)).sessionId;
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.deliveryWire={patches:[],receipts:[],reads:0,patchMode:'ready',receiptMode:'ready',readMode:'ready',patchWaiters:[],readWaiters:[],storageBeforeSend:[]};
      window.deliveryFetch=window.fetch;window.fetch=async(input,init)=>{
        const u=new URL(String(input),location.href),m=init?.method??'GET',w=deliveryWire;
        if(!/^\\/api\\/v1\\/sales-orders\\/[^/]+\\/delivery-plans(?:\\/receipt)?$/.test(u.pathname))return deliveryFetch(input,init);
        if(m==='PATCH'){
          w.patches.push(JSON.parse(init.body));w.storageBeforeSend.push(Object.keys(sessionStorage).filter(k=>k.startsWith('zhixu.server.delivery-plan.pending.v1.')).map(k=>sessionStorage.getItem(k)));
          const mode=w.patchMode;w.patchMode='ready';if(mode==='before')throw Error('synthetic before send');
          const r=await deliveryFetch(input,init);if(mode==='lost')throw Error('synthetic lost reply');
          if(mode==='hold200'||mode==='hold401')return new Promise(done=>w.patchWaiters.push(()=>done(mode==='hold401'?Response.json({error:{code:'authentication_required'}},{status:401}):r)));return r;
        }
        if(m==='POST'){
          w.receipts.push(JSON.parse(init.body));const mode=w.receiptMode;w.receiptMode='ready';const r=await deliveryFetch(input,init);
          if(mode==='mismatch'){const d=await r.json();d.receipt.requestId='00000000-0000-4000-8000-000000000099';return Response.json(d);}return r;
        }
        w.reads++;const mode=w.readMode;w.readMode='ready';const r=await deliveryFetch(input,init);
        if(mode==='hold401')return new Promise(done=>w.readWaiters.push(()=>done(Response.json({error:{code:'authentication_required'}},{status:401}))));return r;
      };` });
    const evaluate = async expression => { const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.equal(r.exceptionDetails, undefined, JSON.stringify(r.exceptionDetails)); return r.result.value; };
    const has = (text, selector = 'body') => until(() => evaluate(`(document.querySelector(${JSON.stringify(selector)})?.innerText??'').includes(${JSON.stringify(text)})`), text);
    const click = (text, selector = 'button') => until(() => evaluate(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||!n.isConnected||n.disabled||!n.getClientRects().length)return false;n.focus({preventScroll:true});n.click();return true})()`), 'enabled ' + text);
    const input = (label, value) => evaluate(`(()=>{const n=document.querySelector('.oc-delivery-modal [aria-label='+${JSON.stringify(JSON.stringify(label))}+']');if(!n||n.disabled)throw Error('missing enabled input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const modalClick = label => click(label, '.oc-delivery-modal button');
    const route = '/order-center/server-detail?id=' + x.orderId.toUpperCase();
    const navigate = async (path = route) => { const marker = randomUUID(); await evaluate('window.deliveryNavigation=' + JSON.stringify(marker)); await command('Page.navigate', { url: x.base + path });
      await until(() => evaluate('window.deliveryNavigation!==' + JSON.stringify(marker) + '&&document.readyState===\'complete\''), 'fresh document'); await has('订单概况'); };
    const cookie = async username => { const value = await x.login(username), at = value.indexOf('='); await command('Network.setCookie', { name: value.slice(0, at), value: value.slice(at + 1), domain: '127.0.0.1', path: '/', httpOnly: true }); };
    const login = async username => { await until(() => evaluate("!!document.querySelector('input[name=username]')"), 'login form'); await evaluate(`(()=>{for(const [name,value]of ${JSON.stringify([['username', 'PLACEHOLDER'], ['password', x.password]])}){const n=document.querySelector('input[name='+name+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,name==='username'?${JSON.stringify(username)}:value);n.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('input[name=username]').closest('form').requestSubmit();})()`); await has('订单概况'); };
    const logout = async () => { await evaluate("document.querySelector('[aria-label=用户菜单]').click()"); await click('退出登录'); await until(() => evaluate("!!document.querySelector('input[name=username]')"), 'logout'); };
    const open = async () => { await until(() => evaluate("(()=>{const n=document.querySelector('[data-maintain-delivery-plans]');if(!n||n.disabled)return false;n.click();return true})()"), 'delivery action'); await has('维护每期交付日期和数量'); };
    const absent = () => until(() => evaluate("!document.querySelector('.oc-delivery-modal')"), 'closed delivery modal');
    const pendingRaw = () => evaluate("Object.keys(sessionStorage).filter(k=>k.startsWith('zhixu.server.delivery-plan.pending.v1.')).map(k=>sessionStorage.getItem(k))");
    const add = async (date, quantity) => { await modalClick('＋ 新增一期'); const n = await evaluate("document.querySelectorAll('.oc-delivery-modal input[type=date]').length"); await input('交付日期 ' + n, date); await input('计划数量 ' + n, quantity); };
    const preview = async () => { await modalClick('预览变更'); await has('确认本次计划', '.oc-delivery-modal'); };
    const hasPlanDate = date => until(() => evaluate(`Array.from(document.querySelectorAll('.oc-delivery-modal input[type=date]')).some(n=>n.value===${JSON.stringify(date)})`), 'current plan date ' + date);
    const saved = async () => { await has('交付计划已保存', '.oc-delivery-modal'); await until(() => evaluate("[...document.querySelectorAll('.oc-delivery-modal footer button')].some(n=>n.textContent==='返回交付计划'&&!n.disabled)"), 'fresh collection read'); };
    const unknownReady = async () => { await has('保存结果暂未确认'); await until(() => evaluate("[...document.querySelectorAll('.oc-delivery-modal button')].some(n=>n.textContent==='核对保存结果'&&!n.disabled)"), 'original save settled before receipt check'); };
    const shot = async name => { if (evidence) await writeFile(join(directory, name + '.png'), Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64')); };
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cookie('demo.admin'); await navigate();

    await phase('source and delivery actions stay visible and actually open at eight widths without any write', async () => {
      const before = await read();
      await until(() => evaluate("(()=>{const buttons=[...document.querySelectorAll('.oc-server-detail-actions button')];return buttons.length===2&&buttons.every(n=>!n.disabled)})()"), 'header actions hydrated');
      for (const [width, height, touch, dpr] of [[1920, 1080, false, 1], [1536, 864, false, 1.25], [1440, 1000, false, 1], [1280, 900, false, 1], [900, 900, false, 1], [736, 900, false, 1], [390, 844, true, 1], [320, 740, true, 1], [320, 740, false, 1]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: touch }); await command('Emulation.setTouchEmulationEnabled', { enabled: touch });
        const header = await evaluate("(()=>{const group=document.querySelector('.oc-server-detail-actions'),identity=group.closest('.qc-page-header').querySelector('.qc-page-identity'),buttons=[...group.querySelectorAll('button')];return{documentOverflow:document.documentElement.scrollWidth>innerWidth+1,actionsBelowIdentity:innerWidth>=600||group.getBoundingClientRect().top>=identity.getBoundingClientRect().bottom-1,actionsShareRow:Math.abs(buttons[0].getBoundingClientRect().top-buttons[1].getBoundingClientRect().top)<=1,buttons:buttons.map(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2),s=getComputedStyle(n);return{label:n.textContent.trim(),visible:r.width>0&&r.height>0&&s.visibility==='visible'&&s.display!=='none',disabled:n.disabled,reachable:!!hit&&n.contains(hit),inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,touchTarget:!matchMedia('(pointer:coarse)').matches||r.height>=44}})}})()");
        if ([1440, 390, 320].includes(width)) await shot('header-' + width + (width === 320 && !touch ? '-fine' : ''));
        const diagnostic = JSON.stringify({ width, header });
        assert.equal(header.documentOverflow, false, diagnostic); assert.equal(header.actionsBelowIdentity, true, diagnostic); assert.equal(header.actionsShareRow, true, diagnostic); assert.deepEqual(header.buttons.map(n => n.label), ['维护来源', '维护交期']);
        for (const button of header.buttons) assert.deepEqual(button, { label: button.label, visible: true, disabled: false, reachable: true, inside: true, touchTarget: true }, `${button.label} must remain usable at width ${width}`);
        headerMetrics.push({ width, height, touch, dpr, ...header });
        await click('维护来源'); await has('搜索报价', '.oc-source-modal'); await click('关闭', '.oc-source-modal button');
        await until(() => evaluate("!document.querySelector('.oc-source-modal')"), 'closed source modal');
        await open(); await modalClick('取消'); await absent();
      }
      assert.equal(await evaluate('deliveryWire.patches.length'), 0); assert.deepEqual(await read(), before); assert.deepEqual(await immutable(), baseline);
      await command('Emulation.setTouchEmulationEnabled', { enabled: false }); await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    });

    await phase('small title action, retained null/zero default and unchanged preview never write', async () => {
      const version = (await read()).version;
      const box = await evaluate("(()=>{const r=document.querySelector('[data-maintain-delivery-plans]').getBoundingClientRect();return{width:r.width,height:r.height}})()");
      assert.ok(box.width < 180 && box.height <= 44); await open();
      await until(() => evaluate("document.querySelector('.oc-delivery-modal input[type=date]')?.value===''"), 'nullable default');
      assert.equal(await evaluate("document.querySelector('.oc-delivery-modal input[inputmode=decimal]').value"), '0');
      await modalClick('预览变更'); await has('没有实际变更，未发送保存请求。');
      assert.equal(await evaluate('deliveryWire.patches.length'), 0); assert.equal((await read()).version, version);
      await modalClick('取消'); await absent(); assert.equal((await read()).ownership, 'source_derived');
    });
    await phase('preview, exact quantities, default preservation and one double-click save refresh the open disclosure', async () => {
      await click('来源与技术详情 只读', 'summary'); await has('交付计划（织序）'); await open();
      await add('2027-01-02', '9007199254740993.0001'); await preview(); await has('计划数量超出合同数量，请核对。');
      const before = await evaluate('deliveryWire.patches.length');
      await evaluate("(()=>{const n=[...document.querySelectorAll('.oc-delivery-modal button')].find(n=>n.textContent==='确认保存');n.click();n.click();})()");
      await saved(); assert.equal(await evaluate('deliveryWire.patches.length'), before + 1);
      const current = await read(); assert.equal(current.ownership, 'user_managed');
      assert.equal(current.plans.find(p => p.id === original.plans[0].id).quantity, '0'); assert.equal(current.plans.find(p => p.id === original.plans[0].id).deliveryDate, null);
      assert.ok(current.plans.some(p => p.quantity === '9007199254740993.0001' && !p.isDerivedDefault));
      assert.equal(await evaluate('deliveryWire.storageBeforeSend[0].length'), 1); assert.deepEqual(await pendingRaw(), []);
      await modalClick('关闭'); await absent(); await has('2027-01-02', '[data-saved-delivery-plans]');
      assert.deepEqual(await immutable(), baseline); await shot('saved-open-disclosure-desktop');
    });
    await phase('unsaved cancellation, keyboard focus and responsive modal geometry preserve all facts', async () => {
      const before = await read(); await open(); await add('2027-02-02', '3'); await modalClick('取消'); await has('交付计划有未保存修改');
      await click('继续编辑'); await until(() => evaluate("document.querySelectorAll('[role=dialog]').length===1"), 'continue original dialog');
      await until(() => evaluate("document.querySelector('.oc-delivery-modal').contains(document.activeElement)"), 'focus restored to original delivery modal');
      for (const [width, height, touch, dpr] of [[1920, 1080, false, 1], [1536, 864, false, 1.25], [1440, 1000, false, 1], [1280, 900, false, 1], [900, 900, false, 1], [736, 900, false, 1], [390, 844, true, 1], [320, 740, true, 1]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: touch }); await command('Emulation.setTouchEmulationEnabled', { enabled: touch });
        const geometry = await evaluate("(()=>{const p=document.querySelector('.oc-delivery-modal'),r=p.getBoundingClientRect(),f=p.querySelector('footer').getBoundingClientRect(),t=p.querySelector('.oc-delivery-table');return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,footerBottom:f.bottom,viewport:innerWidth,height:innerHeight,documentOverflow:document.documentElement.scrollWidth>innerWidth+1,tableOverflow:t.scrollWidth>t.clientWidth+1,nestedVerticalScroll:t.scrollHeight>t.clientHeight+1,controlsOutside:[...t.querySelectorAll('input,button')].some(n=>{const b=n.getBoundingClientRect();return b.left<r.left||b.right>r.right}),touchTargets:!matchMedia('(pointer:coarse)').matches||[...p.querySelectorAll('button,input')].every(n=>n.getBoundingClientRect().height>=44)}})()");
        assert.ok(geometry.left >= -1 && geometry.right <= width + 1 && geometry.top >= -1 && geometry.bottom <= height + 1); assert.equal(geometry.documentOverflow, false); assert.ok(geometry.footerBottom <= height + 1);
        assert.equal(geometry.tableOverflow, false); assert.equal(geometry.nestedVerticalScroll, false); assert.equal(geometry.controlsOutside, false); assert.equal(geometry.touchTargets, true);
        metrics.push({ width, height, touch, dpr, ...geometry }); await shot('edit-' + width);
      }
      await modalClick('作废'); await has('作废本期？'); assert.equal(await evaluate("(()=>{const p=document.querySelector('.oc-delivery-modal'),r=p.getBoundingClientRect();return [...p.querySelectorAll('.oc-delivery-void-confirm button')].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right})})()"), true);
      await click('取消', '.oc-delivery-void-confirm button');
      const previewRow = await evaluate("document.querySelectorAll('.oc-delivery-modal input[type=date]').length"), longQuantity = '9'.repeat(64);
      await input('计划数量 ' + previewRow, longQuantity); await preview(); await has(longQuantity, '.oc-delivery-preview-table');
      assert.equal(await evaluate("(()=>{const p=document.querySelector('.oc-delivery-modal'),body=p.querySelector('.qc-modal-body'),t=p.querySelector('.oc-delivery-preview-table'),b=body.getBoundingClientRect();return t.scrollWidth<=t.clientWidth+1&&t.scrollHeight<=t.clientHeight+1&&body.scrollWidth<=body.clientWidth+1&&[...body.children].filter(n=>n.getClientRects().length).every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right})})()"), true);
      await evaluate("document.querySelector('.oc-delivery-preview-table tbody tr td:last-child').scrollIntoView({block:'nearest'})"); await shot('preview-320'); await modalClick('返回修改'); await input('计划数量 ' + previewRow, '3');
      await command('Emulation.setTouchEmulationEnabled', { enabled: false }); await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await modalClick('取消'); await click('放弃修改'); await absent(); assert.deepEqual(await read(), before);
    });
    await phase('lost success retains exact pending, wrong receipt cannot clear it, historical receipt reloads current collection', async () => {
      await open(); await add('2027-02-03', '2'); await preview(); await evaluate("deliveryWire.patchMode='lost'"); await modalClick('确认保存'); await unknownReady();
      const raw = await pendingRaw(); assert.equal(raw.length, 1); const before = await evaluate('deliveryWire.patches.length');
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert.equal(await evaluate("!!document.querySelector('.oc-delivery-modal')"), true);
      assert.equal(await evaluate("document.querySelector('.oc-delivery-modal > header > button').disabled"), true);
      await peer('4', '2027-02-04');
      await evaluate("deliveryWire.receiptMode='mismatch'"); await modalClick('核对保存结果'); await has('核对结果与本次保存不一致');
      assert.deepEqual(await pendingRaw(), raw); assert.equal(await evaluate('deliveryWire.patches.length'), before);
      assert.equal(await evaluate("document.body.innerText.includes('重发完全相同的原请求')"), false);
      await modalClick('核对保存结果'); await saved(); assert.deepEqual(await pendingRaw(), []);
      await modalClick('返回交付计划'); await hasPlanDate('2027-02-04');
      assert.equal(await evaluate('deliveryWire.patches.length'), before); await modalClick('取消'); await absent();
    });
    await phase('before-send failure permits only exact unknown receipt then explicit identical replay, once per confirmation', async () => {
      await open(); await add('2027-02-05', '5'); await preview(); await evaluate("deliveryWire.patchMode='before'"); await modalClick('确认保存'); await unknownReady();
      const before = await evaluate('deliveryWire.patches.length'), raw = await pendingRaw(), version = (await read()).version;
      assert.equal(await evaluate("document.body.innerText.includes('重发完全相同的原请求')"), false);
      await modalClick('核对保存结果'); await has('重发完全相同的原请求'); assert.deepEqual(await pendingRaw(), raw); assert.equal((await read()).version, version);
      await modalClick('重发完全相同的原请求'); await has('确认重发原请求');
      await click('继续核对'); await until(() => evaluate("document.querySelectorAll('[role=dialog]').length===1&&document.querySelector('.oc-delivery-modal').contains(document.activeElement)"), 'focus after cancelling original replay');
      assert.equal(await evaluate('deliveryWire.patches.length'), before);
      await modalClick('重发完全相同的原请求'); await has('确认重发原请求');
      await evaluate("deliveryWire.patchMode='lost'");
      await evaluate("(()=>{const n=[...document.querySelectorAll('[role=dialog] button')].find(n=>n.textContent==='确认重发同一请求');n.click();n.click();})()");
      await unknownReady(); assert.equal(await evaluate('deliveryWire.patches.length'), before + 1);
      await until(() => evaluate("document.querySelector('.oc-delivery-modal').contains(document.activeElement)"), 'focus after original replay');
      assert.equal(await evaluate("document.body.innerText.includes('重发完全相同的原请求')"), false); assert.deepEqual(await pendingRaw(), raw);
      await modalClick('核对保存结果'); await saved(); assert.equal(await evaluate('deliveryWire.patches.length'), before + 1);
      const commands = await evaluate('deliveryWire.patches.slice(-2)'); assert.deepEqual(commands[0], commands[1]);
      assert.equal((await read()).version, version + 1); await modalClick('关闭'); await absent();
    });
    await phase('a concurrent real writer rejects stale CAS and requires explicit reload instead of silent rebasing', async () => {
      await open(); await add('2027-02-06', '6'); await preview(); await peer('8', '2027-02-07');
      await modalClick('确认保存'); await has('保存结果暂未确认'); const before = await evaluate('deliveryWire.patches.length');
      await modalClick('核对保存结果'); await has('本次变更未保存'); assert.deepEqual(await pendingRaw(), []);
      await modalClick('重新读取计划'); await has('交付计划有未保存修改'); await click('放弃修改'); await has('已重新读取，请核对后再保存。');
      await hasPlanDate('2027-02-07'); assert.equal(await evaluate('deliveryWire.patches.length'), before); await modalClick('取消'); await absent();
    });
    await phase('unavailable storage prevents a send, and an externally changed original slot invalidates retry permission', async () => {
      const version = (await read()).version, count = await evaluate('deliveryWire.patches.length');
      await open(); await add('2027-02-10', '10'); await preview();
      await evaluate("window.deliverySetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===sessionStorage&&k.startsWith('zhixu.server.delivery-plan.pending.v1.'))throw Error('synthetic storage failure');return deliverySetItem.call(this,k,v)}");
      await modalClick('确认保存'); await has('本机待核对记录暂时无法读取'); assert.equal(await evaluate('deliveryWire.patches.length'), count); assert.equal((await read()).version, version);
      await evaluate('Storage.prototype.setItem=deliverySetItem'); await navigate(); await open(); await add('2027-02-11', '11'); await preview();
      await evaluate("deliveryWire.patchMode='before'"); await modalClick('确认保存'); await has('保存结果暂未确认'); await modalClick('核对保存结果'); await has('重发完全相同的原请求');
      const slot = await evaluate("(()=>{const key=Object.keys(sessionStorage).find(k=>k.startsWith('zhixu.server.delivery-plan.pending.v1.'));return{key,raw:sessionStorage.getItem(key)}})()");
      await modalClick('重发完全相同的原请求'); await has('确认重发原请求');
      // Only this test's technical slot is removed, then restored byte-for-byte.
      await evaluate('sessionStorage.removeItem(' + JSON.stringify(slot.key) + ')');
      const calls = await evaluate('deliveryWire.patches.length'); await click('确认重发同一请求'); await has('本机待核对记录暂时无法读取');
      assert.equal(await evaluate('deliveryWire.patches.length'), calls); assert.equal((await read()).version, version);
      await evaluate('sessionStorage.setItem(' + JSON.stringify(slot.key) + ',' + JSON.stringify(slot.raw) + ')');
      await navigate(); await open(); await modalClick('核对保存结果'); await has('重发完全相同的原请求'); await modalClick('重发完全相同的原请求'); await click('确认重发同一请求'); await saved(); await modalClick('关闭'); await absent();
    });
    await phase('explicit void-all retains every original row and creates no replacement plan', async () => {
      const before = await read(); await open();
      for (let remaining = before.plans.filter(p => !p.voidedAt).length; remaining; remaining--) { await modalClick('作废'); await modalClick('确认作废'); }
      await preview(); await modalClick('确认保存'); await saved(); const after = await read();
      assert.equal(after.plans.length, before.plans.length); assert.ok(after.plans.every(p => p.voidedAt));
      await modalClick('返回交付计划'); await has('暂无有效计划'); await has('作废记录'); await modalClick('取消'); await absent();
    });
    await phase('same-user A to B to A cannot consume late200 or late401, and refresh restores only the original intent', async () => {
      for (const late of ['hold200', 'hold401']) {
        await navigate(); await evaluate("deliveryWire.readMode='hold401'"); await click('来源与技术详情 只读', 'summary');
        await until(() => evaluate('deliveryWire.readWaiters.length===1'), 'independent held read');
        await open(); await add('2027-02-08', '8'); await preview(); await evaluate('deliveryWire.patchMode=' + JSON.stringify(late)); await modalClick('确认保存');
        await until(() => evaluate('deliveryWire.patchWaiters.length===1'), 'held original save'); const raw = await pendingRaw();
        await evaluate('deliveryWire.readWaiters.shift()()'); await until(() => evaluate("!!document.querySelector('input[name=username]')"), 'current independent401');
        await login('demo.manager'); assert.equal(await evaluate("!!document.querySelector('.oc-delivery-modal')"), false); await logout(); await login('demo.admin');
        await open(); await has('保存结果暂未确认'); assert.deepEqual(await pendingRaw(), raw);
        await evaluate('deliveryWire.patchWaiters.shift()()'); await has('订单概况'); assert.equal(await evaluate("!!document.querySelector('input[name=username]')"), false);
        assert.deepEqual(await pendingRaw(), raw); await modalClick('核对保存结果'); await saved(); await modalClick('关闭'); await absent();
      }
      await open(); await add('2027-02-09', '9'); await preview(); await evaluate("deliveryWire.patchMode='lost'"); await modalClick('确认保存'); await unknownReady();
      const raw = await pendingRaw(); await navigate(); await open(); await has('保存结果暂未确认'); assert.deepEqual(await pendingRaw(), raw); assert.equal(await evaluate('deliveryWire.patches.length'), 0);
      await modalClick('核对保存结果'); await saved(); assert.equal(await evaluate('deliveryWire.patches.length'), 0); await modalClick('关闭'); await absent();
    });
    await phase('completed orders retain existing delivery editing rights, and processing has no fabricated source comparison', async () => {
      await x.pool.query("UPDATE sales_orders SET lifecycle_state='completed',version=version+1 WHERE id=$1", [x.orderId]);
      await navigate(); await open(); await add('2027-04-01', '1'); await preview(); await modalClick('确认保存'); await saved(); await modalClick('关闭'); await absent();
      const quote = createSyntheticQuoteFixture('delivery-ui-processing', 'processing');
      for (const revision of quote.revisions) { revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null; }
      const revision = quote.revisions.find(r => r.revisionId === quote.defaultRevisionId), pv = revision.priceVersions[0];
      pv.pricingParameters.laborCurrency = 'USD'; pv.confirmation = { quotedGarmentPrice: null, quotedLaborPrice: 3, confirmedGarmentPrice: null, confirmedLaborPrice: 3, note: 'synthetic', confirmedAt: '2026-10-22T00:00:00Z' };
      await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(quote));
      const batch = await createProcessingBatch(x.pool, actor, { requestId: randomUUID(), quoteId: quote.id, revisionId: revision.revisionId, priceVersionId: pv.id,
        customerName: '合成加工交付客户', businessStyleNo: 'SYNTHETIC-DELIVERY-PROCESSING', quantity: '30', orderDate: '2026-10-22', deliveryDate: '2027-05-01', customerReference: '', deliveryRequirements: '', referenceOrderId: null });
      const batchPreview = await previewProcessingBatch(x.pool, actor, batch.batchId);
      const confirmed = await confirmProcessingBatch(x.pool, actor, batch.batchId, { requestId: randomUUID(), expectedVersion: batch.version, sourceFingerprint: batchPreview.candidate.fingerprint });
      const consumed = await consumeProcessingBatches(x.pool, actor, { requestId: randomUUID(), items: [{ batchId: batch.batchId, expectedVersion: confirmed.version }] });
      assert.equal(consumed.results[0].status, 'created');
      await navigate('/order-center/server-detail?id=' + consumed.results[0].salesOrderId); await open(); await has('加工订单无艾诺科合同对照。');
      assert.equal(await evaluate("document.querySelector('.oc-delivery-modal').innerText.includes('原加工数量')"), false);
      await add('2027-05-02', '30'); await preview(); await modalClick('确认保存'); await saved(); await modalClick('关闭'); await absent();
    });
    await phase('all existing roles enforce current Server view/edit grants and never initialize Browser collections', async () => {
      for (const username of x.users) {
        const grants = new Set((await x.pool.query('SELECT rp.permission_key FROM app_users u JOIN app_user_roles ur ON ur.user_id=u.id JOIN app_role_permissions rp ON rp.role_id=ur.role_id WHERE u.username=$1', [username])).rows.map(row => row.permission_key));
        await cookie(username); const marker = randomUUID(); await evaluate('window.deliveryRole=' + JSON.stringify(marker)); await command('Page.navigate', { url: x.base + route });
        await until(() => evaluate('window.deliveryRole!==' + JSON.stringify(marker) + '&&document.readyState===\'complete\''), 'role document');
        await until(() => evaluate("(document.body?.innerText??'').includes('订单概况')||(document.body?.innerText??'').includes('当前 Server 账号没有订单查看权限')"), 'role result ' + username);
        if (grants.has('order.view')) {
          await until(() => evaluate("!!document.querySelector('[data-maintain-delivery-plans]')"), 'role action');
          if (grants.has('order.edit')) await until(() => evaluate("!document.querySelector('[data-maintain-delivery-plans]').disabled"), 'role ready');
          assert.equal(await evaluate("document.querySelector('[data-maintain-delivery-plans]').disabled"), !grants.has('order.edit'));
        } else assert.equal(await evaluate("!!document.querySelector('[data-maintain-delivery-plans]')"), false);
        assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"), []);
        assert.equal(await evaluate('deliveryWire.patches.length'), 0);
      }
    });
    assert.deepEqual(errors, []); assert.deepEqual(x.errors, []);
    if (evidence) await writeFile(join(directory, 'receipt.json'), JSON.stringify({ schemaVersion: 'delivery-plan-maintenance-ui.v2', renderedSourceSha: info.gitCommit, buildId: info.buildId, synthetic: true, realSourceRequests: 0, headerMetrics, metrics }, null, 2) + '\n');
  } finally {
    if (ws) ws.close(); if (browser) browser.kill(); await x.close();
    const owned = relative(resolve(tmpdir()), resolve(temp));
    if (!owned || owned.startsWith('..') || isAbsolute(owned) || !owned.startsWith('zhixu-delivery-plan-ui-')) throw Error('unsafe browser cleanup');
    await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
