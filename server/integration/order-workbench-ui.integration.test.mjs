import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startContinuousFixture } from './ainuoke-continuous-fixture.ts';
import { waitForChromiumEndpoint, stopOwnedChromium } from './chromium-endpoint.mjs';
import { createAinuokeSalesOrder } from '../sales-orders/service.ts';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.ts';

const pause = ms => new Promise(done => setTimeout(done, ms));
async function until(read, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try { if (await read()) return; } catch (error) { if (!/context|navigated|closed/iu.test(String(error))) throw error; }
    await pause(70);
  }
  throw Error(label + ' timed out');
}

test('built order workbench uses existing live APIs, preserves unknown facts, roles and responsive controls', { timeout: 240000 }, async t => {
  const staticDirectory = resolve('dist/client');
  const build = JSON.parse(await readFile(join(staticDirectory, 'build-info.json'), 'utf8'));
  const expected = process.env.ORDER_WORKBENCH_EXPECTED_SOURCE ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(build.gitCommit, expected); assert.equal(build.orderRead, 'snapshot'); assert.equal(build.quoteAuthority, 'server');
  const x = await startContinuousFixture(staticDirectory, { orderAlerts: true, garmentShipments: true });
  const directory = resolve('outputs/order-workbench/isolated-' + build.gitCommit); await mkdir(directory, { recursive: true });
  const profile = join(await mkdtemp(join(tmpdir(), 'zhixu-workbench-ui-')), 'profile');
  let browser, ws, session, sequence = 0; const pending = new Map(), exceptions = [], requests = [];
  const command = (method, params = {}, sid = session) => new Promise((done, reject) => {
    const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 20000);
    pending.set(id, { done: value => { clearTimeout(timer); done(value); }, reject: value => { clearTimeout(timer); reject(value); } });
    ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });
  try {
    const cookie = await x.login('demo.admin');
    const read = async path => { const response = await fetch(x.base + path, { headers: { Cookie: cookie } }); assert.equal(response.status, 200); return response.json(); };
    const initial = await read('/api/v1/sales-orders/' + x.orderId);
    const detail = initial.salesOrder ?? initial.order ?? initial;
    const actor = await loadExistingBootstrapActor(x.pool, x.users[0]);
    const other = (await createAinuokeSalesOrder(x.pool, actor, { source: { sourceId: 'workbench-other', sourceRowIdentity: 'workbench-other', salesContractNo: 'SC-WORKBENCH-OTHER', insideOrderNo: 'SYNTHETIC-OTHER', lifecycleStatusRaw: '草拟', contractDate: '2026-11-27', contractDeliveryDate: null, styleNo: 'SYNTHETIC-OTHER', companyNameSnapshot: '合成公司', customerNameSnapshot: '合成客户', brandNameSnapshot: '合成品牌', quantity: null, sourceHash: 'f'.repeat(64), fetchedAt: new Date().toISOString() }, colors: [] })).salesOrder;
    browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome'), ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const [port, path] = await waitForChromiumEndpoint(profile);
    ws = new WebSocket('ws://127.0.0.1:' + port + path); await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', event => {
      const row = JSON.parse(String(event.data)), job = pending.get(row.id);
      if (job) { pending.delete(row.id); if (row.error) job.reject(Error(row.error.message)); else job.done(row.result); }
      if (row.method === 'Runtime.exceptionThrown') exceptions.push(row.params.exceptionDetails.text);
      if (row.method === 'Network.requestWillBeSent' && row.params.request.url.startsWith(x.base + '/api/v1/')) requests.push({ url: row.params.request.url, method: row.params.request.method });
    });
    const target = await command('Target.createTarget', { url: 'about:blank' }, null);
    session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null)).sessionId;
    await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
    await command('Page.addScriptToEvaluateOnNewDocument', {source: `window.materialFailure=false; const originalFetch=window.fetch; window.fetch=(input,init)=>window.materialFailure&&String(typeof input==='string'?input:input.url).includes('/material-progress')?Promise.resolve(new Response('{}',{status:503})):originalFetch(input,init);`});
    const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.equal(Boolean(result.exceptionDetails), false); return result.result.value; };
    const click = text => evaluate(`(()=>{const e=[...document.querySelectorAll('button,summary')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length);if(!e)return false;e.click();return true})()`);
    const text = () => evaluate('document.body?.innerText??""');
    const has = value => until(async () => (await text()).includes(value), value);
    const navigate = async id => { await command('Page.navigate', { url: x.base + '/order-center/server-detail?id=' + id }); await has('订单工作台'); await until(() => evaluate('Boolean(document.querySelector("[data-order-workbench]"))'), 'workbench loaded'); };
    const setCookie = async value => { const at = value.indexOf('='); await command('Network.setCookie', { name: value.slice(0, at), value: value.slice(at + 1), url: x.base, path: '/' }); };
    const screenshot = async name => { const shot = await command('Page.captureScreenshot', { format: 'png' }); await writeFile(join(directory, name + '.png'), Buffer.from(shot.data, 'base64')); };
    await setCookie(cookie);
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(x.orderId);
    await t.test('source identity, delivery plan and four execution modules are visible without business writes', async () => {
      await has('交付计划'); await has('物料采购汇总'); await has('生产执行'); await has('成衣出货'); await has('财务关账');
      await has('实际完成数量'); await has('尚未登记');
      const header = await evaluate('document.querySelector(".ow-order-heading").innerText');
      assert.ok(header.includes(detail.insideOrderNo)); assert.ok(header.includes(detail.quantity.toLocaleString('zh-CN')));
      assert.ok(requests.some(row => row.url.includes('/delivery-plans'))); assert.ok(requests.some(row => row.url.includes('/production-scheduling/orders/')));
      assert.ok(requests.some(row => row.url.includes('/closing/orders/') && row.url.includes('view=display')));
      assert.equal(await evaluate('document.querySelectorAll(".ow-workbench .oc-server-detail-section").length>0'), true);
      await screenshot('desktop-overview');
    });
    await t.test('local refinements remove repeated explanations and preserve an independent read action', async () => {
      const heading = await evaluate('document.querySelector(".ow-order-heading").innerText');
      assert.doesNotMatch(heading,/来源只读|合同交期（来源）|与织序交付计划分别保留/);
      assert.equal(await evaluate('document.querySelector(".ow-plan-evidence")===null'),true);
      assert.doesNotMatch(await evaluate('document.querySelector(".ow-delivery").innerText'),/织序交付要求，与合同来源分开维护|计划日期与合同交期一致；计划数量与合同数量一致/);
      assert.equal(await evaluate('document.querySelectorAll(".ow-heading-metrics input").length'),0);
      assert.equal(await click('重新读取交付计划'),true);
    });
    await t.test('material metrics come from the real fixture API, and unavailable data never becomes zero', async () => {
      await has('自购需求项');
      const material = await read('/api/v1/sales-orders/' + x.orderId + '/material-progress');
      const expectedDemands = material.progress.summary.fabric.demands + material.progress.summary.trim.demands;
      assert.equal(await evaluate('document.querySelector(".ow-material-metrics dd").textContent'),String(expectedDemands));
      await evaluate('window.materialFailure=true;window.dispatchEvent(new Event("focus"))');
      await until(()=>evaluate('[...document.querySelectorAll(".ow-material-metrics dd")].every(e=>e.textContent==="待核对")'),'unavailable material metrics');
      const business = await evaluate('document.querySelector("[data-material-business]").innerText');
      assert.doesNotMatch(business,/Browser|未接通|接口|0%/);
      const source = await evaluate('document.querySelector(".oc-server-detail-material-summary .ow-refresh").textContent');
      assert.match(source,/不会回退 Browser/);
      assert.equal(await evaluate('document.querySelector(".oc-server-detail-material-summary .ow-refresh").open'),false);
      await evaluate('window.materialFailure=false;window.dispatchEvent(new Event("focus"))'); await has('自购需求项');
      await until(()=>evaluate('document.querySelector(".ow-material-metrics dd").textContent!=="待核对"'),'material recovery');
    });
    await t.test('color quantities lead to source matrices without losing unknown or pending evidence', async () => {
      await evaluate('document.querySelector(".ow-color-summary-row button").click()');
      await has('未知不补 0');
      assert.equal(await evaluate('document.getElementById("ow-panel-colors").hidden'), false);
      assert.equal(await evaluate('document.querySelector("[data-selected]")!==null'), true);
      assert.equal(await evaluate('document.querySelector(".ow-size-matrix").textContent.includes("未知")||document.querySelector(".ow-size-matrix").textContent.includes("尚未记录")'), true);
      await screenshot('desktop-colors');
    });
    await t.test('duplicate size labels, exact decimals, zero and unknown stay in their original slots', async () => {
      const saved = (await x.pool.query("SELECT source_line_identity,source_metadata FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1 AND color_name='蓝色'", [x.orderId])).rows[0];
      assert.ok(saved);
      const rule = Array.from({ length: 27 }, (_, i) => i === 0 || i === 2 ? 'M' : i === 3 ? 'S' : i === 4 ? 'L' : i === 26 ? '超出槽位' : '').join(',');
      try {
        await x.pool.query('UPDATE ainuoke_sales_order_color_mirrors SET source_metadata=$3 WHERE sales_order_id=$1 AND source_line_identity=$2', [x.orderId,saved.source_line_identity,{...saved.source_metadata,sizeRule:rule,sizeMatrixStatus:'SIZE_MATRIX_RULE_OVERFLOW',sizeAllocations:[{slot:1,sizeName:'M',quantity:0},{slot:3,sizeName:'M',quantity:null},{slot:4,sizeName:'S',quantity:0.0001},{slot:5,sizeName:'L',quantity:1.23456},{slot:27,sizeName:'超出槽位',quantity:null}]}]);
        await navigate(x.orderId); await click('颜色与尺码'); await has('0.0001');
        const values = await evaluate("(()=>{const t=[...document.querySelectorAll('.ow-size-matrix table')].find(t=>t.textContent.includes('超出槽位'));return{headers:[...t.tHead.rows[0].cells].map(c=>c.textContent),cells:[...t.tBodies[0].rows[0].cells].slice(2).map(c=>c.textContent),totals:t.querySelectorAll('tfoot').length}})()");
        assert.deepEqual(values.cells,['0','未知','0.0001','1.23456','未知']);
        assert.ok(values.headers.includes('M（槽位1）')&&values.headers.includes('M（槽位3）'));assert.equal(values.totals,0);
        await click('查看颜色尺码来源与核对说明'); await has('来源尺码超出可对应槽位');
      } finally { await x.pool.query('UPDATE ainuoke_sales_order_color_mirrors SET source_metadata=$3 WHERE sales_order_id=$1 AND source_line_identity=$2',[x.orderId,saved.source_line_identity,saved.source_metadata]); }
    });
    await t.test('material history remains reachable from the material module and keeps original-order scope', async () => {
      await click('订单总览');
      assert.equal(await evaluate('document.querySelector(".oc-server-detail-material-summary header").textContent.includes("查看历史物料来源")'), true);
      await click('查看历史物料来源'); await has('历史物料来源');
      await until(() => evaluate('Boolean(document.querySelector("[role=dialog]"))'), 'material history dialog');
      await click('关闭历史来源');
    });
    await t.test('prices, original source/technical facts and maintenance entry points remain reachable', async () => {
      await click('价格与历史'); await has('订单变更历史'); await has('订单调价历史');
      assert.equal(await click('维护交期'), true); await has('交付计划');
      await evaluate('(()=>{const e=[...document.querySelectorAll("[role=dialog] button")].find(e=>/关闭|取消/.test(e.textContent)&&!e.disabled);if(e)e.click()})()');
      await evaluate('document.querySelector(".ow-source-details summary").click()'); await has('UUID');
      await click('订单总览');
    });
    await t.test('desktop, narrow desktop and touch layouts keep all tabs and content reachable', async () => {
      for (const [width, ratio, mobile] of [[1920,1,false],[1536,1.25,false],[1280,1,false],[900,1,false],[390,1,true],[320,1,true]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: ratio, mobile });
        await command('Emulation.setTouchEmulationEnabled', { enabled: mobile }); await pause(100);
        for (const tab of ['订单总览','颜色与尺码','价格与历史']) { assert.equal(await click(tab), true); await pause(70); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, tab + ' at ' + width); assert.equal(await evaluate('[...document.querySelectorAll(".ow-workbench [role=tabpanel]:not([hidden]) .oc-server-detail-section")].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})'),true,'cards reachable '+width); }
        await click('订单总览'); if (width === 390) await screenshot('mobile-overview');
      }
    });
    await t.test('switching to another order never retains the old identity or selected color', async () => {
      await navigate(other.id); await has(other.orderNo);
      const heading = await evaluate('document.querySelector(".ow-order-heading").innerText');
      assert.equal(heading.includes(detail.orderNo), false); assert.ok(heading.includes('暂未取得数据')); assert.equal(await evaluate('document.querySelector("[role=tab][aria-selected=true]").textContent'), '订单总览');
    });
    await t.test('restricted role does not request production or closing facts', async () => {
      await setCookie(await x.login('demo.quote')); requests.length = 0; await navigate(x.orderId);
      await has('当前账号没有生产查看权限'); await has('当前账号没有关账查看权限');
      assert.equal(requests.some(row => row.url.includes('/production-scheduling/orders/') || row.url.includes('/closing/orders/')), false);
    });
    assert.equal(requests.some(row => row.method !== 'GET'), false, 'viewing the workspace does not write business facts');
    assert.deepEqual(exceptions, []);
    await writeFile(join(directory, 'result.json'), JSON.stringify({ sourceSha: build.gitCommit, widths: [1920,1536,1440,1280,900,390,320], browserExceptions: exceptions, realSourceRequests: 0, scope: 'owned synthetic PostgreSQL and actual built UI/API' }, null, 2));
  } finally {
    if (browser) await stopOwnedChromium(browser, { gracefulClose: ws ? () => command('Browser.close', {}, null) : undefined, graceMs: 10000, exitMs: 10000 });
    if (ws) ws.close(); await x.close();
  }
});
