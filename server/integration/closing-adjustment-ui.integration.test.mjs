import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { closingFixture } from './closing-fixture.ts';
import { prepareClosingUiFixture } from './closing-ui-fixture.ts';
import { waitForChromiumEndpoint, stopOwnedChromium } from './chromium-endpoint.mjs';

const delay = ms => new Promise(done => setTimeout(done, ms));
test('approved closing UI uses real built Server, owned synthetic PostgreSQL and actual Chromium', { timeout: 240000 }, async t => {
  const staticDirectory = resolve(process.env.CLOSING_UI_STATIC_DIR ?? 'dist/client'), build = JSON.parse(await readFile(join(staticDirectory, 'build-info.json'), 'utf8'));
  const expectedSource = process.env.CLOSING_UI_EXPECTED_SOURCE;
  assert.match(expectedSource ?? '', /^[0-9a-f]{40}$/u); assert.equal(build.gitCommit, expectedSource);
  assert.equal(build.quoteAuthority, 'server'); assert.equal(build.identityMode, 'session'); assert.equal(build.orderRead, 'snapshot');
  const x = await closingFixture(t, false, false, { staticDirectory }), seeded = await prepareClosingUiFixture(x);
  const temp = await mkdtemp(join(await realpath(tmpdir()), 'zhixu-closing-ui-browser-')), profile = join(temp, 'profile');
  const evidence = resolve('outputs/closing-adjustment-ui-current-20261027/browser-' + Date.now()); await mkdir(evidence, { recursive: true });
  const pending = new Map(), errors = [], network = []; let sequence = 0, session, ws, command, cleaned = false;
  const browser = spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const cleanup = async () => { if (cleaned) return; cleaned = true; try { await stopOwnedChromium(browser, { gracefulClose: ws?.readyState === WebSocket.OPEN && command ? () => command('Browser.close', {}, null) : undefined }); }
    finally { ws?.close(); for (const call of pending.values()) clearTimeout(call.timer); } };
  t.after(cleanup);
  const [port, endpoint] = await waitForChromiumEndpoint(profile, { timeoutMs: 30000 }); ws = new WebSocket('ws://127.0.0.1:' + port + endpoint);
  await new Promise((done, reject) => { const timer = setTimeout(() => reject(Error('CDP connection deadline')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); done(); }, { once: true }); ws.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true }); });
  command = (method, params = {}, sid = session) => new Promise((done, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)); }, 20000); pending.set(id, { done, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); });
  ws.addEventListener('message', ({ data }) => { const event = JSON.parse(String(data)), call = pending.get(event.id); if (call) { pending.delete(event.id); clearTimeout(call.timer); if (event.error) call.reject(Error(JSON.stringify(event.error))); else call.done(event.result); }
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
    if (event.method === 'Network.requestWillBeSent') network.push({ method: event.params.request.method, path: new URL(event.params.request.url).pathname });
    if (event.method === 'Page.javascriptDialogOpening') void command('Page.handleJavaScriptDialog', { accept: true }); });
  const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const until = async (read, label) => { const end = Date.now() + 18000; while (Date.now() < end) { try { if (await read()) return; } catch (error) { if (!/context|navigated|closed/u.test(String(error))) throw error; } await delay(60); } throw Error(label + ' timed out'); };
  const has = text => until(() => evaluate('document.body?.innerText.includes(' + JSON.stringify(text) + ')'), text);
  const click = async (label, selector = 'button') => { const find = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())===${JSON.stringify(label)}&&!n.matches(':disabled')&&n.getClientRects().length)`;
    await until(() => evaluate('Boolean(' + find + ')'), 'enabled ' + label); await evaluate(find + '.click()'); };
  const field = async (selector, value, tag = 'HTMLInputElement') => { await until(() => evaluate('Boolean(document.querySelector(' + JSON.stringify(selector) + '))'), 'field');
    await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event(${tag === 'HTMLSelectElement' ? "'change'" : "'input'"},{bubbles:true}))})()`); };
  const shot = async name => { const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(join(evidence, name + '.png'), Buffer.from(image.data, 'base64')); };
  const posts = () => network.filter(row => row.method === 'POST' && row.path.endsWith('/month-plans/commands')).length;
  const phase = async (name, run) => { let error; await t.test(name, async () => { try { await run(); } catch (value) { error = value; throw value; } }); if (error) throw error; };
  try {
    const target = await command('Target.createTarget', { url: 'about:blank' }, null); session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null)).sessionId;
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    // Install once before application clients capture fetch. Mutating a shared
    // global delegate after mounting can recurse or miss the client entirely.
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const nativeFetch=window.fetch.bind(window);window.droppedClosingMonthAcks=0;window.fetch=async(...args)=>{const response=await nativeFetch(...args);if(window.dropNextClosingMonthAck&&String(args[0]).endsWith('/month-plans/commands')){window.dropNextClosingMonthAck=false;window.droppedClosingMonthAcks++;await response.text();throw Error('synthetic committed acknowledgement lost')}return response}})()` });
    const i = x.editor.cookie.indexOf('='); await command('Network.setCookie', { name: x.editor.cookie.slice(0, i), value: x.editor.cookie.slice(i + 1), domain: '127.0.0.1', path: '/', httpOnly: true });
    const navigate = async path => { await command('Page.navigate', { url: x.base + path }); await has('全年成衣销售产值'); await until(() => evaluate("document.querySelectorAll('.sc-month-card').length===12"), '12 months'); };
    await phase('desktop annual view has exactly two outputs and isolates Browser stores', async () => {
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await navigate('/closing-center?year=2027'); await evaluate("localStorage.setItem('zhixu.erp.local.closing-center','KEEP')");
      assert.equal(await evaluate("document.querySelectorAll('.sc-annual-totals .qc-card').length"), 2); await has('制作完成'); await shot('desktop-annual');
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
    });
    await phase('outsource scope changes both total and detail; whole preview still includes hidden portions', async () => {
      await field('select[aria-label="关账显示范围"]', 'outsource', 'HTMLSelectElement'); await until(() => evaluate("document.querySelectorAll('.sc-order-table tbody tr').length===1"), 'one outsource'); await has('¥2,000');
      await click('调整月份'); await has('可调数量'); await field('select[aria-label="调整范围"]', 'whole', 'HTMLSelectElement'); await field('input[aria-label="目标月份"]', '2027-11'); await field('input[aria-label="调整原因"]', '整单包含当前隐藏的内制与未分配'); await click('预览调整'); await has('调整后完整月份分配');
      assert.equal(await evaluate("document.querySelectorAll('.sc-preview > .sc-table-scroll:first-of-type tbody tr').length"), 3); await has('两项产值参考'); await until(() => evaluate("document.querySelectorAll('.sc-value-difference tbody tr').length===2"), 'two changed months'); await shot('whole-preview'); const before = posts(); await click('取消', '[role=dialog] button'); assert.equal(posts(), before);
    });
    await phase('real incremental text entry keeps the same focused search node across query generations', async () => {
      await evaluate("window.closingSearchNode=document.querySelector('input[aria-label=搜索关账订单]');closingSearchNode.focus()");
      for (const char of 'SYN-CLOSE') { await command('Input.insertText', { text: char }); await delay(35); assert.equal(await evaluate('document.activeElement===closingSearchNode&&closingSearchNode.isConnected'), true); }
      await command('Input.insertText', { text: ' 合成' }); assert.equal(await evaluate('document.activeElement===closingSearchNode&&closingSearchNode.value.endsWith("合成")'), true);
      await field('input[aria-label=搜索关账订单]', ''); await until(() => evaluate("document.querySelectorAll('.sc-order-table tbody tr').length===1"), 'scope restored');
    });
    await phase('partial quantity save recovers a committed but lost acknowledgement without a second POST', async () => {
      await field('select[aria-label="关账显示范围"]', 'all', 'HTMLSelectElement'); await has('制作完成'); await click('调整月份'); await has('可调数量');
      await field('input[aria-label="目标月份"]', '2027-03'); await field('input[aria-label="调整原因"]', '合成实机部分调月'); await field('.sc-adjustment-fields tbody input', '10'); await click('预览调整'); await has('调整后完整月份分配');
      const dropped = await evaluate('window.droppedClosingMonthAcks'); await evaluate('window.dropNextClosingMonthAck=true');
      const before = posts(); await click('确认调整'); await has('原请求已核实'); assert.equal(posts(), before + 1); assert.equal(await evaluate('window.droppedClosingMonthAcks'), dropped + 1); await click('完成', '[role=dialog] button');
      assert.equal(await evaluate("Object.keys(sessionStorage).some(k=>k.startsWith('zhixu.server.closing-month.pending.v1.'))"), false); assert.equal(await evaluate("localStorage.getItem('zhixu.erp.local.closing-center')"), 'KEEP');
    });
    await phase('source review reads the whole order behind an outsource filter and recovers one committed response', async () => {
      const before = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body.plan;
      const executions = (await x.pool.query('SELECT * FROM production_schedule_executions ORDER BY assignment_id')).rows;
      // This changes only saved Source facts in the caller-owned synthetic DB.
      // The existing persistent fixture separately tests actual Source refresh.
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=120 WHERE sales_order_id=$1', [seeded.first.id]);
      await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=CASE color_name WHEN 'Blue' THEN 70 ELSE 50 END WHERE sales_order_id=$1", [seeded.first.id]);
      await field('select[aria-label="关账显示范围"]', 'outsource', 'HTMLSelectElement'); await has('来源待复核');
      const menu = await evaluate("document.querySelector('.sc-order-table tbody tr .qc-floating-menu-trigger').getAttribute('aria-label')");
      await click(menu); await click('复核来源数量'); await has('当前来源量 120');
      assert.equal(await evaluate("document.querySelectorAll('table[aria-label=来源复核原片段] tbody tr').length"), before.lines.length);
      await has('新增待分月 / 未分配'); await field('input[aria-label=来源复核原因]', '全单新增量保持未分配'); await click('预览复核'); await has('复核后完整月份分配');
      assert.equal(await evaluate("/[¥$]|CNY|USD/u.test(document.querySelector('[role=dialog]').innerText)"), false);
      await shot('source-complete-order-preview');
      const dropped = await evaluate('window.droppedClosingMonthAcks'); await evaluate('window.dropNextClosingMonthAck=true');
      const count = posts(); await click('确认复核'); await has('原请求已核实'); assert.equal(posts(), count + 1); assert.equal(await evaluate('window.droppedClosingMonthAcks'), dropped + 1);
      const after = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body;
      assert.equal(after.plan.sourceQuantity, '120'); assert.equal(after.sourceChanged, false);
      for (const line of before.lines) assert.deepEqual(after.plan.lines.find(value => value.id === line.id), line);
      const added = after.plan.lines.filter(line => !before.lines.some(old => old.id === line.id));
      assert.equal(added.length, 1); assert.equal(added[0].quantity, '20'); assert.equal(added[0].month, null); assert.equal(added[0].assignmentId, null);
      assert.deepEqual((await x.pool.query('SELECT * FROM production_schedule_executions ORDER BY assignment_id')).rows, executions);
      await click('完成', '[role=dialog] button');
    });
    await phase('a second Source change after UI preview is rejected without another month version', async () => {
      const before = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body.plan;
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=130 WHERE sales_order_id=$1', [seeded.first.id]);
      await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=CASE color_name WHEN 'Blue' THEN 80 ELSE 50 END WHERE sales_order_id=$1", [seeded.first.id]);
      await click('刷新'); await has('来源待复核');
      const menu = await evaluate("document.querySelector('.sc-order-table tbody tr .qc-floating-menu-trigger').getAttribute('aria-label')");
      await click(menu); await click('复核来源数量'); await has('当前来源量 130'); await field('input[aria-label=来源复核原因]', '预览后的来源竞争'); await click('预览复核'); await has('复核后完整月份分配');
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=140 WHERE sales_order_id=$1', [seeded.first.id]);
      await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=CASE color_name WHEN 'Blue' THEN 90 ELSE 50 END WHERE sales_order_id=$1", [seeded.first.id]);
      const count = posts(); await click('确认复核'); await until(() => evaluate("document.querySelectorAll('[role=dialog] [role=alert]').length>0"), 'Source race shown');
      assert.equal(posts(), count + 1); const after = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body;
      assert.equal(after.plan.version, before.version); assert.deepEqual(after.plan.lines, before.lines); assert.equal(after.sourceChanged, true);
      await click('取消', '[role=dialog] button');
      await x.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=120 WHERE sales_order_id=$1', [seeded.first.id]);
      await x.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=CASE color_name WHEN 'Blue' THEN 70 ELSE 50 END WHERE sales_order_id=$1", [seeded.first.id]);
      await field('select[aria-label="关账显示范围"]', 'all', 'HTMLSelectElement'); await has('制作完成');
    });
    await phase('executor matching assigns only the selected unassigned quantity and keeps its exact remainder', async () => {
      const before = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body.plan;
      const pending = before.lines.find(line => line.assignmentId === null && line.month === null && line.quantity === '20'); assert.ok(pending);
      const facts = (await x.pool.query('SELECT * FROM production_schedule_executions ORDER BY assignment_id')).rows;
      const menu = await evaluate("document.querySelector('.sc-order-table tbody tr .qc-floating-menu-trigger').getAttribute('aria-label')");
      await click(menu); await click('匹配执行方'); await has('未分配片段'); await field('select[aria-label=待匹配月份片段]', pending.id, 'HTMLSelectElement');
      await until(() => evaluate("document.querySelectorAll('table[aria-label=执行方匹配候选] tbody tr').length===2"), 'same order same color candidates');
      await field('input[aria-label="匹配数量 ' + seeded.internal + '"]', '5'); await field('input[aria-label="匹配数量 ' + seeded.outsourced + '"]', '10');
      await has('余量 5 保持未分配'); await field('input[aria-label=执行方匹配原因]', '明确内外发归属并保留余量'); await click('预览匹配'); await has('匹配后完整月份分配');
      await has('归属量超过排单 / 完成参考量'); assert.equal(await evaluate("/[¥$]|CNY|USD/u.test(document.querySelector('[role=dialog]').innerText)"), false); await shot('executor-unassigned-preview');
      const dropped = await evaluate('window.droppedClosingMonthAcks'); await evaluate('window.dropNextClosingMonthAck=true');
      const count = posts(); await click('确认匹配'); await has('原请求已核实'); assert.equal(posts(), count + 1); assert.equal(await evaluate('window.droppedClosingMonthAcks'), dropped + 1);
      const after = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body.plan;
      for (const line of before.lines.filter(line => line.id !== pending.id)) assert.deepEqual(after.lines.find(value => value.id === line.id), line);
      assert.deepEqual(after.lines.find(line => line.id === pending.id), { ...pending, quantity: '5' });
      const added = after.lines.filter(line => !before.lines.some(old => old.id === line.id));
      assert.deepEqual(added.map(line => [line.assignmentId, line.quantity]).sort(), [[seeded.internal, '5'], [seeded.outsourced, '10']].sort()); assert(added.every(line => line.colorId === pending.colorId && line.month === pending.month));
      assert.deepEqual((await x.pool.query('SELECT * FROM production_schedule_executions ORDER BY assignment_id')).rows, facts); await click('完成', '[role=dialog] button');
    });
    await phase('locked month has no ordinary close/edit and an explicit new period has a blank tax', async () => {
      await click('管理 2027-12'); await has('重开月份'); assert.equal(await evaluate("document.querySelector('select[aria-label=月份操作]').options.length"), 1); await click('关闭', '[role=dialog] button');
      await click('管理 2027-06'); await has('期间税率'); assert.equal(await evaluate("document.querySelector('input[aria-label=期间税率]').value"), ''); await click('关闭', '[role=dialog] button');
    });
    await phase('refresh after a committed original remains recoverable without edit rights or a visible SO', async () => {
      const state = (await x.request('/orders/' + seeded.first.id + '/month-plan')).body;
      const p = (await x.request('/month-plans/preview', { action: 'move_months', orderId: seeded.first.id, expectedVersion: state.plan.version, targetMonth: '2027-11', reason: 'Synthetic lost acknowledgement before refresh', selection: { mode: 'whole' } })).body;
      const original = { requestId: randomUUID(), intent: p.intent, previewHash: p.previewHash };
      assert.equal((await x.request('/month-plans/commands', original)).body.status, 'applied');
      const key = 'zhixu.server.closing-month.pending.v1.' + x.editor.actor.userId;
      await evaluate(`sessionStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({ schemaVersion: 1, userId: x.editor.actor.userId, savedAt: new Date().toISOString(), command: original }))})`);
      await x.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.edit'", [x.editor.role]);
      const before = posts(); await navigate('/closing-center?year=2028'); await has('当前范围没有订单片段'); await click('核对月份调整原请求'); await click('核对原请求', '[role=dialog] button'); await has('原请求已核实');
      assert.equal(posts(), before); assert.equal(await evaluate('sessionStorage.getItem(' + JSON.stringify(key) + ')'), null); await shot('read-only-original-recovery'); await click('返回', '[role=dialog] button');
      await x.pool.query("INSERT INTO app_role_permissions VALUES($1,'closing.edit')", [x.editor.role]); await navigate('/closing-center?year=2027');
    });
    await phase('a fresh 403 removes formerly visible annual amounts and detail', async () => {
      await x.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.view'", [x.editor.role]);
      await click('刷新'); await until(() => evaluate("!document.querySelector('.sc-annual-totals')&&!document.querySelector('.sc-order-table')"), 'revoked read clears old data');
      await x.pool.query("INSERT INTO app_role_permissions VALUES($1,'closing.view')", [x.editor.role]); await navigate('/closing-center?year=2027');
    });
    await phase('390px actual layout keeps page and modal within viewport with intentional table scrolling', async () => {
      await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(150); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true); await shot('mobile-annual');
      await click('调整月份'); await has('可调数量'); assert.equal(await evaluate("(()=>{const r=document.querySelector('.sc-adjustment-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.height<=innerHeight})()"), true); await shot('mobile-adjust'); await click('取消', '[role=dialog] button');
    });
    assert.deepEqual(errors, []); assert.deepEqual(x.errors, []); await writeFile(join(evidence, 'result.json'), JSON.stringify({ build, status: 'PASS', errors, network, firstOrder: seeded.first.id, limitations: 'owned synthetic Chromium only, no user acceptance or deployment' }, null, 2));
  } catch (error) { await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: String(error), body: await evaluate('document.body?.innerText').catch(() => ''), errors, network }, null, 2)); throw error; }
  finally { await cleanup(); }
});
