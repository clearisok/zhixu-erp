import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { waitForChromiumEndpoint } from './chromium-endpoint.mjs';
import { startContinuousFixture } from './ainuoke-continuous-fixture.ts';
import { randomUUID } from 'node:crypto';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.js';
import { createQuoteRepository } from '../quotes/repository.js';
import { quoteSnapshotFromBrowser } from '../quotes/model.js';
import { createSyntheticQuoteFixture } from './quote-fixture.js';
import { createProcessingBatch, previewProcessingBatch, confirmProcessingBatch, consumeProcessingBatches } from '../sales-orders/processing-batch-service.js';

const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(read, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await read()) return; }
    catch (error) {
      if (!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context with specified id/.test(String(error))) throw error;
    }
    await wait(80);
  }
  throw Error(label + ' timed out');
}

test('built order disclosures preserve saved size and owned plan facts without source reads or writes', { timeout: 240000 }, async t => {
  const info = JSON.parse(readFileSync('dist/client/build-info.json', 'utf8'));
  assert.equal(info.orderRead, 'snapshot'); assert.equal(info.quoteAuthority, 'server');
  const x = await startContinuousFixture(resolve('dist/client'), { orderAlerts: true });
  const temp = await mkdtemp(join(tmpdir(), 'zhixu-saved-sources-ui-'));
  const evidence = resolve('outputs/saved-order-sources-ui', `${process.env.ORDER_SAVED_SOURCES_BEFORE === '1' ? 'before' : 'after'}-${info.gitCommit}-${Date.now()}`);
  let browser, ws, session, closeBrowser, id = 0;
  const pending = new Map(), errors = [], metrics = [];
  try {
    const profile = join(temp, 'profile');
    browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'), ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const [port, path] = await waitForChromiumEndpoint(profile, { timeoutMs: 20000 });
    ws = new WebSocket('ws://127.0.0.1:' + port + path);
    await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const command = (method, params = {}, sid = session) => new Promise((done, reject) => {
      const request = ++id;
      const timer = setTimeout(() => { pending.delete(request); reject(Error('CDP ' + method + ' timed out')); }, 15000);
      pending.set(request, { done, reject, timer }); ws.send(JSON.stringify({ id: request, method, params, sessionId: sid }));
    });
    closeBrowser = () => command('Browser.close', {}, undefined);
    ws.addEventListener('message', ({ data }) => {
      const r = JSON.parse(String(data)), p = pending.get(r.id);
      if (p) { pending.delete(r.id); clearTimeout(p.timer); if (r.error) p.reject(Error(JSON.stringify(r.error))); else p.done(r.result); }
      if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails.text);
    });
    ws.addEventListener('close', () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Owned browser connection closed')); } pending.clear(); });
    const target = await command('Target.createTarget', { url: 'about:blank' }, undefined);
    session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, undefined)).sessionId;
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Page.bringToFront');
    const evaluate = async expression => {
      const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(r.exceptionDetails, undefined, JSON.stringify(r.exceptionDetails)); return r.result.value;
    };
    const navigate = async path => {
      const marker = Date.now() + Math.random(); await evaluate('window.navEpoch=' + marker);
      await command('Page.navigate', { url: x.base + path });
      await until(() => evaluate("window.navEpoch!==" + marker + "&&document.readyState==='complete'"), 'navigation');
    };
    const has = text => until(() => evaluate('Boolean(document.body?.innerText.includes(' + JSON.stringify(text) + '))'), text);
    const login = async username => {
      const cookie = await x.login(username), split = cookie.indexOf('=');
      await command('Network.setCookie', { name: cookie.slice(0, split), value: cookie.slice(split + 1), domain: '127.0.0.1', path: '/', httpOnly: true });
    };
    const click = label => evaluate(`(()=>{const n=[...document.querySelectorAll('button,a')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())===${JSON.stringify(label)}&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing control');n.click()})()`);
    const fold = text => evaluate(`[...document.querySelectorAll('summary')].find(n=>n.textContent.startsWith(${JSON.stringify(text)})).click()`);
    const shot = async name => {
      if (process.env.ORDER_SAVED_SOURCES_EVIDENCE !== '1') return;
      await mkdir(evidence, { recursive: true });
      const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(evidence, name + '.png'), Buffer.from(result.data, 'base64'));
    };
    const input = (selector, value) => evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    const route = '/order-center/server-detail?id=' + x.orderId;
    // Faults/delays are local client injections over a real trusted HTTP fixture.
    // They never call an external source or alter a production database.
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.planReads=0;window.businessWrites=[];window.planMode='ready';window.planWaiters=[];
      const originalFetch=fetch;
      window.fetch=async(...args)=>{
        const url=new URL(String(args[0]),location.href),plan=url.pathname.endsWith('/delivery-plans');
        if(args[1]?.method&&!['GET','HEAD'].includes(args[1].method)&&!url.pathname.includes('/auth/'))businessWrites.push(url.pathname);
        if(!plan)return originalFetch(...args);
        planReads++;const mode=planMode;planMode='ready';
        if(mode==='offline')throw Error('local synthetic offline');
        if(mode==='403'||mode==='401')return new Response(JSON.stringify({error:{code:'synthetic'}}),{status:Number(mode)});
        const response=await originalFetch(...args);
        if(mode==='wrong-owner'){const body=await response.json();body.deliveryPlanSet.salesOrderId='00000000-0000-4000-8000-000000000000';return new Response(JSON.stringify(body));}
        if(mode==='delay401')return new Promise(done=>planWaiters.push(()=>done(new Response(JSON.stringify({error:{code:'synthetic_old_session'}}),{status:401}))));
        if(mode==='delay200'){const body=await response.json();body.deliveryPlanSet.plans[0].quantity='987654321.123456789012345678';return new Promise(done=>planWaiters.push(()=>done(new Response(JSON.stringify(body)))));}
        return response;
      };` });
    await login(x.users[0]);
    if (process.env.ORDER_SAVED_SOURCES_BEFORE === '1') {
      await t.test('previous exact application build retains unwired note and closed technical facts', async () => {
        assert.equal(info.gitCommit, 'a1879b70dde94d9670f33da476732157e48c9443');
        for (const width of [1440, 390]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 });
          await navigate(route); await has('物料采购汇总'); await has('分码数据尚未接线');
          assert.equal(await evaluate("document.querySelector('.oc-server-technical-details').open"), false);
          await shot('default-' + width); await fold('来源与技术详情'); await shot('technical-' + width);
        }
      });
      return;
    }

    await t.test('default layout, closed disclosures and keyboard at six widths do not eagerly fetch plans', async () => {
      for (const [width, deviceScaleFactor] of [[1920, 1], [1536, 1.25], [1440, 1], [1280, 1], [900, 1], [390, 1]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor, mobile: width === 390 });
        await navigate(route); await has('物料采购汇总'); await has('查看颜色尺码'); await wait(100);
        assert.equal(await evaluate('planReads'), 0);
        assert.deepEqual(await evaluate("[...document.querySelectorAll('.oc-server-technical-details')].map(n=>n.open)"), [false, false]);
        assert.deepEqual(await evaluate("[...document.querySelector('.oc-server-detail-colors > .oc-server-color-table').querySelectorAll('th')].map(n=>n.textContent)"), ['颜色', '数量']);
        const measure = await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth+1,columns:getComputedStyle(document.querySelector('.oc-server-detail-overview .qc-description-list')).gridTemplateColumns.split(' ').length})");
        assert.equal(measure.overflow, false); assert.equal(measure.columns, width >= 600 ? 3 : 1); metrics.push({ width, ...measure });
        if (width === 1440 || width === 390) await shot('default-' + width);
        await evaluate("document.querySelector('[data-saved-color-sizes]>summary').focus()");
        await command('Page.bringToFront');
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
        await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await has('颜色数量待确认，尺码数量保持未知。');
        assert.equal(await evaluate('planReads'), 0);
        assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false);
        if (width === 1440 || width === 390) await shot('sizes-' + width);
      }
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    });

    await t.test('saved gaps, duplicate labels, zero and unknown beyond26 keep slot order without total', async () => {
      const row = (await x.pool.query("SELECT source_line_identity,source_metadata FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1 AND color_name='蓝色'", [x.orderId])).rows[0];
      const rule = Array.from({ length: 27 }, (_, i) => i === 0 || i === 2 ? 'M' : i === 3 ? 'S' : i === 4 ? 'L' : i === 26 ? '超出槽位' : '').join(',');
      await x.pool.query('UPDATE ainuoke_sales_order_color_mirrors SET source_metadata=$3 WHERE sales_order_id=$1 AND source_line_identity=$2', [x.orderId, row.source_line_identity, { ...row.source_metadata, sizeRule: rule, sizeMatrixStatus: 'SIZE_MATRIX_RULE_OVERFLOW', sizeAllocations: [{ slot: 1, sizeName: 'M', quantity: 0 }, { slot: 3, sizeName: 'M', quantity: null }, { slot: 4, sizeName: 'S', quantity: 0.0001 }, { slot: 5, sizeName: 'L', quantity: 1.23456 }, { slot: 27, sizeName: '超出槽位', quantity: null }] }]);
      try {
        await navigate(route); await has('查看颜色尺码'); await fold('查看颜色尺码'); await has('来源尺码超出可对应槽位');
        assert.deepEqual(await evaluate("[...document.querySelector('[aria-label=\"蓝色尺码明细\"] tbody').rows].map(r=>[...r.cells].map(c=>c.textContent))"), [['1', 'M', '0'], ['3', 'M', '未知'], ['4', 'S', '0.0001'], ['5', 'L', '1.23456'], ['27', '超出槽位', '未知']]);
        assert.equal(await evaluate("document.querySelectorAll('[data-saved-color-sizes] tfoot').length"), 0);
        assert.equal(await evaluate("[...document.querySelectorAll('[data-saved-color-sizes] tr')].some(n=>n.textContent.includes('合计'))"), false);
        assert.doesNotMatch(await evaluate("document.querySelector('[data-saved-color-sizes]').innerText"), /sourceHash|quantityPendingConfirmation|SIZE_MATRIX/);
      } finally { await x.pool.query('UPDATE ainuoke_sales_order_color_mirrors SET source_metadata=$3 WHERE sales_order_id=$1 AND source_line_identity=$2', [x.orderId, row.source_line_identity, row.source_metadata]); }
    });

    await t.test('owned plans keep exact decimals, null dates, zero and void history with separate source comparison', async () => {
      await x.pool.query("UPDATE sales_order_delivery_plans SET quantity=9007199254740993.123456789012345678,delivery_date=NULL WHERE sales_order_id=$1", [x.orderId]);
      await x.pool.query("INSERT INTO sales_order_delivery_plans(sales_order_id,delivery_date,quantity,is_derived_default,voided_at) VALUES($1,'2026-12-12',0,false,now())", [x.orderId]);
      await navigate(route); await has('查看颜色尺码'); assert.equal(await evaluate('planReads'), 0);
      await fold('来源与技术详情'); await has('9007199254740993.123456789012345678');
      const text = await evaluate("document.querySelector('[data-saved-delivery-plans]').innerText");
      assert.match(text, /日期未记录/); assert.match(text, /已作废（历史保留）/); assert.match(text, /艾诺科合同数量（对照）/); assert.match(text, /100/);
      assert.equal(await evaluate('planReads'), 1);
      await evaluate("document.querySelector('[data-saved-delivery-plans]').scrollIntoView({block:'start'})");
      await shot('plan-facts');
      await fold('来源与技术详情'); await fold('来源与技术详情'); await has('9007199254740993.123456789012345678');
      assert.equal(await evaluate('planReads'), 2);
    });

    await t.test('offline, forbidden and wrong-owner responses show no old facts; manual retry is read-only', async () => {
      for (const mode of ['offline', '403', 'wrong-owner']) {
        await navigate(route); await has('查看颜色尺码'); await evaluate('planMode=' + JSON.stringify(mode));
        await fold('来源与技术详情'); await has(mode === '403' ? '没有交付计划查看权限' : '交付计划暂时无法读取');
        assert.equal(await evaluate("document.querySelectorAll('[data-saved-delivery-plans] tbody tr').length"), 0);
        assert.equal(await evaluate('planReads'), 1); await wait(180); assert.equal(await evaluate('planReads'), 1);
        await evaluate("document.querySelector('[data-saved-delivery-plans] button').click()"); await has('9007199254740993.123456789012345678');
        assert.equal(await evaluate('planReads'), 2); assert.deepEqual(await evaluate('businessWrites'), []);
      }
    });

    await t.test('real processing batch has no invented Ainuoke sizes or comparison and keeps unknown plan ownership', async () => {
      const actor = await loadExistingBootstrapActor(x.pool, x.users[0]);
      const quote = createSyntheticQuoteFixture('saved-sources-processing', 'processing');
      for (const r of quote.revisions) { r.imageAttachmentIds = []; r.fileAttachmentIds = []; r.styleImageAttachmentId = null; }
      const revision = quote.revisions.find(r => r.revisionId === quote.defaultRevisionId), pv = revision.priceVersions[0];
      pv.pricingParameters.laborCurrency = 'USD';
      pv.confirmation = { quotedGarmentPrice: 99, quotedLaborPrice: 10, confirmedGarmentPrice: null, confirmedLaborPrice: 10, note: 'synthetic', confirmedAt: '2026-10-20T00:00:00Z' };
      await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(quote));
      const batch = await createProcessingBatch(x.pool, actor, { requestId: randomUUID(), quoteId: quote.id, revisionId: revision.revisionId, priceVersionId: pv.id, customerName: 'Synthetic', businessStyleNo: 'SYN-PROCESS-READ', quantity: '10', orderDate: '2026-10-20', deliveryDate: null, customerReference: '', deliveryRequirements: '', referenceOrderId: null });
      const preview = await previewProcessingBatch(x.pool, actor, batch.batchId);
      const confirmed = await confirmProcessingBatch(x.pool, actor, batch.batchId, { requestId: randomUUID(), expectedVersion: batch.version, sourceFingerprint: preview.candidate.fingerprint });
      const result = await consumeProcessingBatches(x.pool, actor, { requestId: randomUUID(), items: [{ batchId: batch.batchId, expectedVersion: confirmed.version }] });
      assert.equal(result.results[0].status, 'created');
      await navigate('/order-center/server-detail?id=' + result.results[0].salesOrderId); await has('查看颜色尺码');
      await fold('查看颜色尺码'); await has('加工订单不适用艾诺科颜色尺码来源。');
      await fold('来源与技术详情'); await has('加工订单无艾诺科合同对照。');
      await has('所有权尚未记录，不推定为自动或人工'); await has('尚无交付计划记录。');
      assert.equal(await evaluate("document.querySelector('[data-saved-delivery-plans]').innerText.includes('艾诺科合同数量（对照）')"), false);
      assert.equal(await evaluate("document.querySelectorAll('[data-saved-delivery-plans] tbody tr').length"), 0);
    });

    await t.test('all seven trusted roles can read sizes and plans with no commercial or Browser fallback', async () => {
      for (const username of x.users) {
        await login(username); await navigate(route); await has('查看颜色尺码');
        await fold('查看颜色尺码'); await has('已保存的分码与当时颜色数量一致。');
        await fold('来源与技术详情'); await has('9007199254740993.123456789012345678');
        assert.deepEqual(await evaluate('businessWrites'), []);
        assert.deepEqual(await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('zhixu.erp.local.'))"), []);
        assert.doesNotMatch(await evaluate('document.body.innerText'), /protected-commercial-sentinel/);
      }
    });

    await t.test('old success and401 cannot affect a new login, including A to B to A', async () => {
      for (const [mode, nextUser] of [['delay200', x.users[1]], ['delay401', x.users[0]]]) {
        const mark = label => { if (process.env.ORDER_SAVED_SOURCES_EVIDENCE === '1') console.log('Saved sources delay check: ' + mode + ' ' + label); };
        await login(x.users[0]); await navigate(route); await has('查看颜色尺码');
        await evaluate('planMode=' + JSON.stringify(mode)); await fold('来源与技术详情');
        await until(() => evaluate('planWaiters.length===1'), 'held plan response');
        mark('old reply held');
        await click('用户菜单'); await click('退出登录'); await has('忘记密码？请联系系统管理员');
        mark('logged out');
        await input('input[name=username]', nextUser); await input('input[name=password]', x.password); await click('登录织序');
        await has('查看颜色尺码'); await fold('来源与技术详情'); await has('9007199254740993.123456789012345678');
        mark('new identity plan shown');
        if (mode === 'delay200') {
          await click('用户菜单'); await click('退出登录'); await has('忘记密码？请联系系统管理员');
          await input('input[name=username]', x.users[0]); await input('input[name=password]', x.password); await click('登录织序');
          await has('查看颜色尺码'); await fold('来源与技术详情'); await has('9007199254740993.123456789012345678');
          mark('A to B to A plan shown before releasing original A reply');
        }
        assert.equal(await evaluate('planWaiters.length'), 1, 'held old response must survive the real SPA login transition');
        await evaluate('planWaiters.splice(0).forEach(done=>done())'); await wait(250);
        mark('old reply released');
        assert.equal(await evaluate("document.body.innerText.includes('987654321.123456789012345678')"), false);
        assert.equal(await evaluate("location.pathname"), '/order-center/server-detail');
        assert.equal(await evaluate("(async()=> (await fetch('/api/v1/sales-orders')).status)()"), 200);
      }
    });

    await t.test('current401 removes plan facts and returns to login without source recovery', async () => {
      await navigate(route); await has('查看颜色尺码'); await evaluate("planMode='401'"); await fold('来源与技术详情');
      await has('忘记密码？请联系系统管理员');
      assert.equal(await evaluate("document.querySelectorAll('[data-saved-delivery-plans]').length"), 0);
      assert.deepEqual(await evaluate('businessWrites'), []);
    });
    assert.deepEqual(errors, []); assert.deepEqual(x.errors, []);
  } finally {
    if (process.env.ORDER_SAVED_SOURCES_EVIDENCE === '1') {
      await mkdir(evidence, { recursive: true });
      await writeFile(join(evidence, 'build-and-geometry.json'), JSON.stringify({ build: info, metrics }, null, 2) + '\n');
    }
    if (closeBrowser && ws?.readyState === WebSocket.OPEN) await Promise.race([closeBrowser().catch(() => {}), wait(2000)]);
    ws?.close(); if (browser && browser.exitCode === null) { browser.kill(); await wait(500); }
    await x.close();
    const distance = relative(resolve(tmpdir()), resolve(temp));
    assert.ok(distance && !distance.startsWith('..') && !isAbsolute(distance) && temp.includes('zhixu-saved-sources-ui-'));
    await rm(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
});
